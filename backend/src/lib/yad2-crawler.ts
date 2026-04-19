// Yad2 agency crawler. Fetches the agency listings page (one URL per
// section + page), parses the inline __NEXT_DATA__ JSON, and returns a
// flat list of normalized listings across forsale + rent + commercial.
//
// The agency listings JSON contains everything we need: address (region/
// city/street/floor), price, rooms, sqm, property type, tags, and a
// cover image URL (img.yad2.co.il/Pic/...). The per-listing detail page
// has more photos but is gated by Yad2's bot-detection challenge so we
// can't fetch it server-side. Cover image only is the durable scope.
//
// Polite by design: 800ms gap between requests, hard cap 10 pages per
// section, hard cap 100 listings per agency. If Yad2 returns 429/403 we
// stop early and return what we have so far.

const UA = 'EstiaImporter/1.0 (https://estia.tripzio.xyz; +mailto:talfuks1234@gmail.com)';
const POLITE_GAP_MS = 800;
const MAX_PAGES_PER_SECTION = 10;
const MAX_LISTINGS_TOTAL = 100;

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
  coverImage?: string;    // https://img.yad2.co.il/Pic/...
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
