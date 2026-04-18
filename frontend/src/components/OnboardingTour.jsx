import { useEffect, useMemo, useRef, useState } from 'react';
import { Joyride, STATUS, ACTIONS } from 'react-joyride';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Capacitor } from '@capacitor/core';

/**
 * First-login tour for agents.
 *
 * Keep it dead-simple: one linear tour, Joyride defaults untouched by
 * external CSS (anything that overrides .react-joyride__overlay or
 * .react-joyride__spotlight BREAKS the cut-out and blacks out the
 * whole viewport — the whole tooltip included). All customization
 * happens via the `styles` prop, which is the officially supported
 * hook and doesn't fight Joyride's SVG mask.
 *
 * Steps anchor on real sidebar links via [data-tour="..."] — when the
 * selector matches, the referenced button gets the bright cut-out; when
 * it doesn't (e.g. the chat widget step, or mobile where those
 * sidebar links aren't mounted), the step falls back to a centered
 * explainer gracefully.
 *
 * Skip button is visible at every step (`showSkipButton: true`) with a
 * clear color + border so the user can exit on the page they're on.
 */
export default function OnboardingTour() {
  const { user, refresh } = useAuth();
  const [run, setRun] = useState(false);
  const startedRef = useRef(false);

  const platform = Capacitor.getPlatform();

  const shouldRun = useMemo(() => {
    if (!user || user.role !== 'AGENT') return false;
    if (user.hasCompletedTutorial) return false;
    if (user.firstLoginPlatform && user.firstLoginPlatform !== platform) return false;
    return true;
  }, [user, platform]);

  useEffect(() => {
    if (!shouldRun || startedRef.current) return;
    startedRef.current = true;
    const t = setTimeout(() => setRun(true), 400);
    return () => clearTimeout(t);
  }, [shouldRun]);

  const steps = useMemo(() => [
    {
      target: 'body',
      placement: 'center',
      title: 'ברוכים הבאים ל-Estia',
      content: 'סיור קצר שיראה לכם איפה נמצא כל דבר. אפשר לדלג בכל שלב — הסיור לא יחזור.',
      disableBeacon: true,
    },
    {
      target: '[data-tour="sidebar-properties"]',
      title: 'נכסים',
      content: 'כל הנכסים שלכם במקום אחד — רשימה, עריכה, שיתוף ללקוחות, וכרטיס נכס מלא עם פעולות שיווק.',
      disableBeacon: true,
      spotlightPadding: 8,
    },
    {
      target: '[data-tour="sidebar-owners"]',
      title: 'בעלי נכסים',
      content: 'ספר המוכרים והמשכירים. כל בעל נכס מקושר לנכסים שלו, עם היסטוריית התקשרות מלאה.',
      disableBeacon: true,
      spotlightPadding: 8,
    },
    {
      target: '[data-tour="sidebar-customers"]',
      title: 'לקוחות',
      content: 'הלקוחות המתעניינים. התאמות אוטומטיות לנכסים מופיעות על כרטיס הנכס.',
      disableBeacon: true,
      spotlightPadding: 8,
    },
    {
      target: '[data-tour="sidebar-templates"]',
      title: 'תבניות הודעות',
      content: 'כותבים פעם אחת — השדות המשתנים (מחיר, חדרים, כתובת) מתמלאים אוטומטית בכל שליחה ללקוח.',
      disableBeacon: true,
      spotlightPadding: 8,
    },
    {
      target: '[data-tour="sidebar-transfers"]',
      title: 'העברות',
      content: 'העברת נכס לסוכן אחר במערכת — בעל הנכס והיסטוריה עוברים איתו.',
      disableBeacon: true,
      spotlightPadding: 8,
    },
    {
      target: 'body',
      placement: 'center',
      title: 'צ׳אט עם המפתחים',
      content: 'כפתור הצ׳אט בפינה התחתונה פותח שיחה ישירה עם צוות Estia — באגים, בקשות ושאלות.',
      disableBeacon: true,
    },
    {
      target: 'body',
      placement: 'center',
      content: 'זהו. בכל עמוד שתכנסו אליו בפעם הראשונה נסביר שם את הפרטים הקטנים. בהצלחה!',
      disableBeacon: true,
    },
  ], []);

  const finish = async () => {
    setRun(false);
    try { await api.completeTutorial(); } catch { /* ignore */ }
    refresh?.();
  };

  const handleCallback = ({ status, action }) => {
    if (
      status === STATUS.FINISHED ||
      status === STATUS.SKIPPED ||
      action === ACTIONS.CLOSE ||
      action === ACTIONS.SKIP
    ) finish();
  };

  if (!shouldRun) return null;

  return (
    <Joyride
      run={run}
      steps={steps}
      continuous
      showProgress
      showSkipButton
      hideCloseButton={false}
      scrollToFirstStep={false}
      disableScrolling={false}
      disableOverlayClose
      locale={{
        back: 'הקודם',
        close: 'סגור',
        last: 'סיימתי',
        next: 'הבא',
        skip: 'דלג על הסיור',
      }}
      callback={handleCallback}
      styles={{
        options: {
          arrowColor: '#ffffff',
          backgroundColor: '#ffffff',
          primaryColor: '#c9a96e',
          textColor: '#1e1a14',
          overlayColor: 'rgba(10, 10, 15, 0.55)',
          width: 380,
          zIndex: 10000,
        },
        tooltipContainer: { direction: 'rtl', textAlign: 'right' },
        tooltipTitle: {
          fontFamily: 'Frank Ruhl Libre, Heebo, system-ui, sans-serif',
          fontWeight: 800,
          fontSize: 18,
          marginBottom: 6,
          color: '#1e1a14',
        },
        tooltipContent: {
          fontFamily: 'Heebo, system-ui, sans-serif',
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
