import { useEffect, useState } from 'react';
import { Joyride, STATUS, ACTIONS } from 'react-joyride';
import { useAuth } from '../lib/auth';

/**
 * PageTour — ONE short explainer per page, once per device.
 *
 * Gating:
 *   - Agent role only
 *   - localStorage `estia-page-tour:<pageKey>` not set
 *   - Runs independently of the main onboarding (users who skipped the
 *     intro still get page context)
 *
 * No external CSS — pass everything through Joyride's `styles` prop so
 * we never fight the SVG overlay mask.
 */
export default function PageTour({ pageKey, steps, delay = 700 }) {
  const { user } = useAuth();
  const [run, setRun] = useState(false);

  useEffect(() => {
    if (!user || user.role !== 'AGENT') return undefined;
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

  const handleCallback = ({ status, action }) => {
    if (
      status === STATUS.FINISHED ||
      status === STATUS.SKIPPED ||
      action === ACTIONS.CLOSE ||
      action === ACTIONS.SKIP
    ) markDone();
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
      styles={{
        options: {
          arrowColor: '#ffffff',
          backgroundColor: '#ffffff',
          primaryColor: '#c9a96e',
          textColor: '#1e1a14',
          overlayColor: 'rgba(10, 10, 15, 0.45)',
          width: 360,
          zIndex: 10000,
        },
        tooltipContainer: { direction: 'rtl', textAlign: 'right' },
        tooltipTitle: {
          fontFamily: 'Frank Ruhl Libre, Heebo, sans-serif',
          fontWeight: 800,
          fontSize: 17,
          marginBottom: 6,
          color: '#1e1a14',
        },
        tooltipContent: {
          fontFamily: 'Heebo, sans-serif',
          fontSize: 14,
          lineHeight: 1.65,
          color: '#1e1a14',
          padding: '6px 0 0',
        },
        buttonNext: {
          backgroundColor: '#c9a96e',
          color: '#1a1409',
          borderRadius: 999,
          fontWeight: 800,
          fontFamily: 'Frank Ruhl Libre, Heebo, sans-serif',
          padding: '8px 18px',
        },
        buttonBack: {
          color: '#6b6458',
          marginInlineEnd: 6,
          fontFamily: 'Heebo, sans-serif',
          fontWeight: 600,
        },
        buttonSkip: {
          color: '#6b6458',
          fontFamily: 'Heebo, sans-serif',
          fontWeight: 700,
          fontSize: 13,
          padding: '6px 12px',
          border: '1px solid #e4dfd4',
          borderRadius: 999,
          background: '#faf7f0',
        },
        buttonClose: { color: '#8a7a5c' },
        spotlight: { borderRadius: 14 },
      }}
    />
  );
}
