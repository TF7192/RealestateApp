import { useEffect, useState, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  MapPin,
  Bed,
  Maximize,
  Building2,
  ParkingCircle,
  Warehouse,
  Snowflake,
  Shield,
  Phone,
  MessageCircle,
  ChevronLeft,
  ChevronRight,
  ArrowRight,
  Share2,
  ExternalLink,
  Calendar,
  Zap,
  Home,
  Layers,
  Banknote,
  Users,
  Route,
  Briefcase,
  CheckCircle2,
} from 'lucide-react';
import api from '../lib/api';
import WhatsAppIcon from '../components/WhatsAppIcon';
import { useViewportMobile } from '../hooks/mobile';
import './CustomerPropertyView.css';

// ── Money & shape helpers ─────────────────────────────────────────────
function formatPrice(price, rent = false) {
  if (!price) return '—';
  const body = `₪${Number(price).toLocaleString('he-IL')}`;
  return rent ? `${body} / חודש` : body;
}

function shortPrice(price) {
  if (!price) return '';
  if (price >= 1_000_000) {
    const v = (price / 1_000_000).toFixed(price % 1_000_000 === 0 ? 0 : 1);
    return `₪${v}M`;
  }
  if (price >= 1_000) return `₪${Math.round(price / 1_000)}K`;
  return `₪${price}`;
}

function parkingCopy(p) {
  if (!p.parking) return null;
  const parts = [];
  if (p.parkingCount) parts.push(`${p.parkingCount} מקומות`);
  const typeMap = { tabu: 'בטאבו', private: 'פרטית', nearby: 'בקרבת הנכס' };
  if (p.parkingType && typeMap[p.parkingType]) parts.push(typeMap[p.parkingType]);
  if (p.parkingCovered) parts.push('מקורה');
  if (p.parkingCoupled) parts.push('צמודה');
  if (p.parkingTandem) parts.push('עוקבת');
  if (p.parkingEvCharger) parts.push('עמדת טעינה חשמלית');
  return parts.length ? parts.join(' · ') : 'יש';
}

function storageCopy(p) {
  if (!p.storage) return null;
  const parts = [];
  const locMap = { attached: 'צמוד לנכס', basement: 'במרתף' };
  if (p.storageLocation && locMap[p.storageLocation]) parts.push(locMap[p.storageLocation]);
  if (p.storageSize) parts.push(`${p.storageSize} מ״ר`);
  return parts.length ? parts.join(' · ') : 'יש';
}

// Update <head> with OpenGraph / Twitter Card tags so WhatsApp, Telegram,
// and Twitter link-previews render a proper card with the cover photo.
function usePropertyMeta(property, agent) {
  useEffect(() => {
    if (!property) return undefined;
    const title = `${property.type} ב${property.street}, ${property.city} · ${shortPrice(property.marketingPrice)}`;
    const desc = [
      property.rooms ? `${property.rooms} חדרים` : null,
      property.sqm ? `${property.sqm} מ״ר` : null,
      property.floor != null ? `קומה ${property.floor}` : null,
      agent?.displayName ? `· ${agent.displayName}` : null,
    ].filter(Boolean).join(' · ');
    const img = (property.images && property.images[0]) || '';

    const prevTitle = document.title;
    document.title = title;
    const pairs = [
      ['og:title', title],
      ['og:description', desc],
      ['og:type', 'website'],
      ['og:url', window.location.href],
      ['og:image', img],
      ['og:locale', 'he_IL'],
      ['twitter:card', 'summary_large_image'],
      ['twitter:title', title],
      ['twitter:description', desc],
      ['twitter:image', img],
    ];
    const added = [];
    pairs.forEach(([prop, content]) => {
      if (!content) return;
      let meta = document.head.querySelector(`meta[property="${prop}"], meta[name="${prop}"]`);
      if (!meta) {
        meta = document.createElement('meta');
        if (prop.startsWith('og:')) meta.setAttribute('property', prop);
        else meta.setAttribute('name', prop);
        document.head.appendChild(meta);
        added.push(meta);
      }
      meta.setAttribute('content', content);
    });
    return () => {
      document.title = prevTitle;
      added.forEach((m) => { try { document.head.removeChild(m); } catch { /* ignore */ } });
    };
  }, [property, agent]);
}

