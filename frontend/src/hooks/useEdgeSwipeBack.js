import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

// iOS-native edge-swipe-back gesture. Listens for touch starts within
// 24px of the screen's left edge (the iOS interactive-pop-gesture zone),
// tracks the horizontal delta, and fires `navigate(-1)` once the user
// drags past 80px of horizontal motion with low vertical jitter.
//
// Why edge-only: a full-area horizontal-swipe-to-back would conflict
// with horizontal-scroll components inside pages (KPI carousel, gallery
// thumbs, kanban columns) plus text-input drag-to-select. The 24px edge
// zone matches what UIKit's UINavigationController ships and what every
// iOS app trains the user to expect — so it's intuitive and collision-
// free with internal scroll.
//
// View Transitions API (already wired in index.css) supplies the visual
// crossfade when navigation fires.
//
// Bail conditions:
// - Not enough horizontal motion (< 80px)
// - Vertical motion exceeded horizontal × 1.5 (= user is scrolling)
// - Touch started outside the 24px edge zone
// - Target is an input/textarea/contenteditable (text selection)
// - Target opted out via [data-allow-x-scroll] (carousels, kanban)
// - At the root of history (cannot go back)
const EDGE_PX = 24;
const MIN_DX = 80;
const MAX_VERTICAL_RATIO = 1.5;
const MAX_DURATION_MS = 600;

export default function useEdgeSwipeBack() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    // Only on touch devices — desktop uses the browser back button.
    if (!('ontouchstart' in window)) return undefined;

    let active = null;

    const onTouchStart = (e) => {
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      // RTL note: iOS edge-swipe-back is from the LEFT edge regardless
      // of language direction (the OS gesture, not a CSS-logical one).
      // Hebrew RTL pages still keep the gesture on the left.
      if (t.clientX > EDGE_PX) return;

      const target = e.target;
      // Don't hijack touches on text inputs (drag-to-select) or on
      // explicitly opted-out horizontal-scroll containers.
      if (target?.closest?.('input, textarea, select, [contenteditable="true"], [data-allow-x-scroll]')) return;

      active = {
        startX: t.clientX,
        startY: t.clientY,
        startedAt: Date.now(),
        dx: 0,
        dy: 0,
      };
    };

    const onTouchMove = (e) => {
      if (!active || e.touches.length !== 1) return;
      const t = e.touches[0];
      active.dx = t.clientX - active.startX;
      active.dy = Math.abs(t.clientY - active.startY);

      // If the user is scrolling vertically (dy > dx × 1.5), abandon —
      // they're not gesturing back.
      if (active.dy > Math.abs(active.dx) * MAX_VERTICAL_RATIO) {
        active = null;
      }
    };

    const onTouchEnd = () => {
      if (!active) return;
      const { dx, startedAt } = active;
      const elapsed = Date.now() - startedAt;
      active = null;

      if (elapsed > MAX_DURATION_MS) return;       // too slow — likely a scroll-then-pause, not a gesture
      if (dx < MIN_DX) return;                      // not enough motion
      if (window.history.length <= 1) return;       // nothing to go back to

      // Use View Transitions when available so the navigation animates
      // on the compositor; falls back to plain navigate otherwise.
      if (document.startViewTransition) {
        document.startViewTransition(() => navigate(-1));
      } else {
        navigate(-1);
      }
    };

    const onTouchCancel = () => { active = null; };

    // Passive listeners so we don't accidentally block native scroll —
    // we don't preventDefault anyway. The 24px edge check is cheap
    // enough that running it on every touchstart costs ~nothing.
    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchmove',  onTouchMove,  { passive: true });
    document.addEventListener('touchend',   onTouchEnd,   { passive: true });
    document.addEventListener('touchcancel', onTouchCancel, { passive: true });

    return () => {
      document.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchmove',  onTouchMove);
      document.removeEventListener('touchend',   onTouchEnd);
      document.removeEventListener('touchcancel', onTouchCancel);
    };
  }, [navigate, location.pathname]);
}
