import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ArrowRight,
  MapPin,
  Bed,
  Maximize,
  Building2,
  ParkingCircle,
  Warehouse,
  Wind,
  Snowflake,
  Shield,
  Calendar,
  Phone,
  Share2,
  CheckCircle2,
  Circle,
  ExternalLink,
  MessageCircle,
  Copy,
  ChevronLeft,
  ChevronRight,
  User,
} from 'lucide-react';
import {
  properties,
  formatPrice,
  marketingActionLabels,
  getAssetClassLabel,
} from '../data/mockData';
import './PropertyDetail.css';

export default function PropertyDetail() {
  const { id } = useParams();
  const property = properties.find((p) => p.id === Number(id));
  const [currentImage, setCurrentImage] = useState(0);
  const [copied, setCopied] = useState(false);

  if (!property) {
    return (
      <div className="empty-state">
        <Building2 size={48} />
        <h3>הנכס לא נמצא</h3>
        <p>ייתכן שהנכס הוסר מהמערכת</p>
        <Link to="/properties" className="btn btn-primary" style={{ marginTop: 16 }}>
          חזרה לנכסים
        </Link>
      </div>
    );
  }

  const done = Object.values(property.marketingActions).filter(Boolean).length;
  const total = Object.values(property.marketingActions).length;
  const pct = Math.round((done / total) * 100);

  const customerLink = `${window.location.origin}/p/${property.id}`;
  const customerPortalLink = `${window.location.origin}/customer?assetClass=${property.assetClass}`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(customerLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleWhatsApp = () => {
    const text = `${property.type} ב${property.street}, ${property.city}\n${formatPrice(property.marketingPrice)}\n\nלצפייה בפרטי הנכס:\n${customerLink}`;
    window.open(
      `https://wa.me/?text=${encodeURIComponent(text)}`,
      '_blank'
    );
  };

  const nextImage = () =>
    setCurrentImage((c) => (c + 1) % property.images.length);
  const prevImage = () =>
    setCurrentImage(
      (c) => (c - 1 + property.images.length) % property.images.length
    );

  return (
    <div className="property-detail">
      <Link to="/properties" className="back-link animate-in">
        <ArrowRight size={16} />
        חזרה לנכסים
      </Link>

      {/* Image gallery */}
      <div className="detail-gallery animate-in animate-in-delay-1">
        <div className="gallery-main">
          <img
            src={property.images[currentImage]}
            alt={property.street}
          />
          {property.images.length > 1 && (
            <>
              <button className="gallery-nav prev" onClick={prevImage}>
                <ChevronRight size={20} />
              </button>
              <button className="gallery-nav next" onClick={nextImage}>
                <ChevronLeft size={20} />
              </button>
            </>
          )}
          <div className="gallery-counter">
            {currentImage + 1} / {property.images.length}
          </div>
        </div>
        {property.images.length > 1 && (
          <div className="gallery-thumbs">
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

      <div className="detail-content">
        {/* Main info */}
        <div className="detail-main animate-in animate-in-delay-2">
          <div className="detail-header">
            <div>
              <div className="detail-badges">
                <span className={`badge ${property.assetClass === 'commercial' ? 'badge-warning' : 'badge-success'}`}>
                  {getAssetClassLabel(property.assetClass)}
                </span>
                <span className={`badge ${property.category === 'sale' ? 'badge-gold' : 'badge-info'}`}>
                  {property.category === 'sale' ? 'מכירה' : 'השכרה'}
                </span>
                <span className="badge badge-gold">{property.type}</span>
              </div>
              <h2 className="detail-title">
                {property.street}, {property.city}
              </h2>
              <div className="detail-price">
                {formatPrice(property.marketingPrice)}
              </div>
              {property.offer && (
                <div className="detail-offer">
                  הצעה אחרונה: {formatPrice(property.offer)}
                </div>
              )}
            </div>
            <div className="detail-share-actions">
              <button className="btn btn-primary" onClick={handleWhatsApp}>
                <MessageCircle size={18} />
                שלח בוואטסאפ
              </button>
              <button
                className="btn btn-secondary"
                onClick={handleCopyLink}
              >
                <Copy size={16} />
                {copied ? 'הועתק!' : 'העתק קישור'}
              </button>
              <Link
                to={`/p/${property.id}`}
                target="_blank"
                className="btn btn-ghost"
              >
                <ExternalLink size={16} />
                צפה כלקוח
              </Link>
            </div>
          </div>

          {/* Specs grid */}
          <div className="specs-grid">
            {property.rooms != null && (
              <div className="spec-item">
                <Bed size={20} />
                <div>
                  <span className="spec-value">{property.rooms}</span>
                  <span className="spec-label">חדרים</span>
                </div>
              </div>
            )}
            <div className="spec-item">
              <Maximize size={20} />
              <div>
                <span className="spec-value">{property.sqm} מ״ר</span>
                <span className="spec-label">שטח</span>
              </div>
            </div>
            <div className="spec-item">
              <Building2 size={20} />
              <div>
                <span className="spec-value">
                  {property.floor}/{property.totalFloors}
                </span>
                <span className="spec-label">קומה</span>
              </div>
            </div>
            {property.balconySize > 0 && (
              <div className="spec-item">
                <Wind size={20} />
                <div>
                  <span className="spec-value">{property.balconySize} מ״ר</span>
                  <span className="spec-label">מרפסת</span>
                </div>
              </div>
            )}
            <div className="spec-item">
              <ParkingCircle size={20} />
              <div>
                <span className="spec-value">
                  {property.parking ? 'יש' : 'אין'}
                </span>
                <span className="spec-label">חניה</span>
              </div>
            </div>
            <div className="spec-item">
              <Warehouse size={20} />
              <div>
                <span className="spec-value">
                  {property.storage ? 'יש' : 'אין'}
                </span>
                <span className="spec-label">מחסן</span>
              </div>
            </div>
            <div className="spec-item">
              <Snowflake size={20} />
              <div>
                <span className="spec-value">
                  {property.ac ? 'יש' : 'אין'}
                </span>
                <span className="spec-label">מזגן</span>
              </div>
            </div>
            <div className="spec-item">
              <Shield size={20} />
              <div>
                <span className="spec-value">
                  {property.safeRoom ? 'יש' : 'אין'}
                </span>
                <span className="spec-label">ממ״ד</span>
              </div>
            </div>
          </div>

          {/* Additional info */}
          <div className="info-grid">
            <div className="info-item">
              <span className="info-label">מצב הנכס</span>
              <span className="info-value">{property.renovated}</span>
            </div>
            <div className="info-item">
              <span className="info-label">כיווני אוויר</span>
              <span className="info-value">{property.airDirections}</span>
            </div>
            <div className="info-item">
              <span className="info-label">מעלית</span>
              <span className="info-value">
                {property.elevator ? 'יש' : 'אין'}
              </span>
            </div>
            <div className="info-item">
              <span className="info-label">גיל הבניין</span>
              <span className="info-value">
                {property.buildingAge === 0 ? 'חדש' : `${property.buildingAge} שנים`}
              </span>
            </div>
            <div className="info-item">
              <span className="info-label">מועד פינוי</span>
              <span className="info-value">{property.vacancyDate}</span>
            </div>
            <div className="info-item">
              <span className="info-label">מגזר</span>
              <span className="info-value">{property.sector}</span>
            </div>
          </div>

          {/* Commercial-specific details */}
          {property.assetClass === 'commercial' && (
            <div className="info-grid">
              {property.usagePermit && (
                <div className="info-item">
                  <span className="info-label">ייעוד / היתר שימוש</span>
                  <span className="info-value">{property.usagePermit}</span>
                </div>
              )}
              {property.monthlyArnona && (
                <div className="info-item">
                  <span className="info-label">ארנונה חודשית</span>
                  <span className="info-value">₪{property.monthlyArnona.toLocaleString('he-IL')}</span>
                </div>
              )}
              <div className="info-item">
                <span className="info-label">רמפת פריקה</span>
                <span className="info-value">{property.loadingArea ? 'יש' : 'אין'}</span>
              </div>
              <div className="info-item">
                <span className="info-label">נגישות לנכים</span>
                <span className="info-value">{property.handicapAccess ? 'יש' : 'אין'}</span>
              </div>
              {property.currentTenant && (
                <div className="info-item">
                  <span className="info-label">שוכר נוכחי</span>
                  <span className="info-value">{property.currentTenant}</span>
                </div>
              )}
            </div>
          )}

          {property.notes && (
            <div className="detail-notes">
              <h4>הערות</h4>
              <p>{property.notes}</p>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="detail-sidebar">
          {/* Owner card */}
          <div className="card sidebar-card animate-in animate-in-delay-3">
            <h4>
              <User size={18} />
              בעל הנכס
            </h4>
            <div className="owner-detail">
              <div className="owner-detail-avatar">
                {property.owner.charAt(0)}
              </div>
              <div>
                <span className="owner-detail-name">{property.owner}</span>
                <a href={`tel:${property.ownerPhone}`} className="owner-phone">
                  <Phone size={14} />
                  {property.ownerPhone}
                </a>
              </div>
            </div>
            <div className="owner-dates">
              <div>
                <span className="date-label">תחילת בלעדיות</span>
                <span className="date-value">{property.exclusiveStart}</span>
              </div>
              <div>
                <span className="date-label">סיום בלעדיות</span>
                <span className="date-value">{property.exclusiveEnd}</span>
              </div>
              <div>
                <span className="date-label">קשר אחרון</span>
                <span className="date-value">{property.lastContact}</span>
              </div>
            </div>
            {property.lastContactNotes && (
              <div className="last-contact-note">
                <span className="date-label">תוכן שיחה אחרונה</span>
                <p>{property.lastContactNotes}</p>
              </div>
            )}
          </div>

          {/* Marketing actions */}
          <div className="card sidebar-card animate-in animate-in-delay-4">
            <div className="marketing-header">
              <h4>פעולות שיווק</h4>
              <span className="badge badge-gold">
                {done}/{total}
              </span>
            </div>
            <div className="progress-bar" style={{ marginBottom: 16 }}>
              <div className="progress-fill" style={{ width: `${pct}%` }} />
            </div>
            <div className="marketing-checklist">
              {Object.entries(property.marketingActions).map(
                ([key, done]) => (
                  <label key={key} className="checklist-item">
                    {done ? (
                      <CheckCircle2 size={18} className="check-done" />
                    ) : (
                      <Circle size={18} className="check-pending" />
                    )}
                    <span className={done ? 'done' : ''}>
                      {marketingActionLabels[key]}
                    </span>
                  </label>
                )
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
