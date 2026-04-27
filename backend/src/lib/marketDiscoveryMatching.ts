// Listing-vs-LeadSearchProfile matching engine for Market Discovery.
//
// Distinct from `lib/matching.ts` (which is property-vs-lead for the
// CRM-facing matches feature). This module specifically powers the
// reactor — given a fresh `MarketListing` row, score it against
// every active `LeadSearchProfile` and return the matches above
// threshold.
//
// Pure functions only — no Prisma, no I/O. The reactor wires this
// to the DB. Keeps the engine unit-testable without a database.
//
// Migrated from services/market-metadata-watcher/src/matching.ts
// during the SOLID refactor — the watcher container is now pure
// discovery; CRM-domain matching lives here.

export interface MatchScore {
  score: number;          // 0..100
  reasons: string[];
}

// Field weights (sum = 100):
const W = {
  city:         25,
  neighborhood: 20,
  propertyType: 15,
  rooms:        15,
  price:        15,
  sqm:          10,
} as const;

export type ListingForMatch = {
  city: string | null;
  neighborhood: string | null;
  propertyType: string | null;
  rooms: number | null;
  price: number | null;
  sizeSqm: number | null;
};

export type ProfileForMatch = {
  cities: string[];
  neighborhoods: string[];
  propertyTypes: string[];
  minRoom: number | null;
  maxRoom: number | null;
  minPrice: number | null;
  maxPrice: number | null;
  // sqm bounds — `LeadSearchProfile` doesn't carry these directly
  // (the model has min/maxPlot but that's land area, not unit area).
  // Phase 1 omits sqm matching against profiles; future work will
  // either extend `LeadSearchProfile` or compute from price + ppm.
  minSizeSqm?: number | null;
  maxSizeSqm?: number | null;
};

// Normalize Hebrew place names so common variants collapse to one
// canonical form. Yad2 uses the official municipal name ("תל אביב יפו",
// "נצרת עילית"); agents type the colloquial name ("תל אביב", "נצרת").
// Without this, a lead with city="תל אביב" misses every Yad2 Tel Aviv
// listing — observed live with 12 demo leads × 183 listings.
const CITY_ALIASES: Record<string, string[]> = {
  'תל אביב':   ['תל אביב יפו', 'תל-אביב', 'תל-אביב יפו', 'ת"א', 'תא'],
  'ירושלים':   ['ירושלים', 'ירושלם'],
  'באר שבע':   ['באר שבע', 'ב"ש'],
  'ראשון לציון': ['ראשל"צ', 'ראשון', 'ראשון-לציון'],
  'נצרת עילית': ['נוף הגליל', 'נצרת'],
  'קרית גת':   ['קריית גת', 'ק.גת'],
};

