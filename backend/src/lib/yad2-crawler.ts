// Yad2 agency crawler. Two-phase:
//
//   1. Listings phase. Fetch each agency section page (forsale / rent /
//      commercial) × N pages with a Safari iOS UA, parse the inline
//      __NEXT_DATA__ JSON, walk agencyData.feed for the per-listing
//      summary (address, price, rooms, sqm, cover image, tags).
//
//   2. Detail phase. For each listing token, fetch
//      /realestate/item/<token> with the same Safari UA and extract
//      the FULL images[] array from
//      pageProps.dehydratedState.queries[0].state.data.metaData.images.
//      Also pulls description and any other fields the listings JSON
//      didn't carry.
//
// Yad2 fronts the detail page with a JS bot challenge that fires for
// naive UAs ("EstiaImporter/1.0" → 302 to challenge). A real Safari
// iOS UA passes through unchallenged, so we use that for ALL fetches
// — the agency listings page works either way; the detail page demands
// it. We're identifying as a real client either way; treat the rate
// limit accordingly with the same 800ms polite gap.
//
// Polite by design: 800ms gap between requests, hard cap 10 pages per
// section, hard cap 100 listings per agency. If Yad2 returns 429/403 we
// stop early and return what we have so far.

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const POLITE_GAP_MS = 800;
const MAX_PAGES_PER_SECTION = 10;
const MAX_LISTINGS_TOTAL = 100;
// Hard cap on detail-page enrichment — even if a Pro plan agency has
// 80 listings we won't hold the request open for 16 minutes.
const MAX_DETAIL_FETCHES = 50;

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

async function fetchPage(url: string): Promise<{ ok: boolean; html?: string; status?: number }> {
  try {
    const r = await fetch(url, {
      headers: {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'he-IL,he;q=0.9,en;q=0.5',
      },
      redirect: 'follow',
    });
    if (!r.ok) return { ok: false, status: r.status };
    const html = await r.text();
    return { ok: true, html };
  } catch {
    return { ok: false };
  }
}

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
  return {
    sourceId: String(token),
    section,
    title: pickStr(item.title, item.subtitle),
    street: pickStr(a.street?.text, a.street, item.street) || '',
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

async function crawlSection(
  agencyId: string,
  section: Yad2Section,
  limitRemaining: number,
): Promise<{ listings: Yad2Listing[]; pagesFetched: number; totalPages: number; error?: string }> {
  const out: Yad2Listing[] = [];
  let totalPages = 0;
  let pagesFetched = 0;

  for (let page = 1; page <= MAX_PAGES_PER_SECTION; page++) {
    if (out.length >= limitRemaining) break;

    const url = `https://www.yad2.co.il/realestate/agency/${encodeURIComponent(agencyId)}/${section}?page=${page}`;
    if (page > 1) await sleep(POLITE_GAP_MS);
    const r = await fetchPage(url);
    if (!r.ok) {
      // 404 on page 2+ → no more pages, that's fine. 429/403 → stop.
      if (r.status === 404 && page > 1) break;
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
    if (page === 1) totalPages = ag.pagination?.totalPages ?? 0;
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
  return { listings: out, pagesFetched, totalPages };
}

// ── Detail-page enrichment ───────────────────────────────────────
// Fetch /realestate/item/<token>, extract the full images[] array
// + description. Returns null if the page didn't load or didn't
// contain the expected JSON shape — caller falls back to the
// listings-page cover.
async function fetchListingDetails(token: string): Promise<{ images: string[]; description?: string } | null> {
  const url = `https://www.yad2.co.il/realestate/item/${encodeURIComponent(token)}`;
  const r = await fetchPage(url);
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

export async function crawlAgency(agencyId: string): Promise<CrawlReport> {
  const sections: Yad2Section[] = ['forsale', 'rent', 'commercial'];
  const allListings: Yad2Listing[] = [];
  const sectionReports: CrawlReport['sections'] = [];
  let agencyName: string | undefined;
  let agencyPhone: string | undefined;
  let truncated = false;

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    const remaining = MAX_LISTINGS_TOTAL - allListings.length;
    if (remaining <= 0) {
      truncated = true;
      sectionReports.push({ section, pagesFetched: 0, totalPages: 0, totalListings: 0 });
      continue;
    }
    if (i > 0) await sleep(POLITE_GAP_MS);
    const r = await crawlSection(agencyId, section, remaining);

    // Pull agency identity from the first successful section response —
    // we already had to fetch page 1 of forsale most likely, but in case
    // forsale had no listings, try the next one.
    if (!agencyName) {
      try {
        const url = `https://www.yad2.co.il/realestate/agency/${encodeURIComponent(agencyId)}/${section}?page=1`;
        const r2 = await fetchPage(url);
        if (r2.ok) {
          const d = extractNextData(r2.html!);
          const det = d?.props?.pageProps?.agencyData?.details;
          if (det) {
            agencyName = pickStr(det.officeName, det.name);
            agencyPhone = pickStr(det.phone);
          }
        }
      } catch { /* ignore */ }
    }

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

  // ── Detail enrichment ───────────────────────────────────────────
  // Per-listing fetch of the item-detail page to pull the FULL gallery
  // (the listings JSON only carries one cover image). Capped at
  // MAX_DETAIL_FETCHES so a giant agency doesn't push the request past
  // a minute. Sequential with the same polite gap. Failures are
  // swallowed — the listing keeps its cover image only.
  const targets = allListings.slice(0, MAX_DETAIL_FETCHES);
  for (let i = 0; i < targets.length; i++) {
    const l = targets[i];
    await sleep(POLITE_GAP_MS);
    try {
      const details = await fetchListingDetails(l.sourceId);
      if (details) {
        if (details.images.length > 0) l.images = details.images;
        if (details.description && !l.description) l.description = details.description;
      }
    } catch { /* keep cover-only */ }
  }
  // Listings beyond MAX_DETAIL_FETCHES still get their cover image;
  // mark a flag for the UI in case we want to surface "+30 listings
  // shown with cover image only".
  if (allListings.length > MAX_DETAIL_FETCHES) truncated = true;

  return {
    agencyId,
    agencyName,
    agencyPhone,
    listings: allListings,
    sections: sectionReports,
    truncated,
  };
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
