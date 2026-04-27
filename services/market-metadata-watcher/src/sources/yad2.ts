// Yad2 region/kind feed discovery.
//
// Live-verified scan plan (see MARKET_DISCOVERY_PLAN.md / chat audit):
//   - 7 regions × 2 kinds (forsale, rent) = 14 page fetches/hour steady-state.
//   - Bare regional URL is sort-by-date by default (UI-confirmed).
//   - Listings live at __NEXT_DATA__.props.pageProps.feed.private + .agency.
//   - Early-exit when ALL items on the current page are already known
//     tokens (relaxed from "any single match" to handle Yad2's listing-
//     boost rotation).
//   - Max 5 pages per (region, kind), 600ms politeness gap.
//
// Self-contained Playwright launch — does not import the backend's
// yad2-crawler. Keeps the watcher container's deps minimal and means
// a refactor of the existing CRM crawler can never break this surface.

import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import type { Logger } from 'pino';
import { extractFeedFromPageProps, type ExtractKind } from '../extractors/yad2-listing.js';
import type { HashableListing } from '../hash.js';

export const REGION_SLUGS = [
  'tel-aviv-area',
  'center-and-sharon',
  'jerusalem-area',
  'coastal-north',
  'north-and-valleys',
  'south',
  'east',
] as const;

export type RegionSlug = typeof REGION_SLUGS[number];

const KINDS: ExtractKind[] = ['forsale', 'rent'];

const POLITE_GAP_MS = 600;
// 8 pages × 40 items = ~320-listing buffer per (region, kind) per
// hour. Yad2's sort is freshness-weighted with boost mixing, not
// pure date-desc — fresh listings land somewhere on page 1 reliably,
// but we walk deeper than strictly necessary as a safety net against
// any future sort weirdness or marketing bursts. Page 6+ is unusual
// in steady state because the early-exit fires when all 40 items
// are known.
const MAX_PAGES_PER_REGION = 8;
const PAGE_LOAD_TIMEOUT_MS = 25_000;
// Volume tripwire — if a single (region, kind) ingests more than
// this in one run, log a WATCHER_HIGH_VOLUME warning. Steady-state
// volume per region is ~3/hour; 100 means something exceptional is
// happening (marketing burst, sort change, source migration) and we
// should investigate before next run.
const HIGH_VOLUME_PER_REGION_KIND = 100;

let browser: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (browser && browser.isConnected()) return browser;
  browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      // Critical for Reblaze: Playwright/Puppeteer set
      // navigator.webdriver=true by default, which Reblaze fingerprints
      // as "automated browser → serve challenge". This flag suppresses
      // the marker. Same line the backend's yad2-crawler uses, which
      // crawls Yad2 successfully today.
      '--disable-blink-features=AutomationControlled',
    ],
  });
  return browser;
}

export async function closeBrowser(): Promise<void> {
  if (browser) {
    await browser.close().catch(() => {/* swallow */});
    browser = null;
  }
}

// Total wall-clock budget per page. Hard outer timeout so a single
// stuck Reblaze challenge can't block the entire tick. When this
// fires we forcibly close the page (which throws inside any pending
// goto/evaluate), then move on to the next URL.
const PAGE_HARD_TIMEOUT_MS = 40_000;

