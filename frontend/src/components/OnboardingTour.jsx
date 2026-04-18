import { useEffect, useMemo, useState } from 'react';
import { Joyride, STATUS } from 'react-joyride';
import { useNavigate, useLocation } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Capacitor } from '@capacitor/core';

/**
 * First-login tour for agents, using react-joyride.
 *
 * Runs only when ALL of these are true:
 *   - user is an AGENT
 *   - user.hasCompletedTutorial === false
 *   - currentPlatform === user.firstLoginPlatform (so it doesn't re-fire
 *     after a device switch)
 *
 * Skip or finish both POST /api/me/tutorial/complete which flips the flag
 * server-side, so the tour is dismissed permanently for that user.
 */
export default function OnboardingTour() {
  const { user, refresh } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [run, setRun] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

  const platform = Capacitor.getPlatform();

  const shouldRun = useMemo(() => {
    if (!user || user.role !== 'AGENT') return false;
    if (user.hasCompletedTutorial) return false;
    // Only run on the platform the agent first signed in on — keeps the
    // tour from re-appearing when they move between web and mobile.
    if (user.firstLoginPlatform && user.firstLoginPlatform !== platform) return false;
    return true;
  }, [user, platform]);

  // Walk the user to /properties before starting. Every step targets a
  // selector on that page or on the always-mounted Layout sidebar, so
  // we want a predictable starting route.
  useEffect(() => {
    if (!shouldRun) { setRun(false); return; }
    if (location.pathname !== '/' && !location.pathname.startsWith('/properties')) {
      navigate('/properties');
    }
    // Give the page a beat to mount before Joyride measures targets.
    const t = setTimeout(() => setRun(true), 600);
    return () => clearTimeout(t);
  }, [shouldRun, location.pathname, navigate]);

  const steps = useMemo(() => [
    {
      target: 'body',
      placement: 'center',
      title: 'ברוך/ה הבא/ה ל-Estia',
      content:
        'סיור קצר (דקה) שיראה לך איפה כל דבר. אפשר לדלג בכל שלב — הסיור לא יחזור.',
      disableBeacon: true,
    },
    {
      target: '[data-tour="sidebar-properties"], [href="/properties"]',
      content: 'כאן מרכז כל הנכסים שלך. מוסיפים, עורכים, ומשתפים ללקוחות ישירות מהרשימה.',
    },
    {
      target: '[data-tour="sidebar-owners"], [href="/owners"]',
      content: 'ספר בעלי הנכסים — כל הפרטים על המוכרים/המשכירים במקום אחד.',
    },
    {
      target: '[data-tour="sidebar-customers"], [href="/customers"]',
      content: 'הלקוחות המתעניינים. התאמה אוטומטית לנכסים מופיעה על כרטיס הנכס.',
    },
    {
      target: '[data-tour="sidebar-templates"], [href="/templates"]',
      content: 'תבניות הודעות — כותבים פעם אחת, השדות המתחלפים מתמלאים אוטומטית בכל שליחה.',
    },
    {
      target: '[data-tour="sidebar-transfers"], [href="/transfers"]',
      content: 'העברות נכסים עם סוכנים אחרים במערכת. בעלי נכסים עוברים איתם.',
    },
    {
      target: 'body',
      placement: 'center',
      content: 'זהו. אפשר להתחיל — בהצלחה!',
    },
  ], []);

  const locale = {
    back: 'הקודם',
    close: 'סגור',
    last: 'סיימתי',
    next: 'הבא',
    skip: 'דלג',
  };

  const finish = async () => {
    try { await api.completeTutorial(); } catch { /* swallow — optimistic */ }
    setRun(false);
    refresh?.();
  };

  const handleCallback = (data) => {
    const { status, action, index, type } = data;
    if (type === 'step:after' || type === 'error:target_not_found') {
      // Let Joyride advance; track step index for safety
      setStepIndex(index + (action === 'prev' ? -1 : 1));
    }
    if (status === STATUS.FINISHED || status === STATUS.SKIPPED || action === 'close') {
      finish();
    }
  };

  if (!shouldRun) return null;

  return (
    <Joyride
      run={run}
      steps={steps}
      stepIndex={stepIndex}
      continuous
      showProgress
      showSkipButton
      disableScrolling={false}
      scrollToFirstStep
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
