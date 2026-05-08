// ListingRow — dense single-row presentation of a MarketListing in the
// default list view. Click anywhere on the row → opens the drawer.
// The action cluster (open / duplicate / overflow) stops propagation so
// agents can fire actions without triggering the drawer.

import { useState, useRef, useEffect } from 'react';
import { ExternalLink, Copy as CopyIcon, MoreHorizontal, CheckCircle2, Sparkles, User, Briefcase } from 'lucide-react';
import { displayPriceShort } from '../../lib/display';
import { freshLabel } from './freshLabel';
import { floorLabel } from './floorLabel';

export default function ListingRow({ listing, isMatched, isDuplicated, onOpen, onOpenMine, onDuplicate, onOverflow }) {
  const accent = isDuplicated ? 'duplicated' : isMatched ? 'matched' : null;
  const matched = (Array.isArray(listing.matches) ? listing.matches : []).filter(Boolean);
  const namesShown = matched.slice(0, 3).map((m) => m.leadName).filter(Boolean).join(', ');
  const namesOverflow = matched.length > 3 ? matched.length - 3 : 0;

  return (
    <article
      className="md-row"
      data-matched={isMatched ? 'true' : undefined}
      data-duplicated={isDuplicated ? 'true' : undefined}
      onClick={() => onOpen?.(listing)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen?.(listing); } }}
      tabIndex={0}
      role="button"
      aria-label={`${listing.street || 'נכס'} ${listing.city || ''}`.trim()}
    >
      <div className="md-row-edge" aria-hidden />

      <div className="md-row-body">
        <div className="md-row-headline">
          <div className="md-row-address">
            {[listing.street, listing.neighborhood, listing.city].filter(Boolean).join(' · ') || 'נכס'}
          </div>
          <span className="md-row-pills">
            {listing.source === 'yad2' && <span className="md-yad2-pill">yad2</span>}
            {listing.kind === 'rent' && <span className="md-pill kind-rent">להשכרה</span>}
            {listing.kind === 'forsale' && <span className="md-pill kind-sale">למכירה</span>}
            {listing.posterType === 'private' && (
              <span className="md-pill poster-private"><User size={11} /> פרטי</span>
            )}
            {listing.posterType === 'agency' && (
              <span className="md-pill poster-agency"><Briefcase size={11} /> תיווך</span>
            )}
            {isDuplicated && <span className="md-pill duplicated"><CheckCircle2 size={11} /> בנכסים שלי</span>}
          </span>
        </div>

        <div className="md-row-specs">
          {[
            listing.propertyType,
            listing.rooms != null ? `${listing.rooms} חד׳` : null,
            listing.sizeSqm != null ? `${listing.sizeSqm} מ״ר` : null,
            floorLabel(listing.floor),
          ].filter(Boolean).join(' · ') || '—'}
        </div>

        <div className="md-row-meta">
          <span>{freshLabel(listing.firstSeenAt)}</span>
          {listing.pricePerSqm != null && listing.kind !== 'rent' && (
            <span>· ₪{Number(listing.pricePerSqm).toLocaleString('he-IL')}/מ״ר</span>
          )}
        </div>

        {accent === 'matched' && namesShown && (
          <div className="md-row-match" title={`${matched.length} התאמות`}>
            <Sparkles size={12} />
            התאמה למתעניין: {namesShown}{namesOverflow ? ` +${namesOverflow}` : ''}
          </div>
        )}
      </div>

      <div className="md-row-price-block">
        {listing.price != null && (
          <>
            <span className="md-row-price">{displayPriceShort(listing.price)}</span>
            <span className="md-row-price-sub">
              {listing.kind === 'rent' ? '/ חודש' : ''}
            </span>
          </>
        )}
        <RowActions
          isDuplicated={isDuplicated}
          onOpenMine={(e) => { e.stopPropagation(); onOpenMine?.(listing); }}
          onDuplicate={(e) => { e.stopPropagation(); onDuplicate?.(listing); }}
          onOverflow={(action) => { onOverflow?.(listing, action); }}
          source={listing.originalUrl}
        />
      </div>
    </article>
  );
}

function RowActions({ isDuplicated, onOpenMine, onDuplicate, onOverflow, source }) {
  return (
    <div className="md-row-actions" onClick={(e) => e.stopPropagation()}>
      <a
        href={source}
        target="_blank"
        rel="noopener noreferrer"
        className="btn btn-secondary btn-sm"
        title="פתח במקור (Yad2)"
        onClick={(e) => e.stopPropagation()}
      >
        <ExternalLink size={14} />
        פתח במקור
      </a>
      {isDuplicated ? (
        <button type="button" className="btn btn-primary btn-sm" onClick={onOpenMine} title="פתח את הנכס שלך">
          <CheckCircle2 size={14} />
          הנכס שלי
        </button>
      ) : (
        <button type="button" className="btn btn-primary btn-sm" onClick={onDuplicate} title="שכפל לנכסים שלי">
          <CopyIcon size={14} />
          שכפל
        </button>
      )}
      <RowOverflow onOverflow={onOverflow} />
    </div>
  );
}

function RowOverflow({ onOverflow }) {
  const ref = useRef(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        aria-label="פעולות נוספות"
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
      >
        <MoreHorizontal size={16} />
      </button>
      {open && (
        <div
          role="menu"
          style={{
            position: 'absolute',
            insetBlockStart: '110%',
            insetInlineStart: 0,
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            boxShadow: 'var(--shadow-md)',
            padding: 4,
            zIndex: 10,
            minWidth: 180,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {['send-to-lead', 'mark-viewed', 'copy-link', 'dismiss'].map((action) => (
            <OverflowItem
              key={action}
              action={action}
              onPick={(a) => { setOpen(false); onOverflow?.(a); }}
            />
          ))}
        </div>
      )}
    </div>
  );
}


function OverflowItem({ action, onPick }) {
  const labels = {
    'send-to-lead': 'שלח למתעניין ב-WhatsApp',
    'mark-viewed':  'סמן כנצפה',
    'copy-link':    'העתק קישור למקור',
    'dismiss':      'דחה (הסתר מהרשימה)',
  };
  return (
    <button
      type="button"
      role="menuitem"
      onClick={() => onPick(action)}
      style={{
        display: 'block',
        width: '100%',
        textAlign: 'start',
        padding: '8px 10px',
        background: 'transparent',
        border: 'none',
        fontFamily: 'var(--font-body)',
        fontSize: 13,
        color: 'var(--text-primary)',
        cursor: 'pointer',
        borderRadius: 6,
      }}
      onMouseOver={(e) => { e.currentTarget.style.background = 'var(--bg-card-hover)'; }}
      onMouseOut={(e)  => { e.currentTarget.style.background = 'transparent'; }}
    >
      {labels[action]}
    </button>
  );
}
