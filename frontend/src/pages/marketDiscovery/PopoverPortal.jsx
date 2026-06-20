// Anchored popover portal for /market-discovery row & card actions.
//
// Why this exists: the per-row "..." overflow menu and the tag picker
// were rendered position:absolute INSIDE each listing. In card view the
// card's `overflow: hidden` clipped them, and in both views the next
// (opaque) listing painted over the popover — so the menu/tag affordance
// looked "overshadowed by the next מודעה". Rendering at document.body via
// <Portal> escapes every ancestor's overflow + stacking context.
//
// Positioned with position:fixed off the anchor's bounding rect, aligned
// to the anchor's inline-start edge (RTL-aware: that's its right edge).
// Re-measures on scroll/resize so it tracks the anchor while open.

import { useLayoutEffect, useState } from 'react';
import Portal from '../../components/Portal';

export default function PopoverPortal({ anchorRef, gap = 4, children }) {
  const [pos, setPos] = useState(null);

  useLayoutEffect(() => {
    const place = () => {
      const el = anchorRef?.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      // Anchor the popover's start (right in RTL) edge to the anchor's
      // start edge, dropping it just below the anchor.
      setPos({ top: r.bottom + gap, right: window.innerWidth - r.right });
    };
    place();
    // Capture-phase scroll so we also catch scrolls on inner containers.
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [anchorRef, gap]);

  if (!pos) return null;

  return (
    <Portal>
      <div style={{ position: 'fixed', top: pos.top, right: pos.right, zIndex: 1200 }}>
        {children}
      </div>
    </Portal>
  );
}
