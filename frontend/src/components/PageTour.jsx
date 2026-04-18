import { useEffect, useReducer, useState } from 'react';
import { Joyride, STATUS, ACTIONS } from 'react-joyride';
import { Capacitor } from '@capacitor/core';
import { useAuth } from '../lib/auth';
import { useViewportMobile } from '../hooks/mobile';
import { areToursKilled, killAllTours, subscribeTourKill } from '../lib/tourKill';
import { tourStyles, floaterProps, TourTooltip } from './OnboardingTour';

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

  const handleCallback = ({ status, action }) => {
    if (
      action === ACTIONS.CLOSE ||
      action === ACTIONS.SKIP ||
      status === STATUS.FINISHED ||
      status === STATUS.SKIPPED
    ) killAllTours();
  };

  if (areToursKilled() || !run) return null;

  return (
    <Joyride
      run={run}
      steps={steps.map((s) => ({ disableBeacon: true, placement: 'auto', ...s }))}
      continuous
      showProgress={steps.length > 1}
      showSkipButton
      hideCloseButton
      scrollToFirstStep={false}
      disableScrolling={false}
      disableOverlayClose
      tooltipComponent={TourTooltip}
      locale={{ back: 'הקודם', last: 'סיימתי', next: 'הבא', skip: 'דלג על הסיור' }}
      callback={handleCallback}
      styles={tourStyles}
      floaterProps={floaterProps}
    />
  );
}
