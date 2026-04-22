import { useEffect, useMemo, useRef, useState } from 'react';

// Card-view pagination: infinite-scroll instead of pager buttons.
// Table view keeps the pager (consistent with desktop data-table UX);
// the card grids on Properties / Customers / Owners use this hook to
// reveal another batch whenever the sentinel scrolls into view.
//
// The hook is list-pure — it owns only the `visible` counter and the
// IntersectionObserver that bumps it. Callers slice their own source
// list and pass it back to the returned sentinel ref.
//
// Invariants:
//   - `visible` resets whenever the SOURCE length drops below the
//     current visible count (e.g. agent flips a filter to a smaller
//     result set). Without this the list would still render the
//     previous batch count against a shorter source, which then
//     stops the observer from firing.
//   - The sentinel only attaches when there's more to show — once the
//     full list fits, no observer is created and there's nothing to
//     clean up.

/**
 * @param {number} total  Total item count after filtering/sorting.
 * @param {object} [opts]
 * @param {number} [opts.pageSize=8] — extra rows revealed per trigger.
 * @param {number} [opts.initial=opts.pageSize] — rows visible on first
 *   render before any scroll has happened. Defaults to pageSize so
 *   the initial card grid is never longer than one pager "page."
 * @param {string} [opts.rootMargin='200px'] — sentinel margin. 200px
 *   means "start loading when the sentinel is 200px below the
 *   viewport" — matches the pattern in most infinite lists and avoids
 *   the user seeing an empty gap while new rows decode.
 */
export default function useInfiniteScroll(total, opts = {}) {
  const pageSize = Math.max(1, opts.pageSize ?? 8);
  const initial  = Math.max(1, opts.initial ?? pageSize);
  const rootMargin = opts.rootMargin ?? '200px';

  const [visible, setVisible] = useState(initial);
  const sentinelRef = useRef(null);

  // Reset when the source shrinks — e.g. a tighter filter collapses
  // a 50-row list to 10. Without this the visible counter stays high
  // and the observer never re-attaches.
  useEffect(() => {
    if (visible > total) setVisible(Math.max(initial, Math.min(initial, total)));
  }, [total, initial, visible]);

  const hasMore = visible < total;

  useEffect(() => {
    if (!hasMore) return undefined;
    const node = sentinelRef.current;
    if (!node) return undefined;
    // Older browsers / happy-dom don't ship IntersectionObserver — fall
    // back to immediately revealing everything so the UI stays usable.
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(total);
      return undefined;
    }
    const obs = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          setVisible((v) => Math.min(total, v + pageSize));
        }
      }
    }, { rootMargin });
    obs.observe(node);
    return () => obs.disconnect();
  }, [hasMore, total, pageSize, rootMargin]);

  // Slice helper — callers typically call `slice(items)` to get the
  // window instead of doing `items.slice(0, visible)` themselves.
  const slice = useMemo(() => (arr) => (Array.isArray(arr) ? arr.slice(0, visible) : []), [visible]);

  return { visible, hasMore, sentinelRef, slice };
}
