import { lazy, Suspense, useEffect, useReducer, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { useAuth } from '../lib/auth';
import { useViewportMobile } from '../hooks/mobile';
import { areToursKilled, subscribeTourKill } from '../lib/tourKill';

// Perf 2026-04-25 — react-joyride (~26 KB transferred + ~2 KB CSS)
// shouldn't ship to non-AGENT sessions. PageTour was previously
// statically importing the heavy `Joyride` symbol AND the OnboardingTour
// CSS via the named re-exports, which dragged the whole tour bundle
// (and its render-blocking CSS) into every page that mounted a tour
// (Properties, PropertyDetail, NewProperty, Templates, Transfers).
// OWNER + CUSTOMER + already-completed-AGENT + mobile sessions paid
// that cost for nothing. Splitting the actual Joyride mount into a
// lazy inner component means the chunk only loads when shouldRun is
// satisfied and the timer is about to start.
const JoyrideInner = lazy(() => import('./PageTourInner'));

/**
 * PageTour — per-page explainer. Skip/Done both funnel through the
 * global kill-switch (killAllTours), which:
 *   - flips an in-memory flag every tour subscribes to
 *   - writes localStorage 'estia-tour-killed'=1 synchronously
 *   - POSTs /api/me/tutorial/complete via both navigator.sendBeacon
 *     AND a keepalive fetch so the server flag flips regardless of
 *     what happens to the page afterwards
 *
 * Tours anywhere else in the tree re-render immediately and return
 * null because areToursKilled() is true. No Joyride callback timing
 * race is involved.
 */
export default function PageTour({ pageKey, steps, delay = 700 }) {
  const { user } = useAuth();
  const isMobile = useViewportMobile();
  const [run, setRun] = useState(false);

  // Re-render on kill-switch changes so we can return null instantly.
  const [, tick] = useReducer((n) => n + 1, 0);
  useEffect(() => subscribeTourKill(tick), []);

  useEffect(() => {
    if (areToursKilled()) return undefined;
    if (!user || user.role !== 'AGENT') return undefined;
    if (Capacitor.isNativePlatform() || isMobile) return undefined;
    if (!pageKey || !steps?.length) return undefined;
    if (user.hasCompletedTutorial) return undefined;
    try {
      if (localStorage.getItem(`estia-page-tour:${pageKey}`)) return undefined;
    } catch { /* ignore */ }
    const t = setTimeout(() => setRun(true), delay);
    return () => clearTimeout(t);
  }, [user, pageKey, steps?.length, delay, isMobile]);

  if (areToursKilled() || !run) return null;

  return (
    <Suspense fallback={null}>
      <JoyrideInner steps={steps} />
    </Suspense>
  );
}
