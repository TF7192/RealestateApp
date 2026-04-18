import { useEffect, useMemo, useRef, useState } from 'react';
import { Joyride, STATUS, ACTIONS } from 'react-joyride';
import { Capacitor } from '@capacitor/core';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useViewportMobile } from '../hooks/mobile';
import './tour-tooltip.css';

// Synchronously hide every element Joyride mounts, BEFORE React re-
// renders. Without this the spotlight + floater play their fade-out
// animation for ~300ms, which the user was seeing as a shrinking
// dark circle.
export function forceUnmountTour() {
  try { document.body.classList.add('tour-dead'); } catch { /* ignore */ }
}
function releaseTourDead() {
  try { document.body.classList.remove('tour-dead'); } catch { /* ignore */ }
}

/**
 * First-login tour for agents.
 *
 * Key behaviors after user feedback:
 *   - Prominent "דלג על כל הסיורים לתמיד" button in every tooltip's
 *     top-right corner — one tap silences the tour + every per-page
 *     tour forever (server flag flipped, local flag set).
 *   - Closing (via skip button, the × in the corner, or the skipTour
 *     keyword) IMMEDIATELY unmounts Joyride so the spotlight element
 *     doesn't linger as a shrinking dark circle during Joyride's
 *     exit animation. We return null from the component the moment
 *     the user asks to close — Joyride's DOM goes away on the same tick.
 */

const PAGE_TOUR_KEYS = [
  'properties', 'owners', 'customers', 'templates',
  'transfers', 'new-property', 'property-detail',
];

// Skip / close / finish all funnel through here. Besides the local
// flags (which only protect the current device), we ALSO POST
// /api/me/tutorial/complete so the state is persisted server-side —
// log out + log back in on any device and the tour stays dismissed.
export async function dismissAllTours() {
  try {
    PAGE_TOUR_KEYS.forEach((k) => {
      localStorage.setItem(`estia-page-tour:${k}`, String(Date.now()));
    });
    localStorage.setItem('estia-tour-dismissed', '1');
  } catch { /* storage disabled */ }
  try { await api.completeTutorial(); } catch { /* ignore — local flags still protect */ }
}

export default function OnboardingTour() {
  const { user, refresh } = useAuth();
  const isMobile = useViewportMobile();
  const [run, setRun] = useState(false);
  const [dead, setDead] = useState(false); // set when user dismisses — unmounts Joyride on the same tick
  const startedRef = useRef(false);

  // Mobile (native app OR any mobile-width web session) NEVER sees
  // the tour. Per user request: "treat as already passed on phone,
  // no matter where". We also post completeTutorial on first mount
  // under these conditions so the server flag flips to true and a
  // later desktop session stays quiet too.
  const isPhone = Capacitor.isNativePlatform() || isMobile;

  const shouldRun = useMemo(() => {
    if (!user || user.role !== 'AGENT') return false;
    if (user.hasCompletedTutorial) return false;
    try { if (localStorage.getItem('estia-tour-dismissed')) return false; } catch { /* ignore */ }
    if (isPhone) return false;
    return true;
  }, [user, isPhone]);

  // One-shot silencer for phone sessions — persists server-side.
  useEffect(() => {
    if (!isPhone) return;
    if (!user || user.role !== 'AGENT') return;
    if (user.hasCompletedTutorial) return;
    (async () => {
      try { await api.completeTutorial(); } catch { /* ignore */ }
      refresh?.();
    })();
  }, [isPhone, user?.id, user?.hasCompletedTutorial, user?.role]); // eslint-disable-line react-hooks/exhaustive-deps

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
    forceUnmountTour();
    setDead(true);
    setRun(false);
    // dismissAllTours writes localStorage flags AND posts
    // /api/me/tutorial/complete so logout/login on any device stays
    // quiet.
    await dismissAllTours();
    refresh?.();
  };

  // When the component unmounts (either via dead or because the user
  // is leaving the page), release the class so future mounts aren't
  // suppressed.
  useEffect(() => () => releaseTourDead(), []);

  const handleCallback = ({ status, action }) => {
    if (
      status === STATUS.FINISHED ||
      status === STATUS.SKIPPED ||
      action === ACTIONS.CLOSE ||
      action === ACTIONS.SKIP
    ) finish();
  };

  if (!shouldRun || dead) return null;

  // TourTooltip renders Joyride's tooltip ourselves so we can put the
  // prominent skip pill in the top-right corner (and drop the built-in
  // × button that used to leave the shrinking spotlight behind).
  return (
    <Joyride
      run={run}
      steps={steps}
      continuous
      showProgress
      showSkipButton
      hideCloseButton
      scrollToFirstStep={false}
      disableScrolling={false}
      disableOverlayClose
      tooltipComponent={TourTooltip}
      locale={{
        back: 'הקודם',
        last: 'סיימתי',
        next: 'הבא',
        skip: 'דלג על כל הסיורים לתמיד',
      }}
      callback={handleCallback}
      styles={tourStyles}
      floaterProps={floaterProps}
    />
  );
}

