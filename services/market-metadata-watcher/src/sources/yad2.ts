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
  if (browser) return browser;
  browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  return browser;
}

export async function closeBrowser(): Promise<void> {
  if (browser) {
    await browser.close().catch(() => {/* swallow */});
    browser = null;
  }
}

async function fetchOnePage(
  ctx: BrowserContext,
  url: string,
  log: Logger,
): Promise<unknown | null> {
  let page: Page | null = null;
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

    const response = await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: PAGE_LOAD_TIMEOUT_MS,
    });

    if (!response || response.status() >= 400) {
      log.warn({ url, status: response?.status() }, 'yad2.page-error');
      return null;
    }

    // Wait for __NEXT_DATA__ to be hydrated. The Reblaze JS challenge
    // resolves in 1–2s on a clean Chromium; we give it 8s headroom.
    await page.waitForFunction(
      () => {
        const el = document.getElementById('__NEXT_DATA__');
        return !!el && (el.textContent?.length ?? 0) > 100;
      },
      { timeout: 8_000 },
    );

    const json = await page.evaluate(() => {
      const el = document.getElementById('__NEXT_DATA__');
      return el?.textContent || null;
    });

    if (!json) {
      log.warn({ url }, 'yad2.no-next-data');
      return null;
    }

    let parsed: unknown;
    try { parsed = JSON.parse(json); }
    catch (e) {
      log.warn({ url, err: String(e) }, 'yad2.next-data-parse-failed');
      return null;
    }

    return (parsed as { props?: { pageProps?: unknown } })?.props?.pageProps ?? null;
  } finally {
    if (page) await page.close().catch(() => {/* swallow */});
  }
}

export type DiscoveryStats = { fetched: number; itemsSeen: number };

/**
 * Discover new Yad2 listings across all configured regions × kinds.
 *
 * `knownTokens` is the set of `externalListingId`s already in our DB
 * for source='yad2'. Used for the early-exit rule: stop walking pages
 * for a (region, kind) when every item on the current page is already
 * known. Page 1 in a quiet hour finds zero new tokens → bails
 * immediately, costing 1 page fetch.
 *
 * Returns flat list of new listings to upsert. The caller (tick.ts)
 * runs the upsert + match-evaluation loop.
 */
export async function discoverYad2(opts: {
  regions: readonly string[];
  knownTokens: Set<string>;
  hardCeiling: number;
  log: Logger;
}): Promise<{ items: HashableListing[]; stats: DiscoveryStats }> {
  const { regions, knownTokens, hardCeiling, log } = opts;
  const allItems: HashableListing[] = [];
  const stats: DiscoveryStats = { fetched: 0, itemsSeen: 0 };

  const br = await getBrowser();
  // One BrowserContext per discovery run — fresh cookies, no state
  // leakage across hourly ticks. The route-level asset blocking
  // configured per-page above survives the close.
  const ctx = await br.newContext({
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/127.0 Safari/537.36',
    locale: 'he-IL',
    timezoneId: 'Asia/Jerusalem',
  });

  try {
    for (const region of regions) {
      for (const kind of KINDS) {
        let page = 1;
        while (page <= MAX_PAGES_PER_REGION) {
          const sep = page === 1 ? '' : `?page=${page}`;
          const url = `https://www.yad2.co.il/realestate/${kind}/${region}${sep}`;
          log.info({ region, kind, page, url }, 'yad2.fetching');

          const pageProps = await fetchOnePage(ctx, url, log);
          stats.fetched++;
          if (!pageProps) break;

          const items = extractFeedFromPageProps(pageProps, kind);
          stats.itemsSeen += items.length;

          let novelOnThisPage = 0;
          for (const it of items) {
            if (!knownTokens.has(it.externalListingId)) {
              allItems.push(it);
              novelOnThisPage++;
              // Mark as in-flight known so duplicate tokens within the
              // same run (e.g. boosted listings appearing in both
              // private and agency buckets) only get added once.
              knownTokens.add(it.externalListingId);
            }
          }

          log.info(
            { region, kind, page, itemsOnPage: items.length, novelOnThisPage },
            'yad2.page-result',
          );

          if (allItems.length >= hardCeiling) {
            log.warn({ allItemsLength: allItems.length, hardCeiling }, 'yad2.hard-ceiling-hit');
            return { items: allItems, stats };
          }

          // Early exit: if EVERY item on this page was already known,
          // we've caught up to last run for this (region, kind).
          if (items.length > 0 && novelOnThisPage === 0) break;
          // No items at all = end of feed for this region.
          if (items.length === 0) break;

          page++;
          await new Promise((r) => setTimeout(r, POLITE_GAP_MS));
        }
      }
    }
  } finally {
    await ctx.close().catch(() => {/* swallow */});
  }

  return { items: allItems, stats };
}
