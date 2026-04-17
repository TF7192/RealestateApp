import { useState, useEffect, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
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
  Edit3,
  Trash2,
  Link2,
  X,
} from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import MarketingActionDialog from '../components/MarketingActionDialog';
import ConfirmDialog from '../components/ConfirmDialog';
import './PropertyDetail.css';

const MARKETING_LABELS = {
  tabuExtract: 'הפקת נסח טאבו',
  photography: 'צילום הנכס',
  buildingPhoto: 'צילום הבניין',
  dronePhoto: 'צילום מקצועי רחפן',
  virtualTour: 'סיור וירטואלי',
  sign: 'תליית שלט',
  iList: 'i-list',
  yad2: 'יד 2',
  facebook: 'פייסבוק',
  marketplace: 'מרקט פלייס',
  onMap: 'on map',
  madlan: 'מדל״ן',
  whatsappGroup: 'קבוצת וואטס-אפ',
  officeWhatsapp: 'וואטס-אפ משרדי',
  externalCoop: 'שת״פ חיצוני',
  video: 'סרטון',
  neighborLetters: 'מכתבי שכנים',
  coupons: 'גזירונים',
  flyers: 'פלאיירים',
  newspaper: 'עיתון',
  agentTour: 'סיור סוכנים',
  openHouse: 'בית פתוח',
};

function formatPrice(price) {
  if (!price) return '—';
  if (price < 10000) return `₪${price.toLocaleString('he-IL')}/חודש`;
  return `₪${price.toLocaleString('he-IL')}`;
}

function buildFullWhatsAppMessage(prop, agent) {
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
  if (prop.assetClass === 'RESIDENTIAL') {
    lines.push(`🛡️ ממ״ד: ${prop.safeRoom ? 'יש' : 'אין'}`);
  }
  lines.push(`🛗 מעלית: ${prop.elevator ? 'יש' : 'אין'}`);
  if (prop.airDirections) lines.push(`🧭 כיווני אוויר: ${prop.airDirections}`);
  lines.push(`🛠️ מצב: ${prop.renovated || '—'}`);
  if (prop.vacancyDate) lines.push(`📅 פינוי: ${prop.vacancyDate}`);
  if (prop.notes) { lines.push(''); lines.push(prop.notes); }
  lines.push('');
  lines.push(`📷 פרטי הנכס:`);
  lines.push(`${window.location.origin}/p/${prop.id}`);
  if (agent?.displayName) {
    lines.push('');
    lines.push('—');
    lines.push(`👤 ${agent.displayName}`);
    if (agent.agency) lines.push(`🏢 ${agent.agency}`);
    if (agent.phone) lines.push(`📞 ${agent.phone}`);
    if (agent.bio) { lines.push(''); lines.push(agent.bio); }
  }
  return lines.join('\n');
}

