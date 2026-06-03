// Yad2 region/kind feed discovery.
//
// Live-verified scan plan (see MARKET_DISCOVERY_PLAN.md / chat audit):
//   - 7 regions × 3 kinds (forsale, rent, commercial) = 21 page fetches/hour steady-state.
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

const ALL_KINDS: ExtractKind[] = ['forsale', 'rent', 'commercial'];

// Human-pacing gap range. Replaces the old fixed 600ms gap — a
// constant cadence is itself a fingerprint signal. Real users vary
// from <1s on a quick scroll-back to 5s+ on a careful read; we use
// 1.5-3.5s with uniform jitter, biased toward the lower end on early
// pages and the upper end on later pages (humans accelerate then
// slow down as they look more carefully).
const POLITE_GAP_MIN_MS = 1500;
const POLITE_GAP_MAX_MS = 3500;
function humanGapMs(): number {
  return POLITE_GAP_MIN_MS + Math.floor(Math.random() * (POLITE_GAP_MAX_MS - POLITE_GAP_MIN_MS));
}
// 3 pages × 40 items = ~120-listing buffer per (region, kind) per
// tick. Tightened from 8 → 3 to keep bandwidth bounded and reduce
// the chance of triggering Reblaze's rate-limit on a single IP.
// Yad2's sort is freshness-weighted: novel listings reliably land
// on page 1; the page 2-3 walk is a safety net against the boost
// rotation occasionally shuffling fresh items deeper. Early-exit
// (every item already known) still fires on page 1 in steady state.
const MAX_PAGES_PER_REGION = 3;
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

  // Tracks whether the document's initial load has reached
  // domcontentloaded. Set true right after page.goto(...) resolves;
  // used to abort post-load XHR/fetch telemetry that doesn't affect
  // the listing payload. Setting via a closure flag (Playwright's
  // route handler doesn't have direct access to the load state).
  const loadState = { domLoaded: false };

  try {
    page = await ctx.newPage();
    // Bandwidth-trim route handler. Three filters, in order:
    //   1. Block heavy asset classes (image/font/media/stylesheet) —
    //      Yad2's listings render fine without them.
    //   2. Block known third-party telemetry domains — analytics,
    //      pixels, tag managers don't affect the __NEXT_DATA__ payload.
    //      Whitelist only: yad2.co.il itself, Reblaze challenge hosts,
    //      and the Yad2 CDN. Everything else gets aborted.
    //   3. After domcontentloaded fires, abort any further xhr/fetch
    //      requests — Yad2's client-side JS pings several telemetry
    //      endpoints we don't need (recommendations, ad-tracking, log
    //      beacons). The HTML + inline JSON we want is already in hand
    //      by domcontentloaded.
    await page.route('**/*', (route) => {
      const req = route.request();
      const t = req.resourceType();
      if (t === 'image' || t === 'font' || t === 'media' || t === 'stylesheet') {
        return route.abort();
      }
      // Allowlist by host — any other host = abort.
      let host = '';
      try { host = new URL(req.url()).host.toLowerCase(); }
      catch { return route.continue(); /* malformed URL — let it through */ }
      const isYad2 =
        host === 'www.yad2.co.il' ||
        host === 'yad2.co.il' ||
        host.endsWith('.yad2.co.il') ||
        host.endsWith('.y2cdn.io');     // Yad2's image CDN (already blocked above by resourceType)
      const isReblaze =
        host === 'validate.perfdrive.com' ||
        host.endsWith('.perfdrive.com') ||
        host.endsWith('.shieldsquare.com') ||
        host === 'shieldsquare.com';
      if (!isYad2 && !isReblaze) {
        return route.abort();
      }
      // Post-DCL XHR/fetch abort. Yad2 fires telemetry pings AFTER
      // initial render; we have everything we need by then.
      if (loadState.domLoaded && (t === 'xhr' || t === 'fetch')) {
        return route.abort();
      }
      return route.continue();
    });

    log.info({ url }, 'yad2.goto-start');
    const response = await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: PAGE_LOAD_TIMEOUT_MS,
    });
    loadState.domLoaded = true;
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

    // Human-pacing — small mouse movement + scroll + dwell before
    // extracting. Reblaze (and many WAFs) record session-level
    // behavior signals: real users move the cursor, scroll the page,
    // and dwell for hundreds of ms before navigating. Pure-headless
    // scraping shows zero of those signals. The interactions below
    // are cheap (~600-1500ms total) and put a session-depth signal
    // into Reblaze's telemetry that pushes us further into the
    // "real user" cluster.
    try {
      const x1 = 200 + Math.floor(Math.random() * 600);
      const y1 = 200 + Math.floor(Math.random() * 400);
      await page.mouse.move(x1, y1, { steps: 6 + Math.floor(Math.random() * 6) });
      await new Promise((r) => setTimeout(r, 150 + Math.floor(Math.random() * 250)));
      await page.evaluate(() => {
        window.scrollBy(0, 300 + Math.floor(Math.random() * 600));
      });
      await new Promise((r) => setTimeout(r, 250 + Math.floor(Math.random() * 500)));
      const x2 = x1 + 100 + Math.floor(Math.random() * 300);
      const y2 = y1 + 100 + Math.floor(Math.random() * 300);
      await page.mouse.move(x2, y2, { steps: 8 + Math.floor(Math.random() * 8) });
      await new Promise((r) => setTimeout(r, 200 + Math.floor(Math.random() * 400)));
    } catch { /* best-effort — extraction is the goal */ }

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

  // Per-region BrowserContext rotation + runtime re-roll. Each region
  // opens a fresh (proxy × fingerprint) context; if a page fetch
  // returns null mid-region (signal of an Reblaze-flagged IP), we
  // close that context, pick a NEW (proxy × fp), open a fresh context,
  // and retry the same page. Capped at MAX_PAGE_REROLLS per page so a
  // bad-batch run doesn't burn the proxy budget on a single region.
  log.info({ poolSize: poolSize(), regions: regions.length }, 'yad2.tick-start');

  const STATE_FRESH_MS = 2 * 60 * 60 * 1000; // 2 hours
  // Max times we re-roll a fresh (proxy × fp) context for the SAME
  // page. With a ~3k-port DataImpulse pool the marginal cost of
  // trying again is tiny; capping at 3 keeps a worst-case page
  // bounded to ~100 s while giving us three chances to land on a
  // clean exit IP.
  const MAX_PAGE_REROLLS = 3;

  // Helper: open a fresh BrowserContext for (region, attempt) using a
  // newly-picked fingerprint + proxy + cookie-state. Returns the ctx
  // and the keys we used (so the caller can save state on success).
  async function openRegionContext(region: string) {
    const fp = pickFingerprint();
    const proxy = pickProxy();
    const proxyKey = proxy ? proxy.server.replace(/[^a-z0-9]/gi, '').slice(0, 16) : 'direct';
    const fpKey = fp.userAgent.replace(/[^a-z0-9]/gi, '').slice(0, 16);
    const regionKey = region.replace(/[^a-z0-9]/gi, '').slice(0, 24);
    const statePath = path.join(STATE_DIR, `yad2-${fpKey}-${proxyKey}-${regionKey}.json`);

    let storageState: string | undefined;
    let stateAgeMs = Infinity;
    try {
      const st = await fs.stat(statePath);
      storageState = statePath;
      stateAgeMs = Date.now() - st.mtimeMs;
    } catch { /* fresh combo */ }

    log.info(
      {
        region, fpKey, proxyKey,
        ua: fp.userAgent.slice(0, 30),
        viewport: fp.viewport,
        proxy: describeProxy(proxy),
        stateAgeMs: Number.isFinite(stateAgeMs) ? stateAgeMs : null,
      },
      'yad2.region-context-open',
    );

    const ctx = await br.newContext({
      userAgent: fp.userAgent,
      locale: 'he-IL',
      timezoneId: 'Asia/Jerusalem',
      viewport: fp.viewport,
      extraHTTPHeaders: { 'Accept-Language': fp.acceptLanguage },
      ...(storageState ? { storageState } : {}),
      ...(proxy ? { proxy } : {}),
    });

    // Warm-up — only when cookies aren't fresh.
    if (stateAgeMs < STATE_FRESH_MS) {
      log.info({ region, stateAgeMs }, 'yad2.warmup-skipped-cookie-fresh');
      await new Promise((r) => setTimeout(r, 1500 + Math.floor(Math.random() * 2500)));
    } else {
      try {
        log.info({ region }, 'yad2.warmup-start');
        const warmup = await ctx.newPage();
        await warmup.goto('https://www.yad2.co.il/', {
          waitUntil: 'domcontentloaded',
          timeout: 20_000,
        });
        await new Promise((r) => setTimeout(r, 3_000));
        const warmupUrl = warmup.url();
        const challenged = warmupUrl.includes('perfdrive.com') || warmupUrl.includes('shieldsquare');
        await warmup.close().catch(() => {/* swallow */});
        if (challenged) {
          log.warn({ region, warmupUrl: warmupUrl.slice(0, 80) }, 'yad2.warmup-challenged-not-saving');
        } else {
          try {
            await fs.mkdir(STATE_DIR, { recursive: true });
            await ctx.storageState({ path: statePath });
          } catch (err) {
            log.warn({ region, err: String(err) }, 'yad2.storage-state-save-failed');
          }
        }
        log.info({ region, challenged }, 'yad2.warmup-done');
        await new Promise((r) => setTimeout(r, 1500 + Math.floor(Math.random() * 2500)));
      } catch (err) {
        log.warn({ region, err: String(err) }, 'yad2.warmup-failed-continuing');
      }
    }
    return { ctx, statePath };
  }

  for (const region of regions) {
    let regionState: { ctx: BrowserContext; statePath: string } | null = null;
    try {
      regionState = await openRegionContext(region);
      for (const kind of kinds) {
        let page = 1;
        let pageRerolls = 0;
        let novelInRegionKind = 0;
        try {
          while (page <= MAX_PAGES_PER_REGION) {
            const sep = page === 1 ? '' : `?page=${page}`;
            const url = `https://www.yad2.co.il/realestate/${kind}/${region}${sep}`;
            log.info({ region, kind, page, url }, 'yad2.fetching');

            const pageProps = await fetchOnePage(regionState!.ctx, url, log);
            stats.fetched++;

            if (!pageProps) {
              // Bad page — likely Reblaze flagged the upstream IP.
              if (pageRerolls < MAX_PAGE_REROLLS) {
                pageRerolls++;
                log.warn({ region, kind, page, attempt: pageRerolls }, 'yad2.reroll-bad-page');
                await regionState!.ctx.close().catch(() => {/* swallow */});
                regionState = await openRegionContext(region);
                continue;
              }
              log.warn({ region, kind, page, rerolls: pageRerolls }, 'yad2.reroll-exhausted');
              break;
            }
            // Successful page — reset reroll counter so a later flaky
            // page can still get its own retries.
            pageRerolls = 0;

            const items = extractFeedFromPageProps(pageProps, kind);
            stats.itemsSeen += items.length;

            const novel: HashableListing[] = [];
            for (const it of items) {
              if (!knownTokens.has(it.externalListingId)) {
                novel.push(it);
                allItems.push(it);
                knownTokens.add(it.externalListingId);
              }
            }

            log.info(
              { region, kind, page, itemsOnPage: items.length, novelOnThisPage: novel.length },
              'yad2.page-result',
            );

            if (onPage && novel.length > 0) {
              await onPage(novel, { region, kind, page });
            }

            if (allItems.length >= hardCeiling) {
              log.warn({ allItemsLength: allItems.length, hardCeiling }, 'yad2.hard-ceiling-hit');
              await regionState!.ctx.close().catch(() => {/* swallow */});
              return { items: allItems, stats };
            }

            novelInRegionKind += novel.length;

            // Early exit: every item already known.
            if (items.length > 0 && novel.length === 0) break;
            if (items.length === 0) break;

            page++;
            await new Promise((r) => setTimeout(r, humanGapMs()));
          }
          if (novelInRegionKind >= HIGH_VOLUME_PER_REGION_KIND) {
            log.warn({ region, kind, novelInRegionKind }, 'yad2.high-volume-per-region-kind');
          }
        } catch (err) {
          log.warn({ region, kind, err: String(err) }, 'yad2.region-failed-continuing');
        }
      }
    } finally {
      if (regionState) await regionState.ctx.close().catch(() => {/* swallow */});
    }

    // Polite gap between regions.
    await new Promise((r) => setTimeout(r, 2500 + Math.floor(Math.random() * 3500)));
  }

  return { items: allItems, stats };
}
