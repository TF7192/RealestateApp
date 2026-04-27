import { describe, it, expect } from 'vitest';
import { metadataHash } from '../hash.js';

describe('metadataHash', () => {
  const base = {
    source: 'yad2', externalListingId: 'abc',
    city: 'תל אביב', neighborhood: 'הצפון הישן', street: 'בן יהודה',
    propertyType: 'apartment', rooms: 3, sizeSqm: 80, floor: 2,
    price: 3_500_000, pricePerSqm: 43_750, status: 'active',
  };

  it('is deterministic across calls', () => {
    expect(metadataHash(base)).toBe(metadataHash(base));
  });

  it('changes when a relevant field changes', () => {
    const moved = { ...base, price: 3_600_000 };
    expect(metadataHash(moved)).not.toBe(metadataHash(base));
  });

  it('does not depend on insertion order of object keys', () => {
    const reordered = {
      status: 'active', price: 3_500_000, pricePerSqm: 43_750,
      floor: 2, sizeSqm: 80, rooms: 3, propertyType: 'apartment',
      street: 'בן יהודה', neighborhood: 'הצפון הישן', city: 'תל אביב',
      externalListingId: 'abc', source: 'yad2',
    };
    expect(metadataHash(reordered)).toBe(metadataHash(base));
  });

  it('treats null and undefined identically', () => {
    const a = { ...base, neighborhood: null };
    const b = { ...base, neighborhood: undefined as unknown as null };
    expect(metadataHash(a)).toBe(metadataHash(b));
  });
});
