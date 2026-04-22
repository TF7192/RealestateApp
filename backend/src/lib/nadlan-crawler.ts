// nadlan.gov.il market-context crawler — Playwright edition.
//
// Why Playwright:
//   nadlan.gov.il migrated to a React SPA backed by api.nadlan.gov.il,
//   and every API call is gated by a reCAPTCHA-Enterprise token that the
//   SPA mints in-page. Direct HTTP to the API returns 403. A real
//   Chromium loads the page, reCAPTCHA Enterprise scores the session
//   invisibly, and the SPA's XHRs succeed — we just intercept the JSON
//   responses as they fly by.
//
// Architecture mirrors yad2-crawler:
//   - One lazy-launched Chromium per process.
//   - Fresh BrowserContext per crawl (no cross-lookup cookie bleed).
//   - Images/fonts/media/stylesheets aborted — we only need the JSON.
//   - Intercept responses to api.nadlan.gov.il via ctx.on('response').
//
// We do NOT navigate to the "buy/rent" landing and try to click through
// UIs. We go directly to the search URL shape the SPA itself uses when
// you open a settlement/neighborhood, and harvest whatever XHRs it
// kicks off. Stable enough in practice; if the SPA reshapes URLs we
// only need to update the `buildUrls()` helper.

import { chromium, type Browser, type BrowserContext, type Response } from 'playwright';

const NAV_TIMEOUT_MS = 30_000;
const DATA_WAIT_MS = 15_000;

// Polite desktop Chrome UA. No headless mode fingerprint if we can
// help it (launch args below drop the `navigator.webdriver` flag).
const DESKTOP_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

export type NadlanKind = 'buy' | 'rent';

export interface NadlanDeal {
  // Minimal shape we surface to the frontend. The underlying API
  // returns much more, but we trim to only what the property-detail
  // card actually renders, to keep the payload small when we cache it.
  street?: string | null;
  city?: string | null;
  dealDate?: string | null;   // ISO-ish; pass-through
  price?: number | null;
  rooms?: number | null;
  sqm?: number | null;
  floor?: number | null;
  buildYear?: number | null;
  pricePerSqm?: number | null;
}

export interface NadlanResult {
  kind: NadlanKind;
  queryCity: string;
  queryStreet: string;
  fetchedAt: string;          // ISO
  deals: NadlanDeal[];
  // Raw samples of API URLs we observed, for debug + future shape
  // migrations. Trimmed to 10 entries so logs don't blow up.
  apiSources: string[];
  error?: string;
}

// ── Browser lifecycle ────────────────────────────────────────────
let browserPromise: Promise<Browser> | null = null;

async function getBrowser(): Promise<Browser> {
  if (browserPromise) {
    const b = await browserPromise;
    if (b.isConnected()) return b;
    browserPromise = null;
  }
  if (!browserPromise) {
    browserPromise = chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
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
  });
  // Drop WebDriver flag so reCAPTCHA Enterprise scores us like a
  // normal visitor.
  await ctx.addInitScript(() => {
    try {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    } catch { /* already defined */ }
  });
  // Block the asset byte-weight we don't need. Keep images OFF but
  // keep stylesheets ON — the SPA lazy-loads data only after it
  // hydrates and the hydration path touches CSS.
  await ctx.route('**/*', (route) => {
    const t = route.request().resourceType();
    if (t === 'image' || t === 'font' || t === 'media') return route.abort();
    return route.continue();
  });
  return ctx;
}

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

// ── URL shapes ──────────────────────────────────────────────────
//
// The SPA uses `https://www.nadlan.gov.il/?view=...&query=...&page=...`.
// We try the "search" entrypoint which accepts free-text and then
// narrows to the right scope. `query` is an address string.
function buildUrls(city: string, street: string, kind: NadlanKind): string[] {
  const q = encodeURIComponent(`${street} ${city}`.trim());
  const page = kind === 'rent' ? 'rent' : 'deals';
  return [
    `https://www.nadlan.gov.il/?search=${q}&page=${page}`,
    `https://www.nadlan.gov.il/?view=search&query=${q}&page=${page}`,
  ];
}

