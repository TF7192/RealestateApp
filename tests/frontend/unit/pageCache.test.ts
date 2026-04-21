import { describe, it, expect, beforeEach } from 'vitest';
// eslint-disable-next-line import/no-relative-packages
import { pageCache, clearPageCache } from '@estia/frontend/lib/pageCache.js';

// Shared module-scoped store — each test starts with a clean slate.
beforeEach(() => clearPageCache());

describe('pageCache', () => {
  it('get returns null for missing keys', () => {
    expect(pageCache.get('never')).toBeNull();
  });

  it('set + get round-trips any value, including arrays and objects', () => {
    const arr = [1, 2, 3];
    pageCache.set('k', arr);
    expect(pageCache.get('k')).toBe(arr);

    const obj = { a: 1 };
    pageCache.set('o', obj);
    expect(pageCache.get('o')).toBe(obj);
  });

  it('distinguishes "not set" from "set to null/undefined"', () => {
    pageCache.set('null', null);
    expect(pageCache.get('null')).toBeNull();
    pageCache.set('undef', undefined);
    // get() returns the stored value; `undefined` is a legal entry.
    expect(pageCache.get('undef')).toBeUndefined();
  });

  it('clear(key) removes only that key', () => {
    pageCache.set('a', 1);
    pageCache.set('b', 2);
    pageCache.clear('a');
    expect(pageCache.get('a')).toBeNull();
    expect(pageCache.get('b')).toBe(2);
  });

  it('clear() with no args wipes everything', () => {
    pageCache.set('a', 1);
    pageCache.set('b', 2);
    pageCache.clear();
    expect(pageCache.get('a')).toBeNull();
    expect(pageCache.get('b')).toBeNull();
  });

  it('clearPageCache() is equivalent to clear()', () => {
    pageCache.set('x', 1);
    clearPageCache();
    expect(pageCache.get('x')).toBeNull();
  });
});
