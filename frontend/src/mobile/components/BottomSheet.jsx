import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { haptics } from '../../native';

export default function BottomSheet({ open, onClose, title, children, maxHeight = '85vh' }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    haptics.tap();
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <div className="m-sheet-backdrop" onClick={onClose} />
      <div className="m-sheet" ref={ref} style={{ maxHeight }} role="dialog" aria-modal="true">
        <div className="m-sheet-handle" />
        {title && (
          <div className="m-sheet-header">
            <h3 className="m-sheet-title">{title}</h3>
            <button className="m-icon-btn" onClick={onClose} aria-label="סגור">
              <X size={18} />
            </button>
          </div>
        )}
        <div className="m-sheet-body">{children}</div>
      </div>
    </>
  );
}
