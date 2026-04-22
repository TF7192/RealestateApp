import { useMemo } from 'react';
import { ChevronRight, ChevronLeft, MoreHorizontal } from 'lucide-react';
import './Pagination.css';

// Client-side pagination control. Rendered by Properties / Customers /
// Owners whenever the filtered list has more than `pageSize` items.
//
// Behavior:
//   - Always renders the first and last page numbers.
//   - Renders a small window around the current page (±2).
//   - Collapses gaps into a "…" spacer so long lists don't explode.
//   - Prev / Next arrows are RTL-aware — the inline `dir="rtl"` on the
//     root flips the flex order so the "next" chevron points in the
//     natural reading direction. We still use `ChevronLeft` for "next"
//     and `ChevronRight` for "prev" because those visually match how
//     Hebrew readers parse left-to-right arrows after the flex flip.
//
// Props:
//   page       number, 1-based, current page
//   pageCount  number, total pages (>= 1)
//   onPage     (n: number) => void — called when the user picks a page.
//
// When `pageCount <= 1` the component renders nothing. Call sites can
// still mount it unconditionally; the caller doesn't have to own the
// threshold check.

export default function Pagination({ page, pageCount, onPage }) {
  const numbers = useMemo(() => pageWindow(page, pageCount), [page, pageCount]);
  if (pageCount <= 1) return null;

  const go = (n) => {
    if (n < 1 || n > pageCount || n === page) return;
    onPage?.(n);
  };

  return (
    <nav className="pager" dir="rtl" aria-label="דפדוף">
      <button
        type="button"
        className="pager-btn pager-nav"
        onClick={() => go(page - 1)}
        disabled={page <= 1}
        aria-label="עמוד קודם"
      >
        <ChevronRight size={16} aria-hidden="true" />
      </button>
      {numbers.map((n, i) =>
        n === '…' ? (
          <span key={`gap-${i}`} className="pager-gap" aria-hidden="true">
            <MoreHorizontal size={14} />
          </span>
        ) : (
          <button
            key={n}
            type="button"
            className={`pager-btn pager-num ${n === page ? 'is-active' : ''}`}
            onClick={() => go(n)}
            aria-current={n === page ? 'page' : undefined}
            aria-label={`עמוד ${n}`}
          >
            {n}
          </button>
        )
      )}
      <button
        type="button"
        className="pager-btn pager-nav"
        onClick={() => go(page + 1)}
        disabled={page >= pageCount}
        aria-label="עמוד הבא"
      >
        <ChevronLeft size={16} aria-hidden="true" />
      </button>
    </nav>
  );
}

// Build a compact list of page numbers and "…" gaps. The algorithm:
//   - Always include 1 and pageCount.
//   - Include current ± 2.
//   - Wherever two adjacent entries have a gap > 1, insert a "…".
// For pageCount <= 7 we return every page (no need to collapse).
function pageWindow(page, pageCount) {
  if (pageCount <= 7) return range(1, pageCount);
  const core = new Set([
    1,
    pageCount,
    page - 2, page - 1, page, page + 1, page + 2,
  ]);
  const sorted = [...core].filter((n) => n >= 1 && n <= pageCount).sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) out.push('…');
    out.push(sorted[i]);
  }
  return out;
}

function range(from, to) {
  const out = [];
  for (let i = from; i <= to; i++) out.push(i);
  return out;
}
