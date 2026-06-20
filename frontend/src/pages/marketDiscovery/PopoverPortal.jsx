// Anchored popover portal for /market-discovery row & card actions.
//
// Why this exists: the per-row "..." overflow menu and the tag picker
// were rendered position:absolute INSIDE each listing. In card view the
// card's `overflow: hidden` clipped them, and in both views the next
// (opaque) listing painted over the popover. Rendering at document.body
// via <Portal> escapes every ancestor's overflow + stacking context.
//
// Positioned with position:fixed off the anchor's bounding rect. Prefers
// aligning the popover's inline-start edge (right, in RTL) to the anchor,
// but is VIEWPORT-AWARE: it measures the rendered popover and clamps so it
// never gets clipped on the left or right edge — if start-alignment would
// run off the left, it opens to the right instead. Re-measures on
// scroll/resize.

import { useLayoutEffect, useRef, useState } from 'react';
import Portal from '../../components/Portal';

const PAD = 8; // min gap from the viewport edges

export default function PopoverPortal({ anchorRef, gap = 4, children }) {
  const popRef = useRef(null);
  const [pos, setPos] = useState(null);

  useLayoutEffect(() => {
    const place = () => {
      const el = anchorRef?.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const vw = window.innerWidth;
      const pw = popRef.current?.offsetWidth || 0;
      // Start-aligned (RTL): popover's right edge meets the anchor's right
      // edge, so it extends leftward. Then clamp into the viewport — if
      // that would clip the left edge, shift right (i.e. open rightward).
      let left = r.right - pw;
      if (pw) {
        if (left + pw > vw - PAD) left = vw - PAD - pw; // would clip right
        if (left < PAD) left = PAD;                     // would clip left → open right
      }
      setPos({ top: r.bottom + gap, left });
    };
    place();
    // Re-run once the popover has painted and has a real width to measure.
    const raf = requestAnimationFrame(place);
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [anchorRef, gap]);

  return (
    <Portal>
      <div
        ref={popRef}
        style={{
          position: 'fixed',
          top: pos?.top ?? -9999,
          left: pos?.left ?? -9999,
          zIndex: 1200,
          // Hidden for the first paint (before we've measured width) to
          // avoid a flash at the wrong spot.
          visibility: pos ? 'visible' : 'hidden',
        }}
      >
        {children}
      </div>
    </Portal>
  );
}
