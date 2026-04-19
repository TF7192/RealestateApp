import { useEffect } from 'react';
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

  return (
    <Portal>
    <div className="confirm-backdrop" onClick={onClose}>
      <div className="confirm-modal" onClick={(e) => e.stopPropagation()}>
        <header className="confirm-header">
          <div className="confirm-title">
            {danger && <AlertTriangle size={18} className="confirm-danger-icon" />}
            <h3>{title}</h3>
          </div>
          <button className="btn-ghost" onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        <div className="confirm-body">
          <p>{message}</p>
        </div>
        <div className="confirm-actions">
          <button
            className={danger ? 'btn btn-danger' : 'btn btn-primary'}
            onClick={handleConfirm}
            disabled={busy}
          >
            {busy ? '...' : confirmLabel}
          </button>
          <button className="btn btn-secondary" onClick={onClose}>
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
    </Portal>
  );
}
