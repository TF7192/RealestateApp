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
  UserPlus,
  Users,
  Workflow,
  Tag,
  Bell,
  Activity,
  Target,
} from 'lucide-react';
import api from '../lib/api';
import { formatFloor } from '../lib/formatFloor';
import { useAuth } from '../lib/auth';
import MarketingActionDialog from '../components/MarketingActionDialog';
import ConfirmDialog from '../components/ConfirmDialog';
import ProspectDialog from '../components/ProspectDialog';
import PropertyPhotoManager from '../components/PropertyPhotoManager';
import PropertyVideoManager from '../components/PropertyVideoManager';
import OwnerPicker from '../components/OwnerPicker';
import WhatsAppSheet from '../components/WhatsAppSheet';
import TransferPropertyDialog from '../components/TransferPropertyDialog';
import LeadPickerSheet from '../components/LeadPickerSheet';
import StickyActionBar from '../components/StickyActionBar';
import WhatsAppIcon from '../components/WhatsAppIcon';
import PageTour from '../components/PageTour';
import PropertyHero from '../components/PropertyHero';
import PropertyKpiTile from '../components/PropertyKpiTile';
import PropertyPanelSheet from '../components/PropertyPanelSheet';
import PropertyPipelineBlock from '../components/PropertyPipelineBlock';
import PropertyAssigneesPanel from '../components/PropertyAssigneesPanel';
import AdvertsPanel from '../components/AdvertsPanel';
import TagPicker from '../components/TagPicker';
import RemindersPanel from '../components/RemindersPanel';
import MatchingList from '../components/MatchingList';
import ActivityPanel from '../components/ActivityPanel';
import { useCopyFeedback, useViewportMobile } from '../hooks/mobile';
import { openWhatsApp, shareWithPhotos, shareToInstagramStory } from '../native/share';
import { isNative } from '../native/platform';
import { track } from '../lib/analytics';
import { telUrl, wazeUrl } from '../lib/waLink';
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
  madlan: 'מדלן',
  whatsappGroup: 'קבוצת וואטס-אפ',
  officeWhatsapp: 'וואטס-אפ משרדי',
  // `externalCoop` is the legacy key (still in old rows); we keep it in
  // the label map so historical data renders, but we expose it under the
  // renamed meaning — שיתופי פעולה עם מתווכים.
  externalCoop: 'שיתופי פעולה מתווכים',
  brokerCoop: 'שיתופי פעולה מתווכים',
  video: 'סרטון',
  neighborLetters: 'מכתבי שכנים',
  coupons: 'גזירונים',
  flyers: 'עלונים',
  newspaper: 'עיתונות מקומית',
  agentTour: 'סיור סוכנים',
  openHouse: 'בית פתוח',
};

