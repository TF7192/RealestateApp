// Thin gold route-progress bar fixed to the top of the viewport.
// Fires on every `useLocation()` change (router nav + lazy-chunk
// swap) plus on in-flight fetches (the api client dispatches
// `estia:route-progress` on request start/finish). The bar animates
// to ~70% immediately and sits there until the transition ends, then
// slides to 100% and fades out — gives the UI an always-there signal
// that something's happening, without adding a heavyweight spinner.
//
// Zero deps, zero DOM-reflow on steady-state, one element total.

import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';

// Event name the api client can dispatch to bump + settle the bar.
// We debounce a tick so rapid requests in the same frame don't cause
// a visible re-animation.
const EVT = 'estia:route-progress';

export default function RouteProgressBar() {
  const location = useLocation();
  const [pct, setPct] = useState(0);
  const [visible, setVisible] = useState(false);
  const activeRef = useRef(0);           // # of in-flight requests
  const settleTimer = useRef(null);
  const finishTimer = useRef(null);

  // Start / bump the bar. Ramps to ~70% with a little randomness so
  // repeated nav doesn't look identical.
  const start = () => {
    clearTimeout(settleTimer.current);
    clearTimeout(finishTimer.current);
    setVisible(true);
    setPct((prev) => (prev === 0 ? 28 : Math.min(prev, 70)));
    // Second tick — creep up. requestAnimationFrame hop so the CSS
    // transition actually animates from the initial value.
    requestAnimationFrame(() => setPct(72));
  };

  // End — finish + fade out.
  const end = () => {
    clearTimeout(settleTimer.current);
    clearTimeout(finishTimer.current);
    setPct(100);
    finishTimer.current = setTimeout(() => {
      setVisible(false);
      setPct(0);
    }, 240);
  };

  // Trigger on every route change. 350ms settle timer gives the
  // Suspense fallback + data fetches a little buffer before we finish
  // — without it, instant cached routes look like the bar never moved.
  useEffect(() => {
    start();
    settleTimer.current = setTimeout(end, 500);
    return () => {
      clearTimeout(settleTimer.current);
      clearTimeout(finishTimer.current);
    };
  }, [location.pathname]);

  // Also react to explicit request-progress events from the api
  // client. Fetches > 120ms flip the bar on; finish flips it off.
  useEffect(() => {
    const onEvt = (e) => {
      const { phase } = e.detail || {};
      if (phase === 'start') {
        activeRef.current += 1;
        start();
      } else if (phase === 'end') {
        activeRef.current = Math.max(0, activeRef.current - 1);
        if (activeRef.current === 0) end();
      }
    };
    window.addEventListener(EVT, onEvt);
    return () => window.removeEventListener(EVT, onEvt);
  }, []);

  return (
    <div
      aria-hidden
      style={{
        position: 'fixed', top: 0, insetInlineStart: 0,
        height: 2, width: '100%', pointerEvents: 'none',
        zIndex: 999,
        opacity: visible ? 1 : 0,
        transition: 'opacity 200ms ease',
      }}
    >
      <div
        style={{
          height: '100%',
          width: `${pct}%`,
          background: 'linear-gradient(90deg, rgba(180,139,76,0.0), #d9b774 40%, #b48b4c 80%, rgba(180,139,76,0.0))',
          boxShadow: '0 0 8px rgba(180,139,76,0.55)',
          transition: 'width 320ms ease-out',
        }}
      />
    </div>
  );
}