function normalizeCity(s: string | null | undefined): string {
  if (!s) return '';
  let v = s.trim().toLowerCase();
  // Strip common direction marks + dashes that vary across sources.
  v = v.replace(/["'״׳`]/g, '').replace(/[-]/g, ' ').replace(/\s+/g, ' ').trim();
  for (const [canonical, variants] of Object.entries(CITY_ALIASES)) {
    if (v === canonical) return canonical;
    if (variants.some((alias) => v === alias.toLowerCase())) return canonical;
    // Substring match handles "תל אביב" vs "תל אביב יפו" (the official
    // municipal merger name). Done last so an exact alias match wins.
    if (v.includes(canonical) || canonical.includes(v)) return canonical;
  }
  return v;
}

function eqLoose(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function eqCity(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return normalizeCity(a) === normalizeCity(b);
}

function inRange(
  value: number | null | undefined,
  min: number | null | undefined,
  max: number | null | undefined,
): boolean {
  if (value == null) return false;
  if (min != null && value < min) return false;
  if (max != null && value > max) return false;
  return true;
}

function citiesIntersect(listingCity: string | null, profileCities: string[]): boolean {
  if (!listingCity || !profileCities?.length) return false;
  return profileCities.some((c) => eqCity(c, listingCity));
}

// Tolerance windows. Strict membership tests ("price IN [min,max]")
// drop near-misses that are obviously relevant (lead budget=2.0M,
// listing=2.1M); we award half-credit when a value is within ±15%
// (price), ±0.5 (rooms), or ±10% (sqm) of the bounds. This widens the
// catch radius without flooding agents with junk — a near-miss with
// city + property-type still has to beat threshold.
function rangeFit(
  value: number,
  min: number | null | undefined,
  max: number | null | undefined,
  tolerance: number,
): 'in' | 'near' | 'out' {
  if (min == null && max == null) return 'in';
  const lo = min ?? -Infinity;
  const hi = max ?? Infinity;
  if (value >= lo && value <= hi) return 'in';
  // Tolerance is interpreted as fraction of the bound for price/sqm,
  // absolute for rooms (caller picks).
  const expandedLo = lo - (Number.isFinite(lo) ? Math.abs(lo) * tolerance : tolerance);
  const expandedHi = hi + (Number.isFinite(hi) ? Math.abs(hi) * tolerance : tolerance);
  if (value >= expandedLo && value <= expandedHi) return 'near';
  return 'out';
}

export function scoreMatch(listing: ListingForMatch, profile: ProfileForMatch): MatchScore {
  let score = 0;
  const reasons: string[] = [];

  // City — required to count, no city = no match (the agent's anchor).
  if (profile.cities?.length) {
    if (citiesIntersect(listing.city, profile.cities)) {
      score += W.city;
      reasons.push('city');
    } else {
      // City constraint exists but doesn't match — bail with 0.
      // Mismatching an explicit city should never read as 70%.
      return { score: 0, reasons: [] };
    }
  }

  if (profile.neighborhoods?.length && listing.neighborhood) {
    if (profile.neighborhoods.some((n) => eqLoose(n, listing.neighborhood))) {
      score += W.neighborhood;
      reasons.push('neighborhood');
    }
  }

  if (profile.propertyTypes?.length && listing.propertyType) {
    if (profile.propertyTypes.some((t) => eqLoose(t, listing.propertyType))) {
      score += W.propertyType;
      reasons.push('property_type');
    }
  }

  if ((profile.minRoom != null || profile.maxRoom != null) && listing.rooms != null) {
    // Rooms tolerance is absolute (±0.5) — "4-room lead" is realistically
    // also interested in 3.5 or 4.5-room units.
    const fit = rangeFit(listing.rooms, profile.minRoom, profile.maxRoom, 0.5);
    if (fit === 'in')   { score += W.rooms;       reasons.push('rooms'); }
    else if (fit === 'near') { score += Math.round(W.rooms / 2); reasons.push('rooms~'); }
  }

  if ((profile.minPrice != null || profile.maxPrice != null) && listing.price != null) {
    // Price tolerance is fractional (±15%) — a lead with budget 2M
    // realistically considers 2.3M too.
    const fit = rangeFit(listing.price, profile.minPrice, profile.maxPrice, 0.15);
    if (fit === 'in')   { score += W.price;       reasons.push('price'); }
    else if (fit === 'near') { score += Math.round(W.price / 2); reasons.push('price~'); }
  }

  if ((profile.minSizeSqm != null || profile.maxSizeSqm != null) && listing.sizeSqm != null) {
    const fit = rangeFit(listing.sizeSqm, profile.minSizeSqm, profile.maxSizeSqm, 0.10);
    if (fit === 'in')   { score += W.sqm;       reasons.push('sqm'); }
    else if (fit === 'near') { score += Math.round(W.sqm / 2); reasons.push('sqm~'); }
  }

  return { score, reasons };
}

// Re-export the city normalizer for tests + other callers (the seed
// helper could one-shot canonicalize Lead.city on insert too, future
// work).
export { normalizeCity };
