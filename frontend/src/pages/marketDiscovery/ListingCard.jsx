// ListingCard — alternate "card" layout users can switch to. Lighter
// than the legacy card: no gold gradient backgrounds, just the left
// edge + match pill + tight specs + price + actions. Click → drawer.

import { ExternalLink, Copy as CopyIcon, CheckCircle2, Sparkles, User, Briefcase } from 'lucide-react';
import { displayPriceShort } from '../../lib/display';
import { freshLabel } from './freshLabel';
import { floorLabel } from './floorLabel';

export default function ListingCard({ listing, isMatched, isDuplicated, onOpen, onOpenMine, onDuplicate }) {
  const matched = (Array.isArray(listing.matches) ? listing.matches : []).filter(Boolean);
  const namesShown = matched.slice(0, 3).map((m) => m.leadName).filter(Boolean).join(', ');
  const namesOverflow = matched.length > 3 ? matched.length - 3 : 0;

  return (
    <article
      className="md-card"
      data-matched={isMatched ? 'true' : undefined}
      data-duplicated={isDuplicated ? 'true' : undefined}
      onClick={() => onOpen?.(listing)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen?.(listing); } }}
    >
      <div className="md-card-edge" aria-hidden />

      <div className="md-row-pills" style={{ marginTop: 4 }}>
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
        <span style={{ marginInlineStart: 'auto', fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>
          {freshLabel(listing.firstSeenAt)}
        </span>
      </div>

      <div>
        <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {[listing.street, listing.neighborhood, listing.city].filter(Boolean).join(' · ') || 'נכס'}
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600, marginTop: 2 }}>
          {[
            listing.propertyType,
            listing.rooms != null ? `${listing.rooms} חד׳` : null,
            listing.sizeSqm != null ? `${listing.sizeSqm} מ״ר` : null,
            floorLabel(listing.floor),
          ].filter(Boolean).join(' · ') || '—'}
        </div>
      </div>

      {listing.price != null && (
        <div style={{
          display: 'flex', alignItems: 'baseline', gap: 8,
          paddingBlock: 4,
          borderBlock: '1px dashed var(--border)',
        }}>
          <span style={{ fontSize: 24, fontWeight: 900, color: 'var(--gold-readable)', letterSpacing: -0.5 }}>
            {displayPriceShort(listing.price)}
          </span>
          {listing.kind === 'rent' && (
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)' }}>/ חודש</span>
          )}
          {listing.pricePerSqm != null && listing.kind !== 'rent' && (
            <span style={{ fontSize: 11, color: 'var(--text-muted)', marginInlineStart: 'auto' }}>
              ₪{Number(listing.pricePerSqm).toLocaleString('he-IL')}/מ״ר
            </span>
          )}
        </div>
      )}

      {isMatched && namesShown && (
        <div className="md-row-match">
          <Sparkles size={12} />
          התאמה: {namesShown}{namesOverflow ? ` +${namesOverflow}` : ''}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: 8, marginTop: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        <a
          href={listing.originalUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-secondary btn-sm"
          style={{ justifyContent: 'center' }}
          onClick={(e) => e.stopPropagation()}
        >
          <ExternalLink size={14} /> פתח במקור
        </a>
        {isDuplicated ? (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={(e) => { e.stopPropagation(); onOpenMine?.(listing); }}
            style={{ justifyContent: 'center' }}
            title="פתח את הנכס שלך בעריכה"
          >
            <CheckCircle2 size={14} /> הנכס שלי
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={(e) => { e.stopPropagation(); onDuplicate?.(listing); }}
            style={{ justifyContent: 'center' }}
          >
            <CopyIcon size={14} /> שכפל
          </button>
        )}
      </div>
    </article>
  );
}
