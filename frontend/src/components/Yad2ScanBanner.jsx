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

export default function Yad2ScanBanner() {
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const [scan, setScan] = useState(getScanState());
  const [dismissedDone, setDismissedDone] = useState(false);

  useEffect(() => subscribeScan(setScan), []);

  // Toast on completion — but ONLY when the agent isn't already on
  // the import page. If they're there, the UI itself shows the result.
  useEffect(() => {
    const handler = (e) => {
      const { ok, listings, error } = e.detail || {};
      if (location.pathname.startsWith('/integrations/yad2')) return;
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

  // When a fresh scan starts, reset the "dismissed" flag so the
  // completion banner shows again.
  useEffect(() => {
    if (scan.status === 'running') setDismissedDone(false);
  }, [scan.status]);

  // Don't render on the yad2 page itself — would duplicate the inline UI.
  if (location.pathname.startsWith('/integrations/yad2')) return null;

  const show = scan.status === 'running'
    || (scan.status === 'done' && scan.result && !dismissedDone)
    || (scan.status === 'error' && !dismissedDone);

  if (!show) return null;

  const isRunning = scan.status === 'running';
  const isDone    = scan.status === 'done';
  const isError   = scan.status === 'error';

  const click = () => {
    navigate('/integrations/yad2');
  };
  const dismiss = (e) => {
    e.stopPropagation();
    setDismissedDone(true);
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
