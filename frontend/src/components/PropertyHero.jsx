import { useEffect, useRef } from 'react';
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
  formatPrice,
  dragOver,
  onDragOver,
  onDragLeave,
  onDrop,
}) {
  const stripRef = useRef(null);

  const handleStripScroll = () => {
    const el = stripRef.current;
    if (!el) return;
    const w = el.clientWidth;
    const idx = Math.round(Math.abs(el.scrollLeft) / w);
    if (idx !== currentImage && idx < images.length) onSelectImage(idx);
  };

  // P-6 — when the carousel index changes programmatically (via the
  // prev/next buttons, keyboard arrows, or dot-nav in the future), scroll
  // the strip to the matching slide. Without this the buttons update the
  // counter/dots but the strip stays parked on the visible slide. In RTL
  // the strip's scrollLeft is negative (Chromium/Firefox) or positive
  // (Safari inverted) depending on engine — scrollTo with an absolute
  // value of `slideIndex * slideWidth` works everywhere because the
  // browser clamps the sign correctly on write.
  useEffect(() => {
    const el = stripRef.current;
    if (!el) return;
    const w = el.clientWidth;
    if (!w) return;
    const currentIdx = Math.round(Math.abs(el.scrollLeft) / w);
    if (currentIdx === currentImage) return;
    const isRtl = getComputedStyle(el).direction === 'rtl';
    const target = currentImage * w * (isRtl ? -1 : 1);
    try {
      el.scrollTo({ left: target, behavior: 'smooth' });
    } catch {
      el.scrollLeft = target;
    }
  }, [currentImage]);

  // P-6 — wrap prev/next handlers so the chevron click can't bubble into
  // the underlying slide's "open lightbox" handler.
  const stopAnd = (fn) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    fn?.();
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
              {/* P-7 — explicit width/height reserves layout space (no
                  CLS); decoding=async keeps decode off the main thread;
                  eager+high priority on slide 0 (the LCP element), lazy
                  on the rest. */}
              <img
                src={img}
                alt={`${property.street} — ${i + 1}`}
                width="1400"
                height="800"
                loading={i === 0 ? 'eager' : 'lazy'}
                decoding="async"
                fetchpriority={i === 0 ? 'high' : 'low'}
              />
            </button>
          ))}
        </div>
        {images.length > 1 && (
          <>
            <button
              type="button"
              className="ph-nav prev"
              onClick={stopAnd(onPrev)}
              aria-label="תמונה קודמת"
            >
              <ChevronRight size={20} />
            </button>
            <button
              type="button"
              className="ph-nav next"
              onClick={stopAnd(onNext)}
              aria-label="תמונה הבאה"
            >
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
            <span>שלח בוואטסאפ</span>
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
