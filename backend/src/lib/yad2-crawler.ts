// Yad2 agency crawler — Playwright edition.
//
// Why Playwright (was: plain node fetch + Safari iOS UA):
//   Yad2 sits behind Reblaze (Radware), which serves a JS challenge to
//   any client that doesn't look like a real browser. Plain fetch gets a
//   challenge HTML back instead of the listing page — the cookie that
//   unblocks subsequent requests is set by JavaScript that has to run
//   in a real browser. Playwright launches a real Chromium that solves
//   the challenge automatically, then we extract the same __NEXT_DATA__
//   payload we always parsed.
//
// Architecture:
//   - One lazy-launched Chromium per process (warm-pool of 1).
//   - One fresh BrowserContext per agency crawl (no cross-tenant cookie
//     leak between sequential imports).
//   - Image / font / media requests aborted at the route level — we
//     don't need any pixels, only the inline JSON. Cuts page weight by
//     ~95% and keeps the crawl fast.
//   - waitUntil: 'domcontentloaded' + an explicit wait for
//     __NEXT_DATA__ to be populated. The challenge resolves in 1-2s in
//     the same flow.
//   - Reblaze fingerprint markers are still checked in the resolved
//     HTML — if Reblaze escalates to a CAPTCHA the JS-challenge bypass
//     won't help and we surface a clear error.
//
// Two-phase crawl (unchanged from the fetch-based version):
//   1. Listings: agency/<id>/<section>?page=N → __NEXT_DATA__
//      → props.pageProps.agencyData.feed
//   2. Details: realestate/item/<token> → full image gallery
//      from props.pageProps.dehydratedState.queries[].state.data.metaData.images
//
// Polite by design: 600ms gap between page navigations (Playwright is
// slower per request than fetch, so we can ride a slightly tighter gap
// without hammering Yad2).

import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';

const POLITE_GAP_MS = 600;
const MAX_PAGES_PER_SECTION = 10;
const MAX_LISTINGS_TOTAL = 100;
// Hard cap on detail-page enrichment — even if a Pro plan agency has
// 80 listings we won't hold the request open for 16 minutes.
const MAX_DETAIL_FETCHES = 50;

// Per-page timings. Reblaze's challenge typically resolves in ~1-2s;
// padded for slow-day variance.
const NAV_TIMEOUT_MS = 30_000;
const NEXT_DATA_WAIT_MS = 12_000;

// Modern desktop Chrome — what the average residential visitor looks
// like to Yad2's analytics. Locale + timezone match an Israeli user.
const DESKTOP_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

export type Yad2Section = 'forsale' | 'rent' | 'commercial';

export interface Yad2Listing {
  sourceId: string;       // listing token (also URL slug)
  section: Yad2Section;   // which agency section it came from
  title?: string;
  street: string;
  city: string;
  region?: string;
  rooms?: number | null;
  sqm?: number | null;
  floor?: number | null;
  price?: number | null;
  type?: string;          // "דירה", "פנטהאוז", etc.
  coverImage?: string;    // https://img.yad2.co.il/Pic/... (first image)
  // Phase-2 enrichment: full gallery from the detail page. May be empty
  // if the detail fetch failed or was skipped (we cap at 50 details per
  // agency to keep request times sane).
  images?: string[];
  description?: string;
  tags?: string[];
  // Source mapping hints
  categoryId?: number;
  subcategoryId?: number;
  adType?: string;
}

export interface CrawlReport {
  agencyId: string;
  agencyName?: string;
  agencyPhone?: string;
  listings: Yad2Listing[];
  // Per-section diagnostics so the frontend can show "5 in מכירה,
  // 3 in השכרה, 0 in מסחרי".
  sections: {
    section: Yad2Section;
    pagesFetched: number;
    totalPages: number;
    totalListings: number;
    error?: string;
  }[];
  truncated: boolean;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ── Browser lifecycle ────────────────────────────────────────────
// Chromium is heavy to launch (~1-2s) and uses ~250MB resident. We
// launch it once on first use and keep it alive for the lifetime of
// the process. Contexts (cheap, ~5MB each) are spun up per-crawl so
// agencies don't share cookies / storage.
//
// The promise-based singleton handles concurrent first-use safely —
// two requests landing simultaneously share the same launch promise.

let browserPromise: Promise<Browser> | null = null;

async function getBrowser(): Promise<Browser> {
  if (browserPromise) {
    const b = await browserPromise;
    if (b.isConnected()) return b;
    // Stale launch (process resumed from sleep, or browser crashed) —
    // re-launch on next await.
    browserPromise = null;
  }
  if (!browserPromise) {
    browserPromise = chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        // Linux containers often have a tiny /dev/shm — Chromium will
        // OOM-allocate without this.
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
      ],
    });
  }
  return browserPromise;
}

