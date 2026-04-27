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

function eqLoose(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
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
  return profileCities.some((c) => eqLoose(c, listingCity));
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
    if (inRange(listing.rooms, profile.minRoom, profile.maxRoom)) {
      score += W.rooms;
      reasons.push('rooms');
    }
  }

  if ((profile.minPrice != null || profile.maxPrice != null) && listing.price != null) {
    if (inRange(listing.price, profile.minPrice, profile.maxPrice)) {
      score += W.price;
      reasons.push('price');
    }
  }

  if ((profile.minSizeSqm != null || profile.maxSizeSqm != null) && listing.sizeSqm != null) {
    if (inRange(listing.sizeSqm, profile.minSizeSqm, profile.maxSizeSqm)) {
      score += W.sqm;
      reasons.push('sqm');
    }
  }

  return { score, reasons };
}
