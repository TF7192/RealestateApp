// Yad2 listing → safe metadata-only HashableListing.
//
// Pure mapper. Given the raw object from
//   __NEXT_DATA__.props.pageProps.feed.{private|agency}[*]
// returns a HashableListing or null if the item should be skipped
// (missing token = unidentifiable; missing price = matching can't run
// + violates our "priced only" implicit filter).
//
// LEGAL/SAFETY: this function has the responsibility to drop everything
// we promised not to store — images, coords, free-text tags. The
// MarketListing schema doesn't have columns for those, so a leak would
// only show up in logs / debug output, but defense in depth: we
// explicitly never read those fields.

import type { HashableListing } from '../hash.js';

type RawYad2Item = {
  token?: unknown;
  orderId?: unknown;
  price?: unknown;
  address?: {
    city?: { text?: unknown };
    neighborhood?: { text?: unknown };
    street?: { text?: unknown };
    house?: { floor?: unknown; number?: unknown };
    // INTENTIONALLY NOT READ:
    //   - region (we already know which region we fetched)
    //   - area
    //   - coords (lat/lon — we don't need geocoded sellers)
  };
  additionalDetails?: {
    property?: { text?: unknown };
    roomsCount?: unknown;
    squareMeter?: unknown;
    // INTENTIONALLY NOT READ:
    //   - propertyCondition (free text in a different shape)
    //   - description / about / freeText (would be a legal violation)
  };
  // INTENTIONALLY NOT READ:
  //   - metaData.coverImage / metaData.images[] (legal: no image storage)
  //   - tags[] (free-form marketing copy)
  //   - merchant (seller identifier)
  //   - phone (never appears in feed payload anyway)
};

function asString(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

function asInt(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.round(v);
  if (typeof v === 'string') {
    const n = Number.parseInt(v, 10);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function asNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number.parseFloat(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export type ExtractKind = 'forsale' | 'rent';

export function extractYad2Listing(raw: RawYad2Item, _kind: ExtractKind): HashableListing | null {
  const token = asString(raw?.token);
  if (!token) return null;

  const price = asInt(raw?.price);
  // Drop unpriced listings — the pricePerSqm derivation needs price,
  // and matching against LeadSearchProfile minPrice/maxPrice can't
  // discriminate without it.
  if (price == null || price <= 0) return null;

  const street = asString(raw?.address?.street?.text);
  const houseNum = asInt(raw?.address?.house?.number);
  // Combined "street + number" stays inside the `street` column.
  // Empty street + number → just the street; both empty → null.
  const streetCombined = street && houseNum != null ? `${street} ${houseNum}` : street;

  const sizeSqm = asInt(raw?.additionalDetails?.squareMeter);
  const pricePerSqm = sizeSqm && sizeSqm > 0 ? Math.round(price / sizeSqm) : null;

  return {
    source: 'yad2',
    externalListingId: token,
    city: asString(raw?.address?.city?.text),
    neighborhood: asString(raw?.address?.neighborhood?.text),
    street: streetCombined,
    propertyType: asString(raw?.additionalDetails?.property?.text),
    rooms: asNumber(raw?.additionalDetails?.roomsCount),
    sizeSqm,
    floor: asInt(raw?.address?.house?.floor),
    price,
    pricePerSqm,
    status: 'active',
  };
}

// Helper used by the source: pulls every relevant item from a parsed
// __NEXT_DATA__ payload. Reads `feed.private` + `feed.agency` only —
// the 8 sponsored buckets re-list items already in private/agency, so
// including them would just churn the upsert path.
export function extractFeedFromPageProps(
  pageProps: unknown,
  kind: ExtractKind,
): HashableListing[] {
  const feed = (pageProps as { feed?: { private?: unknown[]; agency?: unknown[] } })?.feed;
  if (!feed) return [];
  const out: HashableListing[] = [];
  const buckets: unknown[][] = [
    Array.isArray(feed.private) ? feed.private : [],
    Array.isArray(feed.agency) ? feed.agency : [],
  ];
  for (const bucket of buckets) {
    for (const raw of bucket) {
      const mapped = extractYad2Listing(raw as RawYad2Item, kind);
      if (mapped) out.push(mapped);
    }
  }
  return out;
}

// Exposed for tests so a captured payload can drive the extractor
// offline. The watcher also re-uses this when the Playwright client
// hands it the raw `__NEXT_DATA__` JSON.
