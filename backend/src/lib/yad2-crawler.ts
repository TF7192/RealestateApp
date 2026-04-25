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

// In-process concurrency cap. A single Playwright Chromium peaks at
// ~800MB RSS during enrichment; the prod EC2 box has 2GB total, so a
// second concurrent crawl risks OOM-killing the API. We refuse the
// second caller with a friendly 429 — the job runner already knows
// how to surface __yad2Envelope verbatim to the client.
const MAX_CONCURRENT_CRAWLS = 1;
let activeCrawls = 0;

class Yad2BusyError extends Error {
  statusCode = 429;
  __yad2Envelope = {
    status: 429,
    message: 'ייבוא Yad2 אחר פעיל כרגע — נסו שוב בעוד דקה',
  };
  constructor() {
    super('ייבוא Yad2 אחר פעיל כרגע — נסו שוב בעוד דקה');
    this.name = 'Yad2BusyError';
  }
}

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

// ── Streaming progress ──────────────────────────────────────────
// Real per-page progress reports emitted as the crawler walks
// listings → details. Routes/yad2 maps these to the user-facing
// {pct, stage} envelope; keeping the shape granular here so other
// callers (smoke tests, future workers) can render their own UX.
//
// `phase` lifecycle:
//   start          → before any network — agencyId is known
//   section-start  → about to fetch the first page of a section
//   section-page   → just fetched page N of M for a section
//   section-end    → finished a section (or hit blocked/empty)
//   detail-start   → entering the detail-enrichment phase
//   detail-item    → just fetched detail page N of M
//   done           → crawl finished successfully
//
// `pct` is the *crawler's* estimate; the route layer is free to
// re-scale or pin it as needed.
export type CrawlProgressEvent =
  | { phase: 'start';         pct: number; stage: string }
  | { phase: 'section-start'; pct: number; stage: string; section: Yad2Section }
  | { phase: 'section-page';  pct: number; stage: string; section: Yad2Section; page: number; totalPages: number; listingsSoFar: number }
  | { phase: 'section-end';   pct: number; stage: string; section: Yad2Section; listings: number; error?: string }
  | { phase: 'detail-start';  pct: number; stage: string; total: number }
  | { phase: 'detail-item';   pct: number; stage: string; index: number; total: number }
  | { phase: 'done';          pct: number; stage: string; listings: number };

export type CrawlProgressReport = (e: CrawlProgressEvent) => void;

const SECTION_LABEL: Record<Yad2Section, string> = {
  forsale:    'נכסים למכירה',
  rent:       'נכסים להשכרה',
  commercial: 'נכסים מסחריים',
};

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

