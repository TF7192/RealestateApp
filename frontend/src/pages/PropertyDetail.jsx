import { useState, useEffect, useRef } from 'react';
import { useParams, useLocation, Link, useNavigate } from 'react-router-dom';
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
  Copy,
  ChevronLeft,
  ChevronRight,
  User,
  FileText,
  Edit3,
  Trash2,
  Link2,
  X,
  Images,
  Film,
  ArrowLeftRight,
  Navigation,
  Check,
  Share2,
  Clock,
} from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import MarketingActionDialog from '../components/MarketingActionDialog';
import ConfirmDialog from '../components/ConfirmDialog';
import PropertyPhotoManager from '../components/PropertyPhotoManager';
import PropertyVideoManager from '../components/PropertyVideoManager';
import WhatsAppSheet from '../components/WhatsAppSheet';
import TransferPropertyDialog from '../components/TransferPropertyDialog';
import LeadPickerSheet from '../components/LeadPickerSheet';
import StickyActionBar from '../components/StickyActionBar';
import WhatsAppIcon from '../components/WhatsAppIcon';
import { useCopyFeedback, useViewportMobile, useViewportDesktop } from '../hooks/mobile';
import { openWhatsApp, shareWithPhotos } from '../native/share';
import { telUrl, wazeUrl, waUrl } from '../lib/waLink';
import { shareSheet } from '../native/share';
import { leadMatchesProperty } from './Properties';
import {
  buildVariables as tplBuildVars,
  renderTemplate as tplRender,
  pickTemplateKind as tplPickKind,
} from '../lib/templates';
import { useToast } from '../lib/toast';
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

// Group the 22 actions into three scannable sections so the agent can find
// and mark the one they want in a couple of glances instead of scrolling.
const MARKETING_GROUPS = [
  {
    key: 'digital',
    label: 'פרסום דיגיטלי',
    keys: ['iList', 'yad2', 'facebook', 'marketplace', 'onMap', 'madlan', 'virtualTour', 'video'],
  },
  {
    key: 'field',
    label: 'שטח ופרינט',
    keys: ['sign', 'tabuExtract', 'photography', 'buildingPhoto', 'dronePhoto', 'flyers', 'coupons', 'newspaper', 'neighborLetters'],
  },
  {
    key: 'agent',
    label: 'פעילות סוכנים',
    keys: ['whatsappGroup', 'officeWhatsapp', 'externalCoop', 'agentTour', 'openHouse'],
  },
];

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
  const pUrl = prop.slug && agent?.slug
    ? `${window.location.origin}/agents/${encodeURI(agent.slug)}/${encodeURI(prop.slug)}`
    : `${window.location.origin}/p/${prop.id}`;
  lines.push(pUrl);
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

const TAB_KEYS = ['details', 'marketing', 'photos', 'history'];

