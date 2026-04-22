// N-17 — tiny in-memory LRU+TTL cache, extracted from `routes/geo.ts`
// so the /search cache is unit-testable without booting Fastify.
//
// This is intentionally modest: one `Map`, no dependencies, no cluster
// coordination. Good enough for per-process address-autocomplete caching;
// not a substitute for Redis when we later need cross-process coherence.
//
// Semantics:
//  - `get(key)`  returns the value if present AND not expired, else null.
//                On hit, the entry is bumped to MRU (delete-then-set).
//                On expiry, the entry is evicted lazily.
//  - `set(key, value)` overwrites any existing entry; evicts the LRU
//                entry when the cache would otherwise exceed `max`.
//  - TTL is millisecond-based; a TTL of 0 disables expiry.

export interface LruTtlCache<V> {
  get: (key: string) => V | null;
  set: (key: string, value: V) => void;
  size: () => number;
  /** Test-only — clears the entire cache. */
  clear: () => void;
}

interface Entry<V> { value: V; expiresAt: number }

export function createLruTtlCache<V>({ max = 1000, ttlMs = 24 * 60 * 60 * 1000 } = {}): LruTtlCache<V> {
  const store = new Map<string, Entry<V>>();

  const get = (key: string): V | null => {
    const hit = store.get(key);
    if (!hit) return null;
    if (ttlMs > 0 && hit.expiresAt <= Date.now()) {
      store.delete(key);
      return null;
    }
    // LRU bump
    store.delete(key);
    store.set(key, hit);
    return hit.value;
  };

  const set = (key: string, value: V) => {
    if (store.size >= max && !store.has(key)) {
      const oldest = store.keys().next().value;
      if (oldest) store.delete(oldest);
    }
    store.set(key, {
      value,
      expiresAt: ttlMs > 0 ? Date.now() + ttlMs : Number.POSITIVE_INFINITY,
    });
  };

  const size = () => store.size;
  const clear = () => store.clear();

  return { get, set, size, clear };
}

// Shared normalizer used by /geo/search: lower-case, collapse whitespace.
export function normalizeCacheKeyPart(s: string | undefined | null): string {
  return (s || '').trim().toLowerCase().replace(/\s+/g, ' ');
}
