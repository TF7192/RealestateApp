// ListingDrawer — right-side detail panel that opens when an agent
// clicks any listing row/card. Shows full specs, every match's lead +
// score + reasons, and a sticky footer with the two primary actions.

import { useEffect, useRef } from 'react';
import { X, ExternalLink, Copy as CopyIcon, CheckCircle2, MessageCircle, Sparkles } from 'lucide-react';
import Portal from '../../components/Portal';
import { displayPriceShort } from '../../lib/display';
import { freshLabel } from './freshLabel';
import { floorLabel } from './floorLabel';

export default function ListingDrawer({ listing, onClose, onDuplicate, onOpenMine, onSendToLead, onDismissMatch }) {
  const dialogRef = useRef(null);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', onKey);
    dialogRef.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!listing) return null;
  const matches = (Array.isArray(listing.matches) ? listing.matches : []).filter(Boolean);
  const isDuplicated = !!listing.duplicatedByMe;

  // pricePerSqm is meaningful for sale listings (₪/m²) but for rent
  // it's monthly-₪/m² which is borderline noise — hide on rentals so
  // the drawer doesn't show a confusingly small "₪54" number.
  const showPricePerSqm = listing.kind !== 'rent' && listing.pricePerSqm != null;
  const specs = [
    { label: 'סוג נכס',  value: listing.propertyType || '—' },
    { label: 'חדרים',    value: listing.rooms != null ? listing.rooms : '—' },
    { label: 'שטח',      value: listing.sizeSqm != null ? `${listing.sizeSqm} מ״ר` : '—' },
    { label: 'קומה',     value: floorLabel(listing.floor) ?? '—' },
    showPricePerSqm
      ? { label: '₪ / מ״ר', value: `₪${Number(listing.pricePerSqm).toLocaleString('he-IL')}` }
      : null,
    { label: 'מפרסם',    value: listing.posterType === 'agency' ? 'תיווך' : listing.posterType === 'private' ? 'פרטי' : '—' },
    { label: 'נראה ראשון', value: freshLabel(listing.firstSeenAt) },
    { label: 'מקור',     value: listing.source === 'yad2' ? 'יד2' : (listing.source || '—') },
  ].filter(Boolean);

  return (
    <Portal>
      <div className="md-drawer-backdrop" onClick={onClose} />
      <aside
        ref={dialogRef}
        tabIndex={-1}
        className="md-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="פרטי מודעה"
        dir="rtl"
      >
        <div className="md-drawer-head">
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2>{[listing.street, listing.neighborhood, listing.city].filter(Boolean).join(' · ') || 'נכס'}</h2>
            <div style={{ marginTop: 6, display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 24, fontWeight: 900, color: 'var(--gold-readable)' }}>
                {listing.price != null ? displayPriceShort(listing.price) : '—'}
              </span>
              {listing.kind === 'rent' && <span style={{ color: 'var(--text-muted)', fontSize: 12, fontWeight: 700 }}>/ חודש</span>}
            </div>
          </div>
          <button type="button" className="md-icon-button" onClick={onClose} aria-label="סגור">
            <X size={18} />
          </button>
        </div>

        <div className="md-drawer-body">
          <div className="md-drawer-section">
            <h3>מאפיינים</h3>
            <dl className="md-spec-grid">
              {specs.map((s) => (
                <div key={s.label}>
                  <dt>{s.label}</dt>
                  <dd>{s.value}</dd>
                </div>
              ))}
            </dl>
          </div>

          {matches.length > 0 && (
            <div className="md-drawer-section">
              <h3>
                <Sparkles size={12} style={{ verticalAlign: 'middle', marginInlineEnd: 4 }} />
                התאמה ל-{matches.length} {matches.length === 1 ? 'מתעניין' : 'מתעניינים'}
              </h3>
              {matches.map((m) => (
                <div key={m.id} className="md-match-card">
                  <div className="md-match-card-row">
                    <span className="md-match-card-name">{m.leadName || 'מתעניין'}</span>
                    {m.score != null && <span className="md-match-card-score">{m.score}/100</span>}
                  </div>
                  {Array.isArray(m.reasons) && m.reasons.length > 0 && (
                    <div className="md-match-card-reasons">{m.reasons.join(' · ')}</div>
                  )}
                  <div className="md-match-card-actions">
                    {m.leadPhone && (
                      <button
                        type="button"
                        className="btn btn-whatsapp btn-sm"
                        onClick={() => onSendToLead?.(m, listing)}
                      >
                        <MessageCircle size={14} /> שלח ב-WhatsApp
                      </button>
                    )}
                    <a
                      href={`/customers/${m.leadId}`}
                      className="btn btn-secondary btn-sm"
                    >
                      פתח כרטיס מתעניין
                    </a>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => onDismissMatch?.(m)}
                    >
                      דחה התאמה
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="md-drawer-footer">
          <a
            href={listing.originalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-secondary"
            style={{ justifyContent: 'center' }}
          >
            <ExternalLink size={14} /> פתח במקור
          </a>
          {isDuplicated ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => onOpenMine?.(listing)}
              style={{ justifyContent: 'center' }}
            >
              <CheckCircle2 size={14} /> פתח אצלי
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => onDuplicate?.(listing)}
              style={{ justifyContent: 'center' }}
            >
              <CopyIcon size={14} /> שכפל לנכסים שלי
            </button>
          )}
        </div>
      </aside>
    </Portal>
  );
}
