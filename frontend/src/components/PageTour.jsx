import { useEffect, useState } from 'react';
import { Joyride, STATUS, ACTIONS } from 'react-joyride';
import { Capacitor } from '@capacitor/core';
import { useAuth } from '../lib/auth';
import { useViewportMobile } from '../hooks/mobile';
import {
  tourStyles,
  floaterProps,
  dismissAllTours,
  TourTooltip,
} from './OnboardingTour';

/**
 * PageTour — per-page explainer. One tap on the skip pill kills every
 * tour everywhere (main + all per-page), forever.
 *
 * Dead-on-close: we flip `dead=true` and immediately return null so
 * Joyride's spotlight can't hang around as a shrinking dark circle.
 */
export default function PageTour({ pageKey, steps, delay = 700 }) {
  const { user } = useAuth();
  const isMobile = useViewportMobile();
  const [run, setRun] = useState(false);
  const [dead, setDead] = useState(false);

  useEffect(() => {
    if (!user || user.role !== 'AGENT') return undefined;
    // Phone sessions never see page tours either.
    if (Capacitor.isNativePlatform() || isMobile) return undefined;
    if (!pageKey || !steps?.length) return undefined;
    try {
      if (localStorage.getItem(`estia-page-tour:${pageKey}`)) return undefined;
      if (localStorage.getItem('estia-tour-dismissed')) return undefined;
    } catch { /* ignore */ }
    const t = setTimeout(() => setRun(true), delay);
    return () => clearTimeout(t);
  }, [user, pageKey, steps?.length, delay, isMobile]);

  const handleCallback = ({ status, action }) => {
    if (action === ACTIONS.CLOSE || action === ACTIONS.SKIP) {
      // Explicit "stop showing me tours anywhere" — wipe every marker
      // and unmount Joyride on the same tick so no circle lingers.
      dismissAllTours();
      setDead(true);
      setRun(false);
      return;
    }
    if (status === STATUS.FINISHED || status === STATUS.SKIPPED) {
      try { localStorage.setItem(`estia-page-tour:${pageKey}`, String(Date.now())); }
      catch { /* ignore */ }
      setDead(true);
      setRun(false);
    }
  };

  if (!run || dead) return null;

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
      locale={{
        back: 'הקודם',
        last: 'הבנתי',
        next: 'הבא',
        skip: 'דלג על כל הסיורים לתמיד',
      }}
      callback={handleCallback}
      styles={tourStyles}
      floaterProps={floaterProps}
    />
  );
}
