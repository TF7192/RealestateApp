// nadlan.gov.il market-context crawler — Playwright edition.
//
// Flow (verified 2026-04-23):
//   1. Load https://www.nadlan.gov.il/ (SPA hydrates).
//   2. Type the free-text address into the autocomplete input
//      (placeholder "הקלד כתובת / שם רחוב / שם ישוב").
//   3. Press Enter. The SPA resolves text → addressId via
//      es.govmap.gov.il/TldSearch and navigates to
//      `/?view=address&id=<addressId>&page=deals`.
//   4. The SPA XHRs `api.nadlan.gov.il/deal-data` (POST). The response
//      is declared `content-type: application/json` but the body is a
//      bare base64 string of gzipped JSON — NOT raw JSON. We must
//      base64-decode + gunzip + JSON.parse ourselves.
//   5. For rent, after (3) we navigate to the same URL with
//      `page=rent` and wait for another `deal-data` call.
//
// Prior shape `?search=<query>&page=deals` no longer does anything —
// it just loads the landing page. Hence "no transactions" everywhere.
//
// reCAPTCHA Enterprise still scores the session invisibly; we drop
// the `navigator.webdriver` flag so it grades us like a human visitor.

import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import zlib from 'node:zlib';

const NAV_TIMEOUT_MS = 30_000;
const DATA_WAIT_MS = 15_000;
const SEARCH_INPUT_SELECTOR = 'input[placeholder*="הקלד"]';

const DESKTOP_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

export type NadlanKind = 'buy' | 'rent';

export interface NadlanDeal {
  street?: string | null;
  city?: string | null;
  dealDate?: string | null;
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
  fetchedAt: string;
  deals: NadlanDeal[];
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
  await ctx.addInitScript(() => {
    try {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    } catch { /* already defined */ }
  });
  // Block bytes we don't need. Keep CSS — the SPA only fires its XHRs
  // after hydration, and hydration touches stylesheets.
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

// ── Body decoding ────────────────────────────────────────────────
// api.nadlan.gov.il/deal-data returns base64(gzip(json)) with a
// bogus `content-type: application/json` header. Decode ourselves.
function decodeNadlanBody(buf: Buffer): any | null {
  try {
    const s = buf.toString('utf8');
    if (!s) return null;
    // Raw gzip fallback, just in case they ever stop base64-ing.
    if (buf[0] === 0x1f && buf[1] === 0x8b) {
      return JSON.parse(zlib.gunzipSync(buf).toString('utf8'));
    }
    // Raw JSON fallback — trim whitespace.
    const trimmed = s.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      return JSON.parse(trimmed);
    }
    // Expected path: base64 of gzipped JSON. "H4sI" is the base64
    // signature of the gzip magic bytes.
    if (!s.startsWith('H4sI')) return null;
    const bin = Buffer.from(s, 'base64');
    if (bin[0] !== 0x1f || bin[1] !== 0x8b) return null;
    return JSON.parse(zlib.gunzipSync(bin).toString('utf8'));
  } catch {
    return null;
  }
}

// ── Deal extraction ──────────────────────────────────────────────
// Primary shape: { statusCode, data: { total_rows, items: [...] } }
// Each item has dealAmount, dealDate, roomNum, assetArea, yearBuilt,
// address, floor (Hebrew string like "קומה 3"), neighborhoodName, etc.
function extractDeals(json: any): NadlanDeal[] {
  const items: any[] = Array.isArray(json?.data?.items)
    ? json.data.items
    : Array.isArray(json?.items)
    ? json.items
    : [];
  if (items.length === 0) return [];

  return items
    .filter((d) => d && typeof d === 'object')
    .map<NadlanDeal>((d) => {
      const price = toNum(d.dealAmount ?? d.priceOfDeal ?? d.price);
      const sqm = toNum(d.assetArea ?? d.dealNatureArea ?? d.area);
      const rawFloor = d.floor;
      // Floor arrives as Hebrew text ("קומה 3", "קרקע", "חנייה").
      // Try to pull a number out; fall back to null.
      const floorNum = typeof rawFloor === 'number'
        ? rawFloor
        : typeof rawFloor === 'string'
          ? toNum(rawFloor.replace(/[^\d\-]/g, ''))
          : null;
      return {
        street: (d.address as string) || (d.streetName as string) || null,
        city: (d.settlementName as string) || (d.neighborhoodName as string) || null,
        dealDate: (d.dealDate as string) || (d.signDate as string) || null,
        price,
        rooms: toNum(d.roomNum ?? d.numOfRooms ?? d.rooms),
        sqm,
        floor: floorNum,
        buildYear: toNum(d.yearBuilt ?? d.buildYear),
        pricePerSqm:
          toNum(d.pricePerSqm ?? d.avgPricePerSqm)
          ?? (price && sqm ? Math.round(price / sqm) : null),
      };
    });
}