// Heuristic to pick the right JSON off a generic API response. The
// nadlan API hangs a lot of things off /deal-data, /deal-info,
// /settlement/<kind>/<id>, /neighborhood/<kind>/<id>. We accept any
// of those and look for an array of deals inside.
function extractDeals(json: unknown, kind: NadlanKind): NadlanDeal[] {
  const visit = (node: any): any[] => {
    if (!node) return [];
    if (Array.isArray(node)) {
      // Take the first array-of-objects that looks like deals.
      const asDeals = node.filter((x) => x && typeof x === 'object'
        && (x.priceOfDeal != null || x.price != null || x.dealAmount != null || x.avgDealPrice != null));
      if (asDeals.length > 0) return asDeals;
      // Otherwise descend.
      const deeper: any[] = [];
      for (const item of node) deeper.push(...visit(item));
      return deeper;
    }
    if (typeof node === 'object') {
      const deeper: any[] = [];
      for (const v of Object.values(node)) deeper.push(...visit(v));
      return deeper;
    }
    return [];
  };
  const candidates = visit(json).slice(0, 50);
  return candidates.map<NadlanDeal>((d) => ({
    street: d.streetName || d.street || d.address || null,
    city: d.city || d.settlementName || d.settlement || null,
    dealDate: d.dealDate || d.dealDateTime || d.date || d.signDate || null,
    price: toNum(d.priceOfDeal ?? d.price ?? d.dealAmount ?? d.avgDealPrice),
    rooms: toNum(d.numOfRooms ?? d.rooms),
    sqm: toNum(d.dealNatureArea ?? d.area ?? d.sqm),
    floor: toNum(d.floorNumber ?? d.floor),
    buildYear: toNum(d.buildYear ?? d.yearBuilt),
    pricePerSqm: toNum(d.pricePerSqm ?? d.avgPricePerSqm),
  }));
}

function toNum(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// ── Public API ──────────────────────────────────────────────────
export async function fetchNadlanMarket(
  opts: { city: string; street: string; kind: NadlanKind; log?: (m: string) => void },
): Promise<NadlanResult> {
  ensureShutdownHook();
  const { city, street, kind, log = () => {} } = opts;
  const result: NadlanResult = {
    kind,
    queryCity: city,
    queryStreet: street,
    fetchedAt: new Date().toISOString(),
    deals: [],
    apiSources: [],
  };

  if (!city || !street) {
    result.error = 'missing city or street';
    return result;
  }

  const ctx = await newCrawlContext();
  const apiJsonPromises: Promise<{ url: string; json: unknown }>[] = [];
  const onResponse = (resp: Response) => {
    const url = resp.url();
    if (!/api\.nadlan\.gov\.il|nadlan\.gov\.il\/api\//.test(url)) return;
    const ct = resp.headers()['content-type'] || '';
    if (!/application\/json/i.test(ct)) return;
    apiJsonPromises.push(
      resp.json()
        .then((j: unknown) => ({ url, json: j }))
        .catch(() => ({ url, json: null })),
    );
  };
  ctx.on('response', onResponse);

  const page = await ctx.newPage();
  const urls = buildUrls(city, street, kind);
  let navigated = false;
  for (const u of urls) {
    try {
      await page.goto(u, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS });
      navigated = true;
      break;
    } catch (e) {
      log(`nadlan: nav failed ${u}: ${(e as Error).message}`);
    }
  }
  if (!navigated) {
    result.error = 'nav_failed';
    await ctx.close();
    return result;
  }

  // Give the SPA time to hydrate + fire its XHRs + receive responses.
  // We don't know exactly which endpoint carries the data in any
  // given view, so we wait a bounded window and then collect what we
  // saw.
  await page.waitForTimeout(DATA_WAIT_MS);
  ctx.off('response', onResponse);

  const settled = await Promise.all(apiJsonPromises);
  result.apiSources = settled.map((s) => s.url).slice(0, 10);

  for (const s of settled) {
    const deals = extractDeals(s.json, kind);
    if (deals.length > 0) {
      result.deals.push(...deals);
      if (result.deals.length >= 50) break;
    }
  }

  // De-dup by (date, price, sqm). The API sometimes returns the same
  // deal via multiple endpoints.
  const seen = new Set<string>();
  result.deals = result.deals.filter((d) => {
    const k = `${d.dealDate || ''}|${d.price || ''}|${d.sqm || ''}|${d.street || ''}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  await ctx.close();
  return result;
}
