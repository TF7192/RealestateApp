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

// playwright-extra is a thin wrapper around playwright that lets us
// chain in puppeteer-extra-plugin-stealth. Stealth patches ~20
// headless-Chromium fingerprint leaks (navigator.plugins, chrome
// runtime, WebGL renderer, canvas hash, permissions API, etc.) that
// Reblaze fingerprints on. The runtime types come from `playwright`
// itself — we just swap the launcher.
import { chromium as chromiumStealth } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import type { Browser, BrowserContext, Page } from 'playwright';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Logger } from 'pino';

chromiumStealth.use(StealthPlugin());

import { pickProxy, poolSize, describeProxy } from '../proxy.js';
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

const ALL_KINDS: ExtractKind[] = ['forsale', 'rent'];

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

// Per-tick fingerprint rotation. Reblaze profiles repeated visits
// from the same UA/viewport/locale combo, so rotating each tick lowers
// the chance of getting flagged after sustained scraping. All entries
// are real Chrome/Safari builds the average Israeli desktop visitor
// might use; locale stays Israeli (he-IL primary) since the timezone
// must match for Reblaze's locale check.
const FINGERPRINTS: Array<{
  userAgent: string;
  viewport: { width: number; height: number };
  acceptLanguage: string;
}> = [
  {
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1366, height: 900 },
    acceptLanguage: 'he-IL,he;q=0.9,en-US;q=0.8,en;q=0.7',
  },
  {
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 },
    acceptLanguage: 'he-IL,he;q=0.9,en;q=0.8',
  },
  {
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 ' +
      '(KHTML, like Gecko) Version/17.4 Safari/605.1.15',
    viewport: { width: 1440, height: 900 },
    acceptLanguage: 'he-IL,he;q=0.9,en-US;q=0.8',
  },
  {
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    viewport: { width: 1536, height: 864 },
    acceptLanguage: 'he-IL,he;q=0.9,en-US;q=0.8,en;q=0.7',
  },
];

function pickFingerprint() {
  return FINGERPRINTS[Math.floor(Math.random() * FINGERPRINTS.length)];
}

// Where storageState (cookies + localStorage) is persisted across
// ticks. /tmp is fine in the container — it's per-container, survives
// between ticks, lost on container restart (acceptable: warmup re-stamps
// cookies on first post-restart tick).
const STATE_DIR = process.env.WATCHER_STATE_DIR || '/tmp/yad2-state';

let browser: Browser | null = null;

// Headful flag — when WATCHER_HEADFUL=1, run a real (non-headless)
// Chromium. Combined with xvfb-run on the container side this gives a
// real GPU/screen surface, which Reblaze can no longer detect as
// "headless browser". Defaults to headful in production via the
// Docker CMD; falls back to headless when the env var isn't set
// (local dev without an X server).
const HEADFUL = process.env.WATCHER_HEADFUL === '1';