function toNum(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// ── SPA navigation ──────────────────────────────────────────────
// The autocomplete can resolve into four view types depending on the
// query's specificity + whether the city has registered neighborhoods:
//   - ?view=address&id=<addressId>          (e.g. "סוקולוב 12 ראשון לציון")
//   - ?view=street&id=<streetId>            (e.g. "לאה גולדברג נס ציונה")
//   - ?view=settlement&id=<settlementId>    (e.g. just a city name)
//   - ?view=neighborhood&id=<neighborhoodId>
// Any of these is a valid "resolved" view for us. Rent data is
// aggregated at either the neighborhood or settlement level, so we
// pick the right S3 path based on which id we got.
type ResolvedView = {
  kind: 'address' | 'street' | 'settlement' | 'neighborhood';
  id: string;
};
async function driveSpa(
  page: Page,
  city: string,
  street: string,
  log: (m: string) => void,
): Promise<ResolvedView> {
  await page.goto('https://www.nadlan.gov.il/', {
    waitUntil: 'domcontentloaded',
    timeout: NAV_TIMEOUT_MS,
  });
  const input = await page.waitForSelector(SEARCH_INPUT_SELECTOR, {
    timeout: 12_000,
  });
  const query = `${street} ${city}`.trim();
  await input.fill(query);
  await page.waitForTimeout(1500);
  await input.press('Enter');
  try {
    await page.waitForURL(/view=(address|street|settlement|neighborhood)/i, { timeout: 15_000 });
  } catch {
    log(`nadlan: query "${query}" did not resolve to a known view`);
    throw new Error('address_not_resolved');
  }
  await page.waitForTimeout(DATA_WAIT_MS);

  const url = page.url();
  const m = url.match(/view=(address|street|settlement|neighborhood)(?:&|.*&)id=(\d+)/i)
    ?? url.match(/[?&]id=(\d+)/);
  if (!m) throw new Error('address_not_resolved');
  // Two capture shapes above; normalise.
  const kind = (m.length === 3 ? m[1] : 'address') as ResolvedView['kind'];
  const id   = m.length === 3 ? m[2] : m[1];
  return { kind, id };
}

// Aggregated rent JSON. nadlan.gov.il serves a tree of pre-computed
// rent stats at:
//   /api/pages/neighborhood/rent/<neighborhoodId>.json
//   /api/pages/settlement/rent/<settlementId>.json
//   /api/pages/street/rent/<streetId>.json        (not always present)
// Each has a `trends.rooms[i].graphData[]` shape: one entry per
// (year, month, rooms) with the area's average monthly rent for that
// room count. We synthesise one "deal" per entry so the existing
// MarketContextCard can render the timeline without frontend changes.
//
// Strategy: try the most specific level first (whatever the SPA
// resolved to), fall back to broader levels if that 404s or has no
// graphData.
async function fetchAggregates(
  page: Page,
  kind: 'buy' | 'rent',
  view: ResolvedView,
  settlementIdFromDeals: string | null,
  neighborhoodIdFromDeals: string | null,
): Promise<{ deals: NadlanDeal[]; source: string | null }> {
  const attempts: { scope: string; id: string }[] = [];
  if (view.kind === 'address' || view.kind === 'street') {
    if (neighborhoodIdFromDeals) attempts.push({ scope: 'neighborhood', id: neighborhoodIdFromDeals });
    if (settlementIdFromDeals)   attempts.push({ scope: 'settlement',   id: settlementIdFromDeals });
  }
  if (view.kind === 'neighborhood') attempts.push({ scope: 'neighborhood', id: view.id });
  if (view.kind === 'settlement')   attempts.push({ scope: 'settlement',   id: view.id });
  if (!attempts.find((a) => a.id === view.id)) attempts.push({ scope: view.kind, id: view.id });

  for (const { scope, id } of attempts) {
    const url = `https://data.nadlan.gov.il/api/pages/${scope}/${kind}/${id}.json`;
    let json: any = null;
    try {
      json = await page.evaluate(async (u: string) => {
        const r = await fetch(u);
        if (!r.ok) return null;
        return await r.json();
      }, url);
    } catch { continue; }
    if (!json) continue;

    const roomBuckets: any[] = Array.isArray(json?.trends?.rooms) ? json.trends.rooms : [];
    const out: NadlanDeal[] = [];
    for (const bucket of roomBuckets) {
      const rooms = toNum(bucket?.numRooms);
      const graph: any[] = Array.isArray(bucket?.graphData) ? bucket.graphData : [];
      for (const g of graph) {
        // Prefer the tightest area's price available.
        const price = toNum(g?.neighborhoodPrice ?? g?.settlementPrice ?? g?.countryPrice);
        const y = toNum(g?.year);
        const m = toNum(g?.month);
        if (!price || !y || !m) continue;
        out.push({
          street: json.neighborhoodName || json.settlementName || null,
          city: json.settlementName || null,
          dealDate: `${y}-${String(m).padStart(2, '0')}-01`,
          price,
          rooms,
          sqm: null,
          floor: null,
          buildYear: null,
          pricePerSqm: null,
        });
      }
    }
    if (out.length > 0) return { deals: out, source: url };
  }
  return { deals: [], source: null };
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
  const bodyPromises: Promise<{ url: string; buf: Buffer | null }>[] = [];
  // Track static-JSON page URLs the SPA loads in the background.
  // Their paths encode IDs we need for the rent-aggregate fallback
  // (e.g. `/pages/settlement/buy/7200.json` tells us settlementId=7200
  // even when deal-data came back empty).
  const observedPageUrls: string[] = [];

  ctx.on('response', (resp) => {
    const u = resp.url();
    if (/api\.nadlan\.gov\.il\/deal-data/.test(u)) {
      bodyPromises.push(
        resp.body()
          .then((buf) => ({ url: u, buf }))
          .catch(() => ({ url: u, buf: null as Buffer | null })),
      );
      return;
    }
    if (/data\.nadlan\.gov\.il\/api\/pages\/[a-z]+\/(buy|rent)\/\d+\.json/.test(u)) {
      // Dedupe by ignoring the cache-bust query string.
      const clean = u.split('?')[0];
      if (!observedPageUrls.includes(clean)) observedPageUrls.push(clean);
    }
  });

  let view: ResolvedView;
  const page = await ctx.newPage();
  try {
    view = await driveSpa(page, city, street, log);
  } catch (e) {
    const msg = (e as Error).message || 'unknown';
    result.error = msg === 'address_not_resolved' ? 'no_address_match' : 'nav_failed';
    await ctx.close();
    return result;
  }

  const settled = await Promise.all(bodyPromises);
  result.apiSources = settled.map((s) => s.url).slice(0, 10);

  // Parse buy deals + harvest neighborhoodId / settlementId from the
  // items to feed the rent-aggregate fetcher.
  const buyDeals: NadlanDeal[] = [];
  let neighborhoodId: string | null = null;
  let settlementId: string | null = null;
  for (const s of settled) {
    if (!s.buf) continue;
    const json = decodeNadlanBody(s.buf);
    if (!json) continue;
    const items: any[] = Array.isArray(json?.data?.items) ? json.data.items : [];
    for (const it of items) {
      if (!neighborhoodId && it?.neighborhoodId) neighborhoodId = String(it.neighborhoodId);
      if (!settlementId && (it?.settlmentID ?? it?.settlementId)) {
        settlementId = String(it.settlmentID ?? it.settlementId);
      }
    }
    buyDeals.push(...extractDeals(json));
  }

  // Harvest any IDs revealed by the SPA's background page fetches.
  // Pattern: /pages/<kind>/<buy|rent>/<id>.json. Prefer the narrowest
  // available scope (neighborhood > street > settlement).
  const observedIds: { scope: 'neighborhood' | 'settlement' | 'street'; id: string }[] = [];
  for (const u of observedPageUrls) {
    const m = u.match(/\/pages\/([a-z]+)\/(buy|rent)\/(\d+)\.json/);
    if (!m) continue;
    const scope = m[1] as 'neighborhood' | 'settlement' | 'street';
    if (scope === 'neighborhood' || scope === 'settlement' || scope === 'street') {
      if (!observedIds.find((o) => o.scope === scope && o.id === m[3])) {
        observedIds.push({ scope, id: m[3] });
      }
    }
  }
  if (!neighborhoodId) {
    const o = observedIds.find((o) => o.scope === 'neighborhood');
    if (o) neighborhoodId = o.id;
  }
  if (!settlementId) {
    const o = observedIds.find((o) => o.scope === 'settlement');
    if (o) settlementId = o.id;
  }

  if (kind === 'buy') {
    if (buyDeals.length > 0) {
      result.deals = buyDeals;
    } else {
      // deal-data came back empty (small settlement, street view, etc.).
      // Fall back to the aggregated settlement/neighborhood buy JSON —
      // same shape as rent, just a different path.
      const { deals, source } = await fetchAggregates(
        page, 'buy', view, settlementId, neighborhoodId,
      );
      result.deals = deals;
      if (source) result.apiSources.push(source);
      if (deals.length === 0) result.error = 'no_buy_data';
    }
  } else {
    const { deals, source } = await fetchAggregates(
      page, 'rent', view, settlementId, neighborhoodId,
    );
    result.deals = deals;
    if (source) result.apiSources.push(source);
    if (deals.length === 0) result.error = 'no_rent_data';
  }

  // De-dup by (date, price, sqm, street).
  const seen = new Set<string>();
  result.deals = result.deals.filter((d) => {
    const k = `${d.dealDate || ''}|${d.price || ''}|${d.sqm || ''}|${d.street || ''}|${d.rooms || ''}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  await ctx.close();
  return result;
}