async function fetchOnePage(
  ctx: BrowserContext,
  url: string,
  log: Logger,
): Promise<unknown | null> {
  let page: Page | null = null;

  // Outer hard-abort: race the actual fetch against a wall-clock
  // timer. If the timer wins, we close the page from the OUTSIDE so
  // any in-flight Playwright primitive (goto / waitForFunction /
  // evaluate) throws and the inner work unwinds. This guards against
  // a Chromium-internal hang where Playwright's own timeout doesn't
  // propagate (we've seen this on Reblaze JS-challenge pages where
  // the renderer enters a never-resolving state).
  const abort = { fired: false };
  const hardTimer = setTimeout(() => {
    abort.fired = true;
    log.warn({ url, timeoutMs: PAGE_HARD_TIMEOUT_MS }, 'yad2.hard-timeout-aborting');
    page?.close().catch(() => { /* swallow */ });
  }, PAGE_HARD_TIMEOUT_MS);

  try {
    page = await ctx.newPage();
    // Block heavy assets — we only need the HTML + its inlined JSON.
    // Cuts page weight by ~95% and lets us stay polite under the
    // 600ms gap without hammering Yad2.
    await page.route('**/*', (route) => {
      const t = route.request().resourceType();
      if (t === 'image' || t === 'font' || t === 'media' || t === 'stylesheet') {
        return route.abort();
      }
      return route.continue();
    });

    log.info({ url }, 'yad2.goto-start');
    const response = await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: PAGE_LOAD_TIMEOUT_MS,
    });
    log.info({ url, status: response?.status() }, 'yad2.goto-done');

    if (!response || response.status() >= 400) {
      log.warn({ url, status: response?.status() }, 'yad2.page-error');
      return null;
    }

    // Wait for __NEXT_DATA__ to hydrate. Reblaze JS-challenge resolves
    // in 1–2s on a clean Chromium; bumped to 12s headroom for slow
    // EC2 ↔ Yad2 round-trips under load. Tolerate timeout — we'll
    // pull HTML anyway and let the regex/blocked-marker logic decide.
    log.info({ url }, 'yad2.waiting-next-data');
    await page.waitForFunction(
      // eslint-disable-next-line @typescript-eslint/no-implied-eval
      `(() => {
        const el = document.getElementById('__NEXT_DATA__');
        return !!(el && el.textContent && el.textContent.length > 1000);
      })()`,
      undefined,
      { timeout: 12_000 },
    ).catch(() => { /* swallow — extraction below decides */ });

    // Read full HTML via page.content() — robust to Reblaze redirects
    // mid-fetch. page.evaluate() throws "Execution context was destroyed"
    // when the renderer is swapping pages; page.content() snapshots the
    // current document and returns. The backend's yad2-crawler.ts
    // (which crawls successfully today) uses this exact pattern.
    //
    // page.content() can still race against Yad2's client-side router
    // (Next.js prefetch swap mid-render). Tolerate the first throw,
    // wait briefly for the load state to settle, then retry once.
    let html = await page.content().catch(() => null);
    if (html == null) {
      await page.waitForLoadState('domcontentloaded', { timeout: 5_000 }).catch(() => {});
      html = await page.content().catch(() => '');
    }
    const blockMarkers = /__uzdbm_\d|validate\.perfdrive\.com|shieldsquare|x-rbz-/i.test(html);
    const m = html.match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/);
    if (!m) {
      log.warn({ url, blocked: blockMarkers }, 'yad2.no-next-data');
      return null;
    }

    let parsed: unknown;
    try { parsed = JSON.parse(m[1]); }
    catch (e) {
      log.warn({ url, err: String(e) }, 'yad2.next-data-parse-failed');
      return null;
    }
    log.info({ url }, 'yad2.next-data-extracted');

    return (parsed as { props?: { pageProps?: unknown } })?.props?.pageProps ?? null;
  } catch (err) {
    if (abort.fired) {
      // Already logged the hard-timeout warning; surface as null
      // rather than re-throwing so the caller's per-region try/catch
      // doesn't classify this as a "region failure" — it's per-page.
      return null;
    }
    log.warn({ url, err: String(err) }, 'yad2.fetch-failed');
    return null;
  } finally {
    clearTimeout(hardTimer);
    if (page) {
      // Race page.close() against a 5s timer. We've observed real cases
      // where Chromium's renderer enters a state (Reblaze redirect,
      // "Execution context was destroyed") that makes close() never
      // resolve, freezing the entire tick. The leaked page handle is
      // cleaned up when the BrowserContext closes at end-of-tick.
      await Promise.race([
        page.close().catch(() => {/* swallow */}),
        new Promise<void>((r) => setTimeout(r, 5_000)),
      ]);
    }
  }
}

export type DiscoveryStats = { fetched: number; itemsSeen: number };
export type PageContext = { region: string; kind: ExtractKind; page: number };

/**
 * Discover new Yad2 listings across all configured regions × kinds.
 *
 * `knownTokens` is the set of `externalListingId`s already in our DB
 * for source='yad2'. Used for the early-exit rule: stop walking pages
 * for a (region, kind) when every item on the current page is already
 * known.
 *
 * `onPage` (NEW, optional): called after every page is extracted with
 * the page's NOVEL items (already filtered against knownTokens) and
 * the region/kind/page-number context. Use this to stream-commit rows
 * to the DB as they arrive — if the watcher container is killed (SIGTERM
 * during a deploy) or hits a Playwright timeout halfway through, every
 * page committed BEFORE the failure is preserved.
 *
 * Errors thrown from `onPage` propagate up and abort the run for that
 * (region, kind) — the loop continues with the next region.
 */