async function newCrawlContext(): Promise<BrowserContext> {
  const browser = await getBrowser();
  const ctx = await browser.newContext({
    userAgent: DESKTOP_UA,
    locale: 'he-IL',
    timezoneId: 'Asia/Jerusalem',
    viewport: { width: 1366, height: 900 },
    extraHTTPHeaders: {
      'Accept-Language': 'he-IL,he;q=0.9,en-US;q=0.8,en;q=0.7',
    },
    // Don't expose `navigator.webdriver = true` — Reblaze checks it.
    bypassCSP: false,
  });
  // Block bytes we don't need. Keeps a full agency crawl under ~30s
  // even with detail-page enrichment.
  await ctx.route('**/*', (route) => {
    const t = route.request().resourceType();
    if (t === 'image' || t === 'font' || t === 'media' || t === 'stylesheet') {
      return route.abort();
    }
    return route.continue();
  });
  return ctx;
}

// Best-effort cleanup on process exit. Keeps Chromium from being
// orphaned in the container if the Node process is signaled.
let shutdownHooked = false;
function ensureShutdownHook() {
  if (shutdownHooked) return;
  shutdownHooked = true;
  const shutdown = async () => {
    if (!browserPromise) return;
    try {
      const b = await browserPromise;
      await b.close();
    } catch { /* ignore */ }
    browserPromise = null;
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}

// ── Page fetcher ─────────────────────────────────────────────────
// Returns the resolved HTML after Reblaze's JS challenge has run (if
// any) and __NEXT_DATA__ is in the DOM. `blocked` is true when the
// challenge didn't resolve in time and the response still looks like
// a Reblaze interstitial.
type PageResult = { ok: boolean; html?: string; status?: number; blocked?: boolean };

async function fetchPage(ctx: BrowserContext, url: string): Promise<PageResult> {
  let page: Page | null = null;
  try {
    page = await ctx.newPage();
    const response = await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: NAV_TIMEOUT_MS,
    });
    const status = response?.status() ?? 0;

    // Wait for the inline Next.js payload to be populated. Reblaze's
    // challenge has resolved by the time this fires; if it didn't,
    // the wait will time out and we'll detect the block below.
    // The function runs INSIDE the browser, so document/window exist
    // there even though TS can't see them in Node-side code.
    await page
      .waitForFunction(
        // eslint-disable-next-line @typescript-eslint/no-implied-eval
        `(() => {
          const el = document.getElementById('__NEXT_DATA__');
          return !!(el && el.textContent && el.textContent.length > 1000);
        })()`,
        undefined,
        { timeout: NEXT_DATA_WAIT_MS }
      )
      .catch(() => { /* fall through — block detection happens below */ });

    const html = await page.content();
    const hasNextData = /<script[^>]+id=["']__NEXT_DATA__["']/.test(html);
    const blockMarkers = /__uzdbm_\d|validate\.perfdrive\.com|shieldsquare|x-rbz-/i.test(html);

    // If we got through the challenge, __NEXT_DATA__ should exist even
    // when the challenge markers are still present (Reblaze leaves the
    // sentinel script in some pages). Treat blocked = "no payload".
    if (!hasNextData && blockMarkers) return { ok: false, status, html, blocked: true };
    if (status >= 400 && !hasNextData) return { ok: false, status };
    return { ok: true, html, status };
  } catch {
    return { ok: false };
  } finally {
    if (page) await page.close().catch(() => {});
  }
}

// ── JSON extraction (unchanged from the fetch-based version) ─────

function extractNextData(html: string): any | null {
  const m = html.match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/);
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch { return null; }
}

function pickStr(...vals: any[]): string | undefined {
  for (const v of vals) {
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (typeof v === 'number') return String(v);
  }
  return undefined;
}

function pickNum(...vals: any[]): number | null {
  for (const v of vals) {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string') {
      const n = Number(v.replace(/[^\d.-]/g, ''));
      if (Number.isFinite(n) && n !== 0) return n;
    }
  }
  return null;
}

