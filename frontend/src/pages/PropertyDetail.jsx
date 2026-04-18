import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  MapPin,
  Building2,
  Phone,
  CheckCircle2,
  Circle,
  ExternalLink,
  X,
  Images,
  Film,
  ArrowLeftRight,
  Edit3,
  Trash2,
  Link2,
  Navigation,
  Share2,
  Clock,
  User,
  FileText,
  ChevronLeft,
  Megaphone,
  Sparkles,
  Pencil,
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
import PropertyHero from '../components/PropertyHero';
import PropertyKpiTile from '../components/PropertyKpiTile';
import PropertyPanelSheet from '../components/PropertyPanelSheet';
import { useCopyFeedback, useViewportMobile, useViewportDesktop } from '../hooks/mobile';
import { openWhatsApp, shareWithPhotos } from '../native/share';
import { track } from '../lib/analytics';
import { telUrl, wazeUrl, waUrl } from '../lib/waLink';
import { shareSheet } from '../native/share';
import { leadMatchesProperty } from './Properties';
import { relativeDate } from '../lib/relativeDate';
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

// Channels that get a quick "✓ / ◯" preview on the marketing card
const MARKETING_HIGHLIGHTS = ['facebook', 'yad2', 'madlan', 'iList'];

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

export default function PropertyDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const toast = useToast();
  const isMobile = useViewportMobile(820);
  const isDesktop = useViewportDesktop(1100);
  const { copied, copy } = useCopyFeedback();
  const [property, setProperty] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [currentImage, setCurrentImage] = useState(0);
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
  const [pickerLeadsOverride, setPickerLeadsOverride] = useState(null);
  const [lightboxIdx, setLightboxIdx] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  // Active sliding panel: 'marketing' | 'owner' | 'photos' | 'exclusivity' | 'notes' | 'map' | null
  const [panel, setPanel] = useState(null);

  useEffect(() => {
    api.listTemplates().then((r) => setTemplates(r.templates || [])).catch(() => {});
    api.listLeads().then((r) => setLeads(r.items || r.leads || [])).catch(() => {});
  }, []);

  const load = async () => {
    try {
      const res = await api.getProperty(id);
      setProperty(res.property);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [id]);

  // Clipboard image paste: while on this page, pasted images upload.
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

  // Keyboard nav for gallery: ArrowLeft/Right cycles, F = fullscreen, Esc = close.
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
    track('property_shared', {
      property_id: property.id,
      mode: opts?.withPhotos ? 'share_with_photos' : (lead ? 'direct_wa' : 'open_wa'),
      has_recipient: !!lead,
    });
    if (opts?.withPhotos) {
      await shareWithPhotos({
        photos: opts.photos,
        text,
        title: `${property.street}, ${property.city}`,
        url: customerLink,
      });
      return;
    }
    await openWhatsApp({ phone: lead?.phone, text });
  };

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

  const nextImage = () => setCurrentImage((i) => (i + 1) % images.length);
  const prevImage = () => setCurrentImage((i) => (i - 1 + images.length) % images.length);

  const handleGalleryDragOver = (e) => {
    if (!Array.from(e.dataTransfer?.types || []).includes('Files')) return;
    e.preventDefault();
    if (!dragOver) setDragOver(true);
  };
  const handleGalleryDragLeave = (e) => {
    if (e.currentTarget.contains(e.relatedTarget)) return;
    setDragOver(false);
  };
  const handleGalleryDrop = async (e) => {
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
  };

  // ── Marketing toggle handler (re-used inside the marketing panel) ──
  const toggleMarketingAction = async (key) => {
    const detail = actionsDetail[key] || { done: false };
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
      toast.success(nextDone
        ? `${MARKETING_LABELS[key]} · סומן כהושלם`
        : `${MARKETING_LABELS[key]} · סימון הוסר`);
    } catch (e) {
      setProperty(property);
      toast.error(e?.message || 'שגיאה — השינוי בוטל');
    }
  };

  // ── Owner data (linked or inline) ──
  const linkedOwner = property.propertyOwner || null;
  const ownerName  = linkedOwner?.name  || property.owner || '';
  const ownerPhone = linkedOwner?.phone || property.ownerPhone || '';
  const ownerEmail = linkedOwner?.email || null;
  const ownerInitial = (ownerName || '?').charAt(0);

  // ── Exclusivity countdown ──
  const exclusivityRel = property.exclusiveEnd ? relativeDate(property.exclusiveEnd) : null;
  const exclusivityDaysLeft = (() => {
    if (!property.exclusiveEnd) return null;
    const ms = new Date(property.exclusiveEnd).getTime() - Date.now();
    if (Number.isNaN(ms)) return null;
    return Math.ceil(ms / 86400000);
  })();
  const hasExclusivity = !!(property.exclusiveStart || property.exclusiveEnd);

  // ── Days on market ──
  const daysListed = (() => {
    const ts = property.createdAt ? new Date(property.createdAt).getTime() : null;
    if (!ts || !Number.isFinite(ts)) return null;
    return Math.max(0, Math.floor((Date.now() - ts) / 86400000));
  })();

  // ── KPI data ──
  const visitsCount = Number(property._count?.visits ?? property.visitsCount ?? 0);
  const inquiriesCount = Number(property._count?.inquiries ?? property.inquiriesCount ?? 0);

  // ── Notes summary chips: build a compact list of features ──
  const featureChips = [];
  if (property.airDirections) featureChips.push(`כיווני אוויר: ${property.airDirections}`);
  if (property.renovated) featureChips.push(`מצב: ${property.renovated}`);
  if (property.elevator) featureChips.push('מעלית');
  if (property.parking) featureChips.push('חניה');
  if (property.safeRoom) featureChips.push('ממ״ד');
  if (property.storage) featureChips.push('מחסן');
  if (property.ac) featureChips.push('מזגן');
  if (property.balconySize > 0) featureChips.push(`מרפסת ${property.balconySize} מ״ר`);

  return (
    <div className="property-detail pd-dashboard">
      {/* Top toolbar */}
      <div className="pd-topbar">
        <Link to="/properties" className="pd-back animate-in">
          <ArrowRight size={16} />
          <span>חזרה לנכסים</span>
        </Link>
        <div className="pd-top-actions">
          <button className="btn btn-secondary btn-sm" onClick={() => setTransferOpen(true)}>
            <ArrowLeftRight size={14} />
            <span>העבר</span>
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => setEditing(true)}>
            <Edit3 size={14} />
            <span>עריכה</span>
          </button>
          <button className="btn btn-secondary btn-sm" onClick={handleShare}>
            <Share2 size={14} />
            <span>שתף</span>
          </button>
          <button className="btn btn-danger btn-sm" onClick={() => setConfirmDelete(true)}>
            <Trash2 size={14} />
            <span>מחיקה</span>
          </button>
        </div>
      </div>

      {/* Hero — gallery + price/title/CTAs */}
      <PropertyHero
        property={property}
        images={images}
        currentImage={currentImage}
        onPrev={prevImage}
        onNext={nextImage}
        onSelectImage={setCurrentImage}
        onOpenLightbox={(i) => setLightboxIdx(i)}
        onManagePhotos={() => setManagingPhotos(true)}
        onManageVideos={() => setManagingVideos(true)}
        onWhatsApp={handleWhatsApp}
        onCopyLink={(link) => copy(link)}
        copied={copied}
        wazeHref={wazeUrl(`${property.street} ${property.city}`)}
        customerLink={customerLink}
        isMobile={isMobile}
        formatPrice={formatPrice}
        dragOver={dragOver}
        onDragOver={handleGalleryDragOver}
        onDragLeave={handleGalleryDragLeave}
        onDrop={handleGalleryDrop}
      />

      {/* KPI strip */}
      <div className="pd-kpis animate-in animate-in-delay-2">
        <PropertyKpiTile
          value={`${pct}%`}
          label="שיווק"
          sublabel={`${done}/${total}`}
          onClick={() => setPanel('marketing')}
        />
        <PropertyKpiTile
          value={visitsCount}
          label="ביקורים"
          tone={visitsCount > 0 ? 'gold' : 'neutral'}
        />
        <PropertyKpiTile
          value={inquiriesCount}
          label="פניות"
          tone={inquiriesCount > 0 ? 'gold' : 'neutral'}
        />
        <PropertyKpiTile
          value={daysListed != null ? daysListed : '—'}
          label="ימים בשוק"
          tone="neutral"
        />
      </div>

      {/* Dashboard cards grid */}
      <div className="pd-grid">

        {/* Marketing — primary card with gold trim */}
        <DashCard
          variant="primary"
          delay={1}
          icon={<Megaphone size={16} />}
          title="שיווק"
          action={(
            <button className="dc-cta" onClick={() => setPanel('marketing')}>
              נהל כל ה-{total} פעולות
              <ChevronLeft size={14} />
            </button>
          )}
        >
          <div className="dc-progress-row">
            <div className="dc-progress-bar">
              <div className="dc-progress-fill" style={{ width: `${pct}%` }} />
            </div>
            <span className="dc-progress-num">{pct}%</span>
          </div>
          <div className="dc-channel-grid">
            {MARKETING_HIGHLIGHTS.map((k) => {
              const on = !!actionsMap[k];
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => toggleMarketingAction(k)}
                  className={`dc-channel ${on ? 'is-on' : ''}`}
                  title={MARKETING_LABELS[k]}
                >
                  {on
                    ? <CheckCircle2 size={14} className="dc-channel-icon on" />
                    : <Circle size={14} className="dc-channel-icon" />}
                  <span>{MARKETING_LABELS[k]}</span>
                </button>
              );
            })}
          </div>
        </DashCard>

        {/* Owner */}
        <DashCard
          delay={2}
          icon={<User size={16} />}
          title="בעל הנכס"
          action={(
            <button className="dc-cta" onClick={() => setPanel('owner')}>
              {linkedOwner?.id ? 'פתח כרטיס' : 'פרטים'}
              <ChevronLeft size={14} />
            </button>
          )}
        >
          {ownerName ? (
            <>
              <div className="dc-owner">
                <div className="dc-owner-avatar">{ownerInitial}</div>
                <div className="dc-owner-id">
                  {linkedOwner?.id ? (
                    <Link to={`/owners/${linkedOwner.id}`} className="dc-owner-name dc-owner-link">
                      {ownerName}
                    </Link>
                  ) : (
                    <span className="dc-owner-name">{ownerName}</span>
                  )}
                  {ownerPhone && (
                    <a href={telUrl(ownerPhone)} className="dc-owner-meta">
                      <Phone size={12} />
                      {ownerPhone}
                    </a>
                  )}
                </div>
              </div>
              {ownerPhone && (
                <div className="dc-owner-actions">
                  <a
                    href={telUrl(ownerPhone)}
                    className="dc-mini dc-mini-secondary"
                    aria-label={`Call ${ownerName}`}
                  >
                    <Phone size={13} />
                    <span>התקשר</span>
                  </a>
                  <a
                    href={waUrl(ownerPhone, '')}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="dc-mini dc-mini-wa"
                    aria-label={`WhatsApp ${ownerName}`}
                  >
                    <WhatsAppIcon size={13} />
                    <span>וואטסאפ</span>
                  </a>
                </div>
              )}
            </>
          ) : (
            <p className="dc-empty">לא מוגדר בעל נכס</p>
          )}
        </DashCard>

        {/* Photos preview */}
        <DashCard
          delay={3}
          icon={<Images size={16} />}
          title={`תמונות (${property.images?.length || 0})`}
          action={(
            <button className="dc-cta" onClick={() => setManagingPhotos(true)}>
              ניהול
              <ChevronLeft size={14} />
            </button>
          )}
        >
          {property.images?.length > 0 ? (
            <div className="dc-thumbs">
              {property.images.slice(0, 4).map((img, i) => (
                <button
                  key={i}
                  type="button"
                  className="dc-thumb"
                  onClick={() => setLightboxIdx(i)}
                  aria-label={`פתח תמונה ${i + 1}`}
                >
                  <img src={img} alt="" loading="lazy" />
                  {i === 3 && property.images.length > 4 && (
                    <span className="dc-thumb-more">+{property.images.length - 4}</span>
                  )}
                </button>
              ))}
            </div>
          ) : (
            <p className="dc-empty">אין עדיין תמונות. גרור או הדבק להעלאה מהירה.</p>
          )}
          <p className="dc-hint">גרור או הדבק תמונות לעדכון</p>
        </DashCard>

        {/* Exclusivity */}
        <DashCard
          delay={4}
          icon={<Clock size={16} />}
          title="בלעדיות"
          action={(
            <button className="dc-cta" onClick={() => setPanel('exclusivity')}>
              {hasExclusivity ? 'פרטים' : 'הגדר'}
              <ChevronLeft size={14} />
            </button>
          )}
        >
          {hasExclusivity ? (
            <div className="dc-excl">
              {property.exclusiveEnd && (
                <div className="dc-excl-line">
                  <span className="dc-excl-label">סיום</span>
                  <span className="dc-excl-value">
                    {new Date(property.exclusiveEnd).toLocaleDateString('he-IL')}
                  </span>
                </div>
              )}
              {exclusivityRel && (
                <div className={`dc-excl-pill dc-excl-pill-${
                  exclusivityDaysLeft != null && exclusivityDaysLeft < 0 ? 'expired'
                  : exclusivityDaysLeft != null && exclusivityDaysLeft <= 14 ? 'soon'
                  : 'normal'
                }`}>
                  {exclusivityRel.label}
                </div>
              )}
              <div className="dc-excl-status">
                סטטוס: <strong>{property.status === 'PAUSED' ? 'מושהה' : property.status === 'ARCHIVED' ? 'בארכיון' : 'פעיל'}</strong>
              </div>
            </div>
          ) : (
            <p className="dc-empty">לא הוגדרה תקופת בלעדיות</p>
          )}
        </DashCard>

        {/* Notes / features */}
        <DashCard
          delay={5}
          icon={<Sparkles size={16} />}
          title="הערות ומאפיינים"
          action={(
            <button className="dc-cta" onClick={() => setPanel('notes')}>
              <Pencil size={13} />
              ערוך
            </button>
          )}
        >
          {featureChips.length > 0 && (
            <div className="dc-feature-chips">
              {featureChips.slice(0, 6).map((c) => (
                <span key={c} className="dc-feature-chip">{c}</span>
              ))}
              {featureChips.length > 6 && (
                <span className="dc-feature-chip dc-feature-chip-more">+{featureChips.length - 6}</span>
              )}
            </div>
          )}
          {property.notes ? (
            <p className="dc-notes-preview">{property.notes}</p>
          ) : featureChips.length === 0 ? (
            <p className="dc-empty">אין הערות עדיין</p>
          ) : null}
        </DashCard>

        {/* Map */}
        <DashCard
          delay={5}
          icon={<MapPin size={16} />}
          title="מיקום"
          action={(
            <a
              href={mapsOpen}
              target="_blank"
              rel="noreferrer"
              className="dc-cta"
            >
              <ExternalLink size={13} />
              פתח במפות
            </a>
          )}
        >
          <div className="dc-map-mini">
            <iframe
              title="מיקום הנכס"
              src={mapsEmbed}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          </div>
          <div className="dc-map-addr">{property.street}, {property.city}</div>
        </DashCard>

      </div>

      {/* ── Slide-in panels ── */}
      {panel === 'marketing' && (
        <PropertyPanelSheet
          title="פעולות שיווק"
          subtitle={`${done} מתוך ${total} הושלמו · ${pct}%`}
          width="lg"
          onClose={() => setPanel(null)}
        >
          <div className="pd-panel-marketing">
            <div className="dc-progress-row dc-progress-row-lg">
              <div className="dc-progress-bar">
                <div className="dc-progress-fill" style={{ width: `${pct}%` }} />
              </div>
              <span className="dc-progress-num">{pct}%</span>
            </div>
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
                      return (
                        <div key={key} className={`checklist-item interactive ${detail.done ? 'is-done' : ''}`}>
                          <button
                            type="button"
                            className="checklist-toggle"
                            onClick={() => toggleMarketingAction(key)}
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
        </PropertyPanelSheet>
      )}

      {panel === 'owner' && (
        <PropertyPanelSheet
          title="בעל הנכס"
          subtitle={ownerName || 'לא מוגדר'}
          onClose={() => setPanel(null)}
        >
          {ownerName ? (
            <div className="pd-panel-owner">
              <div className="dc-owner">
                <div className="dc-owner-avatar dc-owner-avatar-lg">{ownerInitial}</div>
                <div className="dc-owner-id">
                  <span className="dc-owner-name">{ownerName}</span>
                  {ownerPhone && (
                    <a href={telUrl(ownerPhone)} className="dc-owner-meta">
                      <Phone size={13} />
                      {ownerPhone}
                    </a>
                  )}
                  {ownerEmail && (
                    <a href={`mailto:${ownerEmail}`} className="dc-owner-meta">
                      {ownerEmail}
                    </a>
                  )}
                </div>
              </div>
              <div className="pd-panel-actions">
                {ownerPhone && (
                  <>
                    <a href={telUrl(ownerPhone)} className="btn btn-secondary">
                      <Phone size={14} />התקשר
                    </a>
                    <a
                      href={waUrl(ownerPhone, '')}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-primary"
                    >
                      <WhatsAppIcon size={14} />WhatsApp
                    </a>
                  </>
                )}
                {linkedOwner?.id && (
                  <Link to={`/owners/${linkedOwner.id}`} className="btn btn-secondary">
                    <User size={14} />פתח כרטיס מלא
                  </Link>
                )}
                <button className="btn btn-secondary" onClick={() => { setPanel(null); setEditing(true); }}>
                  <Edit3 size={14} />ערוך פרטי בעלים
                </button>
              </div>
            </div>
          ) : (
            <div className="pd-panel-empty">
              <User size={32} />
              <p>אין בעל נכס מקושר.</p>
              <button className="btn btn-primary" onClick={() => { setPanel(null); setEditing(true); }}>
                הוסף פרטי בעלים
              </button>
            </div>
          )}
        </PropertyPanelSheet>
      )}

      {panel === 'exclusivity' && (
        <PropertyPanelSheet
          title="בלעדיות"
          subtitle={hasExclusivity ? 'פרטי תקופת הבלעדיות' : 'הגדר טווח תאריכים'}
          onClose={() => setPanel(null)}
        >
          <div className="pd-panel-excl">
            {property.exclusiveStart && (
              <div className="pd-panel-row">
                <span className="pd-panel-label">תחילת בלעדיות</span>
                <span className="pd-panel-value">
                  {new Date(property.exclusiveStart).toLocaleDateString('he-IL')}
                </span>
              </div>
            )}
            {property.exclusiveEnd && (
              <div className="pd-panel-row">
                <span className="pd-panel-label">סיום בלעדיות</span>
                <span className="pd-panel-value">
                  {new Date(property.exclusiveEnd).toLocaleDateString('he-IL')}
                </span>
              </div>
            )}
            {exclusivityRel && (
              <div className={`pd-panel-pill pd-panel-pill-${
                exclusivityDaysLeft != null && exclusivityDaysLeft < 0 ? 'expired'
                : exclusivityDaysLeft != null && exclusivityDaysLeft <= 14 ? 'soon'
                : 'normal'
              }`}>
                {exclusivityRel.label}
              </div>
            )}
            <button className="btn btn-primary" onClick={() => { setPanel(null); setEditing(true); }}>
              <Edit3 size={14} />ערוך תקופת בלעדיות
            </button>
            {!hasExclusivity && (
              <p className="dc-empty">לא הוגדרה תקופת בלעדיות. לחץ "ערוך" להוספה.</p>
            )}
          </div>
        </PropertyPanelSheet>
      )}

      {panel === 'notes' && (
        <PropertyPanelSheet
          title="הערות ומאפיינים"
          subtitle="כל הפרטים והמאפיינים של הנכס"
          width="lg"
          onClose={() => setPanel(null)}
        >
          <div className="pd-panel-notes">
            {featureChips.length > 0 && (
              <div className="dc-feature-chips dc-feature-chips-lg">
                {featureChips.map((c) => (
                  <span key={c} className="dc-feature-chip">{c}</span>
                ))}
              </div>
            )}
            {property.notes ? (
              <div className="pd-panel-notes-body">
                <h5>טקסט חופשי</h5>
                <p>{property.notes}</p>
              </div>
            ) : (
              <p className="dc-empty">לא הוזנו הערות.</p>
            )}
            <button className="btn btn-primary" onClick={() => { setPanel(null); setEditing(true); }}>
              <Edit3 size={14} />ערוך הערות ומאפיינים
            </button>
          </div>
        </PropertyPanelSheet>
      )}

      {/* Videos preview if there are videos — shown below the grid */}
      {property.videos?.length > 0 && (
        <div className="pd-videos animate-in animate-in-delay-5">
          <div className="pd-videos-head">
            <h4><Film size={16} /> סרטונים ({property.videos.length})</h4>
            <button className="btn btn-ghost btn-sm" onClick={() => setManagingVideos(true)}>
              <Edit3 size={13} />
              ניהול
            </button>
          </div>
          <div className="pd-videos-grid">
            {property.videos.map((v) => (
              <VideoTile key={v.id} video={v} />
            ))}
          </div>
        </div>
      )}

      {/* ── Dialogs ── */}
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

      {/* Mobile: keep the sticky bottom action bar */}
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

/* ──────────────────────────────────────────────────────────────
 * DashCard — card shell with title, action button and body.
 * ────────────────────────────────────────────────────────────── */
function DashCard({ icon, title, action, children, variant = 'default', delay = 1 }) {
  return (
    <section className={`dc dc-${variant} animate-in animate-in-delay-${delay}`}>
      <header className="dc-header">
        <h3 className="dc-title">
          {icon && <span className="dc-icon">{icon}</span>}
          <span>{title}</span>
        </h3>
        {action}
      </header>
      <div className="dc-body">{children}</div>
    </section>
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