export async function discoverYad2(opts: {
  regions: readonly string[];
  knownTokens: Set<string>;
  hardCeiling: number;
  log: Logger;
  onPage?: (items: HashableListing[], ctx: PageContext) => Promise<void>;
}): Promise<{ items: HashableListing[]; stats: DiscoveryStats }> {
  const { regions, knownTokens, hardCeiling, log, onPage } = opts;
  const allItems: HashableListing[] = [];
  const stats: DiscoveryStats = { fetched: 0, itemsSeen: 0 };

  const br = await getBrowser();
  // One BrowserContext per discovery run — fresh cookies, no state
  // leakage across hourly ticks. The route-level asset blocking
  // configured per-page above survives the close.
  const ctx = await br.newContext({
    // Modern desktop Chrome on macOS — what the average Israeli
    // residential visitor's browser sends. Fingerprint shape is
    // unremarkable; Reblaze classifies it as legitimate.
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale: 'he-IL',
    timezoneId: 'Asia/Jerusalem',
    // Realistic viewport — undefined viewport (Playwright default)
    // shows up in window.screen telemetry. 1366×900 is the most common
    // desktop in Israel.
    viewport: { width: 1366, height: 900 },
    extraHTTPHeaders: {
      'Accept-Language': 'he-IL,he;q=0.9,en-US;q=0.8,en;q=0.7',
    },
  });

  try {
    for (const region of regions) {
      for (const kind of KINDS) {
        let page = 1;
        let novelInRegionKind = 0;
        // Wrap the inner page-walk in try/catch so one bad
        // (region, kind) doesn't kill the whole tick — Yad2 sometimes
        // hits Reblaze timeouts on a single region while every other
        // region serves cleanly.
        try {
          while (page <= MAX_PAGES_PER_REGION) {
            const sep = page === 1 ? '' : `?page=${page}`;
            const url = `https://www.yad2.co.il/realestate/${kind}/${region}${sep}`;
            log.info({ region, kind, page, url }, 'yad2.fetching');

            const pageProps = await fetchOnePage(ctx, url, log);
            stats.fetched++;
            if (!pageProps) break;

            const items = extractFeedFromPageProps(pageProps, kind);
            stats.itemsSeen += items.length;

            const novel: HashableListing[] = [];
            for (const it of items) {
              if (!knownTokens.has(it.externalListingId)) {
                novel.push(it);
                allItems.push(it);
                // Mark as in-flight known so duplicate tokens within
                // the same run (boosted listings, cross-bucket repeats)
                // only get added once.
                knownTokens.add(it.externalListingId);
              }
            }

            log.info(
              { region, kind, page, itemsOnPage: items.length, novelOnThisPage: novel.length },
              'yad2.page-result',
            );

            // Stream-commit BEFORE the early-exit check so even a
            // single-page region writes its rows before we move on.
            // Errors here bubble out of the `try` and skip the rest
            // of this region's pages — partial progress is preserved
            // because earlier pages already committed.
            if (onPage && novel.length > 0) {
              await onPage(novel, { region, kind, page });
            }

            if (allItems.length >= hardCeiling) {
              log.warn(
                { allItemsLength: allItems.length, hardCeiling },
                'yad2.hard-ceiling-hit',
              );
              return { items: allItems, stats };
            }

            novelInRegionKind += novel.length;

            // Early exit: if EVERY item on this page was already known,
            // we've caught up to last run for this (region, kind).
            if (items.length > 0 && novel.length === 0) break;
            if (items.length === 0) break;

            page++;
            await new Promise((r) => setTimeout(r, POLITE_GAP_MS));
          }
          if (novelInRegionKind >= HIGH_VOLUME_PER_REGION_KIND) {
            log.warn(
              { region, kind, novelInRegionKind },
              'yad2.high-volume-per-region-kind',
            );
          }
        } catch (err) {
          // Per-region error isolation. Most common cause is
          // Playwright's `page.waitForFunction` 30s timeout when
          // Reblaze escalates to a CAPTCHA on this specific region
          // — the next region usually serves cleanly.
          log.warn(
            { region, kind, err: String(err) },
            'yad2.region-failed-continuing',
          );
        }
      }
    }
  } finally {
    await ctx.close().catch(() => {/* swallow */});
  }

  return { items: allItems, stats };
}
