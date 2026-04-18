import { useEffect, useMemo, useRef, useState } from 'react';
import { Joyride, STATUS, ACTIONS } from 'react-joyride';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Capacitor } from '@capacitor/core';
import { useViewportMobile } from '../hooks/mobile';

/**
 * First-login tour for agents.
 *
 * - No external CSS — everything via Joyride's `styles` prop so we
 *   don't fight react-joyride@3's SVG overlay mask.
 * - Close (×) / Skip both mark EVERY tour as done (main + all page
 *   tours) so tours never pop back up unless the user explicitly
 *   replays via the sidebar `?` button.
 * - Mobile uses MobileTabBar data-tour anchors; desktop uses sidebar
 *   anchors. Steps whose target is missing on the current viewport
 *   are skipped, so the tour never stalls on a missing element.
 */

const PAGE_TOUR_KEYS = [
  'properties', 'owners', 'customers', 'templates',
  'transfers', 'new-property', 'property-detail',
];

// Public helper — dismiss every tour everywhere. Called from Skip/Close
// in either the main tour OR a page tour. Also exposed on window so
// external code (e.g. the sidebar ? button's logic) can reset it.
export function dismissAllTours() {
  try {
    PAGE_TOUR_KEYS.forEach((k) => {
      localStorage.setItem(`estia-page-tour:${k}`, String(Date.now()));
    });
    localStorage.setItem('estia-tour-dismissed', '1');
  } catch { /* storage disabled */ }
}

export default function OnboardingTour() {
  const { user, refresh } = useAuth();
  const isMobile = useViewportMobile();
  const [run, setRun] = useState(false);
  const startedRef = useRef(false);

  const platform = Capacitor.getPlatform();

  const shouldRun = useMemo(() => {
    if (!user || user.role !== 'AGENT') return false;
    if (user.hasCompletedTutorial) return false;
    // Respect the dismiss-all flag set by a previous Skip/Close.
    try { if (localStorage.getItem('estia-tour-dismissed')) return false; } catch { /* ignore */ }
    // NOTE: we used to gate the tour on `firstLoginPlatform === platform`
    // so it wouldn't re-fire on a device switch. That caused the tour
    // to silently skip on the iPhone app whenever the user had signed
    // up on the web first. The tour is cheap and user-dismissable, so
    // just run it wherever the flag is still false — Skip/Close flips
    // it server-side for every surface.
    return true;
  }, [user]);
  void platform; // platform no longer gates the tour; kept for future use

  useEffect(() => {
    if (!shouldRun || startedRef.current) return;
    startedRef.current = true;
    const t = setTimeout(() => setRun(true), 400);
    return () => clearTimeout(t);
  }, [shouldRun]);

  const steps = useMemo(() => {
    const centered = (title, content) => ({
      target: 'body', placement: 'center', title, content, disableBeacon: true,
    });
    const anchored = (selector, title, content) => ({
      target: selector, title, content,
      disableBeacon: true,
      spotlightPadding: 8,
      placement: 'auto',
    });

    if (isMobile) {
      // Mobile: anchor on the tab bar (Properties + Customers are there)
      // and use centered steps for the sections that live in the More
      // sheet (Owners, Templates, Transfers).
      return [
        centered('ברוכים הבאים ל-Estia',
          'סיור קצר שיראה לכם איפה נמצא כל דבר. אפשר לדלג בכל שלב — הסיור לא יחזור.'),
        anchored('[data-tour="sidebar-properties"]', 'נכסים',
          'כל הנכסים שלכם, לחיצה על כרטיס פותחת את כל פעולות השיווק והעריכה.'),
        anchored('[data-tour="sidebar-customers"]', 'לקוחות',
          'הלקוחות המתעניינים. התאמות אוטומטיות לנכסים מופיעות בכרטיסי הנכסים.'),
        centered('בעלי נכסים, תבניות, העברות וצ׳אט',
          'בתפריט ⋯ למטה תמצאו את בעלי הנכסים, תבניות ההודעות, העברות נכסים וצ׳אט עם המפתחים.'),
        centered('',
          'זהו. בכל עמוד שתכנסו אליו בפעם הראשונה נראה לכם את הפרטים הקטנים של אותו עמוד. בהצלחה!'),
      ];
    }

    return [
      centered('ברוכים הבאים ל-Estia',
        'סיור קצר שיראה לכם איפה נמצא כל דבר. אפשר לדלג בכל שלב — הסיור לא יחזור.'),
      anchored('[data-tour="sidebar-properties"]', 'נכסים',
        'כל הנכסים שלכם במקום אחד — רשימה, עריכה, שיתוף ללקוחות, וכרטיס נכס מלא עם פעולות שיווק.'),
      anchored('[data-tour="sidebar-owners"]', 'בעלי נכסים',
        'ספר המוכרים והמשכירים. כל בעל נכס מקושר לנכסים שלו, עם היסטוריית התקשרות מלאה.'),
      anchored('[data-tour="sidebar-customers"]', 'לקוחות',
        'הלקוחות המתעניינים. התאמות אוטומטיות לנכסים מופיעות על כרטיס הנכס.'),
      anchored('[data-tour="sidebar-templates"]', 'תבניות הודעות',
        'כותבים פעם אחת — השדות המשתנים (מחיר, חדרים, כתובת) מתמלאים אוטומטית בכל שליחה ללקוח.'),
      anchored('[data-tour="sidebar-transfers"]', 'העברות',
        'העברת נכס לסוכן אחר במערכת — בעל הנכס והיסטוריה עוברים איתו.'),
      centered('צ׳אט עם המפתחים',
        'כפתור הצ׳אט פותח שיחה ישירה עם צוות Estia — באגים, בקשות ושאלות.'),
      centered('',
        'זהו. בכל עמוד שתכנסו אליו בפעם הראשונה נסביר שם את הפרטים הקטנים. בהצלחה!'),
    ];
  }, [isMobile]);

  const finish = async () => {
    setRun(false);
    dismissAllTours();
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
      styles={tourStyles}
      floaterProps={floaterProps}
    />
  );
}