function normalize(item: any, section: Yad2Section): Yad2Listing | null {
  if (!item || typeof item !== 'object') return null;
  const token = pickStr(item.token, item.id, item.orderId);
  if (!token) return null;
  const a = item.address || {};
  // Yad2 teasers sometimes omit `street` on purpose (agent hid it, or
  // listing is positioned at neighborhood granularity only). Rather
  // than write '—' and lose the geolocation signal, fall back through
  // neighborhood → area → region → the ad title in that order. The
  // canonical-address normalizer downstream will still correct
  // spelling drift once we pick something non-empty.
  const street =
    pickStr(a.street?.text, a.street, item.street,
            a.neighborhood?.text, a.neighborhood,
            a.area?.text, a.area,
            item.neighborhood, item.area) || '';
  return {
    sourceId: String(token),
    section,
    title: pickStr(item.title, item.subtitle),
    street,
    city:   pickStr(a.city?.text,   a.city,   item.city)   || '',
    region: pickStr(a.region?.text, a.region),
    rooms:  pickNum(item.additionalDetails?.roomsCount,   item.rooms),
    sqm:    pickNum(item.additionalDetails?.squareMeter,  item.sqm,  item.size),
    floor:  pickNum(a.house?.floor, item.floor),
    price:  pickNum(item.price, item.priceValue, item.metaData?.price),
    type:   pickStr(item.additionalDetails?.property?.text, item.type),
    coverImage: pickStr(item.metaData?.coverImage),
    tags: Array.isArray(item.tags)
      ? item.tags.map((t: any) => pickStr(t?.name)).filter(Boolean) as string[]
      : undefined,
    categoryId:    typeof item.categoryId    === 'number' ? item.categoryId    : undefined,
    subcategoryId: typeof item.subcategoryId === 'number' ? item.subcategoryId : undefined,
    adType: pickStr(item.adType),
  };
}

// ── Section walker ───────────────────────────────────────────────

async function crawlSection(
  ctx: BrowserContext,
  agencyId: string,
  section: Yad2Section,
  limitRemaining: number,
): Promise<{
  listings: Yad2Listing[];
  pagesFetched: number;
  totalPages: number;
  agencyName?: string;
  agencyPhone?: string;
  error?: string;
}> {
  const out: Yad2Listing[] = [];
  let totalPages = 0;
  let pagesFetched = 0;
  let agencyName: string | undefined;
  let agencyPhone: string | undefined;

  for (let page = 1; page <= MAX_PAGES_PER_SECTION; page++) {
    if (out.length >= limitRemaining) break;

    const url = `https://www.yad2.co.il/realestate/agency/${encodeURIComponent(agencyId)}/${section}?page=${page}`;
    if (page > 1) await sleep(POLITE_GAP_MS);
    const r = await fetchPage(ctx, url);
    if (!r.ok) {
      if (r.status === 404 && page > 1) break;
      if (r.blocked) {
        return {
          listings: out,
          pagesFetched,
          totalPages,
          error: 'Yad2 חוסם את השרת שלנו (אימות-בוט). נא לנסות שוב מאוחר יותר או לפנות לתמיכה.',
        };
      }
      return {
        listings: out,
        pagesFetched,
        totalPages,
        error: r.status === 429 || r.status === 403
          ? 'Yad2 חסם את הבקשה — נסה שוב בעוד מספר דקות'
          : `Yad2 returned ${r.status ?? 'no response'}`,
      };
    }
    pagesFetched++;
    const data = extractNextData(r.html!);
    const ag = data?.props?.pageProps?.agencyData;
    if (!ag) break; // page exists but no agency block — likely structure change

    if (page === 1) {
      totalPages = ag.pagination?.totalPages ?? 0;
      // Pull agency identity from page 1 of whichever section reaches it
      // first — saves the second roundtrip the old crawler did.
      const det = ag.details;
      if (det) {
        agencyName  = pickStr(det.officeName, det.name);
        agencyPhone = pickStr(det.phone);
      }
    }

    const feed: any[] = Array.isArray(ag.feed) ? ag.feed : [];
    for (const item of feed) {
      const norm = normalize(item, section);
      if (norm) out.push(norm);
      if (out.length >= limitRemaining) break;
    }

    // Stop when we've fetched all reported pages, or when this page
    // returned an empty feed (defensive).
    if (totalPages > 0 && page >= totalPages) break;
    if (feed.length === 0) break;
  }

  return { listings: out, pagesFetched, totalPages, agencyName, agencyPhone };
}

// ── Detail-page enrichment ───────────────────────────────────────

