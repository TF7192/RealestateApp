// Tiny client-side pagination helper shared by Properties / Customers /
// Owners. The product rule: below 9 items we don't show pager UI at all;
// at/above 9 we slice into pages of 8 and the caller renders "1 · 2 ·
// 3 · …" controls.
//
// Pure — no React, no DOM. The React bits live in `usePagination` (hook)
// and the `Pagination` component. Keeping the math here makes unit tests
// trivially fast and means SSR / test fixtures can slice without React.

/**
 * @param {Array<T>} items
 * @param {{ page?: number, pageSize?: number }} opts
 * @returns {{
 *   slice: Array<T>,
 *   page: number,
 *   pageCount: number,
 *   pageSize: number,
 *   total: number,
 *   needsPager: boolean,
 * }}
 */
export function paginate(items, opts = {}) {
  const pageSize = Math.max(1, opts.pageSize ?? 8);
  const total = Array.isArray(items) ? items.length : 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const requested = Number.isFinite(opts.page) ? opts.page : 1;
  const page = Math.min(pageCount, Math.max(1, Math.floor(requested)));
  const start = (page - 1) * pageSize;
  const slice = Array.isArray(items) ? items.slice(start, start + pageSize) : [];
  return {
    slice,
    page,
    pageCount,
    pageSize,
    total,
    needsPager: total > pageSize,
  };
}