export default function CustomerPropertyView() {
  const { id, agentSlug, propertySlug } = useParams();
  const [property, setProperty] = useState(null);
  const [agent, setAgent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentImage, setCurrentImage] = useState(0);
  const [lightbox, setLightbox] = useState(false);
  const isMobile = useViewportMobile();

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        if (agentSlug && propertySlug) {
          const r = await api.publicProperty(agentSlug, propertySlug);
          if (cancelled) return;
          setProperty(r.property);
          setAgent(r.agent);
          return;
        }
        const res = await api.getProperty(id);
        if (cancelled) return;
        setProperty(res.property);
        if (res.property?.agentId) {
          try {
            const a = await api.getAgentPublic(res.property.agentId);
            if (!cancelled) setAgent(a.agent);
          } catch { /* ignore */ }
        }
      } catch (e) {
        if (!cancelled) setError(e.message || 'שגיאה');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [id, agentSlug, propertySlug]);

  usePropertyMeta(property, agent);

  // Keyboard navigation for the gallery lightbox
  useEffect(() => {
    if (!lightbox) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setLightbox(false);
      if (e.key === 'ArrowRight') setCurrentImage((c) => (c - 1 + images.length) % images.length);
      if (e.key === 'ArrowLeft')  setCurrentImage((c) => (c + 1) % images.length);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lightbox, property]);

  const images = useMemo(
    () => (property?.images?.length ? property.images : []),
    [property]
  );

  if (loading) {
    return (
      <div className="cpv-page cpv-loading-page">
        <div className="cpv-skel cpv-skel-gallery" />
        <div className="cpv-skel-body">
          <div className="cpv-skel cpv-skel-line w-80" />
          <div className="cpv-skel cpv-skel-line w-40" />
          <div className="cpv-skel cpv-skel-chips">
            <span /><span /><span /><span />
          </div>
        </div>
      </div>
    );
  }

  if (error || !property) {
    return (
      <div className="cpv-not-found">
        <Building2 size={56} />
        <h2>הנכס לא נמצא</h2>
        <p>ייתכן שהנכס הוסר או שהקישור אינו תקין</p>
      </div>
    );
  }

  const isRent = property.category === 'RENT';
  const isCommercial = property.assetClass === 'COMMERCIAL';
  const nextImage = () => setCurrentImage((c) => (c + 1) % images.length);
  const prevImage = () => setCurrentImage((c) => (c - 1 + images.length) % images.length);

  const agentName = agent?.displayName || 'סוכן';
  const agentPhone = agent?.phone || '';
  const agentPhoneDigits = agentPhone.replace(/[^0-9]/g, '');
  const agentBackLink = agent?.slug
    ? `/agents/${agent.slug}`
    : agent?.id ? `/a/${agent.id}` : null;

  const handleWhatsApp = () => {
    const text = `שלום ${agentName}, אני מתעניין/ת בנכס ב${property.street}, ${property.city}. אשמח לפרטים נוספים.`;
    const target = agentPhoneDigits || '';
    window.open(`https://wa.me/${target}?text=${encodeURIComponent(text)}`, '_blank');
  };

  const handleShare = async () => {
    const shareData = {
      title: `${property.type} ב${property.street}, ${property.city}`,
      text: `${property.type} ${property.rooms ? `${property.rooms} חדרים ` : ''}ב${property.city} — ${formatPrice(property.marketingPrice, isRent)}`,
      url: window.location.href,
    };
    try {
      if (navigator.share) await navigator.share(shareData);
      else {
        await navigator.clipboard.writeText(window.location.href);
      }
    } catch { /* user cancelled */ }
  };

  const mapsQuery = encodeURIComponent(`${property.street}, ${property.city}`);
  const mapsEmbed  = `https://www.google.com/maps?q=${mapsQuery}&output=embed`;
  const mapsOpen   = `https://www.google.com/maps/search/?api=1&query=${mapsQuery}`;
  const wazeOpen   = `https://waze.com/ul?q=${mapsQuery}`;

  // Features we SHOW only when present — premium pages hide "no" items
  // instead of listing binary ✓/✗ for everything.
  const amenities = [
    property.elevator       && { icon: Layers,         label: property.elevatorCount ? `${property.elevatorCount} מעליות` : 'מעלית' },
    property.shabbatElevator && { icon: Zap,           label: 'מעלית שבת' },
    property.parking        && { icon: ParkingCircle,  label: parkingCopy(property) },
    property.storage        && { icon: Warehouse,      label: storageCopy(property) },
    property.ac             && { icon: Snowflake,      label: 'מזגנים' },
    property.safeRoom       && { icon: Shield,         label: 'ממ״ד' },
    property.floorShelter   && { icon: Shield,         label: 'מרחב מוגן קומתי' },
    property.shelter        && { icon: Shield,         label: 'מקלט בבניין' },
    isCommercial && property.kitchenette   && { icon: Home,      label: 'מטבחון' },
    isCommercial && property.meetingRoom   && { icon: Users,     label: 'חדר ישיבות' },
    isCommercial && property.lobbySecurity && { icon: Shield,    label: 'עמדת שמירה בלובי' },
    isCommercial && property.nearbyParking && { icon: Route,     label: 'חניה בסביבה' },
    isCommercial && property.workstations  && { icon: Briefcase, label: `${property.workstations} עמדות ישיבה` },
  ].filter(Boolean);

  const facts = [
    property.rooms != null && { label: 'חדרים', value: property.rooms },
    property.sqm             && { label: 'שטח',    value: `${property.sqm} מ״ר` },
    property.sqmTabu         && { label: 'שטח בטאבו', value: `${property.sqmTabu} מ״ר` },
    property.sqmArnona       && { label: 'שטח ארנונה', value: `${property.sqmArnona} מ״ר` },
    isCommercial && property.sqmGross && { label: 'שטח ברוטו', value: `${property.sqmGross} מ״ר` },
    isCommercial && property.sqmNet   && { label: 'שטח נטו',   value: `${property.sqmNet} מ״ר` },
    property.floor != null && { label: 'קומה', value: property.totalFloors ? `${property.floor} מתוך ${property.totalFloors}` : `${property.floor}` },
    property.renovated  && { label: 'מצב הנכס',   value: property.renovated },
    isCommercial && property.buildState && { label: 'מצב בנייה', value: property.buildState },
    property.balconySize > 0 && { label: 'מרפסת', value: `${property.balconySize} מ״ר` },
    property.neighborhood && { label: 'שכונה', value: property.neighborhood },
    property.airDirections && { label: 'כיווני אוויר', value: property.airDirections },
    property.buildingAge != null && {
      label: 'גיל הבניין',
      value: property.buildingAge === 0 ? 'חדש' : `${property.buildingAge} שנים`,
    },
    (property.vacancyFlexible || property.vacancyDate) && {
      label: 'פינוי',
      value: property.vacancyFlexible ? 'גמיש' : property.vacancyDate,
    },
    property.arnonaAmount && { label: 'ארנונה חודשית', value: `₪${property.arnonaAmount.toLocaleString('he-IL')}` },
    property.buildingCommittee && { label: 'ועד בית', value: `₪${property.buildingCommittee.toLocaleString('he-IL')}` },
    !isCommercial && property.sector && property.sector !== 'כללי' && { label: 'מגזר', value: property.sector },
  ].filter(Boolean);

  const coverImage = images[currentImage] || null;

  return (
    <div className="cpv-page">
      {/* Header: minimal, glass-translucent, auto-hides on scroll-down via CSS */}
      <header className="cpv-header">
        <div className="cpv-header-inner">
          {agentBackLink ? (
            <Link to={agentBackLink} className="cpv-back" aria-label={`חזרה לנכסי ${agentName}`}>
              <ArrowRight size={16} />
              <span>הנכסים של {agentName}</span>
            </Link>
          ) : <span aria-hidden />}
          <div className="cpv-brand">
            <span className="cpv-brand-mark">◆</span>
            <span className="cpv-brand-name">Estia</span>
          </div>
          <button className="cpv-icon-btn" onClick={handleShare} aria-label="שתף את הנכס">
            <Share2 size={17} />
          </button>
        </div>
      </header>

      {/* Hero: large editorial image + overlay title/price/specs */}
      <section className="cpv-hero">
        {coverImage ? (
          <button
            className="cpv-hero-img"
            onClick={() => setLightbox(true)}
            aria-label="הגדל תמונה"
          >
            <img
              src={coverImage}
              alt={`${property.street}, ${property.city}`}
              loading="eager"
              fetchpriority="high"
            />
          </button>
        ) : (
          <div className="cpv-hero-img cpv-hero-empty">
            <Building2 size={80} />
          </div>
        )}
        <div className="cpv-hero-gradient" aria-hidden />

        {images.length > 1 && (
          <>
            <button className="cpv-nav cpv-nav-prev" onClick={prevImage} aria-label="תמונה קודמת">
              <ChevronRight size={22} />
            </button>
            <button className="cpv-nav cpv-nav-next" onClick={nextImage} aria-label="תמונה הבאה">
              <ChevronLeft size={22} />
            </button>
            <div className="cpv-counter">{currentImage + 1} / {images.length}</div>
          </>
        )}

        <div className="cpv-hero-copy">
          <div className="cpv-chips">
            <span className={`cpv-chip ${isRent ? 'cpv-chip-rent' : 'cpv-chip-sale'}`}>
              {isRent ? 'להשכרה' : 'למכירה'}
            </span>
            <span className="cpv-chip cpv-chip-type">{property.type}</span>
            {property.neighborhood && (
              <span className="cpv-chip cpv-chip-soft">{property.neighborhood}</span>
            )}
          </div>
          <h1 className="cpv-title">
            <span className="cpv-title-street">{property.street}</span>
            <span className="cpv-title-city">{property.city}</span>
          </h1>
          <div className="cpv-price">
            {formatPrice(property.marketingPrice, isRent)}
          </div>
        </div>
      </section>

      {/* Thumbnails rail — no jitter on load thanks to fixed aspect */}
      {images.length > 1 && (
        <div className="cpv-thumbs" role="listbox" aria-label="גלריית תמונות">
          {images.map((img, i) => (
            <button
              key={i}
              className={`cpv-thumb ${i === currentImage ? 'on' : ''}`}
              onClick={() => setCurrentImage(i)}
              aria-label={`תמונה ${i + 1}`}
              aria-selected={i === currentImage}
              role="option"
            >
              <img src={img} alt="" loading="lazy" />
            </button>
          ))}
        </div>
      )}

      <div className="cpv-body">
        <main className="cpv-main">
          {/* Headline stats row */}
          <section className="cpv-headline">
            {property.rooms != null && (
              <div className="cpv-headline-cell">
                <Bed size={18} />
                <strong>{property.rooms}</strong>
                <span>חדרים</span>
              </div>
            )}
            <div className="cpv-headline-cell">
              <Maximize size={18} />
              <strong>{property.sqm}</strong>
              <span>מ״ר</span>
            </div>
            {property.floor != null && (
              <div className="cpv-headline-cell">
                <Building2 size={18} />
                <strong>{property.floor}{property.totalFloors ? `/${property.totalFloors}` : ''}</strong>
                <span>קומה</span>
              </div>
            )}
            {property.buildingAge != null && (
              <div className="cpv-headline-cell">
                <Calendar size={18} />
                <strong>
                  {property.buildingAge === 0 ? 'חדש' : `${property.buildingAge}ש׳`}
                </strong>
                <span>גיל הבניין</span>
              </div>
            )}
          </section>

          {/* Amenities — only what's present */}
          {amenities.length > 0 && (
            <section className="cpv-section">
              <h3 className="cpv-section-title">מה כלול</h3>
              <ul className="cpv-amenities">
                {amenities.map((a, i) => (
                  <li key={i} className="cpv-amenity">
                    <span className="cpv-amenity-icon">
                      <a.icon size={16} />
                    </span>
                    <span>{a.label}</span>
                    <CheckCircle2 size={14} className="cpv-amenity-tick" aria-hidden />
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Facts / registry + fees */}
          {facts.length > 0 && (
            <section className="cpv-section">
              <h3 className="cpv-section-title">פרטי הנכס</h3>
              <dl className="cpv-facts">
                {facts.map((f, i) => (
                  <div className="cpv-fact" key={i}>
                    <dt>{f.label}</dt>
                    <dd>{f.value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          {property.notes && (
            <section className="cpv-section cpv-description">
              <h3 className="cpv-section-title">תיאור</h3>
              <p>{property.notes}</p>
            </section>
          )}

          {/* Map */}
          <section className="cpv-section cpv-map-section">
            <div className="cpv-section-head">
              <h3 className="cpv-section-title">
                <MapPin size={16} /> מיקום
              </h3>
              <div className="cpv-section-head-actions">
                <a href={wazeOpen} target="_blank" rel="noreferrer" className="cpv-linkbtn">
                  <Route size={14} /> ווייז
                </a>
                <a href={mapsOpen} target="_blank" rel="noreferrer" className="cpv-linkbtn">
                  <ExternalLink size={14} /> Google Maps
                </a>
              </div>
            </div>
            <div className="cpv-map-frame">
              <iframe
                title="מיקום הנכס"
                src={mapsEmbed}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                allowFullScreen
              />
            </div>
            <p className="cpv-map-address">{property.street}, {property.city}</p>
          </section>

          {property.videos?.length > 0 && (
            <section className="cpv-section">
              <h3 className="cpv-section-title">סרטונים</h3>
              <div className="cpv-videos">
                {property.videos.map((v) => <CpvVideo key={v.id} video={v} />)}
              </div>
            </section>
          )}
        </main>

        {/* Desktop-only sticky contact card */}
        <aside className="cpv-aside">
          <div className="cpv-contact">
            <div className="cpv-contact-header">
              {agent?.avatarUrl ? (
                <img className="cpv-avatar" src={agent.avatarUrl} alt="" />
              ) : (
                <div className="cpv-avatar cpv-avatar-placeholder">
                  {agentName.charAt(0)}
                </div>
              )}
              <div>
                <strong>{agentName}</strong>
                <span>{agent?.title || 'סוכן נדל״ן'}</span>
                {agent?.agency && <span>{agent.agency}</span>}
              </div>
            </div>
            <div className="cpv-price-reminder">
              <span>מחיר מבוקש</span>
              <strong>{formatPrice(property.marketingPrice, isRent)}</strong>
            </div>
            <div className="cpv-contact-actions">
              <button className="cpv-cta cpv-cta-wa" onClick={handleWhatsApp}>
                <MessageCircle size={18} />
                שלח הודעה בוואטסאפ
              </button>
              {agentPhone && (
                <a
                  href={`tel:${agentPhoneDigits}`}
                  className="cpv-cta cpv-cta-call"
                >
                  <Phone size={18} />
                  <span>{agentPhone}</span>
                </a>
              )}
            </div>
            <div className="cpv-contact-note">
              <Banknote size={13} />
              <span>אין עמלות או עלויות נסתרות. ניצור איתך קשר באותו ערוץ שתבחר.</span>
            </div>
          </div>
        </aside>
      </div>

      {/* Mobile sticky bottom action bar with safe-area inset */}
      <div className="cpv-mobile-bar" role="toolbar" aria-label="יצירת קשר">
        <button className="cpv-mobile-btn cpv-mobile-wa" onClick={handleWhatsApp}>
          <WhatsAppIcon size={18} /> וואטסאפ
        </button>
        {agentPhoneDigits && (
          <a
            href={`tel:${agentPhoneDigits}`}
            className="cpv-mobile-btn cpv-mobile-call"
          >
            <Phone size={18} /> התקשר
          </a>
        )}
      </div>

      {/* Image lightbox */}
      {lightbox && coverImage && (
        <div className="cpv-lightbox" onClick={() => setLightbox(false)} role="dialog" aria-modal="true">
          <button
            className="cpv-lightbox-close"
            onClick={(e) => { e.stopPropagation(); setLightbox(false); }}
            aria-label="סגור"
          >
            ✕
          </button>
          <img src={coverImage} alt="" onClick={(e) => e.stopPropagation()} />
          {images.length > 1 && (
            <>
              <button
                className="cpv-nav cpv-nav-prev cpv-nav-lightbox"
                onClick={(e) => { e.stopPropagation(); prevImage(); }}
                aria-label="תמונה קודמת"
              ><ChevronRight size={24} /></button>
              <button
                className="cpv-nav cpv-nav-next cpv-nav-lightbox"
                onClick={(e) => { e.stopPropagation(); nextImage(); }}
                aria-label="תמונה הבאה"
              ><ChevronLeft size={24} /></button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function embedUrl(url) {
  const yt = url.match(/(?:youtu\.be\/|youtube\.com\/watch\?v=|youtube\.com\/embed\/)([\w-]{11})/)?.[1];
  if (yt) return `https://www.youtube.com/embed/${yt}?rel=0&playsinline=1`;
  const vimeo = url.match(/vimeo\.com\/(\d+)/)?.[1];
  if (vimeo) return `https://player.vimeo.com/video/${vimeo}`;
  return null;
}

function CpvVideo({ video }) {
  if (video.kind === 'upload' || video.url?.startsWith('/uploads/')) {
    return (
      <div className="cpv-video">
        <video src={video.url} controls preload="metadata" playsInline />
        {video.title && <span className="cpv-video-caption">{video.title}</span>}
      </div>
    );
  }
  const embed = embedUrl(video.url);
  if (embed) {
    return (
      <div className="cpv-video">
        <iframe
          title={video.title || 'וידאו'}
          src={embed}
          loading="lazy"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
        />
      </div>
    );
  }
  return (
    <a className="cpv-video-link" href={video.url} target="_blank" rel="noreferrer">
      ▶ צפה בסרטון
    </a>
  );
}