export default function PropertyDetail() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const toast = useToast();
  const isMobile = useViewportMobile(820);
  const isDesktop = useViewportDesktop(1100); // P1-D1 — 2-column rail at >=1100px
  const { copied, copy } = useCopyFeedback();
  const [property, setProperty] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [currentImage, setCurrentImage] = useState(0);
  const [reminder, setReminder] = useState('WEEKLY');
  const [actionDialog, setActionDialog] = useState(null);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [managingPhotos, setManagingPhotos] = useState(false);
  const [managingVideos, setManagingVideos] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [waShare, setWaShare] = useState(null);
  const [templates, setTemplates] = useState(null);
  const [leads, setLeads] = useState([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerLeadsOverride, setPickerLeadsOverride] = useState(null); // P3-M9
  const [lightboxIdx, setLightboxIdx] = useState(null);
  const [dragOver, setDragOver] = useState(false); // P2-D5 — drag-to-upload
  const stripRef = useRef(null);

  // P2-M14 — tab state, persisted via URL hash on mobile
  const initialTab = (() => {
    const h = (location.hash || '').replace('#', '');
    return TAB_KEYS.includes(h) ? h : 'details';
  })();
  const [activeTab, setActiveTab] = useState(initialTab);

  useEffect(() => {
    const onHash = () => {
      const h = (window.location.hash || '').replace('#', '');
      if (TAB_KEYS.includes(h)) setActiveTab(h);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const switchTab = (t) => {
    setActiveTab(t);
    try {
      window.history.replaceState(null, '', `#${t}`);
    } catch { /* ignore */ }
  };

  useEffect(() => {
    api.listTemplates().then((r) => setTemplates(r.templates || [])).catch(() => {});
    api.listLeads().then((r) => setLeads(r.items || r.leads || [])).catch(() => {});
  }, []);

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

  // P2-D6 — Clipboard image paste: while on this page, pasted images upload to the property.
  useEffect(() => {
    const onPaste = async (e) => {
      if (!property) return;
      const items = e.clipboardData?.items || [];
      let uploaded = 0;
      for (const item of items) {
        if (item.type && item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            try {
              await api.uploadPropertyImage(property.id, file);
              uploaded += 1;
            } catch (err) {
              toast?.error?.(err?.message || 'העלאת התמונה נכשלה');
            }
          }
        }
      }
      if (uploaded > 0) {
        toast?.success?.(`${uploaded} תמונות הועלו`);
        await load();
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [property?.id]);

  // P2-D15 — Keyboard nav for gallery: ArrowLeft/Right cycles, F = fullscreen, Esc = close.
  useEffect(() => {
    const onKey = (e) => {
      const tag = (document.activeElement?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      const len = property?.images?.length || 0;
      if (e.key === 'ArrowLeft')  setCurrentImage((i) => Math.max(0, i - 1));
      if (e.key === 'ArrowRight') setCurrentImage((i) => Math.min(Math.max(0, len - 1), i + 1));
      if ((e.key === 'f' || e.key === 'F') && lightboxIdx == null && len > 0) {
        setLightboxIdx(currentImage);
      }
      if (e.key === 'Escape' && lightboxIdx != null) setLightboxIdx(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [currentImage, lightboxIdx, property?.images?.length]);


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

  // Prefer SEO-friendly slug URL when both agent + property slugs exist.
  // The legacy /p/:id link is kept as a fallback so older share links keep
  // working (the route resolves either shape).
  const customerLink = property.slug && user?.slug
    ? `${window.location.origin}/agents/${encodeURI(user.slug)}/${encodeURI(property.slug)}`
    : `${window.location.origin}/p/${property.id}`;

  const buildMessage = () => {
    const kind = tplPickKind(property, 'client');
    const tpl = templates?.find((t) => t.kind === kind);
    if (tpl?.body) {
      const vars = tplBuildVars(property, user, { stripAgent: false });
      return tplRender(tpl.body, vars);
    }
    return buildFullWhatsAppMessage(property, {
      displayName: user?.displayName,
      agency: user?.agentProfile?.agency,
      phone: user?.phone,
      bio: user?.agentProfile?.bio,
    });
  };

  // P3-M9 — Smart matching:
  //  · 1 match  → open WhatsApp with that lead's phone directly (skip picker)
  //  · 2-5 matches → open picker filtered to only those leads
  //  · 0 (or > 5) → open the full picker
  const handleWhatsApp = () => {
    const matches = (leads || []).filter((l) => leadMatchesProperty(l, property));
    if (matches.length === 1) {
      const lead = matches[0];
      const text = buildMessage();
      window.open(waUrl(lead.phone, text), '_blank', 'noopener,noreferrer');
      return;
    }
    if (matches.length >= 2 && matches.length <= 5) {
      setPickerLeadsOverride(matches);
      setPickerOpen(true);
      return;
    }
    setPickerLeadsOverride(null);
    setPickerOpen(true);
  };

  const handlePickLead = async (lead, editedText, opts) => {
    setPickerOpen(false);
    setPickerLeadsOverride(null);
    const text = editedText || buildMessage();
    // "Share with photos" path — iOS native share sheet, photos attached
    if (opts?.withPhotos) {
      await shareWithPhotos({
        photos: opts.photos,
        text,
        title: `${property.street}, ${property.city}`,
        url: customerLink,
      });
      return;
    }
    // Native deep link on iOS, wa.me in browser on web
    await openWhatsApp({ phone: lead?.phone, text });
  };

  // P1-M13 — Native share
  const handleShare = async () => {
    await shareSheet({
      title: property.street,
      text: buildMessage(),
      url: window.location.origin + '/p/' + property.id,
    });
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

  const nextImage = () => {
    const next = (currentImage + 1) % images.length;
    setCurrentImage(next);
    if (stripRef.current) {
      const w = stripRef.current.clientWidth;
      stripRef.current.scrollTo({ left: -(next * w), behavior: 'smooth' });
    }
  };
  const prevImage = () => {
    const next = (currentImage - 1 + images.length) % images.length;
    setCurrentImage(next);
    if (stripRef.current) {
      const w = stripRef.current.clientWidth;
      stripRef.current.scrollTo({ left: -(next * w), behavior: 'smooth' });
    }
  };
  const handleStripScroll = () => {
    const el = stripRef.current;
    if (!el) return;
    const w = el.clientWidth;
    // RTL: scrollLeft is zero or negative; use abs.
    const idx = Math.round(Math.abs(el.scrollLeft) / w);
    if (idx !== currentImage && idx < images.length) setCurrentImage(idx);
  };

  // P2-M14 — section visibility: on desktop everything is shown; on mobile only the active tab.
  const showDetails   = !isMobile || activeTab === 'details';
  const showMarketing = !isMobile || activeTab === 'marketing';
  const showPhotos    = !isMobile || activeTab === 'photos';
  const showHistory   = !isMobile || activeTab === 'history';

  // P1-D1 — exclusivity countdown helper (days until end)
  const exclusivityDaysLeft = (() => {
    if (!property.exclusiveEnd) return null;
    const ms = new Date(property.exclusiveEnd).getTime() - Date.now();
    if (Number.isNaN(ms)) return null;
    return Math.ceil(ms / 86400000);
  })();

  // Reusable marketing-actions card (rendered in sidebar by default; in left column on desktop ≥1100px)
  const marketingActionsCard = showMarketing ? (
    <div className="card sidebar-card animate-in animate-in-delay-4">
      <div className="marketing-header">
        <h4>פעולות שיווק</h4>
        <span className="badge badge-gold">{done}/{total}</span>
      </div>
      <div className="progress-bar" style={{ marginBottom: 16 }}>
        <div className="progress-fill" style={{ width: `${pct}%` }} />
      </div>
      <p className="marketing-hint">סמן כהושלם בלחיצה · פרטים נוספים בכפתור הצד</p>

      {MARKETING_GROUPS.map((group) => {
        const gTotal = group.keys.length;
        const groupDone = group.keys.filter((k) => actionsMap[k]).length;
        return (
          <MarketingGroup
            key={group.key}
            id={group.key}
            label={group.label}
            done={groupDone}
            total={gTotal}
          >
            <div className="marketing-checklist">
              {group.keys.map((key) => {
                const label = MARKETING_LABELS[key];
                const detail = actionsDetail[key] || { done: false };
                const handleToggle = async () => {
                  const nextDone = !detail.done;
                  const next = {
                    ...property,
                    marketingActions: { ...actionsMap, [key]: nextDone },
                    marketingActionsDetail: {
                      ...actionsDetail,
                      [key]: { ...detail, done: nextDone, doneAt: nextDone ? new Date().toISOString() : null },
                    },
                  };
                  setProperty(next);
                  try {
                    await api.toggleMarketingAction(property.id, {
                      actionKey: key,
                      done: nextDone,
                      notes: detail.notes || null,
                      link: detail.link || null,
                    });
                    toast.success(nextDone ? `${label} · סומן כהושלם` : `${label} · סימון הוסר`);
                  } catch (e) {
                    setProperty(property);
                    toast.error(e?.message || 'שגיאה — השינוי בוטל');
                  }
                };
                return (
                  <div key={key} className={`checklist-item interactive ${detail.done ? 'is-done' : ''}`}>
                    <button
                      type="button"
                      className="checklist-toggle"
                      onClick={handleToggle}
                    >
                      {detail.done ? (
                        <CheckCircle2 size={18} className="check-done" />
                      ) : (
                        <Circle size={18} className="check-pending" />
                      )}
                      <span className={detail.done ? 'done' : ''}>{label}</span>
                    </button>
                    <button
                      type="button"
                      className="checklist-detail-btn"
                      onClick={() => setActionDialog({ key, detail })}
                      title="פרטים / העלאה / קישור"
                      aria-label={`פרטי ${label}`}
                    >
                      {detail.link
                        ? <Link2 size={13} />
                        : detail.notes
                        ? <FileText size={13} />
                        : <FileText size={13} style={{ opacity: 0.4 }} />}
                    </button>
                  </div>
                );
              })}
            </div>
          </MarketingGroup>
        );
      })}
    </div>
  ) : null;

  return (
    <div className="property-detail">
      <div className="detail-top-actions">
        <Link to="/properties" className="back-link animate-in">
          <ArrowRight size={16} />
          חזרה לנכסים
        </Link>
        {!isDesktop && (
          <div className="detail-top-manage">
            <button className="btn btn-secondary btn-sm" onClick={() => setTransferOpen(true)}>
              <ArrowLeftRight size={14} />
              העבר נכס
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => setEditing(true)}>
              <Edit3 size={14} />
              עריכה
            </button>
            <button className="btn btn-danger btn-sm" onClick={() => setConfirmDelete(true)}>
              <Trash2 size={14} />
              מחיקה
            </button>
          </div>
        )}
      </div>

      {/* P2-M14 — compact mobile header above tabs (title + price always visible) */}
      {isMobile && (
        <div className="pd-mobile-head animate-in">
          <div className="detail-badges">
            <span className={`badge ${property.assetClass === 'COMMERCIAL' ? 'badge-warning' : 'badge-success'}`}>
              {property.assetClass === 'COMMERCIAL' ? 'מסחרי' : 'מגורים'}
            </span>
            <span className={`badge ${property.category === 'SALE' ? 'badge-gold' : 'badge-info'}`}>
              {property.category === 'SALE' ? 'מכירה' : 'השכרה'}
            </span>
            <span className="badge badge-gold">{property.type}</span>
          </div>
          <h2 className="detail-title">{property.street}, {property.city}</h2>
          <div className="detail-price">{formatPrice(property.marketingPrice)}</div>
        </div>
      )}

      {/* P2-M14 — mobile tab bar */}
      {isMobile && (
        <div className="pd-tabs" role="tablist" aria-label="פרטי נכס">
          {[
            { key: 'details',   label: 'פרטים' },
            { key: 'marketing', label: 'שיווק' },
            { key: 'photos',    label: 'תמונות' },
            { key: 'history',   label: 'היסטוריה' },
          ].map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={activeTab === t.key}
              className={`pd-tab ${activeTab === t.key ? 'active' : ''}`}
              onClick={() => switchTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {/* Gallery */}
      {showPhotos && (
      <div
        className={`detail-gallery animate-in animate-in-delay-1 ${dragOver ? 'pd-drag-over' : ''}`}
        onDragOver={(e) => {
          if (!Array.from(e.dataTransfer?.types || []).includes('Files')) return;
          e.preventDefault();
          if (!dragOver) setDragOver(true);
        }}
        onDragLeave={(e) => {
          // only clear when leaving the gallery boundary, not children
          if (e.currentTarget.contains(e.relatedTarget)) return;
          setDragOver(false);
        }}
        onDrop={async (e) => {
          e.preventDefault();
          setDragOver(false);
          const files = Array.from(e.dataTransfer?.files || []).filter((f) => f.type.startsWith('image/'));
          if (!files.length) return;
          let uploaded = 0;
          for (const file of files) {
            try {
              await api.uploadPropertyImage(property.id, file);
              uploaded += 1;
            } catch (err) {
              toast?.error?.(err?.message || 'העלאת התמונה נכשלה');
            }
          }
          if (uploaded > 0) {
            toast?.success?.(`${uploaded} תמונות הועלו`);
            await load();
          }
        }}
      >
        {dragOver && (
          <div className="pd-drop-overlay" aria-hidden="true">
            <Images size={28} />
            <span>שחרר כאן להעלאה</span>
          </div>
        )}
        <div className="gallery-main">
          <div
            ref={stripRef}
            className="gallery-strip"
            onScroll={handleStripScroll}
          >
            {images.map((img, i) => (
              <button
                key={i}
                type="button"
                className="gallery-slide"
                onClick={() => setLightboxIdx(i)}
                aria-label={`פתח תמונה ${i + 1}`}
              >
                <img src={img} alt={`${property.street} — ${i + 1}`} loading="lazy" />
              </button>
            ))}
          </div>
          {images.length > 1 && (
            <>
              <button className="gallery-nav prev" onClick={prevImage} aria-label="תמונה קודמת">
                <ChevronRight size={20} />
              </button>
              <button className="gallery-nav next" onClick={nextImage} aria-label="תמונה הבאה">
                <ChevronLeft size={20} />
              </button>
            </>
          )}
          <div className="gallery-counter">
            {currentImage + 1} / {images.length}
          </div>
          <button
            className="gallery-manage-btn"
            onClick={() => setManagingPhotos(true)}
            title="ניהול תמונות — הוספה, מחיקה וסידור"
          >
            <Images size={14} />
            ניהול תמונות
          </button>
          <button
            className="gallery-manage-btn gallery-manage-btn-alt"
            onClick={() => setManagingVideos(true)}
            title="ניהול סרטונים"
          >
            <Film size={14} />
            ניהול סרטונים {property.videos?.length ? `(${property.videos.length})` : ''}
          </button>
        </div>
        {images.length > 1 && (
          <div className="gallery-dots" aria-hidden="true">
            {images.map((_, i) => (
              <span
                key={i}
                className={`gallery-dot ${i === currentImage ? 'active' : ''}`}
              />
            ))}
          </div>
        )}
        {images.length > 1 && (
          <div className="gallery-thumbs">
            {images.map((img, i) => (
              <button
                key={i}
                className={`gallery-thumb ${i === currentImage ? 'active' : ''}`}
                onClick={() => {
                  setCurrentImage(i);
                  if (stripRef.current) {
                    const w = stripRef.current.clientWidth;
                    stripRef.current.scrollTo({ left: -(i * w), behavior: 'smooth' });
                  }
                }}
              >
                <img src={img} alt="" />
              </button>
            ))}
          </div>
        )}
      </div>
      )}

      <div className="detail-content">
        <div className="detail-main animate-in animate-in-delay-2">
          {/* Header — desktop only (mobile uses pd-mobile-head + tabs). */}
          {!isMobile && (
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
              {!isDesktop && (
                <div className="detail-share-actions">
                  <button className="btn btn-primary" onClick={handleWhatsApp} aria-label={`WhatsApp ${property.street}`}>
                    <WhatsAppIcon size={18} />
                    שלח בוואטסאפ
                  </button>
                  <button
                    className={`btn btn-secondary ${copied ? 'copy-flash' : ''}`}
                    onClick={() => copy(customerLink)}
                    aria-label={`Copy link ${property.street}`}
                  >
                    {copied ? <Check size={16} /> : <Copy size={16} />}
                    {copied ? 'הועתק' : 'העתק קישור'}
                  </button>
                  <Link to={`/p/${property.id}`} target="_blank" className="btn btn-ghost" aria-label={`View as customer ${property.street}`}>
                    <ExternalLink size={16} />
                    צפה כלקוח
                  </Link>
                </div>
              )}
            </div>
          )}

          {showDetails && (
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
          )}

          {showDetails && (
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
          )}

          {showPhotos && property.videos?.length > 0 && (
            <div className="detail-videos">
              <div className="detail-videos-head">
                <h4><Film size={16} /> סרטונים ({property.videos.length})</h4>
              </div>
              <div className="detail-videos-grid">
                {property.videos.map((v) => (
                  <VideoTile key={v.id} video={v} />
                ))}
              </div>
            </div>
          )}

          {showDetails && property.notes && (
            <div className="detail-notes">
              <h4>הערות</h4>
              <p>{property.notes}</p>
            </div>
          )}

          {/* P1-D1 — on desktop the marketing-actions card lives in the left column */}
          {isDesktop && marketingActionsCard}

          {/* P2-M14 — empty history tab */}
          {isMobile && showHistory && (
            <div className="empty-state pd-history-empty">
              <Clock size={42} />
              <h3>עוד אין היסטוריה</h3>
              <p>פעילות, העברות והערות עדכון יוצגו כאן.</p>
            </div>
          )}
        </div>

        <div className={`detail-sidebar ${isDesktop ? 'pd-rail-desktop' : ''}`}>
          {showDetails && (() => {
            // Prefer the linked Owner record; fall back to inline name/phone.
            const linkedOwner = property.propertyOwner || null;
            const ownerName = linkedOwner?.name || property.owner || '';
            const ownerPhone = linkedOwner?.phone || property.ownerPhone || '';
            const ownerEmail = linkedOwner?.email || null;
            const initial = (ownerName || '?').charAt(0);
            return (
              <div className="card sidebar-card animate-in animate-in-delay-3">
                <h4><User size={18} />בעל הנכס</h4>
                <div className="owner-detail">
                  <div className="owner-detail-avatar">{initial}</div>
                  <div>
                    {linkedOwner?.id ? (
                      <Link to={`/owners/${linkedOwner.id}`} className="owner-detail-name owner-detail-link">
                        {ownerName}
                      </Link>
                    ) : (
                      <span className="owner-detail-name">{ownerName}</span>
                    )}
                    {ownerPhone && (
                      <a href={telUrl(ownerPhone)} className="owner-phone" aria-label={`Call ${ownerName}`}>
                        <Phone size={14} />
                        {ownerPhone}
                      </a>
                    )}
                    {ownerEmail && (
                      <a href={`mailto:${ownerEmail}`} className="owner-phone" aria-label={`Email ${ownerName}`}>
                        {ownerEmail}
                      </a>
                    )}
                  </div>
                </div>
                {/* P1-D1 — desktop rail: tel + WhatsApp anchors right under the owner */}
                {isDesktop && ownerPhone && (
                  <div className="pd-rail-owner-actions">
                    <a
                      href={telUrl(ownerPhone)}
                      className="btn btn-secondary btn-sm"
                      aria-label={`Call ${ownerName}`}
                    >
                      <Phone size={14} />
                      התקשר
                    </a>
                    <a
                      href={waUrl(ownerPhone, '')}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-secondary btn-sm"
                      aria-label={`WhatsApp ${ownerName}`}
                    >
                      <WhatsAppIcon size={14} />
                      וואטסאפ
                    </a>
                    {linkedOwner?.id && (
                      <Link to={`/owners/${linkedOwner.id}`} className="btn btn-ghost btn-sm">
                        <User size={14} />
                        פתח כרטיס
                      </Link>
                    )}
                  </div>
                )}
              </div>
            );
          })()}

          {/* P2-M14 — exclusivity dates live in marketing tab on mobile.
              P1-D1 — on desktop, also show a live countdown to the end date. */}
          {(showMarketing || isDesktop) && (property.exclusiveStart || property.exclusiveEnd) && (
            <div className="card sidebar-card animate-in">
              <h4><Clock size={18} />בלעדיות</h4>
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
              {exclusivityDaysLeft != null && (
                <div className={`pd-exclusive-countdown ${exclusivityDaysLeft < 0 ? 'is-expired' : exclusivityDaysLeft <= 14 ? 'is-soon' : ''}`}>
                  {exclusivityDaysLeft < 0
                    ? `הסתיים לפני ${Math.abs(exclusivityDaysLeft)} ימים`
                    : exclusivityDaysLeft === 0
                    ? 'מסתיים היום'
                    : `נותרו ${exclusivityDaysLeft} ימים`}
                </div>
              )}
            </div>
          )}

          {/* P2-M14 — marketing-price reminder inside marketing tab on mobile */}
          {showMarketing && isMobile && (
            <div className="card sidebar-card pd-marketing-price-card">
              <h4>מחיר שיווק</h4>
              <div className="detail-price">{formatPrice(property.marketingPrice)}</div>
            </div>
          )}

          {/* P1-D1 — Desktop rail: view as customer, share actions, manage buttons */}
          {isDesktop && (
            <>
              <div className="card sidebar-card pd-rail-actions">
                <Link
                  to={`/p/${property.id}`}
                  target="_blank"
                  className="btn btn-primary"
                  aria-label={`View as customer ${property.street}`}
                >
                  <ExternalLink size={16} />
                  צפה כלקוח
                </Link>
              </div>

              <div className="card sidebar-card pd-rail-share">
                <h4><Share2 size={16} />שיתוף</h4>
                <div className="pd-rail-share-grid">
                  <button
                    className="btn btn-primary"
                    onClick={handleWhatsApp}
                    aria-label={`WhatsApp ${property.street}`}
                  >
                    <WhatsAppIcon size={16} />
                    שלח בוואטסאפ
                  </button>
                  <button
                    className={`btn btn-secondary ${copied ? 'copy-flash' : ''}`}
                    onClick={() => copy(customerLink)}
                    aria-label={`Copy link ${property.street}`}
                  >
                    {copied ? <Check size={16} /> : <Copy size={16} />}
                    {copied ? 'הועתק' : 'העתק קישור'}
                  </button>
                  <button
                    className="btn btn-secondary"
                    onClick={handleShare}
                    aria-label={`Share ${property.street}`}
                  >
                    <Share2 size={16} />
                    שתף
                  </button>
                </div>
              </div>

              <div className="card sidebar-card pd-rail-manage">
                <h4>ניהול נכס</h4>
                <div className="pd-rail-manage-grid">
                  <button className="btn btn-secondary" onClick={() => setEditing(true)}>
                    <Edit3 size={14} />
                    עריכה
                  </button>
                  <button className="btn btn-secondary" onClick={() => setTransferOpen(true)}>
                    <ArrowLeftRight size={14} />
                    העבר נכס
                  </button>
                  <button className="btn btn-danger" onClick={() => setConfirmDelete(true)}>
                    <Trash2 size={14} />
                    מחיקה
                  </button>
                </div>
              </div>
            </>
          )}

          {/* Marketing actions — sidebar on mobile/tablet; on desktop ≥1100 it lives in the left column */}
          {!isDesktop && marketingActionsCard}
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

      {managingPhotos && (
        <PropertyPhotoManager
          propertyId={property.id}
          initial={property.imageList || []}
          onClose={() => setManagingPhotos(false)}
          onChange={async () => { await load(); }}
        />
      )}

      {managingVideos && (
        <PropertyVideoManager
          propertyId={property.id}
          initial={property.videos || []}
          onClose={() => setManagingVideos(false)}
          onChange={async () => { await load(); }}
        />
      )}

      {waShare && (
        <WhatsAppSheet
          title={waShare.title || `שליחת ${property.street}, ${property.city}`}
          subtitle="ערוך את ההודעה — לחיצה על 'פתח בוואטסאפ' תעביר לבחירת נמען"
          message={waShare.text}
          onClose={() => setWaShare(null)}
        />
      )}

      {transferOpen && (
        <TransferPropertyDialog
          property={property}
          onClose={() => setTransferOpen(false)}
          onDone={() => load()}
        />
      )}

      {pickerOpen && (
        <LeadPickerSheet
          property={property}
          leads={pickerLeadsOverride || leads}
          previewText={buildMessage()}
          onPick={handlePickLead}
          onClose={() => { setPickerOpen(false); setPickerLeadsOverride(null); }}
        />
      )}

      {lightboxIdx != null && (
        <div
          className="pd-lightbox"
          onClick={() => setLightboxIdx(null)}
          role="dialog"
          aria-label="תצוגת תמונה מלאה"
        >
          <button
            className="pd-lightbox-close"
            onClick={(e) => { e.stopPropagation(); setLightboxIdx(null); }}
            aria-label="סגור"
          >
            <X size={22} />
          </button>
          <img
            src={images[lightboxIdx]}
            alt={property.street}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      <StickyActionBar className="sab-icons" visible>
        <a
          href={wazeUrl(`${property.street} ${property.city}`)}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-secondary"
          aria-label={`Navigate ${property.street}`}
        >
          <Navigation size={18} />
          <span>ניווט</span>
        </a>
        <a
          href={telUrl(property.ownerPhone)}
          className="btn btn-secondary"
          aria-label={`Call ${property.owner || ''} ${property.street}`}
        >
          <Phone size={18} />
          <span>התקשר</span>
        </a>
        <button
          type="button"
          className="btn btn-primary"
          onClick={handleWhatsApp}
          aria-label={`WhatsApp ${property.street}`}
        >
          <WhatsAppIcon size={18} />
          <span>שלח ללקוח</span>
        </button>
        {/* P1-M13 — native share */}
        <button
          type="button"
          className="btn btn-secondary"
          onClick={handleShare}
          aria-label={`Share ${property.street}`}
        >
          <Share2 size={18} />
          <span>שתף</span>
        </button>
      </StickyActionBar>
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

function embedUrl(url) {
  const yt = url.match(/(?:youtu\.be\/|youtube\.com\/watch\?v=|youtube\.com\/embed\/)([\w-]{11})/)?.[1];
  if (yt) return `https://www.youtube.com/embed/${yt}?rel=0&playsinline=1`;
  const vimeo = url.match(/vimeo\.com\/(\d+)/)?.[1];
  if (vimeo) return `https://player.vimeo.com/video/${vimeo}`;
  return null;
}

export function VideoTile({ video }) {
  if (video.kind === 'upload' || video.url.startsWith('/uploads/')) {
    return (
      <div className="video-tile">
        <video src={video.url} controls preload="metadata" playsInline />
        {video.title && <span className="video-tile-title">{video.title}</span>}
      </div>
    );
  }
  const embed = embedUrl(video.url);
  if (embed) {
    return (
      <div className="video-tile embed">
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
  // Fallback — show as a link
  return (
    <a className="video-tile link-fallback" href={video.url} target="_blank" rel="noreferrer">
      <span>▶ צפה בסרטון</span>
      <small>{video.title || video.url}</small>
    </a>
  );
}

function MarketingGroup({ id, label, done, total, children }) {
  const [open, setOpen] = useState(() => {
    try { return localStorage.getItem(`estia-mg-${id}`) !== '0'; }
    catch { return true; }
  });
  const pct = total ? Math.round((done / total) * 100) : 0;
  const toggle = () => {
    setOpen((v) => {
      const next = !v;
      try { localStorage.setItem(`estia-mg-${id}`, next ? '1' : '0'); } catch { /* ignore */ }
      return next;
    });
  };
  return (
    <div className={`mg-section ${open ? 'open' : ''}`}>
      <button type="button" className="mg-header" onClick={toggle}>
        <span className="mg-chev">{open ? '▾' : '◂'}</span>
        <span className="mg-title">{label}</span>
        <span className="mg-progress">
          <span className="mg-bar"><span style={{ width: `${pct}%` }} /></span>
          <span className="mg-count">{done}/{total}</span>
        </span>
      </button>
      {open && <div className="mg-body">{children}</div>}
    </div>
  );
}
