import { useEffect, useMemo, useState } from 'react';
import { Joyride, STATUS, EVENTS, ACTIONS } from 'react-joyride';
import { useNavigate, useLocation } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Capacitor } from '@capacitor/core';
import { useViewportMobile } from '../hooks/mobile';

/**
 * First-login tour for agents.
 *
 * Runs only when ALL of these are true:
 *   - user is an AGENT
 *   - user.hasCompletedTutorial === false
 *   - currentPlatform === user.firstLoginPlatform
 *
 * Skip or finish both POST /api/me/tutorial/complete.
 *
 * Defensive against missing targets: on iPhone the sidebar isn't mounted
 * (MobileTabBar is used instead), so a step whose selector doesn't exist
 * would previously leave the overlay stuck on a grey screen. We handle
 * Joyride's error:target_not_found event by auto-advancing, AND we
 * serve a shorter mobile-specific step list.
 */
export default function OnboardingTour() {
  const { user, refresh } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useViewportMobile();
  const [run, setRun] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

  const platform = Capacitor.getPlatform();

  const shouldRun = useMemo(() => {
    if (!user || user.role !== 'AGENT') return false;
    if (user.hasCompletedTutorial) return false;
    if (user.firstLoginPlatform && user.firstLoginPlatform !== platform) return false;
    return true;
  }, [user, platform]);

  useEffect(() => {
    if (!shouldRun) { setRun(false); return; }
    if (location.pathname !== '/' && !location.pathname.startsWith('/properties')) {
      navigate('/properties');
    }
    const t = setTimeout(() => setRun(true), 600);
    return () => clearTimeout(t);
  }, [shouldRun, location.pathname, navigate]);

  // Desktop tour points at sidebar data-tour anchors. Mobile tour uses
  // the tab bar + centered steps for sections that live in MoreSheet
  // (Owners, Templates, Transfers are NOT on the tab bar).
  const steps = useMemo(() => {
    const welcome = {
      target: 'body',
      placement: 'center',
      title: 'ברוך/ה הבא/ה ל-Estia',
      content: 'סיור קצר (דקה) שיראה לך איפה כל דבר. אפשר לדלג בכל שלב — הסיור לא יחזור.',
      disableBeacon: true,
    };
    const wrap = {
      target: 'body',
      placement: 'center',
      content: 'זהו. אפשר להתחיל — בהצלחה!',
    };

    if (isMobile) {
      return [
        welcome,
        {
          target: '[data-tour="sidebar-properties"]',
          content: 'כאן מרכז כל הנכסים שלך. הוספה, עריכה ושיתוף ללקוחות.',
          placement: 'top',
        },
        {
          target: '[data-tour="sidebar-customers"]',
          content: 'הלקוחות המתעניינים — התאמה אוטומטית לנכסים על כרטיס הנכס.',
          placement: 'top',
        },
        {
          target: 'body',
          placement: 'center',
          content: 'בתפריט ⋯ תמצאי/מצא גם את בעלי הנכסים, תבניות ההודעות, העברות וצ׳אט עם המפתחים.',
        },
        wrap,
      ];
    }

    return [
      welcome,
      { target: '[data-tour="sidebar-properties"]',
        content: 'כאן מרכז כל הנכסים שלך. מוסיפים, עורכים, ומשתפים ללקוחות ישירות מהרשימה.' },
      { target: '[data-tour="sidebar-owners"]',
        content: 'ספר בעלי הנכסים — כל הפרטים על המוכרים/המשכירים במקום אחד.' },
      { target: '[data-tour="sidebar-customers"]',
        content: 'הלקוחות המתעניינים. התאמה אוטומטית לנכסים מופיעה על כרטיס הנכס.' },
      { target: '[data-tour="sidebar-templates"]',
        content: 'תבניות הודעות — כותבים פעם אחת, השדות המתחלפים מתמלאים אוטומטית בכל שליחה.' },
      { target: '[data-tour="sidebar-transfers"]',
        content: 'העברות נכסים עם סוכנים אחרים במערכת. בעלי נכסים עוברים איתם.' },
      wrap,
    ];
  }, [isMobile]);

  const locale = {
    back: 'הקודם',
    close: 'סגור',
    last: 'סיימתי',
    next: 'הבא',
    skip: 'דלג',
  };

  const finish = async () => {
    setRun(false);
    setStepIndex(0);
    try { await api.completeTutorial(); } catch { /* ignore */ }
    refresh?.();
  };

  const handleCallback = (data) => {
    const { status, type, action, index } = data;

    // End cases — skip / finish / close button
    if (status === STATUS.FINISHED || status === STATUS.SKIPPED ||
        action === ACTIONS.CLOSE  || action === ACTIONS.SKIP) {
      finish();
      return;
    }

    // Target missing for this step — auto-advance so the overlay never
    // gets stuck on a grey screen (root cause of the earlier bug).
    if (type === EVENTS.TARGET_NOT_FOUND) {
      const next = (action === ACTIONS.PREV ? index - 1 : index + 1);
      if (next >= steps.length) { finish(); return; }
      setStepIndex(Math.max(0, next));
      return;
    }

    // Normal step advance: Joyride fires step:after when a step unmounts
    if (type === EVENTS.STEP_AFTER) {
      const next = (action === ACTIONS.PREV ? index - 1 : index + 1);
      if (next >= steps.length) { finish(); return; }
      setStepIndex(Math.max(0, next));
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
      scrollToFirstStep={false}
      disableScrolling={false}
      disableOverlayClose
      // `hideBackButton={false}` default is fine
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
