import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createLruTtlCache,
  normalizeCacheKeyPart,
} from '../../../backend/src/lib/lruTtlCache.js';

// N-17 — the /geo/search street-autocomplete cache is a generic
// in-memory LRU with a TTL clock. We test the primitive in isolation
// so the Fastify route can be thin (cache + normalized key).

describe('N-17 — createLruTtlCache', () => {
  it('returns null for missing keys and caches values on set', () => {
    const c = createLruTtlCache<string>({ max: 10, ttlMs: 1000 });
    expect(c.get('a')).toBeNull();
    c.set('a', 'alpha');
    expect(c.get('a')).toBe('alpha');
    expect(c.size()).toBe(1);
  });

  it('evicts the least-recently-used entry when `max` is exceeded', () => {
    const c = createLruTtlCache<number>({ max: 2, ttlMs: 1000 });
    c.set('a', 1);
    c.set('b', 2);
    // Access `a` so `b` becomes the LRU.
    expect(c.get('a')).toBe(1);
    c.set('c', 3);
    // `b` must have been evicted; `a` + `c` survive.
    expect(c.get('b')).toBeNull();
    expect(c.get('a')).toBe(1);
    expect(c.get('c')).toBe(3);
    expect(c.size()).toBe(2);
  });

  it('expires entries past the TTL window', () => {
    vi.useFakeTimers();
    try {
      const c = createLruTtlCache<string>({ max: 10, ttlMs: 1000 });
      c.set('a', 'alpha');
      vi.advanceTimersByTime(999);
      expect(c.get('a')).toBe('alpha');
      vi.advanceTimersByTime(2);
      expect(c.get('a')).toBeNull();
      // The expired entry was also evicted — size shrinks.
      expect(c.size()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('TTL=0 disables expiry', () => {
    vi.useFakeTimers();
    try {
      const c = createLruTtlCache<string>({ max: 10, ttlMs: 0 });
      c.set('a', 'alpha');
      vi.advanceTimersByTime(10 * 365 * 24 * 3600 * 1000); // 10 years
      expect(c.get('a')).toBe('alpha');
    } finally {
      vi.useRealTimers();
    }
  });

  it('overwriting an existing key does not grow the cache size', () => {
    const c = createLruTtlCache<number>({ max: 2, ttlMs: 1000 });
    c.set('a', 1);
    c.set('a', 2);
    c.set('a', 3);
    expect(c.size()).toBe(1);
    expect(c.get('a')).toBe(3);
  });

  it('clear() empties the cache', () => {
    const c = createLruTtlCache<string>({ max: 10, ttlMs: 1000 });
    c.set('a', 'x');
    c.set('b', 'y');
    c.clear();
    expect(c.size()).toBe(0);
    expect(c.get('a')).toBeNull();
  });
});

describe('N-17 — normalizeCacheKeyPart', () => {
  it('lower-cases input', () => {
    expect(normalizeCacheKeyPart('HERZL')).toBe('herzl');
  });
  it('trims leading/trailing whitespace', () => {
    expect(normalizeCacheKeyPart('  herzl  ')).toBe('herzl');
  });
  it('collapses internal whitespace to a single space', () => {
    expect(normalizeCacheKeyPart('tel    aviv')).toBe('tel aviv');
  });
  it('handles empty / undefined / null inputs', () => {
    expect(normalizeCacheKeyPart(undefined)).toBe('');
    expect(normalizeCacheKeyPart(null)).toBe('');
    expect(normalizeCacheKeyPart('')).toBe('');
  });

  it('produces identical keys for case + whitespace variants', () => {
    expect(normalizeCacheKeyPart('  Tel   Aviv  ')).toBe(normalizeCacheKeyPart('tel aviv'));
  });
});
