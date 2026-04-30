// Sprint 2 / MLS parity — Task C3.
//
// Server-side port of `leadMatchesProperty()` (frontend
// Properties.jsx). Adds a simple numeric `score` so UIs can rank
// matches, and considers `LeadSearchProfile` rows (Task K4) in
// addition to the legacy flat fields on Lead.

export interface MatchSignal {
  matches: boolean;
  score: number; // 0..1 — higher is better; 0 means no match.
  reasons: string[];
}

type LeadLike = {
  id: string;
  interestType?: 'PRIVATE' | 'COMMERCIAL' | null;
  lookingFor?: 'BUY' | 'RENT' | null;
  city?: string | null;
  // 2026-04-30 — flat-form leads now carry a neighborhood preference
  // (most agents capture neighborhood, only some specify a street).
  // Used as a soft boost: a property in the requested neighborhood
  // scores higher; a property in a *different* neighborhood is still
  // accepted (city-level match is the gate).
  neighborhood?: string | null;
  // OSM-backed street ↔ neighborhood join. When the matcher caller
  // pre-resolves the lead's neighborhood via the Neighborhood table,
  // it can pass the row's `streetCodes` here so a property whose
  // street resolves to one of those codes is treated as a
  // neighborhood match — even if Property.neighborhood is empty or
  // spelled differently from Lead.neighborhood.
  neighborhoodStreetCodes?: number[] | null;
  rooms?: string | null;
  budget?: number | null;
  searchProfiles?: ProfileLike[] | null;
};

type ProfileLike = {
  domain?: 'RESIDENTIAL' | 'COMMERCIAL' | null;
  dealType?: 'SALE' | 'RENT' | null;
  propertyTypes?: string[] | null;
  cities?: string[] | null;
  neighborhoods?: string[] | null;
  minRoom?: number | null;
  maxRoom?: number | null;
  minPrice?: number | null;
  maxPrice?: number | null;
};

type PropertyLike = {
  id: string;
  assetClass: 'RESIDENTIAL' | 'COMMERCIAL';
  category: 'SALE' | 'RENT';
  type?: string | null;
  city?: string | null;
  neighborhood?: string | null;
  // Caller may pre-resolve the registry street code from
  // `Property.street` (we don't store it on the row) — when present
  // and the lead has `neighborhoodStreetCodes`, the matcher uses it
  // for the neighborhood↔street join check.
  streetCode?: number | null;
  rooms?: number | null;
  marketingPrice?: number | null;
};

/**
 * Returns `true` iff the lead's flat criteria suggest a match —
 * identical to the frontend helper, used as the fallback when no
 * search profiles are present.
 */
function flatMatches(lead: LeadLike, property: PropertyLike, signal: MatchSignal): boolean {
  const leadAsset =
    (lead as any).assetClass ??
    (lead.interestType === 'COMMERCIAL' ? 'COMMERCIAL' : 'RESIDENTIAL');
  if (leadAsset !== property.assetClass) return false;
  signal.score += 0.25;
  signal.reasons.push('asset_class');

  const wantsSale = lead.lookingFor === 'BUY';
  const wantsRent = lead.lookingFor === 'RENT';
  if (wantsSale && property.category !== 'SALE') return false;
  if (wantsRent && property.category !== 'RENT') return false;
  signal.score += 0.15;
  signal.reasons.push('deal_type');

  if (lead.city && property.city && String(lead.city).trim() !== String(property.city).trim()) {
    return false;
  }
  if (lead.city) {
    signal.score += 0.2;
    signal.reasons.push('city');
  }

  // Neighborhood is a soft signal — same neighborhood is a positive
  // boost, but mismatch doesn't gate (agents often loosely set a
  // neighborhood when the lead would also accept adjacent areas).
  // Two paths award the boost:
  //   1. Direct string match on `Property.neighborhood`.
  //   2. OSM-backed join: lead carries `neighborhoodStreetCodes`
  //      (pre-resolved from `Neighborhood.streetCodes`), and the
  //      property's street resolves to one of those codes. This lets
  //      properties without an explicit neighborhood field match the
  //      lead's preference based on street geography alone.
  if (lead.neighborhood) {
    let hood = false;
    if (property.neighborhood &&
        String(lead.neighborhood).trim() === String(property.neighborhood).trim()) {
      hood = true;
    } else if (
      lead.neighborhoodStreetCodes?.length &&
      property.streetCode != null &&
      lead.neighborhoodStreetCodes.includes(property.streetCode)
    ) {
      hood = true;
    }
    if (hood) {
      signal.score += 0.1;
      signal.reasons.push('neighborhood');
    }
  }

  if (property.marketingPrice && lead.budget) {
    // Hebrew agents enter `budget` as an upper ceiling ("עד 2 מיליון"),
    // so treat it as a strict max (the previous +15% fudge surfaced
    // 2.3 M properties for a 2 M lead, which is far above the cap the
    // agent set). Keep a -15% lower band — slightly below-budget rows
    // are still legitimate matches.
    const min = Math.round(lead.budget * 0.85);
    const max = lead.budget;
    if (property.marketingPrice < min || property.marketingPrice > max) return false;
    signal.score += 0.2;
    signal.reasons.push('price');
  }

  const pr = property.rooms ?? null;
  if (pr != null && lead.rooms) {
    const tokens = String(lead.rooms).match(/\d+(\.\d+)?/g) || [];
    if (tokens.length) {
      const nums = tokens.map(Number);
      const lo = Math.min(...nums);
      const hi = Math.max(...nums);
      if (pr < lo - 1 || pr > hi + 1) return false;
      signal.score += 0.2;
      signal.reasons.push('rooms');
    }
  }
  return true;
}

