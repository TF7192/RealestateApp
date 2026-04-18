import { useEffect, useMemo, useRef, useState } from 'react';
import { Joyride, STATUS, ACTIONS } from 'react-joyride';
import './onboarding.css';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Capacitor } from '@capacitor/core';

/**
 * First-login tour for agents.
 *
 * Uses centered explainer steps (target:'body' + placement:'center')
 * for the initial overview so the tour doesn't depend on any specific
 * element being mounted and never force-navigates the user. When the
 * user dismisses/finishes, per-page tours (<PageTour>) take over on
 * each first visit so the remaining feature walkthrough is contextual.
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
    // Give the page a beat to settle before the tour mounts
    const t = setTimeout(() => setRun(true), 400);
    return () => clearTimeout(t);
  }, [shouldRun]);

  const steps = useMemo(() => {
    // Helper: try to anchor on the real sidebar / tab-bar item. If that
    // selector isn't on the current viewport (e.g. Owners has no mobile
    // tab), fall back to a centered explainer. Joyride handles missing
    // targets gracefully in continuous mode now that we don't override
    // spotlight/overlay shadows.
    const anchored = (selector, title, content, placement = 'auto') => ({
      target: selector,
      title,
      content,
      placement,
      disableBeacon: true,
      spotlightPadding: 6,
    });
    const centered = (title, content) => ({
      target: 'body',
      placement: 'center',
      title,
      content,
      disableBeacon: true,
    });

    return [
      centered('ברוך/ה הבא/ה ל-Estia',
        'סיור קצר (פחות מדקה) שמראה איפה נמצא כל דבר. אפשר לדלג בכל שלב — הסיור לא יחזור.'),
      anchored('[data-tour="sidebar-properties"]', 'נכסים',
        'כל הנכסים שלך במקום אחד — רשימה, עריכה, שיתוף ללקוחות, וכרטיס נכס מלא עם פעולות שיווק.'),
      anchored('[data-tour="sidebar-owners"]', 'בעלי נכסים',
        'ספר בעלי הנכסים שלך — המוכרים והמשכירים. כל בעל נכס מקושר לנכסים שלו, עם היסטוריה מלאה.'),
      anchored('[data-tour="sidebar-customers"]', 'לקוחות',
        'הלקוחות המתעניינים. התאמות אוטומטיות לנכסים מופיעות על כרטיס הנכס, כדי שתדעו למי לשלוח.'),
      anchored('[data-tour="sidebar-templates"]', 'תבניות הודעות',
        'כותבים פעם אחת — השדות המשתנים (מחיר, חדרים, כתובת) מתמלאים אוטומטית בכל שליחה ללקוח.'),
      anchored('[data-tour="sidebar-transfers"]', 'העברות',
        'העברת נכס לסוכן אחר במערכת. בעל הנכס והיסטוריית הנכס עוברים איתו.'),
      centered('צ׳אט עם המפתחים',
        'כפתור הצ׳אט בפינה התחתונה פותח שיחה ישירה עם צוות המפתחים — באגים, בקשות ושאלות. אנחנו חוזרים מהר.'),
      centered('',
        'זהו. בכל עמוד שתכנסו אליו בפעם הראשונה נסביר שם את הפרטים הקטנים. בהצלחה!'),
    ];
  }, []);

  const locale = {
    back: 'הקודם',
    close: 'סגור',
    last: 'סיימתי',
    next: 'הבא',
    skip: 'דלג',
  };

  const finish = async () => {
    setRun(false);
    try { await api.completeTutorial(); } catch { /* ignore */ }
    refresh?.();
  };

  const handleCallback = (data) => {
    const { status, action } = data;
    if (
      status === STATUS.FINISHED ||
      status === STATUS.SKIPPED ||
      action === ACTIONS.CLOSE ||
      action === ACTIONS.SKIP
    ) {
      finish();
    }
  };

  if (!shouldRun) return null;

  return (
    <Joyride
      run={run}
      steps={steps}
      continuous
      showProgress
      showSkipButton
      scrollToFirstStep={false}
      disableScrolling={false}
      disableOverlayClose
      locale={locale}
      callback={handleCallback}
      styles={{
        options: {
          arrowColor: 'var(--bg-card)',
          backgroundColor: 'var(--bg-card)',
          primaryColor: 'var(--gold)',
          textColor: 'var(--text-primary)',
          overlayColor: 'rgba(10, 10, 15, 0.55)',
          zIndex: 1200,
        },
        tooltip: {
          borderRadius: 16,
          padding: '18px 20px',
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
