import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Loader2, Check, AlertCircle, X } from 'lucide-react';
import { useToast } from '../lib/toast';
import { getScanState, subscribeScan } from '../lib/yad2ScanStore';
import haptics from '../lib/haptics';
import './Yad2ScanBanner.css';

// Global scan banner — sits above the tab bar (or at top, depending on
// viewport). Visible whenever a Yad2 scan is in-flight OR has just
// finished AND the agent is NOT on /integrations/yad2 itself. The goal
// is for the agent to keep working while the slow (~60-90s) Playwright
// crawl runs; when it finishes they get a tap-target to jump back.
//
// Separate concerns:
//   - The banner visually shows "scan running / scan done" regardless
//     of route (except the yad2 page itself — redundant there).
//   - A one-shot toast fires on `yad2-scan-complete` when the agent is
//     off-page, so even if they're on a page where the banner is
//     hidden (e.g. full-screen modals) they still get notified.

// Dismissal is keyed to the SPECIFIC completion (scan.finishedAt) so
// clicking X on one result sticks across route changes / remounts,
// and a brand-new completion re-arms the banner. Persisted to
// sessionStorage so a tab reload doesn't forget the dismissal either.
const DISMISS_KEY = 'estia-yad2-banner-dismissed-at';
function readDismissedAt() {
  try { return Number(sessionStorage.getItem(DISMISS_KEY)) || 0; }
  catch { return 0; }
}
function writeDismissedAt(ts) {
  try { sessionStorage.setItem(DISMISS_KEY, String(ts || 0)); }
  catch { /* private mode */ }
}

// Guard the toast effect against double-fires. The effect re-subscribes
// when `toast` identity changes (ToastProvider recreates its api object
// on every render), so if we keyed off subscription alone we'd attach a
// fresh handler repeatedly. The handler itself checks lastToastedAt so
// the same `yad2-scan-complete` event never raises two toasts.
let lastToastedAt = 0;

export default function Yad2ScanBanner() {
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const [scan, setScan] = useState(getScanState());
  const [dismissedAt, setDismissedAt] = useState(readDismissedAt);

  useEffect(() => subscribeScan(setScan), []);

  // Toast on completion — but ONLY when the agent isn't already on
  // the import page. If they're there, the UI itself shows the result.
  useEffect(() => {
    const handler = (e) => {
      const { ok, listings, error } = e.detail || {};
      if (location.pathname.startsWith('/integrations/yad2')) return;
      const finishedAt = getScanState()?.finishedAt || Date.now();
      if (lastToastedAt === finishedAt) return; // dedupe across remounts
      lastToastedAt = finishedAt;
      try { haptics.success?.(); } catch { /* ignore */ }
      if (ok) {
        toast.success?.(`הסריקה הסתיימה — ${listings ?? 0} נכסים מוכנים`);
      } else {
        toast.error?.(`הסריקה נכשלה: ${error || 'שגיאה'}`);
      }
    };
    window.addEventListener('yad2-scan-complete', handler);
    return () => window.removeEventListener('yad2-scan-complete', handler);
  }, [location.pathname, toast]);

  // Don't render on the yad2 page itself — would duplicate the inline UI.
  if (location.pathname.startsWith('/integrations/yad2')) return null;

  // Dismissed if user clicked X during this completion's lifetime.
  // If the scan exposes a finishedAt, compare against that (so a
  // NEWER completion with later finishedAt re-arms the banner).
  // If finishedAt is missing (older scan store / test fixture), fall
  // back to a plain "user dismissed at some point" check.
  const finishedAt = scan.finishedAt || 0;
  const isDismissedForThisRun = dismissedAt > 0
    && (finishedAt === 0 || dismissedAt >= finishedAt);

  const show = scan.status === 'running'
    || (scan.status === 'done'  && scan.result && !isDismissedForThisRun)
    || (scan.status === 'error' && !isDismissedForThisRun);

  if (!show) return null;

  const isRunning = scan.status === 'running';
  const isDone    = scan.status === 'done';
  const isError   = scan.status === 'error';

  const click = () => {
    navigate('/integrations/yad2');
  };
  const dismiss = (e) => {
    e.stopPropagation();
    // Stamp the dismissal with the CURRENT completion timestamp. Any
    // later completion will have a higher finishedAt and re-show the
    // banner; same-completion re-renders (remounts, navigation) leave
    // it hidden.
    const stampAt = finishedAt || Date.now();
    writeDismissedAt(stampAt);
    setDismissedAt(stampAt);
  };

  return (
    <button
      type="button"
      className={`y2b ${isRunning ? 'y2b-run' : isDone ? 'y2b-ok' : 'y2b-err'}`}
      onClick={click}
      aria-label={isRunning ? 'סריקה פעילה — חזור לייבוא' : 'הסריקה הסתיימה — חזור לייבוא'}
    >
      <span className="y2b-icon">
        {isRunning && <Loader2 size={16} className="y2b-spin" />}
        {isDone    && <Check size={16} />}
        {isError   && <AlertCircle size={16} />}
      </span>
      <span className="y2b-body">
        <strong>
          {isRunning && 'סריקת Yad2 פעילה'}
          {isDone    && `הסריקה הסתיימה — ${scan.result?.listings?.length ?? 0} נכסים`}
          {isError   && 'הסריקה נכשלה'}
        </strong>
        <span>
          {isRunning && 'רץ ברקע — הקש כדי לעקוב'}
          {isDone    && 'הקש כדי לעבור לבחירה ולייבוא'}
          {isError   && (scan.error || 'נסה/י שוב מעמוד הייבוא')}
        </span>
      </span>
      {!isRunning && (
        <span className="y2b-x" onClick={dismiss} role="button" aria-label="סגור">
          <X size={14} />
        </span>
      )}
    </button>
  );
}
