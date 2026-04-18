import { useEffect, useState } from 'react';
import { Joyride, STATUS, ACTIONS } from 'react-joyride';
import { useAuth } from '../lib/auth';

/**
 * PageTour — a tiny per-page walkthrough that runs ONCE per device.
 *
 * Usage on a page:
 *   <PageTour pageKey="properties" steps={[
 *     { target: 'body', placement: 'center', content: '…' },
 *     { target: '[data-page-tour="add-fab"]', content: '…' },
 *   ]} />
 *
 * Gating rules:
 *   - Only for authenticated agents
 *   - Only AFTER the main OnboardingTour has completed (so the two
 *     don't fight for the overlay on first login)
 *   - Only once per device per page — tracked in localStorage under
 *     estia-page-tour:<pageKey>. No server field needed: re-install /
 *     re-login on a new device re-runs the page tours, which is fine.
 */
export default function PageTour({ pageKey, steps, delay = 700 }) {
  const { user } = useAuth();
  const [run, setRun] = useState(false);

  useEffect(() => {
    if (!user || user.role !== 'AGENT') return undefined;
    if (!user.hasCompletedTutorial) return undefined; // wait for the global tour
    if (!pageKey || !steps?.length) return undefined;
    const key = `estia-page-tour:${pageKey}`;
    try { if (localStorage.getItem(key)) return undefined; } catch { /* ignore */ }
    const t = setTimeout(() => setRun(true), delay);
    return () => clearTimeout(t);
  }, [user, pageKey, steps?.length, delay]);

  const markDone = () => {
    try { localStorage.setItem(`estia-page-tour:${pageKey}`, String(Date.now())); }
    catch { /* ignore */ }
    setRun(false);
  };

  const handleCallback = (data) => {
    const { status, action } = data;
    if (
      status === STATUS.FINISHED ||
      status === STATUS.SKIPPED ||
      action === ACTIONS.CLOSE ||
      action === ACTIONS.SKIP
    ) {
      markDone();
    }
  };

  if (!run) return null;

  return (
    <Joyride
      run={run}
      steps={steps.map((s) => ({ disableBeacon: true, placement: 'auto', ...s }))}
      continuous
      showProgress
      showSkipButton
      scrollToFirstStep={false}
      disableScrolling={false}
      disableOverlayClose
      locale={{
        back: 'הקודם',
        close: 'סגור',
        last: 'סיימתי',
        next: 'הבא',
        skip: 'דלג',
      }}
      callback={handleCallback}
      styles={{
        options: {
          arrowColor: 'var(--bg-card)',
          backgroundColor: 'var(--bg-card)',
          primaryColor: 'var(--gold)',
          textColor: 'var(--text-primary)',
          overlayColor: 'rgba(10, 10, 15, 0.45)',
          zIndex: 1150,
        },
        tooltip: {
          borderRadius: 16,
          padding: '16px 18px',
          direction: 'rtl',
          fontFamily: 'var(--font-body)',
        },
        buttonNext: {
          backgroundColor: 'var(--gold)',
          color: '#1a1409',
          borderRadius: 999,
          fontWeight: 800,
          padding: '8px 18px',
          fontFamily: 'var(--font-display)',
        },
        buttonBack: {
          color: 'var(--text-secondary)',
          marginInlineEnd: 8,
        },
        buttonSkip: {
          color: 'var(--text-muted)',
        },
      }}
    />
  );
}
