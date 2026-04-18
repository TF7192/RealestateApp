import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Joyride, STATUS, ACTIONS } from 'react-joyride';
import { Capacitor } from '@capacitor/core';
import { useAuth } from '../lib/auth';
import { useViewportMobile } from '../hooks/mobile';
import {
  areToursKilled,
  killAllTours,
  subscribeTourKill,
} from '../lib/tourKill';
import './tour-tooltip.css';

// Re-exported so PageTour can import alongside the shared tooltip
// component + styles without pulling this module twice.
export { killAllTours };

export default function OnboardingTour() {
  const { user } = useAuth();
  const isMobile = useViewportMobile();
  const [run, setRun] = useState(false);
  const startedRef = useRef(false);

  // Force re-render whenever the global kill-switch fires, so this
  // component re-evaluates shouldRun and returns null if killed.
  const [, tick] = useReducer((n) => n + 1, 0);
  useEffect(() => subscribeTourKill(tick), []);

  const isPhone = Capacitor.isNativePlatform() || isMobile;

  // Read the kill-switch fresh on every render — do NOT memoize.
  // If we memoize on [user, isPhone], a `tick()` from the subscriber
  // forces a re-render but the cached memo still returns the old
  // value, and the tour keeps rendering even though killed is true.
  // That was the entire bug the user was seeing.
  const killed = areToursKilled();
  const shouldRun =
    !killed &&
    !!user &&
    user.role === 'AGENT' &&
    !user.hasCompletedTutorial &&
    !isPhone;

  useEffect(() => {
    if (!shouldRun || startedRef.current) return;
    startedRef.current = true;
    const t = setTimeout(() => setRun(true), 400);
    return () => clearTimeout(t);
  }, [shouldRun]);

  // One-shot silencer for phone sessions — fires server flag too.
  useEffect(() => {
    if (!isPhone) return;
    if (!user || user.role !== 'AGENT') return;
    if (user.hasCompletedTutorial) return;
    killAllTours();
  }, [isPhone, user?.id, user?.hasCompletedTutorial, user?.role]); // eslint-disable-line react-hooks/exhaustive-deps

  const steps = useMemo(() => {
    const centered = (title, content) => ({
      target: 'body', placement: 'center', title, content, disableBeacon: true,
    });
    const anchored = (selector, title, content) => ({
      target: selector, title, content, disableBeacon: true,
      spotlightPadding: 8, placement: 'auto',
    });

    if (isMobile) {
      return [
        centered('ברוכים הבאים ל-Estia',
          'סיור קצר שיראה לכם איפה נמצא כל דבר. אפשר לדלג בכל שלב.'),
        anchored('[data-tour="sidebar-properties"]', 'נכסים',
          'כל הנכסים שלכם. לחיצה על כרטיס פותחת פעולות שיווק ועריכה.'),
        anchored('[data-tour="sidebar-customers"]', 'לקוחות',
          'הלקוחות המתעניינים. התאמות מופיעות אוטומטית על כרטיסי הנכסים.'),
        centered('יתר הפיצ׳רים',
          'בתפריט ⋯ תמצאו בעלי נכסים, תבניות הודעות, העברות וצ׳אט עם המפתחים.'),
        centered('', 'בהצלחה!'),
      ];
    }

    return [
      centered('ברוכים הבאים ל-Estia',
        'סיור קצר שיראה לכם איפה נמצא כל דבר. אפשר לדלג בכל שלב.'),
      anchored('[data-tour="sidebar-properties"]', 'נכסים',
        'כל הנכסים שלכם — רשימה, עריכה, שיתוף ללקוחות, וכרטיס נכס מלא.'),
      anchored('[data-tour="sidebar-owners"]', 'בעלי נכסים',
        'ספר המוכרים והמשכירים, עם היסטוריית התקשרות מלאה.'),
      anchored('[data-tour="sidebar-customers"]', 'לקוחות',
        'הלקוחות המתעניינים והתאמות אוטומטיות לנכסים.'),
      anchored('[data-tour="sidebar-templates"]', 'תבניות הודעות',
        'כותבים פעם אחת — השדות מתחלפים אוטומטית לפי הנכס.'),
      anchored('[data-tour="sidebar-transfers"]', 'העברות',
        'העברת נכס לסוכן אחר במערכת.'),
      centered('צ׳אט עם המפתחים',
        'כפתור הצ׳אט פותח שיחה ישירה איתנו — באגים, בקשות ושאלות.'),
      centered('', 'בהצלחה!'),
    ];
  }, [isMobile]);

  const handleCallback = ({ status, action }) => {
    if (
      status === STATUS.FINISHED ||
      status === STATUS.SKIPPED ||
      action === ACTIONS.CLOSE ||
      action === ACTIONS.SKIP
    ) killAllTours();
  };

  if (!shouldRun) return null;

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
      locale={{ back: 'הקודם', last: 'סיימתי', next: 'הבא', skip: 'דלג על הסיור' }}
      callback={handleCallback}
      styles={tourStyles}
      floaterProps={floaterProps}
    />
  );
}

// ─── Custom tooltip ─────────────────────────────────────────────
// Rendered INSTEAD of Joyride's default so the Skip button calls our
// own kill-switch directly. We never rely on Joyride's callback
// chain for dismissal — that was the source of every persistence
// bug so far.
// eslint-disable-next-line react/prop-types
export function TourTooltip({
  continuous,
  index,
  step,
  backProps,
  primaryProps,
  tooltipProps,
  size,
  isLastStep,
}) {
  const pct = size > 1 ? ((index + 1) / size) * 100 : 100;
  const onSkip = (e) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    killAllTours();
  };
  const onDone = (e) => {
    // "Done" on the last step should also hard-kill the tour — the
    // user saw enough, they don't want another one popping after.
    if (isLastStep) killAllTours();
    primaryProps?.onClick?.(e);
  };
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
              <button
                type="button"
                {...primaryProps}
                onClick={onDone}
                className="tour-btn tour-btn-primary"
              >
                {isLastStep ? 'סיימתי' : 'הבא'}
              </button>
            )}
          </div>
        </div>

        {/* Big, always-visible skip — wired DIRECTLY to the global
            kill-switch, no Joyride callback round-trip. */}
        <button
          type="button"
          onClick={onSkip}
          className="tour-skip-link"
          aria-label="דלג על הסיור"
        >
          דלג על הסיור
        </button>
      </div>
    </div>
  );
}

// ─── Shared styling ────────────────────────────────────────────
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
  styles: { floater: { transition: 'opacity 0.18s ease-out' } },
};