export default function PropertyDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [property, setProperty] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [currentImage, setCurrentImage] = useState(0);
  const [copied, setCopied] = useState(false);
  const [reminder, setReminder] = useState('WEEKLY');
  const [actionDialog, setActionDialog] = useState(null);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = async () => {
    try {
      const res = await api.getProperty(id);
      setProperty(res.property);
      if (res.property?.marketingReminderFrequency) {
        setReminder(res.property.marketingReminderFrequency);
      }
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [id]);

  if (loading) {
    return (
      <div className="empty-state">
        <Building2 size={48} />
        <h3>טוען נכס…</h3>
      </div>
    );
  }
  if (err || !property) {
    return (
      <div className="empty-state">
        <Building2 size={48} />
        <h3>הנכס לא נמצא</h3>
        <p>{err || 'ייתכן שהנכס הוסר מהמערכת'}</p>
        <Link to="/properties" className="btn btn-primary" style={{ marginTop: 16 }}>
          חזרה לנכסים
        </Link>
      </div>
    );
  }

  const actionsDetail = property.marketingActionsDetail || {};
  const actionsMap = property.marketingActions || {};
  const done = Object.values(actionsMap).filter(Boolean).length;
  const total = Object.keys(MARKETING_LABELS).length;
  const pct = Math.round((done / total) * 100);

  const images = property.images?.length ? property.images : [
    'https://via.placeholder.com/1200x675?text=Estia',
  ];

  const mapsQuery = encodeURIComponent(`${property.street}, ${property.city}`);
  const mapsEmbed = `https://www.google.com/maps?q=${mapsQuery}&output=embed`;
  const mapsOpen = `https://www.google.com/maps/search/?api=1&query=${mapsQuery}`;

  const customerLink = `${window.location.origin}/p/${property.id}`;
  const handleCopyLink = () => {
    navigator.clipboard.writeText(customerLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleWhatsApp = () => {
    const text = buildFullWhatsAppMessage(property, {
      displayName: user?.displayName,
      agency: user?.agentProfile?.agency,
      phone: user?.phone,
      bio: user?.agentProfile?.bio,
    });
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await api.deleteProperty(property.id);
      navigate('/properties');
    } catch (e) {
      setErr(e.message);
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  const nextImage = () => setCurrentImage((c) => (c + 1) % images.length);
  const prevImage = () => setCurrentImage((c) => (c - 1 + images.length) % images.length);

  return (
    <div className="property-detail">
      <div className="detail-top-actions">
        <Link to="/properties" className="back-link animate-in">
          <ArrowRight size={16} />
          חזרה לנכסים
        </Link>
        <div className="detail-top-manage">
          <button className="btn btn-secondary btn-sm" onClick={() => setEditing(true)}>
            <Edit3 size={14} />
            עריכה
          </button>
          <button className="btn btn-danger btn-sm" onClick={() => setConfirmDelete(true)}>
            <Trash2 size={14} />
            מחיקה
          </button>
        </div>
      </div>

      {/* Gallery */}
      <div className="detail-gallery animate-in animate-in-delay-1">
        <div className="gallery-main">
          <img src={images[currentImage]} alt={property.street} />
          {images.length > 1 && (
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
            {currentImage + 1} / {images.length}
          </div>
        </div>
        {images.length > 1 && (
          <div className="gallery-thumbs">
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

      <div className="detail-content">
        <div className="detail-main animate-in animate-in-delay-2">
          <div className="detail-header">
            <div>
              <div className="detail-badges">
                <span className={`badge ${property.assetClass === 'COMMERCIAL' ? 'badge-warning' : 'badge-success'}`}>
                  {property.assetClass === 'COMMERCIAL' ? 'מסחרי' : 'מגורים'}
                </span>
                <span className={`badge ${property.category === 'SALE' ? 'badge-gold' : 'badge-info'}`}>
                  {property.category === 'SALE' ? 'מכירה' : 'השכרה'}
                </span>
                <span className="badge badge-gold">{property.type}</span>
              </div>
              <h2 className="detail-title">
                {property.street}, {property.city}
              </h2>
              <div className="detail-price">{formatPrice(property.marketingPrice)}</div>
            </div>
            <div className="detail-share-actions">
              <button className="btn btn-primary" onClick={handleWhatsApp}>
                <MessageCircle size={18} />
                שלח בוואטסאפ
              </button>
              <button className="btn btn-secondary" onClick={handleCopyLink}>
                <Copy size={16} />
                {copied ? 'הועתק!' : 'העתק קישור'}
              </button>
              <Link to={`/p/${property.id}`} target="_blank" className="btn btn-ghost">
                <ExternalLink size={16} />
                צפה כלקוח
              </Link>
            </div>
          </div>

          <div className="specs-grid">
            {property.rooms != null && (
              <Spec icon={Bed} value={property.rooms} label="חדרים" />
            )}
            <Spec icon={Maximize} value={`${property.sqm} מ״ר`} label="שטח" />
            <Spec icon={Building2} value={`${property.floor}/${property.totalFloors}`} label="קומה" />
            {property.balconySize > 0 && (
              <Spec icon={Wind} value={`${property.balconySize} מ״ר`} label="מרפסת" />
            )}
            <Spec icon={ParkingCircle} value={property.parking ? 'יש' : 'אין'} label="חניה" />
            <Spec icon={Warehouse} value={property.storage ? 'יש' : 'אין'} label="מחסן" />
            <Spec icon={Snowflake} value={property.ac ? 'יש' : 'אין'} label="מזגן" />
            <Spec icon={Shield} value={property.safeRoom ? 'יש' : 'אין'} label="ממ״ד" />
          </div>

          <div className="detail-map-card">
            <div className="detail-map-header">
              <h4><MapPin size={18} />מיקום הנכס</h4>
              <a href={mapsOpen} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm">
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
            <div className="detail-map-address">{property.street}, {property.city}</div>
          </div>

          {property.notes && (
            <div className="detail-notes">
              <h4>הערות</h4>
              <p>{property.notes}</p>
            </div>
          )}
        </div>

        <div className="detail-sidebar">
          <div className="card sidebar-card animate-in animate-in-delay-3">
            <h4><User size={18} />בעל הנכס</h4>
            <div className="owner-detail">
              <div className="owner-detail-avatar">{property.owner.charAt(0)}</div>
              <div>
                <span className="owner-detail-name">{property.owner}</span>
                <a href={`tel:${property.ownerPhone}`} className="owner-phone">
                  <Phone size={14} />
                  {property.ownerPhone}
                </a>
              </div>
            </div>
            <div className="owner-dates">
              {property.exclusiveStart && (
                <div>
                  <span className="date-label">תחילת בלעדיות</span>
                  <span className="date-value">
                    {new Date(property.exclusiveStart).toLocaleDateString('he-IL')}
                  </span>
                </div>
              )}
              {property.exclusiveEnd && (
                <div>
                  <span className="date-label">סיום בלעדיות</span>
                  <span className="date-value">
                    {new Date(property.exclusiveEnd).toLocaleDateString('he-IL')}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Marketing actions — each row opens a detailed dialog */}
          <div className="card sidebar-card animate-in animate-in-delay-4">
            <div className="marketing-header">
              <h4>פעולות שיווק</h4>
              <span className="badge badge-gold">{done}/{total}</span>
            </div>
            <div className="progress-bar" style={{ marginBottom: 16 }}>
              <div className="progress-fill" style={{ width: `${pct}%` }} />
            </div>
            <p className="marketing-hint">לחץ על פעולה כדי להוסיף קישור, תמונה או לסמן כהושלם</p>
            <div className="marketing-checklist">
              {Object.entries(MARKETING_LABELS).map(([key, label]) => {
                const detail = actionsDetail[key] || { done: false };
                return (
                  <button
                    type="button"
                    key={key}
                    className={`checklist-item interactive ${detail.done ? 'is-done' : ''}`}
                    onClick={() => setActionDialog({ key, detail })}
                  >
                    {detail.done ? (
                      <CheckCircle2 size={18} className="check-done" />
                    ) : (
                      <Circle size={18} className="check-pending" />
                    )}
                    <span className={detail.done ? 'done' : ''}>{label}</span>
                    {detail.link && <Link2 size={13} className="ma-row-icon" />}
                    {detail.notes && !detail.link && <FileText size={13} className="ma-row-icon" />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {actionDialog && (
        <MarketingActionDialog
          propertyId={property.id}
          actionKey={actionDialog.key}
          initial={actionDialog.detail}
          onClose={() => setActionDialog(null)}
          onSaved={async () => {
            setActionDialog(null);
            await load();
          }}
        />
      )}

      {editing && (
        <PropertyEditDialog
          property={property}
          onClose={() => setEditing(false)}
          onSaved={async () => {
            setEditing(false);
            await load();
          }}
        />
      )}

      {confirmDelete && (
        <ConfirmDialog
          title="מחיקת נכס"
          message={`האם למחוק את "${property.street}, ${property.city}"? פעולה זו אינה הפיכה.`}
          confirmLabel="מחק נכס"
          onConfirm={handleDelete}
          onClose={() => setConfirmDelete(false)}
          busy={deleting}
        />
      )}
    </div>
  );
}

function Spec({ icon: Icon, value, label }) {
  return (
    <div className="spec-item">
      <Icon size={20} />
      <div>
        <span className="spec-value">{value}</span>
        <span className="spec-label">{label}</span>
      </div>
    </div>
  );
}

function PropertyEditDialog({ property, onClose, onSaved }) {
  const [form, setForm] = useState({
    type: property.type || '',
    street: property.street || '',
    city: property.city || '',
    owner: property.owner || '',
    ownerPhone: property.ownerPhone || '',
    marketingPrice: property.marketingPrice ?? '',
    closingPrice: property.closingPrice ?? '',
    sqm: property.sqm ?? '',
    rooms: property.rooms ?? '',
    floor: property.floor ?? '',
    totalFloors: property.totalFloors ?? '',
    balconySize: property.balconySize ?? '',
    buildingAge: property.buildingAge ?? '',
    renovated: property.renovated || '',
    vacancyDate: property.vacancyDate || '',
    sector: property.sector || 'כללי',
    airDirections: property.airDirections || '',
    notes: property.notes || '',
    elevator: !!property.elevator,
    parking: !!property.parking,
    storage: !!property.storage,
    ac: !!property.ac,
    safeRoom: !!property.safeRoom,
    status: property.status || 'ACTIVE',
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const update = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      const body = {
        type: form.type,
        street: form.street,
        city: form.city,
        owner: form.owner,
        ownerPhone: form.ownerPhone,
        marketingPrice: Number(form.marketingPrice) || 0,
        closingPrice: form.closingPrice !== '' ? Number(form.closingPrice) : null,
        sqm: Number(form.sqm) || 0,
        rooms: form.rooms !== '' ? Number(form.rooms) : null,
        floor: form.floor !== '' ? Number(form.floor) : null,
        totalFloors: form.totalFloors !== '' ? Number(form.totalFloors) : null,
        balconySize: Number(form.balconySize) || 0,
        buildingAge: form.buildingAge !== '' ? Number(form.buildingAge) : null,
        renovated: form.renovated || null,
        vacancyDate: form.vacancyDate || null,
        sector: form.sector || null,
        airDirections: form.airDirections || null,
        notes: form.notes || null,
        elevator: form.elevator,
        parking: form.parking,
        storage: form.storage,
        ac: form.ac,
        safeRoom: form.safeRoom,
        status: form.status,
      };
      await api.updateProperty(property.id, body);
      onSaved();
    } catch (e) {
      setErr(e.message || 'עדכון נכשל');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="agreement-backdrop" onClick={onClose}>
      <div className="agreement-modal" onClick={(e) => e.stopPropagation()}>
        <header className="agreement-header">
          <div>
            <h3>עריכת נכס</h3>
            <p>{property.street}, {property.city}</p>
          </div>
          <button className="btn-ghost" onClick={onClose}><X size={18} /></button>
        </header>
        <div className="agreement-body">
          {err && <div className="agreement-error">{err}</div>}
          <div className="deal-form-grid">
            <Field label="סוג"><input className="form-input" value={form.type} onChange={(e) => update('type', e.target.value)} /></Field>
            <Field label="סטטוס">
              <select className="form-select" value={form.status} onChange={(e) => update('status', e.target.value)}>
                <option value="ACTIVE">פעיל</option>
                <option value="PAUSED">מושהה</option>
                <option value="SOLD">נמכר</option>
                <option value="RENTED">הושכר</option>
                <option value="ARCHIVED">בארכיון</option>
              </select>
            </Field>
            <Field label="רחוב ומספר"><input className="form-input" value={form.street} onChange={(e) => update('street', e.target.value)} /></Field>
            <Field label="עיר"><input className="form-input" value={form.city} onChange={(e) => update('city', e.target.value)} /></Field>
            <Field label="בעל הנכס"><input className="form-input" value={form.owner} onChange={(e) => update('owner', e.target.value)} /></Field>
            <Field label="טלפון בעלים"><input className="form-input" value={form.ownerPhone} onChange={(e) => update('ownerPhone', e.target.value)} /></Field>
            <Field label="מחיר שיווק"><input type="number" className="form-input" value={form.marketingPrice} onChange={(e) => update('marketingPrice', e.target.value)} /></Field>
            <Field label="מחיר סגירה"><input type="number" className="form-input" value={form.closingPrice} onChange={(e) => update('closingPrice', e.target.value)} /></Field>
            <Field label="מ״ר"><input type="number" className="form-input" value={form.sqm} onChange={(e) => update('sqm', e.target.value)} /></Field>
            <Field label="חדרים"><input type="number" step="0.5" className="form-input" value={form.rooms} onChange={(e) => update('rooms', e.target.value)} /></Field>
            <Field label="קומה"><input type="number" className="form-input" value={form.floor} onChange={(e) => update('floor', e.target.value)} /></Field>
            <Field label="סה״כ קומות"><input type="number" className="form-input" value={form.totalFloors} onChange={(e) => update('totalFloors', e.target.value)} /></Field>
            <Field label="גודל מרפסת"><input type="number" className="form-input" value={form.balconySize} onChange={(e) => update('balconySize', e.target.value)} /></Field>
            <Field label="בניין בן"><input type="number" className="form-input" value={form.buildingAge} onChange={(e) => update('buildingAge', e.target.value)} /></Field>
            <Field label="מצב הנכס"><input className="form-input" value={form.renovated} onChange={(e) => update('renovated', e.target.value)} /></Field>
            <Field label="תאריך פינוי"><input className="form-input" value={form.vacancyDate} onChange={(e) => update('vacancyDate', e.target.value)} /></Field>
            <Field label="כיווני אוויר"><input className="form-input" value={form.airDirections} onChange={(e) => update('airDirections', e.target.value)} /></Field>
            <Field label="מגזר">
              <select className="form-select" value={form.sector} onChange={(e) => update('sector', e.target.value)}>
                <option>כללי</option><option>דתי</option><option>חרדי</option><option>ערבי</option>
              </select>
            </Field>
            <Field label="הערות" wide>
              <textarea className="form-textarea" rows={3} value={form.notes} onChange={(e) => update('notes', e.target.value)} />
            </Field>
          </div>
          <div className="checkbox-grid" style={{ marginTop: 8 }}>
            {[
              { key: 'elevator', label: 'מעלית' },
              { key: 'parking', label: 'חניה' },
              { key: 'storage', label: 'מחסן' },
              { key: 'ac', label: 'מזגנים' },
              { key: 'safeRoom', label: 'ממ״ד' },
            ].map(({ key, label }) => (
              <label key={key} className="checkbox-item">
                <input type="checkbox" checked={form[key]} onChange={(e) => update(key, e.target.checked)} />
                <span className="checkbox-custom" />
                {label}
              </label>
            ))}
          </div>
          <div className="deal-form-actions">
            <button className="btn btn-primary" onClick={save} disabled={busy}>
              {busy ? 'שומר…' : 'שמור שינויים'}
            </button>
            <button className="btn btn-secondary" onClick={onClose}>ביטול</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children, wide }) {
  return (
    <div className={`form-group ${wide ? 'form-group-wide' : ''}`}>
      <label className="form-label">{label}</label>
      {children}
    </div>
  );
}
