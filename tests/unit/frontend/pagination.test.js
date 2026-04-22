import { describe, it, expect } from 'vitest';
import { paginate } from '../../../frontend/src/lib/pagination.js';

// Pagination slicing — the single-purpose helper all list pages share.
//
// Threshold per product: no pager UI below 9 items. At/above 9, slice
// into pages of 8 and expose a page window that the UI can render as
// "1 · 2 · 3 · …". The helper is pure so hooks + SSR + tests all agree.

describe('paginate', () => {
  it('returns the whole list unchanged when items <= pageSize', () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8];
    const r = paginate(items, { page: 1, pageSize: 8 });
    expect(r.slice).toEqual(items);
    expect(r.pageCount).toBe(1);
    expect(r.needsPager).toBe(false);
    expect(r.page).toBe(1);
  });

  it('activates the pager at items > pageSize', () => {
    const items = Array.from({ length: 9 }, (_, i) => i);
    const r = paginate(items, { page: 1, pageSize: 8 });
    expect(r.slice).toHaveLength(8);
    expect(r.pageCount).toBe(2);
    expect(r.needsPager).toBe(true);
  });

  it('returns the correct slice for page 2 with pageSize 8', () => {
    const items = Array.from({ length: 17 }, (_, i) => i);
    const r = paginate(items, { page: 2, pageSize: 8 });
    expect(r.slice).toEqual([8, 9, 10, 11, 12, 13, 14, 15]);
    expect(r.pageCount).toBe(3);
  });

  it('clamps out-of-range pages to the last valid page', () => {
    const items = Array.from({ length: 10 }, (_, i) => i);
    const r = paginate(items, { page: 99, pageSize: 8 });
    expect(r.page).toBe(2);
    expect(r.slice).toEqual([8, 9]);
  });

  it('clamps page < 1 to 1', () => {
    const r = paginate([1, 2, 3], { page: -5, pageSize: 8 });
    expect(r.page).toBe(1);
  });

  it('handles an empty list cleanly', () => {
    const r = paginate([], { page: 1, pageSize: 8 });
    expect(r.slice).toEqual([]);
    expect(r.pageCount).toBe(1);
    expect(r.needsPager).toBe(false);
  });
});
