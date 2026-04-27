import { createHash } from 'node:crypto';

// Canonical metadata hash. Stable across runs for unchanged listings;
// flips whenever any of these fields move. New `MarketListingSnapshot`
// rows are only inserted when the hash changes — that's how we keep
// snapshot history sparse instead of one row per listing per hour.
//
// Fields hashed: source-stable identity (source + externalListingId)
// PLUS every column an agent might care about for "did this listing
// change?". Notably we DO NOT hash firstSeenAt / lastSeenAt /
// updatedAt — those move every run by design and would defeat the
// point.
export type HashableListing = {
  source: string;
  externalListingId: string;
  city: string | null;
  neighborhood: string | null;
  street: string | null;
  propertyType: string | null;
  rooms: number | null;
  sizeSqm: number | null;
  floor: number | null;
  price: number | null;
  pricePerSqm: number | null;
  status: string;
  // "forsale" | "rent" — derived from the feed URL the watcher hit.
  kind: string | null;
  // "private" | "agency" — which feed bucket the listing came from.
  posterType: string | null;
};

export function metadataHash(input: HashableListing): string {
  // JSON.stringify with sorted keys — deterministic. Wrapping null
  // explicitly so undefined ≠ null doesn't change the digest.
  const norm = {
    source: input.source,
    externalListingId: input.externalListingId,
    city: input.city ?? null,
    neighborhood: input.neighborhood ?? null,
    street: input.street ?? null,
    propertyType: input.propertyType ?? null,
    rooms: input.rooms ?? null,
    sizeSqm: input.sizeSqm ?? null,
    floor: input.floor ?? null,
    price: input.price ?? null,
    pricePerSqm: input.pricePerSqm ?? null,
    status: input.status,
    kind: input.kind ?? null,
    posterType: input.posterType ?? null,
  };
  const ordered = Object.keys(norm)
    .sort()
    .map((k) => [k, (norm as Record<string, unknown>)[k]] as const);
  const canonical = JSON.stringify(ordered);
  return createHash('sha256').update(canonical).digest('hex');
}