// Group the 22 actions into three scannable sections so the agent can find
// and mark the one they want in a couple of glances instead of scrolling.
//
// Within "שטח ופרינט" the order follows the agent's real workflow:
// photography first (shots are the base asset), then sign + tabu extract,
// then mailed-to-neighbors outreach (this is the agent's opening move —
// the whole building learns about the listing), then the print channels
// (flyers/coupons) and finally local press.
const MARKETING_GROUPS = [
  {
    key: 'digital',
    label: 'פרסום דיגיטלי',
    keys: ['iList', 'yad2', 'facebook', 'marketplace', 'onMap', 'madlan', 'virtualTour', 'video'],
  },
  {
    key: 'field',
    label: 'שטח ופרינט',
    keys: [
      'photography', 'buildingPhoto', 'dronePhoto',
      'sign', 'tabuExtract',
      'neighborLetters',
      'flyers', 'coupons',
      'newspaper',
    ],
  },
  {
    key: 'agent',
    label: 'פעילות סוכנים',
    keys: ['whatsappGroup', 'officeWhatsapp', 'brokerCoop', 'agentTour', 'openHouse'],
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
  if (prop.floor != null) lines.push(`🏢 קומה: ${formatFloor(prop.floor, prop.totalFloors)}`);
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
  const { copied, copy } = useCopyFeedback();
  const [property, setProperty] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [currentImage, setCurrentImage] = useState(0);
  const [actionDialog, setActionDialog] = useState(null);
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
  // F-4.3 — respect `?panel=marketing` deep-link from the Dashboard's
  // marketing-progress card.
  const [panel, setPanel] = useState(() => {
    try {
      const p = new URLSearchParams(window.location.search).get('panel');
      const allowed = [
        'marketing', 'owner', 'photos', 'exclusivity', 'notes', 'map',
        // MLS parity panels
        'pipeline', 'adverts', 'assignees', 'matching', 'activity', 'reminders',
      ];
      return allowed.includes(p) ? p : null;
    } catch { return null; }
  });
  // 1.5 — Prospect intake dialog open-state
  const [prospectOpen, setProspectOpen] = useState(false);
  // OwnerPicker for swapping the linked Owner without leaving the page.
  const [ownerPickerOpen, setOwnerPickerOpen] = useState(false);
  const [ownerSaving, setOwnerSaving] = useState(false);

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
      // 2.1 — route through openWhatsApp so the named-target reuse
      // logic kicks in (WA-web tab is reused instead of spawning a
      // fresh one each click).
      openWhatsApp({ phone: lead.phone, text: buildMessage() });
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

  const handleInstagramStory = async () => {
    track('property_shared', {
      property_id: property.id,
      mode: 'instagram_story',
    });
    const cover = (property.images && property.images[0]) || null;
    const priceLabel = property.marketingPrice
      ? `₪${Number(property.marketingPrice).toLocaleString('he-IL')}` +
        (property.category === 'RENT' ? ' / חודש' : '')
      : null;
    const badge = property.category === 'RENT' ? 'להשכרה' : 'למכירה';
    // Use the same caption the agent would send to a client — keeps the
    // story consistent with everything else we ship (StoryComposer is the
    // single renderer; WhatsApp uses the raw text).
    const captionParts = [
      `${property.type} ב${property.street}, ${property.city}`,
      property.rooms ? `${property.rooms} חדרים · ${property.sqm} מ״ר` : `${property.sqm} מ״ר`,
      priceLabel,
    ].filter(Boolean);
    const caption = captionParts.join('\n');
    const footer  = user?.displayName
      ? `${user.displayName}${user.agentProfile?.agency ? ' · ' + user.agentProfile.agency : ''}`
      : 'Estia';
    const result = await shareToInstagramStory({ coverUrl: cover, caption, footer, badge });
    if (result === 'fallback') {
      toast?.info?.('התמונה נשמרה לשיתוף — בחר אינסטגרם מהגיליון');
    } else if (result === 'downloaded') {
      toast?.info?.('הסטורי הורד כתמונה — העלה אותו מהאלבום באינסטגרם');
    } else if (!result) {
      toast?.error?.('התקן את אינסטגרם כדי לשתף סטורי');
    }
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

  // ── Days on market (1.3) ──
  // Prefer the explicit marketingStartDate the agent set (or the backend
  // defaulted on create); fall back to createdAt for legacy rows with
  // no start date. If the property is sold/off-market we freeze the
  // count at (soldDate - startDate) so it stops counting up.
  const daysListed = (() => {
    const startMs = (() => {
      const startStr = property.marketingStartDate || property.createdAt;
      const ts = startStr ? new Date(startStr).getTime() : null;
      return (ts && Number.isFinite(ts)) ? ts : null;
    })();
    if (!startMs) return null;
    // Freeze for sold / off-market properties — cap at the closing date.
    const frozenMs = (() => {
      if (property.status !== 'SOLD' && property.status !== 'OFF_MARKET') return null;
      const d = property.closingDate || property.updatedAt;
      const ts = d ? new Date(d).getTime() : null;
      return (ts && Number.isFinite(ts)) ? ts : null;
    })();
    const endMs = frozenMs ?? Date.now();
    return Math.max(0, Math.floor((endMs - startMs) / 86400000));
  })();

  // ── KPI data (1.4) ──
  // "Visits" here means real page-views of the public property URL
  // (PropertyViewing rows) + prospects who filled the intake form;
  // "Inquiries" means inbound contact attempts (PropertyInquiry rows).
  // Both are exposed via backend's _count.
  const visitsCount    = Number(property._count?.viewings ?? property._count?.visits ?? property.visitsCount ?? 0);
  const prospectsCount = Number(property._count?.prospects ?? 0);
  const pageViews      = visitsCount + prospectsCount;
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
  if (property.balconySize > 0) {
    // 1.1 — balconyType sub-option when present ("שמש" / "מקורה")
    const typeLabel = property.balconyType === 'SUNNY' ? ' · שמש'
      : property.balconyType === 'COVERED' ? ' · מקורה' : '';
    featureChips.push(`מרפסת ${property.balconySize} מ״ר${typeLabel}`);
  }
  if (property.assetClass === 'COMMERCIAL' && property.commercialZone) {
    featureChips.push(`איזור: ${property.commercialZone}`);
  }
  if (property.assetClass === 'COMMERCIAL' && property.workstations) {
    featureChips.push(`${property.workstations} עמדות ישיבה`);
  }

  return (
    <div className="property-detail pd-dashboard">
      <PageTour
        pageKey="property-detail"
        steps={[
          { target: 'body', placement: 'center',
            title: 'כרטיס הנכס',
            content: 'דשבורד מלא: 22 פעולות שיווק, בעל הנכס, תמונות, בלעדיות והערות. מעל — כפתורי העברה, עריכה, שיתוף לקוח (וסטורי באפליקציה).' },
        ]}
      />
      {/* Top toolbar */}
      <div className="pd-topbar">
        <Link to="/properties" className="pd-back animate-in">
          <ArrowRight size={16} />
          <span>חזרה לנכסים</span>
        </Link>
        <div className="pd-top-actions">
          {/* UX review F-6.1 + F-6.2 — canonical toolbar order:
              Edit (highest frequency) · Share · Add-Prospect · overflow
              for rare actions (Transfer, Story) · Delete (red, last). */}
          <button className="btn btn-secondary btn-sm" onClick={() => navigate(`/properties/${id}/edit`)}>
            <Edit3 size={14} />
            <span>עריכה</span>
          </button>
          <button className="btn btn-secondary btn-sm" onClick={handleShare}>
            <Share2 size={14} />
            <span>שתף</span>
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => setProspectOpen(true)}>
            <UserPlus size={14} />
            <span>הוסף מתעניין</span>
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => setTransferOpen(true)} title="העברה לסוכן אחר">
            <ArrowLeftRight size={14} />
            <span>העבר</span>
          </button>
          {isNative() && (
            <button
              className="btn btn-secondary btn-sm pd-ig-btn"
              onClick={handleInstagramStory}
              aria-label="שתף בסטורי של אינסטגרם"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <rect x="2" y="2" width="20" height="20" rx="5" />
                <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
                <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
              </svg>
              <span>סטורי</span>
            </button>
          )}
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
      {/* UX review F-1.1 — Matched-leads quick dispatch.
          Surfaces top 3 leads that match this property as one-tap
          "Send WhatsApp" rows. The matching function was already used
          by handleWhatsApp below; this just makes it visible before
          the user has to click the generic picker. Saves ~13s × ~15
          handoffs/day = 11min/agent/day on the #1 workflow.  */}
      {(() => {
        const matches = (leads || []).filter((l) => leadMatchesProperty(l, property));
        if (matches.length === 0) return null;
        const top = matches.slice(0, 3);
        const restCount = matches.length - top.length;
        return (
          <section className="pd-matches animate-in animate-in-delay-2" aria-label="לידים תואמים">
            <header className="pd-matches-head">
              <span>מתאים ל-{matches.length} לידים</span>
            </header>
            <ul className="pd-matches-list">
              {top.map((lead) => (
                <li key={lead.id}>
                  <button
                    type="button"
                    className="pd-match-row"
                    onClick={() => openWhatsApp({ phone: lead.phone, text: buildMessage() })}
                    title={`שלח לליד ${lead.name} בוואטסאפ`}
                  >
                    <span className="pd-match-name">{lead.name}</span>
                    <span className="pd-match-meta">
                      {lead.city || '—'}{lead.budget ? ` · תקציב ₪${Number(lead.budget).toLocaleString('he-IL')}` : ''}
                    </span>
                    <span className="pd-match-cta">
                      <WhatsAppIcon size={14} /> שלח בוואטסאפ
                    </span>
                  </button>
                </li>
              ))}
              {restCount > 0 && (
                <li>
                  <button
                    type="button"
                    className="pd-match-more"
                    onClick={() => { setPickerLeadsOverride(matches); setPickerOpen(true); }}
                  >
                    ראה עוד {restCount} לידים תואמים
                  </button>
                </li>
              )}
            </ul>
          </section>
        );
      })()}

      <div className="pd-kpis animate-in animate-in-delay-2">
        <PropertyKpiTile
          value={`${pct}%`}
          label="שיווק"
          sublabel={`${done}/${total}`}
          onClick={() => setPanel('marketing')}
        />
        <PropertyKpiTile
          value={pageViews}
          label="צפיות בעמוד"
          sublabel="כניסות לעמוד הנכס"
          tone={pageViews > 0 ? 'gold' : 'neutral'}
        />
        <PropertyKpiTile
          value={inquiriesCount}
          label="פניות"
          sublabel="קשרו עם הנכס"
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
            <div className="dc-cta-row">
              <button
                className="dc-cta dc-cta-ghost"
                onClick={() => setOwnerPickerOpen(true)}
                disabled={ownerSaving}
                title="החלף את בעל הנכס המקושר"
                type="button"
              >
                <Pencil size={12} />
                {ownerSaving ? 'שומר…' : (linkedOwner?.id ? 'החלף' : 'הוסף')}
              </button>
              <button className="dc-cta" onClick={() => setPanel('owner')} type="button">
                {linkedOwner?.id ? 'פתח כרטיס' : 'פרטים'}
                <ChevronLeft size={14} />
              </button>
            </div>
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
                {ownerPhone && (
                  <div className="dc-owner-round-actions" aria-hidden="false">
                    <a
                      href={telUrl(ownerPhone)}
                      className="dc-owner-round dc-owner-round-call"
                      aria-label={`התקשר ל${ownerName}`}
                      title={`התקשר ל${ownerName}`}
                    >
                      <Phone size={18} />
                    </a>
                    <button
                      type="button"
                      onClick={() => openWhatsApp({ phone: ownerPhone, text: `שלום ${ownerName}` })}
                      className="dc-owner-round dc-owner-round-wa"
                      aria-label={`וואטסאפ ל${ownerName}`}
                      title={`וואטסאפ ל${ownerName}`}
                    >
                      <WhatsAppIcon size={20} />
                    </button>
                  </div>
                )}
              </div>
              {ownerPhone && (
                <div className="dc-owner-actions dc-owner-actions-desktop">
                  <a
                    href={telUrl(ownerPhone)}
                    className="dc-mini dc-mini-secondary"
                    aria-label={`Call ${ownerName}`}
                  >
                    <Phone size={13} />
                    <span>התקשר</span>
                  </a>
                  <button
                    type="button"
                    onClick={() => openWhatsApp({ phone: ownerPhone, text: `שלום ${ownerName}` })}
                    className="dc-mini dc-mini-wa"
                    aria-label={`WhatsApp ${ownerName}`}
                  >
                    <WhatsAppIcon size={13} />
                    <span>שלח בוואטסאפ</span>
                  </button>
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

        {/* MLS parity — pipeline (J9) */}
        <DashCard
          delay={6}
          icon={<Workflow size={16} />}
          title="צנרת תיווך"
          action={(
            <button
              type="button"
              className="dc-cta"
              onClick={() => setPanel('pipeline')}
              aria-label="ערוך צנרת תיווך"
            >
              ערוך
              <ChevronLeft size={14} />
            </button>
          )}
        >
          <div className="pd-pipeline-preview">
            <span className="pd-pipeline-label">שלב: </span>
            <strong>{property.stage || 'WATCHING'}</strong>
            {property.agentCommissionPct != null && (
              <span className="pd-pipeline-chip">עמלה {property.agentCommissionPct}%</span>
            )}
            {property.sellerSeriousness && property.sellerSeriousness !== 'NONE' && (
              <span className="pd-pipeline-chip">רצינות {property.sellerSeriousness}</span>
            )}
          </div>
        </DashCard>

        {/* MLS parity — adverts (F1) */}
        <DashCard
          delay={6}
          icon={<Megaphone size={16} />}
          title="מודעות פרסום"
          action={(
            <button
              type="button"
              className="dc-cta"
              onClick={() => setPanel('adverts')}
              aria-label="נהל מודעות פרסום"
            >
              נהל
              <ChevronLeft size={14} />
            </button>
          )}
        >
          <p className="dc-empty">לחץ "נהל" לפתיחה</p>
        </DashCard>

        {/* MLS parity — assignees (J10) */}
        <DashCard
          delay={7}
          icon={<Users size={16} />}
          title="שותפים לנכס"
          action={(
            <button
              type="button"
              className="dc-cta"
              onClick={() => setPanel('assignees')}
              aria-label="נהל שותפים לנכס"
            >
              נהל
              <ChevronLeft size={14} />
            </button>
          )}
        >
          <p className="dc-empty">הוסף שותפים מהמשרד לצפייה משותפת</p>
        </DashCard>

        {/* MLS parity — matching customers (C3 reverse) */}
        <DashCard
          delay={7}
          icon={<Target size={16} />}
          title="לקוחות תואמים"
          action={(
            <button
              type="button"
              className="dc-cta"
              onClick={() => setPanel('matching')}
              aria-label="הצג לקוחות תואמים"
            >
              הצג
              <ChevronLeft size={14} />
            </button>
          )}
        >
          <p className="dc-empty">גלה לקוחות במאגר שהנכס תואם את הפרופיל שלהם</p>
        </DashCard>

        {/* MLS parity — tags (A2) */}
        <DashCard
          delay={7}
          icon={<Tag size={16} />}
          title="תגיות"
        >
          <TagPicker entityType="PROPERTY" entityId={property.id} />
        </DashCard>

        {/* MLS parity — reminders (D1) */}
        <DashCard
          delay={8}
          icon={<Bell size={16} />}
          title="תזכורות"
          action={(
            <button
              type="button"
              className="dc-cta"
              onClick={() => setPanel('reminders')}
              aria-label="פתח תזכורות"
            >
              פתח
              <ChevronLeft size={14} />
            </button>
          )}
        >
          <p className="dc-empty">הוסף תזכורת לפעולה עתידית על הנכס</p>
        </DashCard>

        {/* MLS parity — activity (H3) */}
        <DashCard
          delay={8}
          icon={<Activity size={16} />}
          title="פעילות"
          action={(
            <button
              type="button"
              className="dc-cta"
              onClick={() => setPanel('activity')}
              aria-label="הצג פעילות"
            >
              הצג
              <ChevronLeft size={14} />
            </button>
          )}
        >
          <p className="dc-empty">יומן פעולות שבוצעו על הנכס</p>
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
                    <button
                      type="button"
                      onClick={() => openWhatsApp({ phone: ownerPhone, text: `שלום ${ownerName}` })}
                      className="btn btn-primary"
                    >
                      <WhatsAppIcon size={14} />וואטסאפ
                    </button>
                  </>
                )}
                {linkedOwner?.id && (
                  <Link to={`/owners/${linkedOwner.id}`} className="btn btn-secondary">
                    <User size={14} />פתח כרטיס מלא
                  </Link>
                )}
                <button className="btn btn-secondary" onClick={() => { setPanel(null); navigate(`/properties/${id}/edit`); }}>
                  <Edit3 size={14} />ערוך פרטי בעל הנכס
                </button>
              </div>
            </div>
          ) : (
            <div className="pd-panel-empty">
              <User size={32} />
              <p>אין בעל נכס מקושר.</p>
              <button className="btn btn-primary" onClick={() => { setPanel(null); navigate(`/properties/${id}/edit`); }}>
                הוסף פרטי בעל הנכס
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
            <button className="btn btn-primary" onClick={() => { setPanel(null); navigate(`/properties/${id}/edit`); }}>
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
            <button className="btn btn-primary" onClick={() => { setPanel(null); navigate(`/properties/${id}/edit`); }}>
              <Edit3 size={14} />ערוך הערות ומאפיינים
            </button>
          </div>
        </PropertyPanelSheet>
      )}

      {/* MLS parity — pipeline (J9) */}
      {panel === 'pipeline' && (
        <PropertyPanelSheet
          title="צנרת תיווך"
          subtitle="שלב, עמלה, סוכן ראשי, בלעדיות, רצינות מוכר, הערות מתווך"
          width="lg"
          onClose={() => setPanel(null)}
        >
          <PropertyPipelineBlock
            property={property}
            onSaved={() => { load(); }}
            toast={toast}
          />
        </PropertyPanelSheet>
      )}

      {/* MLS parity — adverts (F1) */}
      {panel === 'adverts' && (
        <PropertyPanelSheet
          title="מודעות פרסום"
          subtitle="מודעה אחת לכל ערוץ פרסום"
          width="lg"
          onClose={() => setPanel(null)}
        >
          <AdvertsPanel propertyId={property.id} toast={toast} />
        </PropertyPanelSheet>
      )}

      {/* MLS parity — assignees (J10) */}
      {panel === 'assignees' && (
        <PropertyPanelSheet
          title="שותפים לנכס"
          subtitle="שיוף סוכנים נוספים מהמשרד"
          width="lg"
          onClose={() => setPanel(null)}
        >
          <PropertyAssigneesPanel propertyId={property.id} toast={toast} />
        </PropertyPanelSheet>
      )}

      {/* MLS parity — matching customers (C3 reverse) */}
      {panel === 'matching' && (
        <PropertyPanelSheet
          title="לקוחות תואמים"
          subtitle="לקוחות שפרופיל החיפוש שלהם תואם לנכס הזה"
          width="lg"
          onClose={() => setPanel(null)}
        >
          <MatchingList propertyId={property.id} />
        </PropertyPanelSheet>
      )}

      {/* MLS parity — reminders (D1) */}
      {panel === 'reminders' && (
        <PropertyPanelSheet
          title="תזכורות לנכס"
          width="lg"
          onClose={() => setPanel(null)}
        >
          <RemindersPanel scope={{ propertyId: property.id }} />
        </PropertyPanelSheet>
      )}

      {/* MLS parity — activity (H3) */}
      {panel === 'activity' && (
        <PropertyPanelSheet
          title="יומן פעילות"
          subtitle="כל הפעולות שבוצעו על הנכס"
          width="lg"
          onClose={() => setPanel(null)}
        >
          <ActivityPanel scope={{ propertyId: property.id }} />
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

      {prospectOpen && (
        <ProspectDialog
          property={property}
          onClose={() => setProspectOpen(false)}
          onCreated={() => { load(); }}
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

      {/* Swap or set the linked Owner without leaving the page. Picker
          handles BOTH "pick existing" and "create new owner inline" via
          OwnerEditDialog. After a pick we PATCH the property and reload
          so the dashboard reflects the change instantly. */}
      <OwnerPicker
        open={ownerPickerOpen}
        onClose={() => setOwnerPickerOpen(false)}
        onPick={async (o) => {
          if (!o?.id) return;
          setOwnerSaving(true);
          try {
            await api.updateProperty(property.id, { propertyOwnerId: o.id });
            await load();
            toast?.success?.(`בעל הנכס עודכן ל${o.name}`);
          } catch (e) {
            toast?.error?.(e?.message || 'עדכון בעל הנכס נכשל');
          } finally {
            setOwnerSaving(false);
            setOwnerPickerOpen(false);
          }
        }}
      />

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
          <span>שלח בוואטסאפ</span>
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
