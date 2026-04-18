import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  MapPin,
  Bed,
  Maximize,
  Building2,
  ParkingCircle,
  Warehouse,
  Wind,
  Snowflake,
  Shield,
  Phone,
  MessageCircle,
  ChevronLeft,
  ChevronRight,
  ArrowRight,
  Share2,
  ExternalLink,
} from 'lucide-react';
import api from '../lib/api';
import StickyActionBar from '../components/StickyActionBar';
import WhatsAppIcon from '../components/WhatsAppIcon';
import { useViewportMobile } from '../hooks/mobile';
import './CustomerPropertyView.css';

function formatPrice(price) {
  if (!price) return '—';
  if (price < 10000) return `₪${price.toLocaleString('he-IL')}/חודש`;
  return `₪${price.toLocaleString('he-IL')}`;
}

export default function CustomerPropertyView() {
  // Supports BOTH route shapes:
  //   /agents/:agentSlug/:propertySlug  (SEO-friendly)
  //   /p/:id                            (legacy short)
  const { id, agentSlug, propertySlug } = useParams();
  const [property, setProperty] = useState(null);
  const [agent, setAgent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentImage, setCurrentImage] = useState(0);
  const isMobile = useViewportMobile();

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        // Slug route → fetch via /api/public/agents/:slug/properties/:slug
        if (agentSlug && propertySlug) {
          const r = await api.publicProperty(agentSlug, propertySlug);
          if (cancelled) return;
          setProperty(r.property);
          setAgent(r.agent);
          return;
        }
        // Legacy id route
        const res = await api.getProperty(id);
        if (cancelled) return;
        setProperty(res.property);
        if (res.property?.agentId) {
          try {
            const a = await api.getAgentPublic(res.property.agentId);
            if (!cancelled) setAgent(a.agent);
          } catch { /* ignore — fall back to default branding */ }
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

  if (loading) {
    return (
      <div className="cpv-loading">
        <div className="ap-loading-spinner" />
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

  const images = property.images?.length ? property.images : [
    'https://via.placeholder.com/1200x675?text=Estia',
  ];

  const nextImage = () => setCurrentImage((c) => (c + 1) % images.length);
  const prevImage = () => setCurrentImage((c) => (c - 1 + images.length) % images.length);

  const agentName = agent?.displayName || 'סוכן';
  const agentPhone = agent?.phone || '';
  const agentPhoneDigits = agentPhone.replace(/[^0-9]/g, '');
  const agentBackLink = agent?.slug
    ? `/agents/${agent.slug}`
    : agent?.id
      ? `/a/${agent.id}`
      : null;

  const handleWhatsApp = () => {
    const text = `שלום, אני מתעניין/ת בנכס ב${property.street}, ${property.city}. אשמח לפרטים נוספים.`;
    const target = agentPhoneDigits || '';
    window.open(
      `https://wa.me/${target}?text=${encodeURIComponent(text)}`,
      '_blank'
    );
  };

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: `${property.type} ב${property.street}, ${property.city}`,
        text: `${property.type} ${property.rooms || ''} ב${property.city} - ${formatPrice(property.marketingPrice)}`,
        url: window.location.href,
      });
    } else {
      navigator.clipboard.writeText(window.location.href);
    }
  };

  const mapsQuery = encodeURIComponent(`${property.street}, ${property.city}`);
  const mapsEmbed = `https://www.google.com/maps?q=${mapsQuery}&output=embed`;
  const mapsOpen = `https://www.google.com/maps/search/?api=1&query=${mapsQuery}`;

  return (
    <div className="cpv-page">
      <div className="noise-overlay" />

      <header className="cpv-header">
        <div className="cpv-header-inner">
          {agentBackLink ? (
            <Link to={agentBackLink} className="cpv-back">
              <ArrowRight size={18} />
              חזרה לנכסי {agent.displayName}
            </Link>
          ) : (
            <span className="cpv-back" />
          )}
          <Link to={agentBackLink || '/'} className="cpv-header-logo">
            <span className="logo-icon-sm">◆</span>
            <span>Estia</span>
          </Link>
          <button className="btn btn-ghost btn-sm" onClick={handleShare}>
            <Share2 size={16} />
            שתף
          </button>
        </div>
      </header>

      <div className="cpv-gallery">
        <div className="cpv-gallery-main">
          <img src={images[currentImage]} alt={property.street} />
          {images.length > 1 && (
            <>
              <button className="gallery-nav prev" onClick={prevImage}>
                <ChevronRight size={20} />
              </button>
              <button className="gallery-nav next" onClick={nextImage}>
                <ChevronLeft size={20} />
              </button>
              <div className="gallery-counter">
                {currentImage + 1} / {images.length}
              </div>
            </>
          )}
        </div>
        {images.length > 1 && (
          <div className="cpv-thumbs">
            {images.map((img, i) => (
              <button
                key={i}
                className={`gallery-thumb ${i === currentImage ? 'active' : ''}`}
                onClick={() => setCurrentImage(i)}
              >
                <img src={img} alt="" />
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="cpv-content">
        <div className="cpv-main">
          <div className="cpv-title-section">
            <div className="cpv-badges">
              <span className={`badge ${property.category === 'SALE' ? 'badge-gold' : 'badge-info'}`}>
                {property.category === 'SALE' ? 'למכירה' : 'להשכרה'}
              </span>
              <span className="badge badge-success">{property.type}</span>
            </div>
            <h1>
              <MapPin size={24} />
              {property.street}, {property.city}
            </h1>
            <div className="cpv-price">
              {formatPrice(property.marketingPrice)}
            </div>
          </div>

          <div className="cpv-specs">
            {property.rooms != null && (
              <div className="cpv-spec">
                <Bed size={22} />
                <div>
                  <strong>{property.rooms}</strong>
                  <span>חדרים</span>
                </div>
              </div>
            )}
            <div className="cpv-spec">
              <Maximize size={22} />
              <div>
                <strong>{property.sqm} מ״ר</strong>
                <span>שטח</span>
              </div>
            </div>
            {property.sqmArnona && (
              <div className="cpv-spec">
                <Maximize size={22} />
                <div>
                  <strong>{property.sqmArnona} מ״ר</strong>
                  <span>ארנונה</span>
                </div>
              </div>
            )}
            <div className="cpv-spec">
              <Building2 size={22} />
              <div>
                <strong>קומה {property.floor}/{property.totalFloors}</strong>
                <span>קומות</span>
              </div>
            </div>
            {property.balconySize > 0 && (
              <div className="cpv-spec">
                <Wind size={22} />
                <div>
                  <strong>{property.balconySize} מ״ר</strong>
                  <span>מרפסת</span>
                </div>
              </div>
            )}
          </div>

          <div className="cpv-features">
            <h3>מאפייני הנכס</h3>
            <div className="cpv-features-grid">
              {[
                { icon: ParkingCircle, label: 'חניה', value: property.parking },
                { icon: Warehouse, label: 'מחסן', value: property.storage },
                { icon: Snowflake, label: 'מזגנים', value: property.ac },
                ...(property.assetClass === 'RESIDENTIAL'
                  ? [{ icon: Shield, label: 'ממ״ד', value: property.safeRoom }]
                  : []),
              ].map((feat) => (
                <div
                  key={feat.label}
                  className={`cpv-feature ${feat.value ? 'has' : 'no'}`}
                >
                  <feat.icon size={20} />
                  <span>{feat.label}</span>
                  <span className="cpv-feature-status">
                    {feat.value ? 'יש' : 'אין'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="cpv-details">
            <h3>פרטים נוספים</h3>
            <div className="cpv-details-grid">
              <div>
                <span className="cpv-detail-label">מצב</span>
                <span className="cpv-detail-value">{property.renovated || '—'}</span>
              </div>
              {property.airDirections && (
                <div>
                  <span className="cpv-detail-label">כיווני אוויר</span>
                  <span className="cpv-detail-value">{property.airDirections}</span>
                </div>
              )}
              <div>
                <span className="cpv-detail-label">מעלית</span>
                <span className="cpv-detail-value">
                  {property.elevator ? 'יש' : 'אין'}
                </span>
              </div>
              <div>
                <span className="cpv-detail-label">בניין בן</span>
                <span className="cpv-detail-value">
                  {property.buildingAge === 0
                    ? 'חדש'
                    : property.buildingAge != null
                    ? `${property.buildingAge} שנים`
                    : '—'}
                </span>
              </div>
              {property.vacancyDate && (
                <div>
                  <span className="cpv-detail-label">תאריך פינוי</span>
                  <span className="cpv-detail-value">{property.vacancyDate}</span>
                </div>
              )}
              {property.assetClass === 'RESIDENTIAL' && property.sector && (
                <div>
                  <span className="cpv-detail-label">מגזר</span>
                  <span className="cpv-detail-value">{property.sector}</span>
                </div>
              )}
            </div>
          </div>

          {/* Google Maps — same as the agent view */}
          <div className="cpv-map-card">
            <div className="cpv-map-header">
              <h3>
                <MapPin size={18} />
                מיקום הנכס
              </h3>
              <a
                href={mapsOpen}
                target="_blank"
                rel="noreferrer"
                className="btn btn-ghost btn-sm"
              >
                <ExternalLink size={14} />
                פתח בגוגל מפות
              </a>
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
            <div className="cpv-map-address">
              {property.street}, {property.city}
            </div>
          </div>

          {property.videos?.length > 0 && (
            <div className="cpv-videos">
              <h3>סרטונים ({property.videos.length})</h3>
              <div className="cpv-videos-grid">
                {property.videos.map((v) => (
                  <CpvVideo key={v.id} video={v} />
                ))}
              </div>
            </div>
          )}

          {property.notes && (
            <div className="cpv-notes">
              <h3>תיאור</h3>
              <p>{property.notes}</p>
            </div>
          )}
        </div>

        <aside className="cpv-sidebar">
          <div className="cpv-contact-card">
            <div className="cpv-agent-info">
              {agent?.avatarUrl ? (
                <img className="cpv-agent-avatar" src={agent.avatarUrl} alt={agentName} />
              ) : (
                <div className="cpv-agent-avatar placeholder">{agentName.charAt(0)}</div>
              )}
              <div>
                <h4>{agentName}</h4>
                <span>{agent?.title || 'סוכן נדל״ן'}</span>
                <span>{agent?.agency || ''}</span>
              </div>
            </div>
            <div className="cpv-contact-buttons">
              <button
                className="btn btn-primary btn-lg cpv-contact-btn"
                onClick={handleWhatsApp}
              >
                <MessageCircle size={20} />
                שלח הודעה בוואטסאפ
              </button>
              {agentPhone && !isMobile && (
                <a
                  href={`tel:${agentPhone}`}
                  className="btn btn-secondary btn-lg cpv-contact-btn"
                >
                  <Phone size={20} />
                  {agentPhone}
                </a>
              )}
            </div>
          </div>
        </aside>
      </div>

      <StickyActionBar visible className="sab-icons cpv-sab">
        {agentPhone && (
          <a
            href={`tel:${agentPhone}`}
            className="btn btn-primary"
            aria-label="התקשר"
          >
            <Phone size={18} />
            התקשר
          </a>
        )}
        <button
          type="button"
          className="btn cpv-wa-btn"
          onClick={handleWhatsApp}
          aria-label="וואטסאפ"
        >
          <WhatsAppIcon size={18} />
          וואטסאפ
        </button>
      </StickyActionBar>
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
