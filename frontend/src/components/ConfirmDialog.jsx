import { useEffect, useId } from 'react';
import { X, AlertTriangle } from 'lucide-react';
import Portal from './Portal';
import haptics from '../lib/haptics';
import './ConfirmDialog.css';

export default function ConfirmDialog({
  title = 'מחיקה',
  message,
  confirmLabel = 'מחק',
  cancelLabel = 'ביטול',
  danger = true,
  onConfirm,
  onClose,
  busy = false,
}) {
  // Polish H-3: medium-impact haptic when a destructive confirm dialog
  // appears so the agent registers the moment the modal is presented,
  // not just when they read it. Press is medium-weight (vs. tap = light)
  // so it feels heavier than a normal navigation.
  useEffect(() => {
    if (danger) haptics.press();
  }, [danger]);

  const handleConfirm = () => {
    if (danger) haptics.warning(); // an extra confirm-the-doom beat
    onConfirm?.();
  };

  const titleId = useId();

  return (
    <Portal>
      <div className="confirm-backdrop" onClick={onClose}>
        <div
          className="confirm-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          onClick={(e) => e.stopPropagation()}
        >
          <header className="confirm-header">
            <div className="confirm-title">
              {danger && <AlertTriangle size={18} className="confirm-danger-icon" />}
              <h3 id={titleId} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</h3>
            </div>
            <button
              type="button"
              className="btn-ghost"
              onClick={onClose}
              aria-label="סגור"
            >
              <X size={18} aria-hidden="true" />
            </button>
          </header>
          <div className="confirm-body">
            <p>{message}</p>
          </div>
          <div className="confirm-actions">
            <button
              type="button"
              className={danger ? 'btn btn-danger' : 'btn btn-primary'}
              onClick={handleConfirm}
              disabled={busy}
            >
              {busy ? '...' : confirmLabel}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
            >
              {cancelLabel}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}