/**
 * Evaluate a single (lead, property) pair. If the lead carries any
 * search profiles, the best-matching profile wins (so a lead with two
 * profiles can match on either). Otherwise fall back to the flat
 * criteria.
 */
export function evaluateLeadProperty(lead: LeadLike, property: PropertyLike): MatchSignal {
  const base: MatchSignal = { matches: false, score: 0, reasons: [] };
  // Flat fallback.
  if (!lead.searchProfiles?.length) {
    const sig: MatchSignal = { matches: false, score: 0, reasons: [] };
    const ok = flatMatches(lead, property, sig);
    sig.matches = ok;
    if (!ok) sig.score = 0;
    return ok ? sig : base;
  }

  // Profile-aware. Try each profile, keep the best.
  let best: MatchSignal = base;
  for (const profile of lead.searchProfiles) {
    const sig: MatchSignal = { matches: false, score: 0, reasons: [] };

    if (profile.domain && profile.domain !== property.assetClass) continue;
    if (profile.domain) { sig.score += 0.2; sig.reasons.push('profile_domain'); }
    if (profile.dealType && profile.dealType !== property.category) continue;
    if (profile.dealType) { sig.score += 0.15; sig.reasons.push('profile_deal'); }

    if (profile.propertyTypes?.length && property.type) {
      if (!profile.propertyTypes.includes(property.type)) continue;
      sig.score += 0.1;
      sig.reasons.push('profile_type');
    }

    if (profile.cities?.length) {
      if (!property.city || !profile.cities.includes(property.city)) continue;
      sig.score += 0.15;
      sig.reasons.push('profile_city');
    }
    if (profile.neighborhoods?.length && property.neighborhood) {
      if (!profile.neighborhoods.includes(property.neighborhood)) continue;
      sig.score += 0.1;
      sig.reasons.push('profile_neighborhood');
    }

    if (property.marketingPrice != null) {
      if (profile.minPrice != null && property.marketingPrice < profile.minPrice) continue;
      if (profile.maxPrice != null && property.marketingPrice > profile.maxPrice) continue;
      if (profile.minPrice != null || profile.maxPrice != null) {
        sig.score += 0.15;
        sig.reasons.push('profile_price');
      }
    }

    if (property.rooms != null) {
      if (profile.minRoom != null && property.rooms < profile.minRoom) continue;
      if (profile.maxRoom != null && property.rooms > profile.maxRoom) continue;
      if (profile.minRoom != null || profile.maxRoom != null) {
        sig.score += 0.15;
        sig.reasons.push('profile_rooms');
      }
    }

    sig.matches = true;
    if (sig.score > best.score) best = sig;
  }

  return best;
}
