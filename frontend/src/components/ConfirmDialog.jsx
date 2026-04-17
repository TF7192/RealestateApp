import { X, AlertTriangle } from 'lucide-react';
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
  return (
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
            onClick={onConfirm}
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
  );
}
