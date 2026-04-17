import { useState, useMemo, useEffect } from 'react';
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
  Phone,
  CheckCircle2,
  Circle,
  ExternalLink,
  MessageCircle,
  Copy,
  ChevronLeft,
  ChevronRight,
  User,
  BellRing,
  FileText,
  Send,
} from 'lucide-react';
import {
  properties,
  formatPrice,
  marketingActionLabels,
  getAssetClassLabel,
  agentProfile,
  leads,
} from '../data/mockData';
import './PropertyDetail.css';

function buildFullWhatsAppMessage(prop) {
  const lines = [];
  lines.push(`*${prop.type} — ${prop.street}, ${prop.city}*`);
  lines.push('');
  lines.push(`💰 מחיר: ${formatPrice(prop.marketingPrice)}`);
  lines.push(`📐 שטח: ${prop.sqm} מ״ר`);
  if (prop.rooms != null) lines.push(`🛏️ חדרים: ${prop.rooms}`);
  lines.push(`🏢 קומה: ${prop.floor}/${prop.totalFloors}`);
  if (prop.balconySize > 0) lines.push(`🌤️ מרפסת: ${prop.balconySize} מ״ר`);
  lines.push(`🚗 חניה: ${prop.parking ? 'יש' : 'אין'}`);
  lines.push(`📦 מחסן: ${prop.storage ? 'יש' : 'אין'}`);
  lines.push(`❄️ מזגנים: ${prop.ac ? 'יש' : 'אין'}`);
  if (prop.assetClass === 'residential') {
    lines.push(`🛡️ ממ״ד: ${prop.safeRoom ? 'יש' : 'אין'}`);
  }
  lines.push(`🛗 מעלית: ${prop.elevator ? 'יש' : 'אין'}`);
  if (prop.airDirections) lines.push(`🧭 כיווני אוויר: ${prop.airDirections}`);
  lines.push(`🛠️ מצב: ${prop.renovated}`);
  lines.push(`🏗️ בניין בן: ${prop.buildingAge === 0 ? 'חדש' : `${prop.buildingAge} שנים`}`);
  lines.push(`📅 פינוי: ${prop.vacancyDate}`);
  if (prop.sector) lines.push(`👥 מגזר: ${prop.sector}`);
  if (prop.assetClass === 'commercial' && prop.sqmArnona) {
    lines.push(`📄 מ״ר ארנונה: ${prop.sqmArnona}`);
  }
  if (prop.notes) {
    lines.push('');
    lines.push(`הערות: ${prop.notes}`);
  }
  lines.push('');
  lines.push(`📷 תמונות ופרטים נוספים:`);
  lines.push(`${window.location.origin}/p/${prop.id}`);
  lines.push('');
  lines.push('—');
  lines.push(`👤 *${agentProfile.name}* — ${agentProfile.title}`);
  lines.push(`🏢 ${agentProfile.agency}`);
  lines.push(`📞 ${agentProfile.phone}`);
  if (agentProfile.bio) {
    lines.push('');
    lines.push(agentProfile.bio);
  }
  if (agentProfile.avatar) {
    lines.push('');
    lines.push(`🖼️ תמונת המתווך: ${agentProfile.avatar}`);
  }
  return lines.join('\n');
}

function buildWeeklyReport(prop, stats) {
  const lines = [];
  lines.push(`*דו״ח שיווק שבועי — ${prop.street}, ${prop.city}*`);
  lines.push('');
  lines.push(`היי, להלן סיכום הפעילות על הנכס שלך בשבוע האחרון:`);
  lines.push('');
  lines.push(`👀 מתעניינים שפנו: ${stats.inquiries}`);
  lines.push(`🏠 צפיות בנכס: ${stats.views}`);
  lines.push(`📅 ביקורים שבוצעו: ${stats.visits}`);
  lines.push(`✉️ הצעות שהתקבלו: ${stats.offers}`);
  lines.push('');
  lines.push(`*פעולות שיווק שהושלמו (${stats.completedActions}/${stats.totalActions}):*`);
  stats.doneLabels.forEach((label) => lines.push(`✅ ${label}`));
  if (stats.pendingLabels.length) {
    lines.push('');
    lines.push(`*בתכנון לשבוע הבא:*`);
    stats.pendingLabels.slice(0, 5).forEach((label) => lines.push(`🔜 ${label}`));
  }
  lines.push('');
  lines.push('—');
  lines.push(`${agentProfile.name} · ${agentProfile.agency} · ${agentProfile.phone}`);
  return lines.join('\n');
}