async function fetchPage(
  ctx: BrowserContext,
  url: string,
  opts: { navTimeoutMs?: number; nextDataTimeoutMs?: number } = {},
): Promise<PageResult> {
  let page: Page | null = null;
  const navTimeout = opts.navTimeoutMs ?? NAV_TIMEOUT_MS;
  const nextDataTimeout = opts.nextDataTimeoutMs ?? NEXT_DATA_WAIT_MS;
  try {
    page = await ctx.newPage();
    const response = await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: navTimeout,
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
        { timeout: nextDataTimeout }
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
  onPage?: (info: { page: number; totalPages: number; listingsSoFar: number }) => void,
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

    // Emit a real per-page progress event. `totalPages` is unknown
    // before page 1 lands; once it's known we can render N/M.
    onPage?.({ page, totalPages, listingsSoFar: out.length });

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
  // Detail pages run AFTER the listings phase set the WAF cookie, so
  // the JS challenge typically resolves in <2s instead of the 12s the
  // listings phase budgets. Tighter timeouts here keep a single bad
  // page from blocking the parallel batch's progress for too long
  // before the wall-clock race in the caller fires anyway.
  const r = await fetchPage(ctx, url, {
    navTimeoutMs: 12_000,
    nextDataTimeoutMs: 6_000,
  });
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

export async function crawlAgency(
  agencyId: string,
  onProgress?: CrawlProgressReport,
): Promise<CrawlReport> {
  if (activeCrawls >= MAX_CONCURRENT_CRAWLS) {
    throw new Yad2BusyError();
  }
  activeCrawls++;
  try {
  ensureShutdownHook();
  const sections: Yad2Section[] = ['forsale', 'rent', 'commercial'];
  const allListings: Yad2Listing[] = [];
  const sectionReports: CrawlReport['sections'] = [];
  let agencyName: string | undefined;
  let agencyPhone: string | undefined;
  let truncated = false;

  // ── Progress budget ────────────────────────────────────────────
  // The bar splits roughly:
  //   0–5%   start / browser warmup
  //   5–60%  three sections (~18% each)
  //   60–95% detail enrichment (linear in MAX_DETAIL_FETCHES)
  //   95–100% finalisation
  const SECTION_BUDGET_START = 5;
  const SECTION_BUDGET_END = 60;
  const DETAIL_BUDGET_START = 60;
  const DETAIL_BUDGET_END = 95;
  const sectionSpan = (SECTION_BUDGET_END - SECTION_BUDGET_START) / sections.length;

  // Helper — clamp + monotonic-friendly. Final monotonic guarantee
  // lives in the route (job.report() already does Math.max), but
  // applying it here keeps standalone callers (smoke test) honest.
  let lastPct = 0;
  const emit = (e: CrawlProgressEvent) => {
    if (!onProgress) return;
    const pct = Math.max(lastPct, Math.min(100, Math.round(e.pct)));
    lastPct = pct;
    onProgress({ ...e, pct });
  };

  emit({ phase: 'start', pct: 2, stage: 'מכין סריקה' });

  const ctx = await newCrawlContext();
  try {
    emit({ phase: 'start', pct: 5, stage: 'מתחבר ל-Yad2' });
    for (let i = 0; i < sections.length; i++) {
      const section = sections[i];
      const sectionStart = SECTION_BUDGET_START + i * sectionSpan;
      const sectionEnd = sectionStart + sectionSpan;
      const remaining = MAX_LISTINGS_TOTAL - allListings.length;
      if (remaining <= 0) {
        truncated = true;
        sectionReports.push({ section, pagesFetched: 0, totalPages: 0, totalListings: 0 });
        emit({
          phase: 'section-end', pct: sectionEnd,
          stage: `דילגנו על ${SECTION_LABEL[section]}`,
          section, listings: 0,
        });
        continue;
      }
      if (i > 0) await sleep(POLITE_GAP_MS);
      emit({
        phase: 'section-start', pct: sectionStart,
        stage: `סורק ${SECTION_LABEL[section]}`,
        section,
      });
      const baseListings = allListings.length;
      const r = await crawlSection(ctx, agencyId, section, remaining, ({ page, totalPages, listingsSoFar }) => {
        // Linear interp inside the section's budget. If totalPages is
        // unknown (page 1 hasn't reported it yet), assume one page so
        // the bar still moves on the first tick.
        const tp = totalPages > 0 ? totalPages : Math.max(page, 1);
        const frac = Math.min(1, page / tp);
        const pct = sectionStart + frac * sectionSpan;
        const stage = totalPages > 0
          ? `${SECTION_LABEL[section]} — דף ${page}/${tp} · ${baseListings + listingsSoFar} נכסים`
          : `${SECTION_LABEL[section]} — דף ${page} · ${baseListings + listingsSoFar} נכסים`;
        emit({
          phase: 'section-page', pct, stage,
          section, page, totalPages: tp, listingsSoFar: baseListings + listingsSoFar,
        });
      });

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
      emit({
        phase: 'section-end', pct: sectionEnd,
        stage: r.error
          ? `${SECTION_LABEL[section]} — שגיאה`
          : `${SECTION_LABEL[section]} — ${r.listings.length} נכסים`,
        section, listings: r.listings.length, error: r.error,
      });
    }

    if (allListings.length >= MAX_LISTINGS_TOTAL) truncated = true;

    // ── Detail enrichment ─────────────────────────────────────────
    // Per-listing fetch of the item-detail page to pull the FULL gallery.
    // The cookies set by the listings phase carry over (same context),
    // so detail pages don't need to re-solve the JS challenge.
    //
    // Failure modes the previous serial loop hit in prod:
    //   1. A single bad listing's detail page hung the full 30s nav
    //      timeout + 12s NEXT_DATA wait = 42s; the bar froze with no
    //      visible error and the next listing didn't start.
    //   2. Yad2 occasionally re-armed the WAF challenge mid-batch; the
    //      per-page handler caught the exception silently but the
    //      sequential loop still paid the full 42s before moving on.
    //   3. With sequential ~5s/page × 50 = 4+ minutes of dead-time
    //      where the bar inched forward one tick at a time.
    //
    // The fix: parallelise detail fetches with a small concurrency
    // ceiling (3 workers — well under WAF's per-IP burst threshold for
    // the agency cookie set), wrap each fetch in an explicit
    // wall-clock race so a hanging page resolves in 18s flat, ALWAYS
    // emit a progress tick after each fetch (even on error/timeout)
    // so the bar never freezes, and log per-listing failures with the
    // sourceId so we can investigate specific tokens.
    const targets = allListings.slice(0, MAX_DETAIL_FETCHES);
    if (targets.length > 0) {
      emit({
        phase: 'detail-start', pct: DETAIL_BUDGET_START,
        stage: `מעשיר תמונות ל-${targets.length} נכסים`,
        total: targets.length,
      });
    }
    const detailSpan = DETAIL_BUDGET_END - DETAIL_BUDGET_START;
    const DETAIL_CONCURRENCY = 3;
    const DETAIL_HARD_TIMEOUT_MS = 18_000;
    let detailDone = 0;
    const queue = targets.slice();

    const worker = async () => {
      for (;;) {
        const l = queue.shift();
        if (!l) return;
        // Tiny stagger between worker pulls so 3 in-flight requests
        // don't fire at the exact same tick — keeps the WAF heuristic
        // happier and reduces the chance of all three workers hitting
        // a flaky network spike together.
        await sleep(POLITE_GAP_MS / 2);
        try {
          // Race the fetch against an explicit wall-clock so a hanging
          // detail page can't burn the full Playwright nav timeout.
          // The fetcher's own catch already swallows network errors;
          // this just stops the wait.
          const details = await Promise.race([
            fetchListingDetails(ctx, l.sourceId),
            new Promise<null>((resolve) => setTimeout(() => resolve(null), DETAIL_HARD_TIMEOUT_MS)),
          ]);
          if (details) {
            if (details.images.length > 0) l.images = details.images;
            if (details.description && !l.description) l.description = details.description;
          }
        } catch (e) {
          // Per-listing failures must not abort the whole crawl.
          // Logging happens via process stderr so the route's pino
          // logger can pick it up if attached.
          // eslint-disable-next-line no-console
          console.warn(`[yad2-crawler] detail fetch failed for ${l.sourceId}:`, (e as Error)?.message);
        } finally {
          detailDone += 1;
          const pct = DETAIL_BUDGET_START + (detailDone / targets.length) * detailSpan;
          emit({
            phase: 'detail-item', pct,
            stage: `טוען תמונות ${detailDone}/${targets.length}`,
            index: detailDone, total: targets.length,
          });
        }
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(DETAIL_CONCURRENCY, targets.length) }, () => worker())
    );
    if (allListings.length > MAX_DETAIL_FETCHES) truncated = true;

    emit({
      phase: 'done', pct: 100,
      stage: `הושלם — ${allListings.length} נכסים`,
      listings: allListings.length,
    });

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
  } finally {
    activeCrawls--;
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
