import { useState, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowRight, Share2, Heart, PhoneCall, MessageCircle, Navigation,
  Bed, Maximize, Building2, Car, Wind, Archive, Shield, Building,
  Calendar, User, Clock, Edit3, Check, CheckCircle2,
} from 'lucide-react';
import { properties, formatPrice, marketingActionLabels, getAssetClassLabel, agentProfile } from '../../data/mockData';
import { formatFloor } from '../../lib/formatFloor';
import { haptics, openExternal, shareSheet } from '../../native';
import { telUrl, whatsappUrl, wazeUrl, publicPropertyUrl } from '../../native/actions';
import { useToast } from '../components/Toast';

function buildWaMessage(prop) {
  const lines = [
    `*${prop.type} — ${prop.street}, ${prop.city}*`, '',
    `מחיר: ${formatPrice(prop.marketingPrice)}`,
    `שטח: ${prop.sqm} מ״ר`,
  ];
  if (prop.rooms != null) lines.push(`חדרים: ${prop.rooms}`);
  if (prop.floor != null) lines.push(`קומה: ${formatFloor(prop.floor, prop.totalFloors)}`);
  if (prop.balconySize > 0) lines.push(`מרפסת: ${prop.balconySize} מ״ר`);
  lines.push(`חניה: ${prop.parking ? 'יש' : 'אין'}  ·  מחסן: ${prop.storage ? 'יש' : 'אין'}`);
  lines.push(`מזגנים: ${prop.ac ? 'יש' : 'אין'}  ·  ממ״ד: ${prop.safeRoom ? 'יש' : 'אין'}`);
  lines.push(`מעלית: ${prop.elevator ? 'יש' : 'אין'}  ·  מצב: ${prop.renovated}`);
  if (prop.notes) { lines.push(''); lines.push(prop.notes); }
  lines.push('', '📷 תמונות ופרטים נוספים:', publicPropertyUrl(prop.id), '',
    `${agentProfile.name} | ${agentProfile.agency} | ${agentProfile.phone}`);
  return lines.join('\n');
}

