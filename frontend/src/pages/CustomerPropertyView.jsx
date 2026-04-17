import { useState } from 'react';
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
} from 'lucide-react';
import { properties, formatPrice, agentProfile } from '../data/mockData';
import './CustomerPropertyView.css';

export default function CustomerPropertyView() {
  const { id } = useParams();
  const property = properties.find((p) => p.id === Number(id));
  const [currentImage, setCurrentImage] = useState(0);

  if (!property) {
    return (
      <div className="cpv-not-found">
        <Building2 size={56} />
        <h2>הנכס לא נמצא</h2>
        <p>ייתכן שהנכס הוסר או שהקישור אינו תקין</p>
      </div>
    );
  }

  const nextImage = () =>
    setCurrentImage((c) => (c + 1) % property.images.length);
  const prevImage = () =>
    setCurrentImage(
      (c) => (c - 1 + property.images.length) % property.images.length
    );

  const handleWhatsApp = () => {
    const text = `שלום, אני מתעניין/ת בנכס ב${property.street}, ${property.city}. אשמח לפרטים נוספים.`;
    window.open(
      `https://wa.me/${agentProfile.phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(text)}`,
      '_blank'
    );
  };

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: `${property.type} ב${property.street}, ${property.city}`,
        text: `${property.type} ${property.rooms} חדרים ב${property.city} - ${formatPrice(property.marketingPrice)}`,
        url: window.location.href,
      });
    } else {
      navigator.clipboard.writeText(window.location.href);
    }
  };

  return (
    <div className="cpv-page">
      <div className="noise-overlay" />

      {/* Header */}
      <header className="cpv-header">
        <div className="cpv-header-inner">
          <Link to="/customer" className="cpv-back">
            <ArrowRight size={18} />
            חזרה לנכסים
          </Link>
          <Link to="/customer" className="cpv-header-logo">
            <span className="logo-icon-sm">◆</span>
            <span>Estia</span>
          </Link>
          <button className="btn btn-ghost btn-sm" onClick={handleShare}>
            <Share2 size={16} />
            שתף
          </button>
        </div>
      </header>

      {/* Gallery */}
      <div className="cpv-gallery">
        <div className="cpv-gallery-main">
          <img src={property.images[currentImage]} alt={property.street} />
          {property.images.length > 1 && (
            <>
              <button className="gallery-nav prev" onClick={prevImage}>
                <ChevronRight size={20} />
              </button>
              <button className="gallery-nav next" onClick={nextImage}>
                <ChevronLeft size={20} />
              </button>
              <div className="gallery-counter">
                {currentImage + 1} / {property.images.length}
              </div>
            </>
          )}
        </div>
        {property.images.length > 1 && (
          <div className="cpv-thumbs">
            {property.images.map((img, i) => (
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

      {/* Content */}
      <div className="cpv-content">
        <div className="cpv-main">
          {/* Title and price */}
          <div className="cpv-title-section">
            <div className="cpv-badges">
              <span className={`badge ${property.category === 'sale' ? 'badge-gold' : 'badge-info'}`}>
                {property.category === 'sale' ? 'למכירה' : 'להשכרה'}
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

          {/* Specs */}
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

          {/* Features — show relevant ones based on asset class */}
          <div className="cpv-features">
            <h3>מאפייני הנכס</h3>
            <div className="cpv-features-grid">
              {[
                { icon: ParkingCircle, label: 'חניה', value: property.parking },
                { icon: Warehouse, label: 'מחסן', value: property.storage },
                { icon: Snowflake, label: 'מזגנים', value: property.ac },
                ...(property.assetClass === 'residential'
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

          {/* Details — fields from the intake doc, for all asset types */}
          <div className="cpv-details">
            <h3>פרטים נוספים</h3>
            <div className="cpv-details-grid">
              <div>
                <span className="cpv-detail-label">עבר שיפוץ</span>
                <span className="cpv-detail-value">{property.renovated}</span>
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
                    : `${property.buildingAge} שנים`}
                </span>
              </div>
              <div>
                <span className="cpv-detail-label">תאריך פינוי</span>
                <span className="cpv-detail-value">{property.vacancyDate}</span>
              </div>
              {property.assetClass === 'residential' && (
                <div>
                  <span className="cpv-detail-label">מגזר</span>
                  <span className="cpv-detail-value">{property.sector}</span>
                </div>
              )}
            </div>
          </div>

          {property.notes && (
            <div className="cpv-notes">
              <h3>תיאור</h3>
              <p>{property.notes}</p>
            </div>
          )}
        </div>

        {/* Sticky contact sidebar */}
        <aside className="cpv-sidebar">
          <div className="cpv-contact-card">
            <div className="cpv-agent-info">
              <div className="cpv-agent-avatar">
                {agentProfile.name.charAt(0)}
              </div>
              <div>
                <h4>{agentProfile.name}</h4>
                <span>{agentProfile.title}</span>
                <span>{agentProfile.agency}</span>
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
              <a
                href={`tel:${agentProfile.phone}`}
                className="btn btn-secondary btn-lg cpv-contact-btn"
              >
                <Phone size={20} />
                {agentProfile.phone}
              </a>
            </div>
          </div>
        </aside>
      </div>

      {/* Mobile contact bar */}
      <div className="cpv-mobile-bar">
        <a href={`tel:${agentProfile.phone}`} className="btn btn-secondary">
          <Phone size={18} />
          התקשר
        </a>
        <button className="btn btn-primary" onClick={handleWhatsApp}>
          <MessageCircle size={18} />
          וואטסאפ
        </button>
      </div>
    </div>
  );
}