// ─── Custom tooltip ────────────────────────────────────────────────
// react-joyride lets us pass a React component as the tooltip. Using
// it instead of the default tooltip gives us:
//   1. A prominent, always-visible "skip everything" pill in the top-
//      right corner, no matter which step you're on.
//   2. No hover-ghosted default × that lingered behind the tooltip.
//   3. Hebrew-first layout with proper RTL gaps and padding.
// eslint-disable-next-line react/prop-types
export function TourTooltip({
  continuous,
  index,
  step,
  backProps,
  primaryProps,
  skipProps,
  tooltipProps,
  size,
  isLastStep,
}) {
  const pct = size > 1 ? ((index + 1) / size) * 100 : 100;
  return (
    <div {...tooltipProps} className="tour-tooltip" role="dialog" aria-modal="true">
      <span className="tour-tooltip-eyebrow">Estia · סיור מודרך</span>
      {step.title && <div className="tour-tooltip-title">{step.title}</div>}
      <div className="tour-tooltip-content">{step.content}</div>

      <div className="tour-tooltip-footer">
        <div className="tour-tooltip-row">
          <div className="tour-progress" aria-hidden={size <= 1}>
            {size > 1 && (
              <>
                <span>{index + 1} / {size}</span>
                <span className="tour-progress-bar">
                  <span
                    className="tour-progress-bar-fill"
                    style={{ transform: `scaleX(${pct / 100})` }}
                  />
                </span>
              </>
            )}
          </div>
          <div className="tour-tooltip-actions">
            {index > 0 && (
              <button type="button" {...backProps} className="tour-btn tour-btn-ghost">
                הקודם
              </button>
            )}
            {continuous && (
              <button type="button" {...primaryProps} className="tour-btn tour-btn-primary">
                {isLastStep ? 'סיימתי' : 'הבא'}
              </button>
            )}
          </div>
        </div>

        {/* Always-visible, full-width dismiss link. Text only — no X
            icon (the × glyph was the user's reported black-circle
            trigger) — and a big target so it's never missed. */}
        <button
          type="button"
          {...skipProps}
          className="tour-skip-link"
          onClick={(e) => {
            // Synchronously hide Joyride's DOM BEFORE Joyride's own
            // callback fires, so there's no fade-out artifact.
            forceUnmountTour();
            skipProps?.onClick?.(e);
          }}
        >
          דלג על הסיור
        </button>
      </div>
    </div>
  );
}

// ─── shared tour styling ──────────────────────────────────────────
export const tourStyles = {
  options: {
    primaryColor: '#c9a96e',
    textColor: '#1e1a14',
    overlayColor: 'rgba(10, 10, 15, 0.55)',
    width: 380,
    zIndex: 10000,
  },
  spotlight: { borderRadius: 14 },
};

export const floaterProps = {
  styles: {
    floater: {
      transition: 'transform 0.22s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.18s ease-out',
      // Disable floater's own exit animation so the tooltip + spotlight
      // disappear together when we set dead=true.
      animationDuration: '0ms',
    },
  },
};