export default function MobilePropertyDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const prop = properties.find((p) => String(p.id) === String(id));
  const [slide, setSlide] = useState(0);
  const [fav, setFav] = useState(false);
  const track = useRef(null);

  if (!prop) {
    return (
      <div className="m-page">
        <div className="m-empty">
          <div className="m-empty-ring"><Building2 size={30} /></div>
          <h3>הנכס לא נמצא</h3>
          <Link to="/properties" className="m-section-link" style={{ marginTop: 16 }}>חזרה לרשימה</Link>
        </div>
      </div>
    );
  }

  const onScroll = () => {
    if (!track.current) return;
    const w = track.current.clientWidth;
    const i = Math.round(track.current.scrollLeft / w);
    if (i !== slide) { setSlide(i); haptics.select(); }
  };

  const call = () => {
    if (!prop.ownerPhone) { toast({ message: 'אין מספר טלפון', tone: 'error' }); return; }
    haptics.press();
    openExternal(telUrl(prop.ownerPhone));
  };
  const wa = () => {
    haptics.press();
    openExternal(whatsappUrl('', buildWaMessage(prop)));
  };
  const nav = () => {
    haptics.press();
    openExternal(wazeUrl({ lat: prop.lat, lng: prop.lng, address: `${prop.street} ${prop.city}` }));
  };
  const share = async () => {
    haptics.tap();
    const r = await shareSheet({
      title: `${prop.type} ב${prop.city}`,
      text: `${prop.street}, ${prop.city} · ${formatPrice(prop.marketingPrice)}`,
      url: publicPropertyUrl(prop.id),
    });
    if (r === 'copied') toast({ message: 'הקישור הועתק' });
  };
  const toggleFav = () => {
    haptics.tap();
    setFav((f) => !f);
    toast({ message: fav ? 'הוסר מהמועדפים' : 'נוסף למועדפים' });
  };

  const actionsDone = Object.values(prop.marketingActions).filter(Boolean).length;
  const actionsTotal = Object.values(prop.marketingActions).length;
  const pct = Math.round((actionsDone / actionsTotal) * 100);

  return (
    <div className="m-detail">
      {/* HERO */}
      <div className="m-detail-hero">
        <div
          className="m-gallery-track"
          ref={track}
          onScroll={onScroll}
          style={{ height: 360 }}
        >
          {prop.images.map((img, i) => (
            <img key={i} src={img} alt={`${prop.street} ${i + 1}`} loading={i === 0 ? 'eager' : 'lazy'} />
          ))}
        </div>
        <div className="m-gallery-gradient" />
        {prop.images.length > 1 && (
          <div className="m-gallery-dots">
            {prop.images.map((_, i) => (
              <span key={i} className={i === slide ? 'active' : ''} />
            ))}
          </div>
        )}

        <div className="m-gallery-top">
          <button
            className="m-icon-btn"
            onClick={() => { haptics.tap(); navigate(-1); }}
            aria-label="חזרה"
            style={{ background: 'rgba(13,15,20,0.7)', backdropFilter: 'blur(12px)' }}
          >
            <ArrowRight size={18} />
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="m-icon-btn"
              onClick={share}
              aria-label="שתף"
              style={{ background: 'rgba(13,15,20,0.7)', backdropFilter: 'blur(12px)' }}
            >
              <Share2 size={18} />
            </button>
            <button
              className="m-icon-btn"
              onClick={toggleFav}
              aria-label="מועדף"
              style={{
                background: 'rgba(13,15,20,0.7)',
                color: fav ? '#f87171' : 'var(--text-primary)',
                backdropFilter: 'blur(12px)'
              }}
            >
              <Heart size={18} fill={fav ? '#f87171' : 'none'} />
            </button>
          </div>
        </div>

        <div className="m-detail-meta">
          <div className="m-detail-price">{formatPrice(prop.marketingPrice)}</div>
          <div className="m-detail-addr">{prop.street}</div>
          <div className="m-detail-city">
            {prop.city} · {prop.type} · {getAssetClassLabel(prop.assetClass)}
          </div>
        </div>
      </div>

      {/* BODY */}
      <div className="m-page" style={{ paddingBottom: 120 }}>
        {/* Quick spec chips */}
        <div className="m-chip-row" style={{ marginTop: 14 }}>
          {prop.rooms != null && <span className="m-chip ghost"><Bed size={14} />{prop.rooms} חד׳</span>}
          <span className="m-chip ghost"><Maximize size={14} />{prop.sqm} מ״ר</span>
          {prop.floor != null && (
            <span className="m-chip ghost"><Building size={14} />קומה {formatFloor(prop.floor, prop.totalFloors)}</span>
          )}
          <span className="m-chip ghost">{prop.renovated}</span>
          <span className="m-chip ghost">
            {prop.buildingAge === 0 ? 'חדש' : `בניין בן ${prop.buildingAge}`}
          </span>
        </div>

        <SectionHeader title="מפרט הנכס" />
        <div className="m-spec-grid">
          <Spec icon={<Car size={16} />} label="חניה" value={prop.parking ? 'יש' : 'אין'} />
          <Spec icon={<Archive size={16} />} label="מחסן" value={prop.storage ? 'יש' : 'אין'} />
          <Spec icon={<Wind size={16} />} label="מזגנים" value={prop.ac ? 'יש' : 'אין'} />
          <Spec icon={<Shield size={16} />} label="ממ״ד" value={prop.safeRoom ? 'יש' : 'אין'} />
          <Spec icon={<Building size={16} />} label="מעלית" value={prop.elevator ? 'יש' : 'אין'} />
          <Spec icon={<Wind size={16} />} label="כיווני אוויר" value={prop.airDirections || '—'} />
          {prop.balconySize > 0 && (
            <Spec icon={<Maximize size={16} />} label="מרפסת" value={`${prop.balconySize} מ״ר`} />
          )}
          <Spec icon={<Calendar size={16} />} label="פינוי" value={prop.vacancyDate} />
        </div>

        {prop.notes && (
          <>
            <SectionHeader title="הערות" />
            <div className="m-card">
              <p style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.7 }}>
                {prop.notes}
              </p>
            </div>
          </>
        )}

        <SectionHeader title="בעל הנכס" />
        <div className="m-card" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div className="m-lead-avatar" style={{ width: 50, height: 50, fontSize: 20 }}>
            {prop.owner.charAt(0)}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 17, color: 'var(--text-primary)' }}>
              {prop.owner}
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', direction: 'ltr', textAlign: 'right' }}>
              {prop.ownerPhone}
            </div>
          </div>
          <button className="m-icon-btn gold" onClick={call} aria-label="התקשר">
            <PhoneCall size={18} />
          </button>
        </div>

        <SectionHeader title="ייחודיות ועדכונים" />
        <div className="m-card">
          <Row icon={<Calendar size={14} />} label="תקופת ייחודיות" value={`${formatDate(prop.exclusiveStart)} — ${formatDate(prop.exclusiveEnd)}`} />
          <Row icon={<Clock size={14} />} label="קשר אחרון" value={formatDate(prop.lastContact)} />
          {prop.lastContactNotes && (
            <Row icon={<Edit3 size={14} />} label="" value={prop.lastContactNotes} />
          )}
          {prop.offer && (
            <Row icon={<User size={14} />} label="הצעה אחרונה" value={formatPrice(prop.offer)} highlight />
          )}
        </div>

        <SectionHeader title={`פעולות שיווק · ${actionsDone}/${actionsTotal}`} />
        <div className="m-card">
          <div className="m-progress" style={{ marginBottom: 14 }}>
            <div className="m-progress-fill" style={{ width: `${pct}%` }} />
          </div>
          <div className="m-actions-list">
            {Object.entries(prop.marketingActions).map(([key, done]) => (
              <div key={key} className={`m-action-row ${done ? 'done' : ''}`}>
                <span className="m-action-check">
                  {done ? <CheckCircle2 size={14} /> : <Check size={14} style={{ opacity: 0.25 }} />}
                </span>
                <span>{marketingActionLabels[key] || key}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* STICKY ACTION BAR */}
      <div className="m-action-bar">
        <button className="m-action-bar-btn" onClick={nav}>
          <Navigation size={16} />
          ניווט
        </button>
        <button className="m-action-bar-btn" onClick={call}>
          <PhoneCall size={16} />
          התקשר
        </button>
        <button className="m-action-bar-btn wa" onClick={wa}>
          <MessageCircle size={16} />
          שלח ללקוח
        </button>
      </div>

      <style>{`
        .m-detail { padding-bottom: 0; }
        .m-detail-hero { height: 360px; overflow: hidden; position: relative; }
        .m-gallery-track {
          display: flex; overflow-x: auto; scroll-snap-type: x mandatory;
          scrollbar-width: none; height: 360px;
        }
        .m-gallery-track::-webkit-scrollbar { display: none; }
        .m-gallery-track img {
          flex: 0 0 100%; width: 100%; height: 100%;
          object-fit: cover; scroll-snap-align: start;
        }
        .m-actions-list {
          display: grid; grid-template-columns: 1fr 1fr; gap: 6px 14px;
        }
        .m-action-row {
          display: flex; align-items: center; gap: 8px;
          font-size: 12.5px; color: var(--text-muted);
        }
        .m-action-row.done { color: var(--text-primary); }
        .m-action-row.done .m-action-check { color: var(--success); }
      `}</style>
    </div>
  );
}

function SectionHeader({ title }) {
  return <h3 className="m-section-title" style={{ marginTop: 28, marginBottom: 12 }}>{title}</h3>;
}

function Spec({ icon, label, value }) {
  return (
    <div className="m-spec">
      <div className="m-spec-icon">{icon}</div>
      <div style={{ minWidth: 0 }}>
        <div className="m-spec-label">{label}</div>
        <div className="m-spec-value">{value}</div>
      </div>
    </div>
  );
}

function Row({ icon, label, value, highlight }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between',
      alignItems: 'center', padding: '10px 0',
      borderBottom: '1px solid var(--m-hairline)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)', fontSize: 12 }}>
        {icon}
        {label && <span>{label}</span>}
      </div>
      <span style={{
        fontSize: 14,
        color: highlight ? 'var(--gold-light)' : 'var(--text-primary)',
        fontWeight: highlight ? 600 : 400,
        fontFamily: highlight ? 'var(--font-display)' : 'var(--font-body)',
      }}>{value}</span>
    </div>
  );
}

function formatDate(str) {
  if (!str) return '—';
  try {
    const d = new Date(str);
    return d.toLocaleDateString('he-IL', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch { return str; }
}
