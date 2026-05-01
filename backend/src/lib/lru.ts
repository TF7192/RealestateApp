// Tiny in-process LRU with TTL. Used for read-heavy endpoints whose
// results don't change second-to-second (topbar-counts, lookup tables,
// per-agent /me-style payloads).
//
// Why not Redis: prod is a single backend container today, in-process
// is sufficient. When we scale to multiple replicas (PERF-roadmap),
// stale-by-a-few-seconds is fine because TTLs are short. Replace with
// a shared cache only if cross-replica consistency matters for a
// specific endpoint.
//
// Usage:
//   const cache = createLru<UserId, TopbarPayload>({ max: 5_000, ttlMs: 30_000 });
//   cache.get(userId);                                // T | undefined
//   cache.set(userId, payload);
//   await cache.wrap(userId, async () => fetchTopbarCounts(userId));

export interface LruOpts {
  max: number;
  ttlMs: number;
}

interface Entry<V> { v: V; expiresAt: number }

export class Lru<K, V> {
  private readonly max: number;
  private readonly ttlMs: number;
  private readonly map = new Map<K, Entry<V>>();

  constructor(opts: LruOpts) {
    this.max = opts.max;
    this.ttlMs = opts.ttlMs;
  }

  get(key: K): V | undefined {
    const e = this.map.get(key);
    if (!e) return undefined;
    if (e.expiresAt < Date.now()) {
      this.map.delete(key);
      return undefined;
    }
    // Refresh recency.
    this.map.delete(key);
    this.map.set(key, e);
    return e.v;
  }

  set(key: K, v: V): void {
    if (this.map.has(key)) this.map.delete(key);
    else if (this.map.size >= this.max) {
      // Evict oldest (Map iteration order is insertion order).
      const first = this.map.keys().next().value;
      if (first !== undefined) this.map.delete(first);
    }
    this.map.set(key, { v, expiresAt: Date.now() + this.ttlMs });
  }

  delete(key: K): boolean {
    return this.map.delete(key);
  }

  clear(): void {
    this.map.clear();
  }

  // Compute-if-absent helper. Race-safe enough for our usage: if two
  // requests miss simultaneously, both compute and the last set wins —
  // acceptable when the underlying op is idempotent (a count, a lookup).
  async wrap<E = Error>(key: K, fn: () => Promise<V>): Promise<V> {
    const hit = this.get(key);
    if (hit !== undefined) return hit;
    const v = await fn();
    this.set(key, v);
    return v;
  }

  // For tests + observability.
  size(): number {
    return this.map.size;
  }
}

export function createLru<K, V>(opts: LruOpts): Lru<K, V> {
  return new Lru<K, V>(opts);
}
