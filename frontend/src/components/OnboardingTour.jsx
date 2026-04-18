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

  const steps = useMemo(() => ([
    {
      target: 'body',
      placement: 'center',
      title: 'ברוך/ה הבא/ה ל-Estia',
      content: 'סיור קצר (דקה) שיראה לך איפה כל דבר. אפשר לדלג בכל שלב — הסיור לא יחזור.',
      disableBeacon: true,
    },
    {
      target: 'body',
      placement: 'center',
      title: 'נכסים',
      content: 'כל הנכסים שלך במקום אחד — רשימה, עריכה, שיתוף ללקוחות, וכרטיס נכס מלא עם פעולות שיווק.',
      disableBeacon: true,
    },
    {
      target: 'body',
      placement: 'center',
      title: 'בעלי נכסים',
      content: 'ספר בעלי הנכסים שלך — המוכרים והמשכירים. כל בעל נכס משויך לנכסים שלו, עם היסטוריה מלאה.',
      disableBeacon: true,
    },
    {
      target: 'body',
      placement: 'center',
      title: 'לקוחות',
      content: 'הלקוחות המתעניינים. התאמות אוטומטיות לנכסים מופיעות על כרטיס הנכס, כדי שתדע מיד למי לשלוח.',
      disableBeacon: true,
    },
    {
      target: 'body',
      placement: 'center',
      title: 'תבניות הודעות',
      content: 'כותבים פעם אחת, השדות המתחלפים (מחיר, חדרים, כתובת) מתמלאים אוטומטית בכל שליחה ללקוח.',
      disableBeacon: true,
    },
    {
      target: 'body',
      placement: 'center',
      title: 'העברות',
      content: 'העברת נכס לסוכן אחר במערכת — בעלי הנכסים נשארים מקושרים. כולל היסטוריית העברות מלאה.',
      disableBeacon: true,
    },
    {
      target: 'body',
      placement: 'center',
      title: 'צ׳אט עם המפתחים',
      content: 'כפתור הצ׳אט בפינה פותח שיחה ישירה איתנו — באגים, בקשות, שאלות. נחזור אליך מהר.',
      disableBeacon: true,
    },
    {
      target: 'body',
      placement: 'center',
      content: 'זהו. בכל עמוד שתבקרי/תבקר בפעם הראשונה נסביר שם את הפרטים הקטנים. בהצלחה!',
      disableBeacon: true,
    },
  ]), []);

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
