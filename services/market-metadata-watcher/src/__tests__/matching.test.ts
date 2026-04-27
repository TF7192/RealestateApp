import { describe, it, expect } from 'vitest';
import { scoreMatch } from '../matching.js';

const listingTLV3R = {
  city: 'תל אביב', neighborhood: 'הצפון הישן', propertyType: 'apartment',
  rooms: 3, price: 3_500_000, sizeSqm: 80,
};

describe('scoreMatch', () => {
  it('returns 0 when profile city is set and listing city differs', () => {
    const r = scoreMatch(listingTLV3R, {
      cities: ['רמת גן'], neighborhoods: [], propertyTypes: [],
      minRoom: null, maxRoom: null, minPrice: null, maxPrice: null,
    });
    expect(r.score).toBe(0);
  });

  it('full match scores ≥ 70', () => {
    const r = scoreMatch(listingTLV3R, {
      cities: ['תל אביב'], neighborhoods: ['הצפון הישן'],
      propertyTypes: ['apartment'],
      minRoom: 3, maxRoom: 4,
      minPrice: 3_000_000, maxPrice: 4_000_000,
    });
    // city (25) + neighborhood (20) + type (15) + rooms (15) + price (15) = 90
    expect(r.score).toBeGreaterThanOrEqual(70);
    expect(r.reasons).toEqual(expect.arrayContaining(['city', 'neighborhood', 'property_type', 'rooms', 'price']));
  });

  it('city-only profile scores 25 (below default threshold)', () => {
    const r = scoreMatch(listingTLV3R, {
      cities: ['תל אביב'], neighborhoods: [], propertyTypes: [],
      minRoom: null, maxRoom: null, minPrice: null, maxPrice: null,
    });
    expect(r.score).toBe(25);
  });

  it('rooms out of range scores below threshold', () => {
    const r = scoreMatch(listingTLV3R, {
      cities: ['תל אביב'], neighborhoods: [], propertyTypes: [],
      minRoom: 5, maxRoom: 6, minPrice: null, maxPrice: null,
    });
    // city (25) only — rooms range bails out without crediting.
    expect(r.score).toBe(25);
  });
});
