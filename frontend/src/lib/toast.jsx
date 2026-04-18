import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import haptics from './haptics';
import './toast.css';

const ToastContext = createContext(null);

let idSeq = 0;

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const timers = useRef(new Map());

  const dismiss = useCallback((id) => {
    setItems((cur) => cur.filter((t) => t.id !== id));
    const tm = timers.current.get(id);
    if (tm) { clearTimeout(tm); timers.current.delete(id); }
  }, []);

  const push = useCallback((message, opts = {}) => {
    const id = ++idSeq;
    const kind = opts.kind || 'success';
    const duration = opts.duration ?? (kind === 'error' ? 5000 : 2400);
    setItems((cur) => [...cur, { id, message, kind }]);
    // Fire matching native haptic so toasts feel "physical" on iPhone
    if (kind === 'success') haptics.success();
    else if (kind === 'error') haptics.error();
    else if (kind === 'warning') haptics.warning();
    const tm = setTimeout(() => dismiss(id), duration);
    timers.current.set(id, tm);
    return id;
  }, [dismiss]);

  // Convenience helpers
  const api = {
    show: push,
    success: (m, o) => push(m, { ...o, kind: 'success' }),
    error: (m, o) => push(m, { ...o, kind: 'error' }),
    info: (m, o) => push(m, { ...o, kind: 'info' }),
    dismiss,
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toast-stack" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}`}>
            <span className="toast-icon">
              {t.kind === 'success' && <CheckCircle2 size={15} />}
              {t.kind === 'error' && <AlertCircle size={15} />}
              {t.kind === 'info' && <Info size={15} />}
            </span>
            <span className="toast-msg">{t.message}</span>
            <button className="toast-close" onClick={() => dismiss(t.id)} aria-label="סגור">
              <X size={13} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}

/**
 * optimisticUpdate(toast, {label, onSave, onRevert, onSuccess})
 * - Shows "שומר..." briefly, then "נשמר" on success, or "שגיאה" with revert on failure.
 */
export async function optimisticUpdate(toast, { label = 'שומר…', success = 'נשמר', onSave, onRevert }) {
  const pendingId = toast.info(label, { duration: 1800 });
  try {
    const r = await onSave();
    toast.dismiss(pendingId);
    toast.success(success);
    return r;
  } catch (e) {
    toast.dismiss(pendingId);
    toast.error(e?.message || 'שגיאה — השינוי בוטל');
    try { await onRevert?.(); } catch { /* ignore */ }
    throw e;
  }
}