export default function PropertyDetail() {
  const { id } = useParams();
  const property = properties.find((p) => p.id === Number(id));
  const [currentImage, setCurrentImage] = useState(0);
  const [copied, setCopied] = useState(false);
  const [actions, setActions] = useState(property?.marketingActions || {});
  const [reminder, setReminder] = useState(property?.marketingReminderFrequency || 'weekly');

  // Keep local state in sync when switching property id
  useEffect(() => {
    if (property) setActions(property.marketingActions);
  }, [property]);

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

  const done = Object.values(actions).filter(Boolean).length;
  const total = Object.values(actions).length;
  const pct = Math.round((done / total) * 100);

  // Overdue reminder — naive "days since last contact" heuristic
  const daysSinceUpdate = useMemo(() => {
    if (!property.lastContact) return null;
    const last = new Date(property.lastContact);
    return Math.floor((Date.now() - last.getTime()) / (1000 * 60 * 60 * 24));
  }, [property.lastContact]);

  const reminderDueDays = { daily: 1, weekly: 7, biweekly: 14, monthly: 30 }[reminder] || 7;
  const reminderOverdue = daysSinceUpdate != null && daysSinceUpdate > reminderDueDays;

  const customerLink = `${window.location.origin}/p/${property.id}`;
  const mapsQuery = encodeURIComponent(`${property.street}, ${property.city}`);
  const mapsEmbed = `https://www.google.com/maps?q=${mapsQuery}&output=embed`;
  const mapsOpen = `https://www.google.com/maps/search/?api=1&query=${mapsQuery}`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(customerLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleWhatsApp = () => {
    const text = buildFullWhatsAppMessage(property);
    window.open(
      `https://wa.me/?text=${encodeURIComponent(text)}`,
      '_blank'
    );
  };

  const toggleAction = (key) => {
    setActions((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Pretend-stats drawn from leads + current marketing progress.
  const inquiries = leads.filter((l) =>
    l.propertiesViewed?.includes(property.id)
  ).length;
  const reportStats = {
    inquiries,
    views: inquiries * 3 + 4, // demo number
    visits: inquiries,
    offers: property.offer ? 1 : 0,
    completedActions: done,
    totalActions: total,
    doneLabels: Object.entries(actions)
      .filter(([, v]) => v)
      .map(([k]) => marketingActionLabels[k]),
    pendingLabels: Object.entries(actions)
      .filter(([, v]) => !v)
      .map(([k]) => marketingActionLabels[k]),
  };

  const handleSendReport = () => {
    const text = buildWeeklyReport(property, reportStats);
    const phone = (property.ownerPhone || '').replace(/[^0-9]/g, '');
    const url = phone
      ? `https://wa.me/${phone}?text=${encodeURIComponent(text)}`
      : `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  const handleSendForSignature = () => {
    alert(
      `נשלח הסכם תיווך לחתימה דיגיטלית אל ${property.owner} (${property.ownerPhone}).\n` +
        'לאחר חתימה הקובץ יצורף אוטומטית לכרטיס הלקוח תחת "קובץ חתום".'
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
              {property.closingPrice && (
                <div className="detail-offer">
                  מחיר סגירה: {formatPrice(property.closingPrice)}
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

          {/* Additional info — labels matching the intake doc */}
          <div className="info-grid">
            <div className="info-item">
              <span className="info-label">עברה שיפוץ?</span>
              <span className="info-value">{property.renovated}</span>
            </div>
            <div className="info-item">
              <span className="info-label">כיווני אוויר</span>
              <span className="info-value">{property.airDirections || '—'}</span>
            </div>
            <div className="info-item">
              <span className="info-label">מעלית</span>
              <span className="info-value">
                {property.elevator ? 'יש' : 'אין'}
              </span>
            </div>
            <div className="info-item">
              <span className="info-label">בניין בן</span>
              <span className="info-value">
                {property.buildingAge === 0 ? 'חדש' : `${property.buildingAge} שנים`}
              </span>
            </div>
            <div className="info-item">
              <span className="info-label">תאריך פינוי</span>
              <span className="info-value">{property.vacancyDate}</span>
            </div>
            <div className="info-item">
              <span className="info-label">מגזר</span>
              <span className="info-value">{property.sector}</span>
            </div>
          </div>

          {/* Commercial: show מ"ר ארנונה from doc/spreadsheet */}
          {property.assetClass === 'commercial' && property.sqmArnona && (
            <div className="info-grid">
              <div className="info-item">
                <span className="info-label">מ״ר ארנונה</span>
                <span className="info-value">{property.sqmArnona}</span>
              </div>
              <div className="info-item">
                <span className="info-label">מצב הנכס</span>
                <span className="info-value">{property.renovated}</span>
              </div>
              <div className="info-item">
                <span className="info-label">מועד פינוי</span>
                <span className="info-value">{property.vacancyDate}</span>
              </div>
            </div>
          )}

          {/* Google Maps */}
          <div className="detail-map-card">
            <div className="detail-map-header">
              <h4>
                <MapPin size={18} />
                מיקום הנכס
              </h4>
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
            <div className="detail-map-frame">
              <iframe
                title="מיקום הנכס"
                src={mapsEmbed}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                allowFullScreen
              />
            </div>
            <div className="detail-map-address">
              {property.street}, {property.city}
            </div>
          </div>

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
            <button
              className="btn btn-secondary btn-sm owner-action-btn"
              onClick={handleSendForSignature}
            >
              <FileText size={14} />
              שלח הסכם תיווך לחתימה דיגיטלית
            </button>
          </div>

          {/* Weekly report — sends marketing summary to the owner */}
          <div className="card sidebar-card report-card animate-in animate-in-delay-3">
            <h4>
              <Send size={18} />
              דו״ח שיווק ללקוח
            </h4>
            <p className="report-desc">
              שליחת סיכום פעולות השיווק של השבוע האחרון ללקוח,
              כולל כמות פניות, ביקורים והצעות.
            </p>
            <div className="report-quick-stats">
              <div>
                <span className="rq-value">{reportStats.inquiries}</span>
                <span className="rq-label">פניות</span>
              </div>
              <div>
                <span className="rq-value">{reportStats.views}</span>
                <span className="rq-label">צפיות</span>
              </div>
              <div>
                <span className="rq-value">{reportStats.visits}</span>
                <span className="rq-label">ביקורים</span>
              </div>
              <div>
                <span className="rq-value">{reportStats.offers}</span>
                <span className="rq-label">הצעות</span>
              </div>
            </div>
            <button
              className="btn btn-primary btn-sm report-send-btn"
              onClick={handleSendReport}
            >
              <MessageCircle size={14} />
              שלח דו״ח בוואטסאפ
            </button>
          </div>

          {/* Marketing actions — interactive + reminder */}
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

            <div className="marketing-reminder">
              <label className="reminder-row">
                <BellRing size={14} />
                <span className="reminder-label">תזכורת תקופתית:</span>
                <select
                  className="reminder-select"
                  value={reminder}
                  onChange={(e) => setReminder(e.target.value)}
                >
                  <option value="daily">יומית</option>
                  <option value="weekly">שבועית</option>
                  <option value="biweekly">דו-שבועית</option>
                  <option value="monthly">חודשית</option>
                </select>
              </label>
              {reminderOverdue && (
                <div className="reminder-overdue">
                  <BellRing size={13} />
                  חלפו {daysSinceUpdate} ימים מאז העדכון האחרון — מומלץ להשלים פעולה או ליצור קשר
                </div>
              )}
            </div>

            <p className="marketing-hint">לחץ על פעולה כדי לסמן אותה כבוצעה</p>
            <div className="marketing-checklist">
              {Object.entries(actions).map(([key, value]) => (
                <button
                  type="button"
                  key={key}
                  className={`checklist-item interactive ${value ? 'is-done' : ''}`}
                  onClick={() => toggleAction(key)}
                >
                  {value ? (
                    <CheckCircle2 size={18} className="check-done" />
                  ) : (
                    <Circle size={18} className="check-pending" />
                  )}
                  <span className={value ? 'done' : ''}>
                    {marketingActionLabels[key]}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
