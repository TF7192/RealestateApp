import { useEffect, useState } from 'react';
import { Joyride, STATUS, ACTIONS } from 'react-joyride';
import { Capacitor } from '@capacitor/core';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useViewportMobile } from '../hooks/mobile';
import {
  tourStyles,
  floaterProps,
  dismissAllTours,
  forceUnmountTour,
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
  const { user, refresh } = useAuth();
  const isMobile = useViewportMobile();
  const [run, setRun] = useState(false);
  const [dead, setDead] = useState(false);

  useEffect(() => {
    if (!user || user.role !== 'AGENT') return undefined;
    // Phone sessions never see page tours either.
    if (Capacitor.isNativePlatform() || isMobile) return undefined;
    if (!pageKey || !steps?.length) return undefined;
    // Persistent gate — if the server says "tutorial done", page tours
    // also stop. This is the bit that survives logout/login.
    if (user.hasCompletedTutorial) return undefined;
    try {
      if (localStorage.getItem(`estia-page-tour:${pageKey}`)) return undefined;
      if (localStorage.getItem('estia-tour-dismissed')) return undefined;
    } catch { /* ignore */ }
    const t = setTimeout(() => setRun(true), delay);
    return () => clearTimeout(t);
  }, [user, pageKey, steps?.length, delay, isMobile]);

  // Both Done and Skip now write the same SYNCHRONOUS flags before
  // anything async starts. That matters because Joyride's callback
  // runs on the click, then the user immediately navigates — if the
  // server POST hasn't resolved by the time the next page mounts its
  // PageTour, that page's useEffect checks user.hasCompletedTutorial
  // (still false in the client state) and fires its own tour.
  //
  // With estia-tour-dismissed written synchronously, the next page's
  // PageTour returns early on its very first render — no flicker, no
  // tour — regardless of how fast the agent switches pages.
  const endTour = async (reason /* 'done' | 'skip' */) => {
    forceUnmountTour();
    setDead(true);
    setRun(false);
    try {
      localStorage.setItem(`estia-page-tour:${pageKey}`, String(Date.now()));
      // SYNCHRONOUS tour-wide flag — blocks every other PageTour mount
      // on the next navigation even if the server call hasn't finished.
      localStorage.setItem('estia-tour-dismissed', '1');
    } catch { /* ignore */ }
    if (reason === 'skip') {
      // Skip ALSO writes all per-page keys so a re-enabled session
      // doesn't re-trigger pages that were never personally visited.
      await dismissAllTours();
    } else {
      try { await api.completeTutorial(); } catch { /* ignore */ }
    }
    refresh?.();
  };

  const handleCallback = ({ status, action }) => {
    if (action === ACTIONS.CLOSE || action === ACTIONS.SKIP) {
      endTour('skip');
      return;
    }
    if (status === STATUS.FINISHED || status === STATUS.SKIPPED) {
      endTour('done');
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