async function fetchListingDetails(ctx: BrowserContext, token: string): Promise<{ images: string[]; description?: string } | null> {
  const url = `https://www.yad2.co.il/realestate/item/${encodeURIComponent(token)}`;
  const r = await fetchPage(ctx, url);
  if (!r.ok || !r.html) return null;
  const data = extractNextData(r.html);
  if (!data) return null;
  // The dehydrated react-query state is an array of { state: { data } }.
  // The single item-detail query lives in queries[0]; we do a defensive
  // walk in case the order changes between Yad2 deploys.
  const queries = data?.props?.pageProps?.dehydratedState?.queries;
  if (!Array.isArray(queries)) return null;
  for (const q of queries) {
    const meta = q?.state?.data?.metaData;
    if (!meta) continue;
    const imgs = Array.isArray(meta.images) ? meta.images.filter((u: any) => typeof u === 'string') : [];
    const description = typeof q?.state?.data?.additionalInfo?.description === 'string'
      ? q.state.data.additionalInfo.description
      : (typeof q?.state?.data?.description === 'string' ? q.state.data.description : undefined);
    if (imgs.length > 0 || description) return { images: imgs, description };
  }
  return null;
}

// ── Public API ───────────────────────────────────────────────────

export async function crawlAgency(agencyId: string): Promise<CrawlReport> {
  ensureShutdownHook();
  const sections: Yad2Section[] = ['forsale', 'rent', 'commercial'];
  const allListings: Yad2Listing[] = [];
  const sectionReports: CrawlReport['sections'] = [];
  let agencyName: string | undefined;
  let agencyPhone: string | undefined;
  let truncated = false;

  const ctx = await newCrawlContext();
  try {
    for (let i = 0; i < sections.length; i++) {
      const section = sections[i];
      const remaining = MAX_LISTINGS_TOTAL - allListings.length;
      if (remaining <= 0) {
        truncated = true;
        sectionReports.push({ section, pagesFetched: 0, totalPages: 0, totalListings: 0 });
        continue;
      }
      if (i > 0) await sleep(POLITE_GAP_MS);
      const r = await crawlSection(ctx, agencyId, section, remaining);

      // First section that succeeds in lifting agency identity wins.
      if (!agencyName && r.agencyName)  agencyName  = r.agencyName;
      if (!agencyPhone && r.agencyPhone) agencyPhone = r.agencyPhone;

      allListings.push(...r.listings);
      sectionReports.push({
        section,
        pagesFetched: r.pagesFetched,
        totalPages: r.totalPages,
        totalListings: r.listings.length,
        error: r.error,
      });
    }

    if (allListings.length >= MAX_LISTINGS_TOTAL) truncated = true;

    // ── Detail enrichment ─────────────────────────────────────────
    // Per-listing fetch of the item-detail page to pull the FULL gallery.
    // The cookies set by the listings phase carry over (same context),
    // so detail pages don't need to re-solve the JS challenge.
    const targets = allListings.slice(0, MAX_DETAIL_FETCHES);
    for (let i = 0; i < targets.length; i++) {
      const l = targets[i];
      await sleep(POLITE_GAP_MS);
      try {
        const details = await fetchListingDetails(ctx, l.sourceId);
        if (details) {
          if (details.images.length > 0) l.images = details.images;
          if (details.description && !l.description) l.description = details.description;
        }
      } catch { /* keep cover-only */ }
    }
    if (allListings.length > MAX_DETAIL_FETCHES) truncated = true;

    return {
      agencyId,
      agencyName,
      agencyPhone,
      listings: allListings,
      sections: sectionReports,
      truncated,
    };
  } finally {
    // Always close the per-crawl context — the singleton browser stays.
    await ctx.close().catch(() => {});
  }
}

// Map section + per-listing hints to our (assetClass, category) pair.
// /forsale → RES + SALE, /rent → RES + RENT. /commercial is mixed —
// Yad2 uses subcategoryId 1=offices, 2=stores, etc. for commercial,
// and we have no reliable signal for sale-vs-rent, so default to SALE
// and let the agent flip on review.
export function mapSectionToAssetClass(l: Yad2Listing): { assetClass: 'RESIDENTIAL' | 'COMMERCIAL'; category: 'SALE' | 'RENT' } {
  if (l.section === 'commercial') return { assetClass: 'COMMERCIAL', category: 'SALE' };
  if (l.section === 'rent')       return { assetClass: 'RESIDENTIAL', category: 'RENT' };
  return { assetClass: 'RESIDENTIAL', category: 'SALE' };
}
