import { useEffect } from 'react';
import { X } from 'lucide-react';
import Portal from './Portal';
import './PropertyPanelSheet.css';

/**
 * PropertyPanelSheet — slide-in right side panel on desktop, bottom sheet
 * on mobile. Used to host the full-fidelity editing UIs (marketing actions,
 * notes editor, exclusivity dates, owner card etc.) launched from the
 * dashboard cards on PropertyDetail.
 *
 * Props:
 *   title    — header title text (string or node)
 *   subtitle — optional small grey line under the title
 *   onClose  — invoked on Esc, backdrop click, or close button
 *   width    — desktop width preset: 'sm' (380), 'md' (440 default), 'lg' (560)
 *   children — body content
 */
export default function PropertyPanelSheet({
  title,
  subtitle,
  onClose,
  width = 'md',
  children,
}) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    // Lock background scroll while open
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <Portal>
      <div className="pps-backdrop" onClick={onClose} role="presentation">
        <aside
          className={`pps-panel pps-${width}`}
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label={typeof title === 'string' ? title : undefined}
        >
          <header className="pps-header">
            <div className="pps-titles">
              <h3 className="pps-title">{title}</h3>
              {subtitle && <p className="pps-subtitle">{subtitle}</p>}
            </div>
            <button
              type="button"
              className="pps-close"
              onClick={onClose}
              aria-label="סגור"
            >
              <X size={20} />
            </button>
          </header>
          <div className="pps-body">{children}</div>
        </aside>
      </div>
    </Portal>
  );
}
