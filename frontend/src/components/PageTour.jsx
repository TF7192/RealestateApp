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

  // Any "I'm done" signal flips the server flag too, so logout/login
  // stays quiet. Done + Skip both route through here.
  const endTour = async (reason /* 'done' | 'skip' */) => {
    forceUnmountTour();
    setDead(true);
    setRun(false);
    try { localStorage.setItem(`estia-page-tour:${pageKey}`, String(Date.now())); }
    catch { /* ignore */ }
    if (reason === 'skip') {
      // Skip = 'stop everywhere' — dismiss all page keys too.
      await dismissAllTours();
    } else {
      // Done = persist server flag so the MAIN tour won't re-fire on
      // another device. Page-tour localStorage markers handle the
      // per-page silencing locally.
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
