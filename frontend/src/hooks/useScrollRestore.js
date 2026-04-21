import { useEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

// F-6.3 — manual scroll restoration for long lists.
//
// React Router v7's built-in <ScrollRestoration> only works with
// createBrowserRouter (data router); we're on BrowserRouter. This hook
// does the job for the pages that matter (Properties, Customers,
// Leads, Owners) — 500+ item lists where losing scroll on back-nav
// forces a long re-scroll.
//
// Usage: call once near the top of the list page, BEFORE the first
// render that depends on data. Pass the scrollable ref (default:
// window). The hook saves position on unmount and restores on mount
// ONLY when navigationType is POP (back/forward) — fresh navigations
// land at the top.

const store = new Map();

export function useScrollRestore(pathname, { ref } = {}) {
  const navType = useNavigationType();
  const savedRef = useRef(null);

  // On mount (only when coming back via POP), restore scroll.
  useEffect(() => {
    if (navType !== 'POP') return undefined;
    const target = ref?.current ?? window;
    const y = store.get(pathname);
    if (typeof y === 'number') {
      // Give the list a frame to render before restoring.
      const raf = requestAnimationFrame(() => {
        try { target.scrollTo(0, y); } catch { /* ignore */ }
      });
      return () => cancelAnimationFrame(raf);
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, navType]);

  // Track live scrollY as the user reads so we have a fresh value to
  // save when the component unmounts.
  useEffect(() => {
    const target = ref?.current ?? window;
    const onScroll = () => {
      savedRef.current = target === window
        ? (window.scrollY || document.documentElement.scrollTop || 0)
        : target.scrollTop;
    };
    onScroll();
    target.addEventListener('scroll', onScroll, { passive: true });
    return () => target.removeEventListener('scroll', onScroll);
  }, [ref]);

  // On unmount, persist.
  useEffect(() => {
    return () => {
      if (savedRef.current != null) store.set(pathname, savedRef.current);
    };
  }, [pathname]);
}

/** Use inside a component whose only job is to watch the route. */
export function useRouteScrollRestore(opts) {
  const loc = useLocation();
  useScrollRestore(loc.pathname, opts);
}
