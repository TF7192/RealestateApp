import { useEffect, useState } from 'react';
import { Joyride, STATUS, ACTIONS } from 'react-joyride';
import { useAuth } from '../lib/auth';
import { tourStyles, floaterProps, dismissAllTours } from './OnboardingTour';

/**
 * PageTour — ONE short explainer per page, once per device.
 *
 * Gating:
 *   - Agent role only
 *   - localStorage `estia-page-tour:<pageKey>` not set
 *   - Respects the dismiss-all flag set by Skip/Close anywhere
 *
 * Listens for `estia-tour:replay` on window so the sidebar `?` button
 * can re-fire this page's tour on demand even after it's been
 * marked done.
 */
export default function PageTour({ pageKey, steps, delay = 700 }) {
  const { user } = useAuth();
  const [run, setRun] = useState(false);

  // Auto-run on first visit if not already seen.
  useEffect(() => {
    if (!user || user.role !== 'AGENT') return undefined;
    if (!pageKey || !steps?.length) return undefined;
    const key = `estia-page-tour:${pageKey}`;
    try {
      if (localStorage.getItem(key)) return undefined;
      if (localStorage.getItem('estia-tour-dismissed')) return undefined;
    } catch { /* ignore */ }
    const t = setTimeout(() => setRun(true), delay);
    return () => clearTimeout(t);
  }, [user, pageKey, steps?.length, delay]);

  // Replay-on-demand: the sidebar `?` button dispatches this with the
  // current page's key. We clear the dismiss flag + the per-page
  // marker before showing the tour again.
  useEffect(() => {
    const onReplay = (e) => {
      if (e?.detail?.pageKey !== pageKey) return;
      try {
        localStorage.removeItem('estia-tour-dismissed');
        localStorage.removeItem(`estia-page-tour:${pageKey}`);
      } catch { /* ignore */ }
      setRun(true);
    };
    window.addEventListener('estia-tour:replay', onReplay);
    return () => window.removeEventListener('estia-tour:replay', onReplay);
  }, [pageKey]);

  const markDone = () => {
    try { localStorage.setItem(`estia-page-tour:${pageKey}`, String(Date.now())); }
    catch { /* ignore */ }
    setRun(false);
  };

  const handleCallback = ({ status, action }) => {
    if (action === ACTIONS.CLOSE || action === ACTIONS.SKIP) {
      // X or Skip in a page tour is an explicit "stop showing me these
      // anywhere" — mark EVERY tour as done (server + all page keys),
      // as the user requested.
      dismissAllTours();
      setRun(false);
      return;
    }
    if (status === STATUS.FINISHED || status === STATUS.SKIPPED) {
      markDone();
    }
  };

  if (!run) return null;

  return (
    <Joyride
      run={run}
      steps={steps.map((s) => ({ disableBeacon: true, placement: 'auto', ...s }))}
      continuous
      showProgress={steps.length > 1}
      showSkipButton
      hideCloseButton={false}
      scrollToFirstStep={false}
      disableScrolling={false}
      disableOverlayClose
      locale={{
        back: 'הקודם',
        close: 'סגור',
        last: 'הבנתי',
        next: 'הבא',
        skip: 'דלג על הטיפ',
      }}
      callback={handleCallback}
      styles={tourStyles}
      floaterProps={floaterProps}
    />
  );
}