// ─── shared tour styling ──────────────────────────────────────────
// Pushed into Joyride's `styles` prop (safe surface — doesn't clash
// with the SVG overlay mask). Extracted so PageTour reuses the exact
// same look.
export const tourStyles = {
  options: {
    arrowColor: '#ffffff',
    backgroundColor: '#ffffff',
    primaryColor: '#c9a96e',
    textColor: '#1e1a14',
    overlayColor: 'rgba(10, 10, 15, 0.55)',
    width: 380,
    zIndex: 10000,
  },
  tooltip: {
    // Key fix: the × lives top-end (visual left in RTL); give the
    // whole tooltip breathing room so the title / progress dots don't
    // drift under it.
    padding: '22px 22px 18px',
    borderRadius: 16,
    boxShadow: '0 24px 60px rgba(30, 26, 20, 0.22), 0 0 0 1px rgba(201, 169, 110, 0.12) inset',
  },
  tooltipContainer: {
    direction: 'rtl',
    textAlign: 'right',
  },
  tooltipTitle: {
    fontFamily: 'Frank Ruhl Libre, Heebo, system-ui, sans-serif',
    fontWeight: 800,
    fontSize: 18,
    lineHeight: 1.25,
    color: '#1e1a14',
    // Leave generous room on BOTH sides so the absolutely-positioned ×
    // never collides with the title glyphs, regardless of how Joyride
    // flips in RTL. 42px on each side = 34px button + 8px gap.
    paddingInlineEnd: 42,
    paddingInlineStart: 42,
    margin: 0,
    textAlign: 'right',
  },
  tooltipContent: {
    fontFamily: 'Heebo, system-ui, sans-serif',
    fontSize: 14,
    lineHeight: 1.65,
    color: '#1e1a14',
    padding: '10px 0 0',
  },
  tooltipFooter: {
    marginTop: 18,
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
    alignItems: 'center',
  },
  buttonNext: {
    backgroundColor: '#c9a96e',
    color: '#1a1409',
    borderRadius: 999,
    fontWeight: 800,
    fontFamily: 'Frank Ruhl Libre, Heebo, sans-serif',
    padding: '9px 20px',
    outline: 'none',
  },
  buttonBack: {
    color: '#6b6458',
    fontFamily: 'Heebo, sans-serif',
    fontWeight: 600,
    marginInlineEnd: 4,
  },
  buttonSkip: {
    color: '#6b6458',
    fontFamily: 'Heebo, sans-serif',
    fontWeight: 700,
    fontSize: 13,
    padding: '7px 14px',
    border: '1px solid #e4dfd4',
    borderRadius: 999,
    background: '#faf7f0',
  },
  buttonClose: {
    color: '#8a7a5c',
    width: 22,
    height: 22,
    padding: 0,
    // Move the × a bit further from the corner so it stops visually
    // colliding with the title glyphs in RTL.
    top: 14,
    right: 14,
    left: 'auto',
  },
  spotlight: { borderRadius: 14 },
};

export const floaterProps = {
  styles: { floater: { transition: 'transform 0.22s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.18s ease-out' } },
};