async function getBrowser(): Promise<Browser> {
  if (browser && browser.isConnected()) return browser;
  browser = await chromiumStealth.launch({
    headless: !HEADFUL,
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

    // Reblaze challenge handling — if we landed on validate.perfdrive.com
    // (Reblaze's Shieldsquare interstitial), wait for the JS challenge
    // to auto-resolve and redirect us back to yad2.co.il. This gives us
    // a session cookie that subsequent fetches reuse.
    const landedAt = page.url();
    if (landedAt.includes('perfdrive.com') || landedAt.includes('shieldsquare')) {
      log.info({ url, challengeUrl: landedAt.slice(0, 80) }, 'yad2.challenge-detected');
      await page
        .waitForURL((u) => !u.href.includes('perfdrive.com') && !u.href.includes('shieldsquare'), {
          timeout: 15_000,
        })
        .catch(() => { /* fall through — extraction below decides */ });
      log.info({ url, finalUrl: page.url().slice(0, 80) }, 'yad2.challenge-resolved');
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
  // Subset of ['forsale', 'rent'] to crawl this tick. Defaults to
  // BOTH if omitted, but production schedules them in separate ticks
  // 15 min apart to give each kind a fresh Reblaze challenge slot.
  kinds?: readonly ExtractKind[];
  knownTokens: Set<string>;
  hardCeiling: number;
  log: Logger;
  onPage?: (items: HashableListing[], ctx: PageContext) => Promise<void>;
}): Promise<{ items: HashableListing[]; stats: DiscoveryStats }> {
  const { regions, knownTokens, hardCeiling, log, onPage } = opts;
  const kinds = opts.kinds && opts.kinds.length > 0 ? opts.kinds : ALL_KINDS;
  const allItems: HashableListing[] = [];
  const stats: DiscoveryStats = { fetched: 0, itemsSeen: 0 };

  const br = await getBrowser();
  // One BrowserContext per discovery run — fresh cookies, no state
  // leakage across hourly ticks. The route-level asset blocking
  // configured per-page above survives the close.
  // Rotate fingerprint per tick. Same context for the duration of a
  // tick so Reblaze cookies established on the first request carry
  // through subsequent listing fetches; next tick spins up a fresh
  // BrowserContext with a new fingerprint pulled from the pool.
  const fp = pickFingerprint();
  // Pick a proxy for THIS tick. Round-robin through the pool so every
  // tick presents to Reblaze with a different IP. Pool is parsed once
  // from WATCHER_PROXIES at process start; running without proxies
  // (empty pool) is still supported — falls back to the EC2 NAT IP.
  const proxy = pickProxy();
  log.info(
    { ua: fp.userAgent.slice(0, 30), viewport: fp.viewport, proxy: describeProxy(proxy), poolSize: poolSize() },
    'yad2.fingerprint',
  );

  // Persist Reblaze session cookies between ticks. A real user keeps
  // their cookies for days; we used to throw them away every hour,
  // forcing a fresh challenge each time. Loading prior storageState
  // means subsequent ticks usually skip the challenge entirely. File
  // is per-fingerprint-class so different UAs don't share cookies.
  // State key includes both fingerprint AND proxy host — Reblaze ties
  // its session cookies to (UA × IP), so reusing cookies across proxies
  // re-triggers a challenge anyway. Per-(fp × proxy) cookie file means
  // round-robin ticks land on a warm session whenever they reuse a
  // (fp, proxy) pair (likely after a few ticks given pool size).
  const proxyKey = proxy ? proxy.server.replace(/[^a-z0-9]/gi, '').slice(0, 16) : 'direct';
  const fpKey = fp.userAgent.replace(/[^a-z0-9]/gi, '').slice(0, 16);
  const statePath = path.join(STATE_DIR, `yad2-${fpKey}-${proxyKey}.json`);
  let storageState: string | undefined;
  try {
    await fs.access(statePath);
    storageState = statePath;
    log.info({ fpKey, proxyKey }, 'yad2.storage-state-loaded');
  } catch { /* no prior state — first run for this fingerprint */ }

  const ctx = await br.newContext({
    userAgent: fp.userAgent,
    locale: 'he-IL',
    timezoneId: 'Asia/Jerusalem',
    viewport: fp.viewport,
    extraHTTPHeaders: {
      'Accept-Language': fp.acceptLanguage,
    },
    ...(storageState ? { storageState } : {}),
    // Per-context proxy. Playwright routes ALL traffic from this
    // context (warmup + every fetchOnePage) through the proxy, so the
    // tick's IP stays consistent.
    ...(proxy ? { proxy } : {}),
  });

  // Warm-up: visit Yad2's homepage first to establish Reblaze session
  // cookies. Real users land on / before drilling into /realestate/rent/...
  // — directly hitting a deep listing path triggers stricter challenges.
  // The cookies set here ride the BrowserContext through every region
  // fetch this tick.
  try {
    log.info({}, 'yad2.warmup-start');
    const warmup = await ctx.newPage();
    await warmup.goto('https://www.yad2.co.il/', {
      waitUntil: 'domcontentloaded',
      timeout: 20_000,
    });
    // Give Reblaze ~3s to run its challenge JS and stamp our cookies,
    // and let it auto-redirect back to yad2 if we landed on the
    // challenge interstitial.
    await new Promise((r) => setTimeout(r, 3_000));
    const warmupUrl = warmup.url();
    const challenged = warmupUrl.includes('perfdrive.com') || warmupUrl.includes('shieldsquare');
    await warmup.close().catch(() => {/* swallow */});

    if (challenged) {
      // We're still on the challenge page after 3s — Reblaze either
      // didn't accept us or our IP is currently flagged. Don't poison
      // the persisted state file with challenge cookies; surface the
      // signal to the operator instead.
      log.warn({ warmupUrl: warmupUrl.slice(0, 80) }, 'yad2.warmup-challenged-not-saving');
    } else {
      try {
        await fs.mkdir(STATE_DIR, { recursive: true });
        await ctx.storageState({ path: statePath });
        log.info({ statePath }, 'yad2.storage-state-saved');
      } catch (err) {
        log.warn({ err: String(err) }, 'yad2.storage-state-save-failed');
      }
    }
    log.info({ challenged }, 'yad2.warmup-done');
  } catch (err) {
    log.warn({ err: String(err) }, 'yad2.warmup-failed-continuing');
  }

  try {
    for (const region of regions) {
      for (const kind of kinds) {
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
