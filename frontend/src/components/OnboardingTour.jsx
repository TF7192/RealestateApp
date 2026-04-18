import { useEffect, useMemo, useState } from 'react';
import { Joyride, STATUS, ACTIONS } from 'react-joyride';
import { useNavigate, useLocation } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Capacitor } from '@capacitor/core';
import { useViewportMobile } from '../hooks/mobile';

/**
 * First-login tour for agents. Uncontrolled stepping: Joyride owns the
 * current step while it's running; we only handle end-state events
 * (finished / skipped / close / skip). This avoids the previous bug
 * where our controlled stepIndex and Joyride's internal advance fought
 * each other on "הבא" and froze the overlay on a grey screen.
 *
 * Robustness against missing targets: every step has a reasonable
 * fallback placement + target selector that also matches the mobile
 * tab bar (see MobileTabBar.jsx data-tour anchors), so the tour never
 * has to rely on an element that isn't mounted on the current
 * viewport. Steps that can't have a guaranteed anchor (e.g. Owners on
 * mobile, which lives inside the MoreSheet) are rendered as
 * centered explainers with target='body'.
 */
export default function OnboardingTour() {
  const { user, refresh } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useViewportMobile();
  const [run, setRun] = useState(false);

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
      disableBeacon: true,
    };

    // Helper — build a step that falls back to body/center if the
    // target selector isn't found. Joyride v3 handles this for us as
    // long as we don't depend on a spotlight anchor.
    const nav = (selector, content, title) => ({
      target: selector,
      content,
      title,
      placement: 'auto',
      disableBeacon: true,
    });

    if (isMobile) {
      return [
        welcome,
        nav('[data-tour="sidebar-properties"]', 'כאן מרכז כל הנכסים שלך. הוספה, עריכה ושיתוף ללקוחות.'),
        nav('[data-tour="sidebar-customers"]', 'הלקוחות המתעניינים — התאמה אוטומטית לנכסים על כרטיס הנכס.'),
        {
          target: 'body',
          placement: 'center',
          content: 'בתפריט ⋯ תמצאו גם את בעלי הנכסים, תבניות ההודעות, העברות וצ׳אט עם המפתחים.',
          disableBeacon: true,
        },
        wrap,
      ];
    }

    return [
      welcome,
      nav('[data-tour="sidebar-properties"]', 'כאן מרכז כל הנכסים שלך. מוסיפים, עורכים, ומשתפים ללקוחות ישירות מהרשימה.'),
      nav('[data-tour="sidebar-owners"]',     'ספר בעלי הנכסים — כל הפרטים על המוכרים/המשכירים במקום אחד.'),
      nav('[data-tour="sidebar-customers"]',  'הלקוחות המתעניינים. התאמה אוטומטית לנכסים מופיעה על כרטיס הנכס.'),
      nav('[data-tour="sidebar-templates"]',  'תבניות הודעות — כותבים פעם אחת, השדות המתחלפים מתמלאים אוטומטית בכל שליחה.'),
      nav('[data-tour="sidebar-transfers"]',  'העברות נכסים עם סוכנים אחרים במערכת. בעלי נכסים עוברים איתם.'),
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
      /* Uncontrolled — do NOT pass stepIndex. Joyride manages Next/Back
         internally in continuous mode. Passing stepIndex while also
         reacting to STEP_AFTER was causing the controlled/uncontrolled
         clash that froze the overlay on "הבא". */
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
