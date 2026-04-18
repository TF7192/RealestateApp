import { useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  ChevronLeft,
  ChevronRight,
  Images,
  Film,
  Copy,
  Check,
  Navigation,
  ExternalLink,
} from 'lucide-react';
import WhatsAppIcon from './WhatsAppIcon';
import { formatFloor } from '../lib/formatFloor';
import './PropertyHero.css';

/**
 * PropertyHero — top hero on the redesigned PropertyDetail.
 *
 * Layout:
 *   ╔═════════════════╗  ╔══════════════════════╗
 *   ║   Gallery 7:4   ║  ║  Title · Price · CTAs ║
 *   ║   dots, manage  ║  ║  WhatsApp (lead)      ║
 *   ╚═════════════════╝  ╚══════════════════════╝
 *
 * The card on the right contains the title, price, status badges,
 * a one-line summary (rooms · sqm · floor) and the primary CTAs
 * (WhatsApp = green gradient lead, ניווט / העתק קישור = gold-ghost).
 *
 * On ≤1100 px this stacks: gallery on top, info card beneath.
 */
export default function PropertyHero({
  property,
  images,
  currentImage,
  onPrev,
  onNext,
  onSelectImage,
  onOpenLightbox,
  onManagePhotos,
  onManageVideos,
  onWhatsApp,
  onCopyLink,
  copied,
  wazeHref,
  customerLink,
  isMobile,
  formatPrice,
  dragOver,
  onDragOver,
  onDragLeave,
  onDrop,
}) {
  const stripRef = useRef(null);

  const goTo = (i) => {
    onSelectImage(i);
    if (stripRef.current) {
      const w = stripRef.current.clientWidth;
      stripRef.current.scrollTo({ left: -(i * w), behavior: 'smooth' });
    }
  };

  const handleStripScroll = () => {
    const el = stripRef.current;
    if (!el) return;
    const w = el.clientWidth;
    const idx = Math.round(Math.abs(el.scrollLeft) / w);
    if (idx !== currentImage && idx < images.length) onSelectImage(idx);
  };

  const summaryParts = [];
  if (property.rooms != null) summaryParts.push(`${property.rooms} חד׳`);
  if (property.sqm) summaryParts.push(`${property.sqm} מ״ר`);
  if (property.floor != null) summaryParts.push(`קומה ${formatFloor(property.floor, property.totalFloors)}`);

  return (
    <section className="ph-hero animate-in animate-in-delay-1">
      {/* Gallery */}
      <div
        className={`ph-gallery ${dragOver ? 'ph-drag-over' : ''}`}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        {dragOver && (
          <div className="ph-drop-overlay" aria-hidden="true">
            <Images size={28} />
            <span>שחרר כאן להעלאה</span>
          </div>
        )}
        <div
          ref={stripRef}
          className="ph-strip"
          onScroll={handleStripScroll}
        >
          {images.map((img, i) => (
            <button
              key={i}
              type="button"
              className="ph-slide"
              onClick={() => onOpenLightbox(i)}
              aria-label={`פתח תמונה ${i + 1}`}
            >
              <img src={img} alt={`${property.street} — ${i + 1}`} loading="lazy" />
            </button>
          ))}
        </div>
        {images.length > 1 && (
          <>
            <button className="ph-nav prev" onClick={onPrev} aria-label="תמונה קודמת">
              <ChevronRight size={20} />
            </button>
            <button className="ph-nav next" onClick={onNext} aria-label="תמונה הבאה">
              <ChevronLeft size={20} />
            </button>
          </>
        )}
        {images.length > 1 && (
          <div className="ph-dots" aria-hidden="true">
            {images.map((_, i) => (
              <span
                key={i}
                className={`ph-dot ${i === currentImage ? 'active' : ''}`}
              />
            ))}
          </div>
        )}
        <div className="ph-counter">{currentImage + 1} / {images.length}</div>
        <div className="ph-gallery-actions">
          <button
            className="ph-gallery-btn"
            onClick={onManagePhotos}
            title="ניהול תמונות"
          >
            <Images size={14} />
            <span>ניהול תמונות</span>
          </button>
          <button
            className="ph-gallery-btn"
            onClick={onManageVideos}
            title="ניהול סרטונים"
          >
            <Film size={14} />
            <span>סרטונים{property.videos?.length ? ` (${property.videos.length})` : ''}</span>
          </button>
        </div>
      </div>

      {/* Info card */}
      <aside className="ph-info">
        <div className="ph-badges">
          <span className={`badge ${property.assetClass === 'COMMERCIAL' ? 'badge-warning' : 'badge-success'}`}>
            {property.assetClass === 'COMMERCIAL' ? 'מסחרי' : 'מגורים'}
          </span>
          <span className={`badge ${property.category === 'SALE' ? 'badge-gold' : 'badge-info'}`}>
            {property.category === 'SALE' ? 'מכירה' : 'השכרה'}
          </span>
          <span className="badge badge-gold">{property.type}</span>
        </div>
        <h1 className="ph-title">{property.street}, {property.city}</h1>
        <div className="ph-price-row">
          <span className="ph-price">{formatPrice(property.marketingPrice)}</span>
          <span className="ph-status-dot" aria-hidden="true">·</span>
          <span className="ph-status">
            {property.category === 'SALE' ? 'למכירה' : 'להשכרה'}
          </span>
        </div>
        {summaryParts.length > 0 && (
          <div className="ph-summary">
            {summaryParts.join(' · ')}
          </div>
        )}

        <div className="ph-divider" aria-hidden="true" />

        <div className="ph-cta-stack">
          <button
            type="button"
            className="ph-cta-wa"
            onClick={onWhatsApp}
            aria-label={`WhatsApp ${property.street}`}
          >
            <WhatsAppIcon size={18} />
            <span>שלח ללקוח</span>
          </button>
          <div className="ph-cta-row">
            <a
              href={wazeHref}
              target="_blank"
              rel="noopener noreferrer"
              className="ph-cta-ghost"
              aria-label={`Navigate to ${property.street}`}
            >
              <Navigation size={15} />
              <span>ניווט</span>
            </a>
            <button
              type="button"
              className={`ph-cta-ghost ${copied ? 'is-copied' : ''}`}
              onClick={() => onCopyLink(customerLink)}
              aria-label={`Copy link ${property.street}`}
            >
              {copied ? <Check size={15} /> : <Copy size={15} />}
              <span>{copied ? 'הועתק' : 'העתק קישור'}</span>
            </button>
            <Link
              to={`/p/${property.id}`}
              target="_blank"
              className="ph-cta-ghost"
              aria-label="View as customer"
            >
              <ExternalLink size={15} />
              <span>צפה</span>
            </Link>
          </div>
        </div>
      </aside>
    </section>
  );
}
