import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  MapPin,
  Building2,
  Phone,
  CheckCircle2,
  Check,
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
  Bell,
  Activity,
  Target,
  Printer,
  Maximize2,
  Copy,
  Upload,
  Banknote,
} from 'lucide-react';
import { popoutCurrentRoute } from '../lib/popout';
import { printPage } from '../lib/print';
import api from '../lib/api';
import { formatFloor } from '../lib/formatFloor';
import { inputPropsForPrice } from '../lib/inputProps';
import { displayPrice } from '../lib/display';
import { PROPERTY_STAGE_LABELS } from '../lib/mlsLabels';
import { useAuth } from '../lib/auth';
import MarketingActionDialog from '../components/MarketingActionDialog';
import ConfirmDialog from '../components/ConfirmDialog';
import ProspectDialog from '../components/ProspectDialog';
import PropertyPhotoManager from '../components/PropertyPhotoManager';
import PropertyVideoManager from '../components/PropertyVideoManager';
import OwnerPicker from '../components/OwnerPicker';
import WhatsAppSheet from '../components/WhatsAppSheet';
import ShareDialog from '../components/ShareDialog';
import TransferPropertyDialog from '../components/TransferPropertyDialog';
import LeadPickerSheet from '../components/LeadPickerSheet';
import StickyActionBar from '../components/StickyActionBar';
import WhatsAppIcon from '../components/WhatsAppIcon';
import PageTour from '../components/PageTour';
import MarketContextCard from '../components/MarketContextCard';
import PropertyPanelSheet from '../components/PropertyPanelSheet';
import AdvertsPanel from '../components/AdvertsPanel';
import RemindersPanel from '../components/RemindersPanel';
import AiMatchesDrawer from '../components/AiMatchesDrawer';
import ActivityPanel from '../components/ActivityPanel';
import PropertyAgreementsSection from '../components/PropertyAgreementsSection';
import PropertyBrokersCard from '../components/PropertyBrokersCard';
import PropertyInterestsPanel from '../components/PropertyInterestsPanel';
import OwnerActivityPanel from '../components/OwnerActivityPanel';
import OwnerAgreementDialog from '../components/OwnerAgreementDialog';
import { openWhatsApp, shareWithPhotos, shareToInstagramStory } from '../native/share';
import { isNative } from '../native/platform';
import { track } from '../lib/analytics';
import { telUrl, wazeUrl } from '../lib/waLink';
import { leadMatchesProperty } from './Properties';
import { relativeDate } from '../lib/relativeDate';
import {
  buildVariables as tplBuildVars,
  renderTemplate as tplRender,
  pickTemplateKind as tplPickKind,
} from '../lib/templates';
import { useToast } from '../lib/toast';
import './PropertyDetail.css';

// Cream & Gold DT tokens — inline styles for the page top-shell
// (toolbar + header card). The dashboard body below (PropertyHero,
// KPI strip, dashboard cards, panels) keeps its existing class-based
// markup and already renders cream & gold via [data-theme=light].
const _DT = {
  cream: '#f7f3ec', cream2: '#efe9df', cream3: '#e8dfcf', cream4: '#fbf7f0',
  white: '#ffffff',
  ink: '#1e1a14',
  muted: '#6b6356',
  gold: '#b48b4c', goldLight: '#d9b774', goldDark: '#7a5c2c',
  goldSoft: 'rgba(180,139,76,0.12)',
  border: 'rgba(30,26,20,0.08)',
  success: '#15803d', danger: '#b91c1c',
};
const _FONT = { fontFamily: 'Assistant, Heebo, -apple-system, sans-serif' };

const PD_DT = {
  toolbar: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    gap: 12, flexWrap: 'wrap', marginBottom: 16,
  },
  backLink: {
    ..._FONT,
    display: 'inline-flex', alignItems: 'center', gap: 8,
    color: _DT.ink, textDecoration: 'none',
    fontSize: 13, fontWeight: 800,
    background: _DT.white,
    border: `1px solid ${_DT.border}`,
    borderRadius: 999,
    padding: '8px 16px',
    boxShadow: '0 1px 3px rgba(30,26,20,0.06)',
    transition: 'background 0.15s, border-color 0.15s, box-shadow 0.15s',
  },
  actionsRow: { display: 'flex', gap: 6, flexWrap: 'wrap' },
  primaryBtn: {
    ..._FONT,
    background: `linear-gradient(180deg, ${_DT.goldLight}, ${_DT.gold})`,
    border: 'none', color: _DT.ink,
    padding: '7px 14px', borderRadius: 10, cursor: 'pointer',
    fontSize: 12, fontWeight: 800,
    display: 'inline-flex', gap: 5, alignItems: 'center',
    boxShadow: '0 4px 10px rgba(180,139,76,0.3)',
    textDecoration: 'none',
  },
  secondaryBtn: {
    ..._FONT, background: _DT.white, border: `1px solid ${_DT.border}`,
    padding: '7px 12px', borderRadius: 10, cursor: 'pointer',
    fontSize: 12, fontWeight: 700,
    display: 'inline-flex', gap: 5, alignItems: 'center', color: _DT.ink,
    textDecoration: 'none',
  },
  ghostBtn: {
    ..._FONT, background: 'transparent', border: `1px solid ${_DT.border}`,
    padding: '7px 12px', borderRadius: 10, cursor: 'pointer',
    fontSize: 12, fontWeight: 700,
    display: 'inline-flex', gap: 5, alignItems: 'center', color: _DT.ink,
    textDecoration: 'none',
  },
  dangerBtn: {
    ..._FONT, background: 'rgba(185,28,28,0.08)',
    border: `1px solid rgba(185,28,28,0.2)`,
    padding: '7px 12px', borderRadius: 10, cursor: 'pointer',
    fontSize: 12, fontWeight: 700,
    display: 'inline-flex', gap: 5, alignItems: 'center', color: _DT.danger,
  },
  headerCard: {
    background: _DT.white, border: `1px solid ${_DT.border}`,
    borderRadius: 14, padding: 20, marginBottom: 16,
    display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
  },
  headerAvatar: {
    width: 64, height: 64, borderRadius: 14,
    background: `linear-gradient(160deg, ${_DT.goldLight}, ${_DT.gold})`,
    color: _DT.ink, display: 'grid', placeItems: 'center',
    flexShrink: 0,
  },
  headerTitle: {
    fontSize: 22, fontWeight: 800, letterSpacing: -0.5, margin: 0,
    color: _DT.ink,
  },
  headerSub: {
    display: 'inline-flex', alignItems: 'center', gap: 10,
    fontSize: 13, color: _DT.muted, marginTop: 6, flexWrap: 'wrap',
  },
  chipRow: {
    display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
    marginTop: 8,
  },
  price: {
    fontSize: 20, fontWeight: 800, color: _DT.goldDark,
    letterSpacing: -0.3, whiteSpace: 'nowrap',
  },
};

function statusChipMeta(status) {
  const s = (status || '').toUpperCase();
  if (s === 'SOLD')       return { label: 'נמכר',    bg: 'rgba(21,128,61,0.12)',  fg: _DT.success };
  if (s === 'OFF_MARKET') return { label: 'הוסר',    bg: 'rgba(107,99,86,0.12)',  fg: _DT.muted };
  if (s === 'PAUSED')     return { label: 'מושהה',   bg: 'rgba(180,139,76,0.12)', fg: _DT.goldDark };
  if (s === 'ARCHIVED')   return { label: 'בארכיון', bg: 'rgba(30,26,20,0.08)',   fg: _DT.ink };
  return { label: 'פעיל', bg: 'rgba(21,128,61,0.12)', fg: _DT.success };
}

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

// Local wrapper around the canonical displayPrice helper. The only
// extra logic here is the "/חודש" suffix for rent-magnitude prices —
// the heuristic stays for back-compat (a future cleanup can switch
// to property.category === 'RENT' once every caller passes a property).
function formatPrice(price) {
  if (price == null || price === '') return '—';
  const base = displayPrice(price);
  if (Number(price) < 10000) return `${base}/חודש`;
  return base;
}

function buildFullWhatsAppMessage(prop, agent, opts = {}) {
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
  // Same precedence as the customerLink builder in the component:
  // server-resolved publicPath (always pretty) → inline agent.slug +
  // prop.slug → bare /p/:id fallback.
  const pUrl = opts.publicSlugPath
    ? `${window.location.origin}${opts.publicSlugPath}`
    : prop.slug && agent?.slug
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
  const [property, setProperty] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [currentImage, setCurrentImage] = useState(0);
  const [actionDialog, setActionDialog] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [managingPhotos, setManagingPhotos] = useState(false);
  const [managingVideos, setManagingVideos] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [waShare, setWaShare] = useState(null);
  // Sprint 7 — universal Share dialog (property channel picker).
  const [shareOpen, setShareOpen] = useState(false);
  const [templates, setTemplates] = useState(null);
  const [leads, setLeads] = useState([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerLeadsOverride, setPickerLeadsOverride] = useState(null);
  const [lightboxIdx, setLightboxIdx] = useState(null);
  // 2026-05-10 — V1 Refined layout state.
  // `tab` drives the right-hand body (הנכס / בעל הנכס / מתעניינים / פעילות).
  // `moreMenuOpen` toggles the kebab menu in the header for secondary actions.
  // `interests` / `offers` are fetched at the page level so the KPI hero
  // can reflect live counts (PropertyInterestsPanel re-fetches them too —
  // double fetch is harmless, the alternative is hoisting state).
  const [tab, setTab] = useState('property');
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [interests, setInterests] = useState([]);
  const [offers, setOffers] = useState([]);
  const [agreementsCount, setAgreementsCount] = useState(0);
  const [statusBusy, setStatusBusy] = useState(false);
  // Owner-side exclusivity-agreement popup (was: routed to /edit)
  const [exclusivityOpen, setExclusivityOpen] = useState(false);
  // Landing-link copy feedback. Declared up here with the rest of the
  // top-level hooks — putting it below the `if (loading) return …`
  // guard triggers "Rendered more hooks than during the previous
  // render" on the loading → loaded transition.
  const [landingCopied, setLandingCopied] = useState(false);
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
  // Sprint 5 — "✨ התאמות חכמות" drawer open-state
  const [aiMatchesOpen, setAiMatchesOpen] = useState(false);
  // OwnerPicker for swapping the linked Owner without leaving the page.
  const [ownerPickerOpen, setOwnerPickerOpen] = useState(false);
  const [ownerSaving, setOwnerSaving] = useState(false);
  // Sprint 5 — AI description generator state. Holds the latest draft +
  // highlights while the agent decides whether to save. Keeping it
  // out-of-property means the agent can preview before committing to
  // the notes field, and we don't flicker the read-only panel text.
  const [aiDesc, setAiDesc] = useState(null); // { description, highlights } | null
  const [aiBusy, setAiBusy] = useState(false);
  // Resolved (agentSlug, propertySlug) pair from the public lookup
  // helper. We hit /api/public/lookup/property/:id once after the
  // property loads so the share link is always the slug-friendly URL
  // ("/agents/etty-dvash/דירה-4-חד-רמלה-משה-צדקה") instead of the
  // bare cuid ("/p/cmofu..."). The lookup endpoint also lazily mints
  // missing slugs server-side, so this works even on rows that were
  // created before the slug system existed.
  const [publicSlugPath, setPublicSlugPath] = useState(null);

  useEffect(() => {
    api.listTemplates().then((r) => setTemplates(r.templates || [])).catch(() => {});
    api.listLeads().then((r) => setLeads(r.items || r.leads || [])).catch(() => {});
  }, []);

  // V1 Refined — page-level fetch for KPI hero (interests count + top
  // active offer). Re-runs whenever the property id changes; tabs that
  // own these collections (PropertyInterestsPanel) keep their own
  // fetches so live edits are reflected without prop-threading.
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    api.listPropertyInterests(id)
      .then((r) => { if (!cancelled) setInterests(r.items || []); })
      .catch(() => {});
    api.listPropertyOffers(id)
      .then((r) => { if (!cancelled) setOffers(r.items || []); })
      .catch(() => {});
    // Agreements count for the "הסכמים" pill — listAgreements is the
    // canonical brokerage-agreement endpoint (signed contracts), filtered
    // by propertyId server-side.
    api.listAgreements({ propertyId: id })
      .then((r) => { if (!cancelled) setAgreementsCount((r.items || []).length); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [id]);

  // Close the kebab menu on outside-click / Escape so it behaves like a
  // normal native menu. Keyed off `moreMenuOpen` so the listener only
  // attaches while the menu is visible.
  useEffect(() => {
    if (!moreMenuOpen) return undefined;
    const onDoc = (e) => {
      if (!e.target.closest?.('.prd-more')) setMoreMenuOpen(false);
    };
    const onKey = (e) => { if (e.key === 'Escape') setMoreMenuOpen(false); };
    document.addEventListener('click', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('click', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [moreMenuOpen]);

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

  // Fetch the canonical slug pair so "שתף נכס" copies the pretty URL
  // even when user.slug or property.slug isn't yet populated client-
  // side. The lookup is public + cheap (1 row + 2 slug-mint calls)
  // and runs once per id.
  useEffect(() => {
    let cancelled = false;
    if (!id) return undefined;
    api.lookupPropertySlug(id)
      .then((r) => {
        if (cancelled) return;
        if (r?.publicPath) setPublicSlugPath(r.publicPath);
      })
      .catch(() => { /* fall back to /p/:id */ });
    return () => { cancelled = true; };
  }, [id]);

  // Sprint 5 — Ask the backend to draft a marketing description. The
  // endpoint calls Claude Opus 4.7 and returns {description, highlights}.
  // We stash the draft in local state first so the agent can accept /
  // reject before it overwrites `notes`. `useProp` guard prevents the
  // call from firing before the property has loaded.
  const handleGenerateDescription = async () => {
    if (!property?.id || aiBusy) return;
    setAiBusy(true);
    try {
      const res = await api.generatePropertyDescription(property.id);
      setAiDesc({
        description: res.description || '',
        highlights: Array.isArray(res.highlights) ? res.highlights : [],
      });
      toast.success('תיאור נוצר בהצלחה');
    } catch (e) {
      toast.error(e?.message || 'יצירת התיאור נכשלה');
    } finally {
      setAiBusy(false);
    }
  };

  // Commit the draft into the `notes` field via the existing update
  // endpoint. Keeps the source-of-truth write path identical to the
  // manual "ערוך הערות" flow — same validation, same audit trail.
  const handleSaveAiDescription = async () => {
    if (!aiDesc?.description || !property?.id) return;
    setAiBusy(true);
    try {
      // Bullet points get appended at the bottom of the freeform text
      // so agents can copy/paste into Yad2 / Madlan without reformatting.
      const bulletBlock = aiDesc.highlights.length
        ? '\n\n' + aiDesc.highlights.map((h) => `• ${h}`).join('\n')
        : '';
      await api.updateProperty(property.id, {
        notes: aiDesc.description + bulletBlock,
      });
      setAiDesc(null);
      toast.success('התיאור נשמר');
      await load();
    } catch (e) {
      toast.error(e?.message || 'שמירת התיאור נכשלה');
    } finally {
      setAiBusy(false);
    }
  };

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

  // PERF-005 — gallery slides render in a ~1200 px viewport; the
  // 768 px `urlCard` variant is plenty. The lightbox keeps the full
  // URL so zooming-in is still sharp. Both arrays stay in lockstep so
  // existing keyboard nav (`lightboxIdx`) just works.
  const galleryImages = property.imageList?.length
    ? property.imageList.map((i) => i.urlCard || i.url)
    : (property.images?.length ? property.images : [
        'https://via.placeholder.com/1200x675?text=Estia',
      ]);
  const images = galleryImages;
  const lightboxImages = property.imageList?.length
    ? property.imageList.map((i) => i.url)
    : images;

  const mapsQuery = encodeURIComponent(`${property.street}, ${property.city}`);
  const mapsEmbed = `https://www.google.com/maps?q=${mapsQuery}&output=embed`;
  const mapsOpen = `https://www.google.com/maps/search/?api=1&query=${mapsQuery}`;

  // Prefer the slug pair resolved from the public lookup helper
  // (server-side lazy-mints missing slugs); fall back to user.slug +
  // property.slug if we have them client-side; last resort is the bare
  // /p/:id short link. End result: "שתף נכס" always copies the
  // human-readable URL when the property has any kind of public slug,
  // never the cuid.
  const customerLink = publicSlugPath
    ? `${window.location.origin}${publicSlugPath}`
    : property.slug && user?.slug
    ? `${window.location.origin}/agents/${encodeURI(user.slug)}/${encodeURI(property.slug)}`
    : `${window.location.origin}/p/${property.id}`;

  // Per-asset landing page URL. Same slug pair, different frontend
  // route — serves a photo-first "brochure" (no price / details) that
  // drives inquiries through the public form. Falls back to the
  // internal id if slugs haven't been minted yet.
  const landingLink = property.slug && user?.slug
    ? `${window.location.origin}/l/${encodeURI(user.slug)}/${encodeURI(property.slug)}`
    : null;
  const copyLandingLink = async () => {
    let url = landingLink;
    if (!url) {
      // No slugs yet — hit the lookup endpoint to mint + return them.
      try {
        const res = await api.lookupPropertySlug(property.id);
        if (res?.agentSlug && res?.propertySlug) {
          url = `${window.location.origin}/l/${encodeURI(res.agentSlug)}/${encodeURI(res.propertySlug)}`;
        }
      } catch { /* fall through */ }
    }
    if (!url) {
      toast?.error?.('לא ניתן להפיק קישור כרגע');
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setLandingCopied(true);
      toast?.success?.('קישור דף הנחיתה הועתק');
      setTimeout(() => setLandingCopied(false), 1800);
    } catch {
      // Legacy execCommand fallback — covers contexts where the async
      // Clipboard API is unavailable. window.prompt would also work
      // but doesn't render in iOS WKWebView, leaving the user stuck.
      try {
        const ta = document.createElement('textarea');
        ta.value = url;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        if (ok) {
          setLandingCopied(true);
          toast?.success?.('קישור דף הנחיתה הועתק');
          setTimeout(() => setLandingCopied(false), 1800);
        } else {
          toast?.error?.('ההעתקה נכשלה — נסה שוב');
        }
      } catch {
        toast?.error?.('ההעתקה נכשלה — נסה שוב');
      }
    }
  };

  const buildMessage = () => {
    const kind = tplPickKind(property, 'client');
    const tpl = templates?.find((t) => t.kind === kind);
    if (tpl?.body) {
      const vars = tplBuildVars(property, user, { stripAgent: false });
      return tplRender(tpl.body, vars);
    }
    return buildFullWhatsAppMessage(
      property,
      {
        displayName: user?.displayName,
        agency: user?.agentProfile?.agency,
        phone: user?.phone,
        bio: user?.agentProfile?.bio,
        slug: user?.slug,
      },
      { publicSlugPath },
    );
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

  // Sprint 7 — the Share button now opens the universal ShareDialog
  // (WhatsApp / SMS / email / copy / OS share). Quick single-tap OS
  // share remains available via the "מערכת" channel inside the dialog.
  const handleShare = () => {
    setShareOpen(true);
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

  // Duplicate the current property — clones address/specs/owner/photos
  // into a fresh draft and navigates to /properties/:newId/edit so the
  // agent can tweak the copy. Mirrors the row-level affordance in
  // /properties (Properties.jsx) so the action is reachable from the
  // detail page too — the small icon-only button there was easy to
  // miss. (`duplicating` state declared up top with the other useStates
  // — hooks must run in the same order on every render, including
  // after early returns.)
  const handleDuplicate = async () => {
    if (duplicating) return;
    setDuplicating(true);
    try {
      const { property: created } = await api.duplicateProperty(property.id);
      toast.success('הנכס שוכפל — מעבר לעריכה');
      navigate(`/properties/${created.id}/edit?duplicated=1`);
    } catch (e) {
      toast.error(e?.message || 'שכפול נכשל');
    } finally {
      setDuplicating(false);
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

  // ── V1 Refined — derived KPI values ─────────────────────────────
  // Top active offer (status = NEW) — drives the "הצעה פעילה" tile in the
  // KPI hero. Falls back to the highest amount when nothing is NEW.
  const newOffers = offers.filter((o) => o.status === 'NEW' || o.status === 'NEGOTIATING');
  const topOfferAmount = newOffers.length
    ? Math.max(...newOffers.map((o) => Number(o.amount) || 0))
    : (offers.length ? Math.max(...offers.map((o) => Number(o.amount) || 0)) : null);
  const interestsCount = interests.length;
  // Active interests (status = IN_PROGRESS) drive the "מתעניינים פעילים"
  // sub-line on the KPI tile.
  const activeInterestsCount = interests.filter((it) => it.status === 'IN_PROGRESS').length;
  const viewingsCount = Number(property._count?.viewings ?? 0);
  // Market delta — pulled from MarketContextCard's data when present.
  // For the KPI sub-line we just show the price-per-sqm for now; the
  // panel below holds the full insights breakdown.
  const pricePerSqm = property.marketingPrice && property.sqm
    ? Math.round(Number(property.marketingPrice) / Number(property.sqm))
    : null;

  // ── V1 Refined — pause / resume marketing ──────────────────────
  // Server accepts ACTIVE / PAUSED via PATCH. Optimistic update keeps the
  // header pill in sync; on failure we revert and toast the error.
  const togglePauseMarketing = async () => {
    if (statusBusy) return;
    const next = property.status === 'PAUSED' ? 'ACTIVE' : 'PAUSED';
    setStatusBusy(true);
    const prev = property;
    setProperty({ ...property, status: next });
    try {
      await api.updateProperty(property.id, { status: next });
      toast.success(next === 'PAUSED' ? 'השיווק הושהה' : 'השיווק חודש');
      await load();
    } catch (e) {
      setProperty(prev);
      toast.error(e?.message || 'עדכון הסטטוס נכשל');
    } finally {
      setStatusBusy(false);
    }
  };

  // ── V1 Refined — next-best action heuristic ────────────────────
  // Picks the most pressing pending interaction so the action rail can
  // surface a single clear CTA at the top. Order:
  //   1. A NEW or NEGOTIATING offer waiting for a response
  //   2. A "hot" lead match that hasn't been contacted yet
  //   3. Owner exclusivity expiring within 14 days
  //   4. null (rail just shows the 6 quick actions)
  const nextAction = (() => {
    if (newOffers.length > 0) {
      const top = newOffers[0];
      return {
        kind: 'offer',
        title: `חזור ל${top.buyerName || 'מתעניין'} על ההצעה`,
        sub: `${formatPrice(top.amount)} · ממתינה למענה`,
        cta: 'התקשר עכשיו',
        phone: top.buyerPhone,
        onClick: () => {
          if (top.buyerPhone) window.location.href = telUrl(top.buyerPhone);
          else setTab('buyers');
        },
      };
    }
    if (exclusivityDaysLeft != null && exclusivityDaysLeft >= 0 && exclusivityDaysLeft <= 14) {
      return {
        kind: 'exclusivity',
        title: 'בלעדיות עומדת להסתיים',
        sub: `${exclusivityDaysLeft} ימים נותרו · עדכן את הבעלים`,
        cta: 'פתח כרטיס בעלים',
        onClick: () => setTab('owner'),
      };
    }
    return null;
  })();

  return (
    <div className="property-detail prd-page" data-theme="light">
      <PageTour
        pageKey="property-detail"
        steps={[
          { target: 'body', placement: 'center',
            title: 'כרטיס הנכס',
            content: 'KPI מהיר למעלה, פעולות מהירות בצד, וטאבים לפי הקשר: הנכס · בעל הנכס · מתעניינים · פעילות.' },
        ]}
      />

      {/* V1 Refined header — breadcrumb + identity + status pills + Share/Edit
          + kebab menu for secondary actions. The legacy toolbar (10+ buttons)
          collapsed into a single overflow menu so the row is scannable. */}
      <header className="prd-header">
        <Link to="/properties" className="prd-breadcrumb">
          <ArrowRight size={13} aria-hidden="true" />
          <span>נכסים · {property.city || ''}</span>
        </Link>
        <div className="prd-id-row">
          <div className="prd-id">
            <h1>
              {[property.street, property.city].filter(Boolean).join(', ') || property.type || 'נכס ללא כתובת'}
            </h1>
            <div className="prd-id-meta">
              {[
                property.neighborhood,
                property.type,
                property.rooms != null ? `${property.rooms} חד׳` : null,
                property.sqm != null ? `${property.sqm} מ״ר` : null,
                property.floor != null ? `קומה ${formatFloor(property.floor, property.totalFloors)}` : null,
              ].filter(Boolean).join(' · ')}
            </div>
          </div>
          <div className="prd-id-actions">
            {(() => {
              const sc = statusChipMeta(property.status);
              const cls = property.status === 'SOLD' ? 'prd-pill prd-pill-success'
                : property.status === 'PAUSED' ? 'prd-pill prd-pill-gold'
                : property.status === 'OFF_MARKET' || property.status === 'ARCHIVED' ? 'prd-pill prd-pill-muted'
                : 'prd-pill prd-pill-success';
              return (
                <span className={cls}>
                  <span className="prd-pill-dot" />
                  {sc.label}{daysListed != null ? ` · יום ${daysListed}` : ''}
                </span>
              );
            })()}
            {hasExclusivity && exclusivityDaysLeft != null && exclusivityDaysLeft > 0 && (
              <span className="prd-pill prd-pill-gold">
                <Sparkles size={11} /> בלעדיות · {exclusivityDaysLeft} ימים
              </span>
            )}
            <button type="button" className="prd-btn" onClick={handleShare}>
              <Share2 size={13} aria-hidden="true" /> שתף
            </button>
            <button
              type="button"
              className="prd-btn prd-btn-primary"
              onClick={() => navigate(`/properties/${id}/edit`)}
            >
              <Edit3 size={13} aria-hidden="true" /> ערוך נכס
            </button>
            <div className="prd-more">
              <button
                type="button"
                className="prd-more-btn"
                aria-haspopup="menu"
                aria-expanded={moreMenuOpen}
                aria-label="עוד פעולות"
                onClick={(e) => { e.stopPropagation(); setMoreMenuOpen((v) => !v); }}
              >
                ⋯
              </button>
              {moreMenuOpen && (
                <div className="prd-more-menu" role="menu">
                  <button type="button" className="prd-more-item" onClick={() => { setMoreMenuOpen(false); handleDuplicate(); }} disabled={duplicating}>
                    <Copy size={14} /> {duplicating ? 'משכפל…' : 'שכפל נכס'}
                  </button>
                  <button type="button" className="prd-more-item" onClick={() => { setMoreMenuOpen(false); copyLandingLink(); }}>
                    {landingCopied ? <Check size={14} /> : <Sparkles size={14} />}
                    {landingCopied ? 'הקישור הועתק' : 'דף נחיתה ללקוחות'}
                  </button>
                  <button type="button" className="prd-more-item" onClick={() => { setMoreMenuOpen(false); setProspectOpen(true); }}>
                    <UserPlus size={14} /> צור הסכם תיווך
                  </button>
                  <button type="button" className="prd-more-item" onClick={() => { setMoreMenuOpen(false); setTransferOpen(true); }}>
                    <ArrowLeftRight size={14} /> העבר לסוכן אחר
                  </button>
                  {isNative() && (
                    <button type="button" className="prd-more-item" onClick={() => { setMoreMenuOpen(false); handleInstagramStory(); }}>
                      <Sparkles size={14} /> שתף בסטורי
                    </button>
                  )}
                  <div className="prd-more-sep" />
                  <button type="button" className="prd-more-item" onClick={() => { setMoreMenuOpen(false); printPage(); }}>
                    <Printer size={14} /> הדפס
                  </button>
                  <button type="button" className="prd-more-item" onClick={() => { setMoreMenuOpen(false); popoutCurrentRoute(); }}>
                    <Maximize2 size={14} /> פתח בחלון חדש
                  </button>
                  <div className="prd-more-sep" />
                  <button type="button" className="prd-more-item prd-more-item-danger" onClick={() => { setMoreMenuOpen(false); setConfirmDelete(true); }}>
                    <Trash2 size={14} /> מחק נכס
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* KPI hero — 5 tiles. Most actionable summary at the top of the page. */}
      <div className="prd-kpis">
        <div className="prd-kpi">
          <div className="prd-kpi-head">
            <span className="prd-kpi-icon"><Target size={15} aria-hidden="true" /></span>
            <span className="prd-kpi-label">מחיר ביקוש</span>
          </div>
          <div className="prd-kpi-value">{property.marketingPrice != null ? formatPrice(property.marketingPrice) : '—'}</div>
          <div className="prd-kpi-sub prd-tone-info">
            {pricePerSqm != null ? `₪${pricePerSqm.toLocaleString('he-IL')} למ״ר` : (property.category === 'RENT' ? 'להשכרה' : 'למכירה')}
          </div>
        </div>
        <div className="prd-kpi">
          <div className="prd-kpi-head">
            <span className="prd-kpi-icon"><Users size={15} aria-hidden="true" /></span>
            <span className="prd-kpi-label">מתעניינים</span>
          </div>
          <div className="prd-kpi-value">{interestsCount}</div>
          <div className={`prd-kpi-sub ${activeInterestsCount > 0 ? 'prd-tone-info' : 'prd-tone-muted'}`}>
            {activeInterestsCount > 0 ? `${activeInterestsCount} פעילים` : 'אין פעילים'}
          </div>
        </div>
        <div className="prd-kpi">
          <div className="prd-kpi-head">
            <span className="prd-kpi-icon"><Activity size={15} aria-hidden="true" /></span>
            <span className="prd-kpi-label">צפיות</span>
          </div>
          <div className="prd-kpi-value">{pageViews}</div>
          <div className={`prd-kpi-sub ${pageViews > 0 ? 'prd-tone-info' : 'prd-tone-muted'}`}>
            {inquiriesCount > 0 ? `${inquiriesCount} פניות` : 'כניסות לעמוד'}
          </div>
        </div>
        <div className="prd-kpi">
          <div className="prd-kpi-head">
            <span className="prd-kpi-icon"><MapPin size={15} aria-hidden="true" /></span>
            <span className="prd-kpi-label">סיורים</span>
          </div>
          <div className="prd-kpi-value">{viewingsCount}</div>
          <div className={`prd-kpi-sub ${viewingsCount > 0 ? 'prd-tone-success' : 'prd-tone-muted'}`}>
            {daysListed != null ? `${daysListed} ימים בשוק` : '—'}
          </div>
        </div>
        <div className="prd-kpi">
          <div className="prd-kpi-head">
            <span className="prd-kpi-icon"><Banknote size={15} aria-hidden="true" /></span>
            <span className="prd-kpi-label">הצעה פעילה</span>
          </div>
          <div className="prd-kpi-value">{topOfferAmount != null ? formatPrice(topOfferAmount) : '—'}</div>
          <div className={`prd-kpi-sub ${topOfferAmount != null ? 'prd-tone-hot' : 'prd-tone-muted'}`}>
            {newOffers.length > 0 ? `${newOffers.length} הצעות פתוחות` : 'אין הצעות פתוחות'}
          </div>
        </div>
      </div>

      {/* Main grid — action rail (left) + tabbed body (right). */}
      <div className="prd-grid">
        {/* LEFT — Quick actions rail */}
        <aside className="prd-rail">
          <div className="prd-rail-label">פעולות מהירות</div>

          {nextAction && (
            <div className="prd-next">
              <div className="prd-next-head">
                <span className="prd-next-bolt"><Sparkles size={13} aria-hidden="true" /></span>
                <span className="prd-next-tag">הצעד הבא</span>
              </div>
              <div className="prd-next-title">{nextAction.title}</div>
              <div className="prd-next-sub">{nextAction.sub}</div>
              <button type="button" className="prd-next-cta" onClick={nextAction.onClick}>
                {nextAction.kind === 'offer' && nextAction.phone ? <Phone size={12} /> : <ChevronLeft size={12} />}
                {nextAction.cta}
              </button>
            </div>
          )}

          {/* Call owner */}
          <button
            type="button"
            className="prd-quick"
            onClick={() => {
              if (ownerPhone) window.location.href = telUrl(ownerPhone);
              else setOwnerPickerOpen(true);
            }}
            disabled={!ownerPhone && !linkedOwner}
          >
            <span className="prd-quick-ico"><Phone size={15} aria-hidden="true" /></span>
            <span className="prd-quick-body">
              <span className="prd-quick-label">{ownerPhone ? 'התקשר לבעלים' : 'הוסף בעל נכס'}</span>
              <span className="prd-quick-sub">{ownerName || 'עדיין לא מקושר'}</span>
            </span>
          </button>

          {/* WhatsApp to buyers */}
          <button
            type="button"
            className="prd-quick prd-quick-wa"
            onClick={handleWhatsApp}
          >
            <span className="prd-quick-ico"><WhatsAppIcon size={15} /></span>
            <span className="prd-quick-body">
              <span className="prd-quick-label">WhatsApp לקונים</span>
              <span className="prd-quick-sub">
                {(() => {
                  const matches = (leads || []).filter((l) => leadMatchesProperty(l, property));
                  return `${matches.length} מתעניינים תואמים`;
                })()}
              </span>
            </span>
          </button>

          {/* Share landing page */}
          <button type="button" className="prd-quick" onClick={copyLandingLink}>
            <span className="prd-quick-ico">{landingCopied ? <Check size={15} /> : <Share2 size={15} />}</span>
            <span className="prd-quick-body">
              <span className="prd-quick-label">{landingCopied ? 'הקישור הועתק' : 'שתף דף נחיתה'}</span>
              <span className="prd-quick-sub" dir="ltr">
                {landingLink ? landingLink.replace(/^https?:\/\//, '') : 'estia.app/l/...'}
              </span>
            </span>
          </button>

          {/* Manage media */}
          <button type="button" className="prd-quick" onClick={() => setManagingPhotos(true)}>
            <span className="prd-quick-ico"><Images size={15} /></span>
            <span className="prd-quick-body">
              <span className="prd-quick-label">ניהול תמונות וסרטונים</span>
              <span className="prd-quick-sub">
                {(property.images?.length || 0)} תמונות
                {property.videos?.length ? ` · ${property.videos.length} סרטונים` : ''}
              </span>
            </span>
          </button>

          {/* Exclusivity — opens the owner-side agreement popup. The
              old version routed to the property-edit page; per Adam's
              UX pass we now show a dedicated dialog so the agent can
              compose an EXCLUSIVITY contract without leaving the page. */}
          <button type="button" className="prd-quick" onClick={() => setExclusivityOpen(true)}>
            <span className="prd-quick-ico"><FileText size={15} /></span>
            <span className="prd-quick-body">
              <span className="prd-quick-label">הסכם בלעדיות</span>
              <span className="prd-quick-sub">
                {hasExclusivity
                  ? (exclusivityDaysLeft != null && exclusivityDaysLeft > 0
                    ? `${exclusivityDaysLeft} ימים נותרו`
                    : exclusivityDaysLeft != null && exclusivityDaysLeft <= 0
                    ? 'פג תוקף'
                    : 'פעיל')
                  : 'לא הוגדר — צור הסכם'}
              </span>
            </span>
          </button>

          {/* Brokerage agreement — promoted out of the kebab menu so
              "צור הסכם תיווך" is a single click from the rail (Adam: "the
              צור הסכם תיווך should be accessible through פעולות מהירות").
              Wires into the existing ProspectDialog. */}
          <button
            type="button"
            className="prd-quick"
            onClick={() => setProspectOpen(true)}
          >
            <span className="prd-quick-ico"><UserPlus size={15} /></span>
            <span className="prd-quick-body">
              <span className="prd-quick-label">צור הסכם תיווך</span>
              <span className="prd-quick-sub">לחתימה דיגיטלית של מתעניין</span>
            </span>
          </button>
        </aside>

        {/* RIGHT — Tabs card */}
        <div className="prd-tabs-card">
          {/* Tab strip + More pills */}
          <div className="prd-tabs-strip">
            <div className="prd-tabs" role="tablist">
              {[
                { k: 'property', label: 'הנכס',     icon: <Building2 size={14} /> },
                { k: 'owner',    label: 'בעל הנכס', icon: <User size={14} /> },
                { k: 'buyers',   label: 'מתעניינים', icon: <Users size={14} />, count: interestsCount || null },
                { k: 'activity', label: 'פעילות',   icon: <Activity size={14} /> },
              ].map((t) => (
                <button
                  key={t.k}
                  type="button"
                  role="tab"
                  aria-selected={tab === t.k}
                  className={`prd-tab ${tab === t.k ? 'is-active' : ''}`}
                  onClick={() => setTab(t.k)}
                >
                  <span className="prd-tab-icon">{t.icon}</span>
                  <span>{t.label}</span>
                  {t.count != null && <span className="prd-tab-count">{t.count}</span>}
                </button>
              ))}
            </div>
            <div className="prd-more-pills">
              <button type="button" className="prd-more-pill" onClick={() => setPanel('marketing')} aria-label="פתח פאנל פעולות שיווק">
                <span>שיווק</span>
                <span className="prd-more-pill-count">{done}/{total}</span>
              </button>
              <button type="button" className="prd-more-pill" onClick={() => setManagingPhotos(true)} aria-label="ניהול מדיה (תמונות וסרטונים)">
                <span>מדיה</span>
                <span className="prd-more-pill-count">
                  {(property.images?.length || 0) + (property.videos?.length || 0)}
                </span>
              </button>
              <button type="button" className="prd-more-pill" onClick={() => setTab('buyers')} aria-label="עבור לטאב מתעניינים לצפייה בהצעות">
                <span>הצעות</span>
                <span className="prd-more-pill-count">{offers.length}</span>
              </button>
              <button
                type="button"
                className="prd-more-pill"
                aria-label="גלול אל הסכמי תיווך"
                onClick={() => {
                  document.getElementById('prd-agreements-anchor')
                    ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
              >
                <span>הסכמים</span>
                <span className="prd-more-pill-count">{agreementsCount}</span>
              </button>
            </div>
          </div>

          {/* Tab body — switches by `tab` */}
          <div className="prd-tab-body">
            {tab === 'property' && (
              <div className="prd-prop-grid">
                <div className="prd-card prd-card-flush">
                  <div className="prd-prop-hero">
                    <img src={images[currentImage] || images[0]} alt={`${property.street}, ${property.city}`} />
                    {images.length > 1 && (
                      <div className="prd-prop-thumbs">
                        {images.slice(0, 5).map((g, i) => (
                          <button
                            key={i}
                            type="button"
                            className={`prd-prop-thumb ${i === currentImage ? 'is-active' : ''}`}
                            onClick={() => setCurrentImage(i)}
                            aria-label={`תמונה ${i + 1}`}
                          >
                            <img src={g} alt="" />
                          </button>
                        ))}
                        {images.length > 5 && (
                          <button
                            type="button"
                            className="prd-prop-thumb prd-prop-thumb-more"
                            onClick={() => setLightboxIdx(currentImage)}
                            aria-label={`עוד ${images.length - 5} תמונות`}
                          >
                            +{images.length - 5}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  <div style={{ padding: 20 }}>
                    <div className="prd-card-eyebrow">מפרט</div>
                    <div className="prd-spec-grid">
                      {[
                        { l: 'חדרים',    v: property.rooms ?? '—' },
                        { l: 'שטח',      v: property.sqm != null ? `${property.sqm} מ״ר` : '—' },
                        { l: 'קומה',     v: property.floor != null ? formatFloor(property.floor, property.totalFloors) : '—' },
                        { l: 'מצב',      v: property.renovated || '—' },
                        { l: 'חניה',     v: property.parking ? 'יש' : 'אין' },
                        { l: 'מחסן',     v: property.storage ? 'יש' : 'אין' },
                        { l: 'ממ״ד',     v: property.safeRoom ? 'יש' : 'אין' },
                        { l: 'מעלית',    v: property.elevator ? 'יש' : 'אין' },
                        { l: 'מרפסת',    v: property.balconySize > 0 ? `${property.balconySize} מ״ר` : 'אין' },
                        { l: 'כיוונים',  v: property.airDirections || '—' },
                        { l: 'גיל בניין', v: property.buildingAge != null ? `${property.buildingAge} שנים` : '—' },
                        { l: 'מזגנים',   v: property.ac ? 'יש' : 'אין' },
                      ].map((s, i) => (
                        <div key={i}>
                          <div className="prd-spec-label">{s.l}</div>
                          <div className="prd-spec-value">{s.v}</div>
                        </div>
                      ))}
                    </div>
                    {property.notes && (
                      <>
                        <div className="prd-card-eyebrow" style={{ marginTop: 18 }}>תיאור שיווקי</div>
                        <div style={{ fontSize: 13.5, color: '#3a3329', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                          {property.notes}
                        </div>
                      </>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div className="prd-card">
                    <div className="prd-card-eyebrow">מחיר ושוק</div>
                    <div className="prd-price">{property.marketingPrice != null ? formatPrice(property.marketingPrice) : '—'}</div>
                    <div className="prd-price-row">
                      {pricePerSqm != null && (
                        <span style={{ fontSize: 12, color: '#6b6356', fontWeight: 600 }}>
                          ₪{pricePerSqm.toLocaleString('he-IL')} למ״ר
                        </span>
                      )}
                      <span className={property.category === 'RENT' ? 'prd-pill prd-pill-muted' : 'prd-pill prd-pill-gold'}>
                        {property.category === 'RENT' ? 'להשכרה' : 'למכירה'}
                      </span>
                    </div>
                    {property.street && property.city && (
                      <MarketContextCard
                        propertyId={property.id}
                        propertyCategory={property.category}
                        propertyStreet={property.street}
                        propertyCity={property.city}
                      />
                    )}
                  </div>

                  <div className="prd-card">
                    <div className="prd-card-eyebrow">מיקום</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: '#1e1a14', letterSpacing: -0.3 }}>
                      {property.street}, {property.city}
                    </div>
                    {property.neighborhood && (
                      <div style={{ fontSize: 12, color: '#6b6356', marginTop: 2 }}>{property.neighborhood}</div>
                    )}
                    <div className="dc-map-mini" style={{ marginTop: 12 }}>
                      <iframe
                        title="מיקום הנכס"
                        src={mapsEmbed}
                        loading="lazy"
                        referrerPolicy="no-referrer-when-downgrade"
                      />
                    </div>
                    <a
                      href={mapsOpen}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="prd-btn"
                      style={{ marginTop: 10, display: 'inline-flex' }}
                    >
                      <ExternalLink size={13} /> פתח במפות
                    </a>
                  </div>

                  <PropertyBrokersCard propertyId={property.id} />
                  <PropertyDocuments propertyId={property.id} />
                </div>
              </div>
            )}

            {tab === 'owner' && (
              <div className="prd-owner-grid">
                <div className="prd-card">
                  <div className="prd-owner-id">
                    <div className="prd-owner-avatar">{ownerInitial}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="prd-card-eyebrow">בעל הנכס</div>
                      <div className="prd-owner-name">{ownerName || 'לא מוגדר'}</div>
                      <div className="prd-owner-meta">
                        {ownerPhone || '—'}{ownerEmail ? ` · ${ownerEmail}` : ''}
                      </div>
                    </div>
                  </div>
                  <div className="prd-owner-quick">
                    {ownerPhone && (
                      <a href={telUrl(ownerPhone)} className="prd-quick">
                        <span className="prd-quick-ico"><Phone size={15} /></span>
                        <span className="prd-quick-body">
                          <span className="prd-quick-label">התקשר</span>
                          <span className="prd-quick-sub" dir="ltr">{ownerPhone}</span>
                        </span>
                      </a>
                    )}
                    {ownerPhone && (
                      <button
                        type="button"
                        className="prd-quick prd-quick-wa"
                        onClick={() => openWhatsApp({ phone: ownerPhone, text: `שלום ${ownerName}` })}
                      >
                        <span className="prd-quick-ico"><WhatsAppIcon size={15} /></span>
                        <span className="prd-quick-body">
                          <span className="prd-quick-label">WhatsApp</span>
                          <span className="prd-quick-sub">עדכון שיווק</span>
                        </span>
                      </button>
                    )}
                    {ownerEmail && (
                      <a href={`mailto:${ownerEmail}`} className="prd-quick">
                        <span className="prd-quick-ico"><FileText size={15} /></span>
                        <span className="prd-quick-body">
                          <span className="prd-quick-label">אימייל</span>
                          <span className="prd-quick-sub">דוח שבועי</span>
                        </span>
                      </a>
                    )}
                    <button type="button" className="prd-quick" onClick={() => setExclusivityOpen(true)}>
                      <span className="prd-quick-ico"><FileText size={15} /></span>
                      <span className="prd-quick-body">
                        <span className="prd-quick-label">הסכם בלעדיות</span>
                        <span className="prd-quick-sub">
                          {hasExclusivity
                            ? (exclusivityDaysLeft != null && exclusivityDaysLeft > 0 ? `פעיל · ${exclusivityDaysLeft} ימים` : 'פעיל')
                            : 'לחיצה ליצירת הסכם'}
                        </span>
                      </span>
                    </button>
                  </div>

                  {hasExclusivity && (
                    <div style={{ marginTop: 18 }}>
                      <div className="prd-owner-progress-row">
                        <span style={{ letterSpacing: 0.4, textTransform: 'uppercase' }}>בלעדיות</span>
                        <span style={{ color: '#7a5c2c' }}>
                          {exclusivityDaysLeft != null && exclusivityDaysLeft > 0
                            ? `${exclusivityDaysLeft} ימים נותרו`
                            : exclusivityRel?.label || ''}
                        </span>
                      </div>
                      <div className="prd-owner-progress-track">
                        <div
                          className="prd-owner-progress-fill"
                          style={{
                            width: (() => {
                              if (!property.exclusiveStart || !property.exclusiveEnd) return '50%';
                              const start = new Date(property.exclusiveStart).getTime();
                              const end = new Date(property.exclusiveEnd).getTime();
                              const now = Date.now();
                              if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return '50%';
                              const pct2 = Math.min(100, Math.max(0, ((now - start) / (end - start)) * 100));
                              return `${pct2.toFixed(0)}%`;
                            })(),
                          }}
                        />
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: '#9c9384', fontWeight: 600, marginTop: 6 }}>
                        <span>{property.exclusiveStart ? new Date(property.exclusiveStart).toLocaleDateString('he-IL') : '—'}</span>
                        <span>{property.exclusiveEnd ? new Date(property.exclusiveEnd).toLocaleDateString('he-IL') : '—'}</span>
                      </div>
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: 8, marginTop: 18, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="prd-btn"
                      onClick={() => setOwnerPickerOpen(true)}
                      disabled={ownerSaving}
                    >
                      <Pencil size={13} /> {linkedOwner?.id ? 'החלף בעל נכס' : 'קשר בעל נכס'}
                    </button>
                    {linkedOwner?.id && (
                      <Link to={`/owners/${linkedOwner.id}`} className="prd-btn">
                        <User size={13} /> פתח כרטיס מלא
                      </Link>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
                  <OwnerActivityPanel propertyId={property.id} />
                </div>
              </div>
            )}

            {tab === 'buyers' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <PropertyInterestsPanel propertyId={property.id} />
                <div id="prd-agreements-anchor" />
                <PropertyAgreementsSection propertyId={property.id} leads={leads} />
              </div>
            )}

            {tab === 'activity' && (
              <ActivityPanel entityType="PROPERTY" entityId={property.id} />
            )}
          </div>
        </div>
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
                      className="btn btn-whatsapp"
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
            {/* 2026-05-03 — inline free-text editor for the marketing description.
                Was: agents had to leave this page and go to /edit to add a
                description. Now they can type directly and save without a
                round-trip. AI generation still lives below. */}
            <NotesInlineEditor
              propertyId={property.id}
              initial={property.notes || ''}
              onSaved={() => load()}
              toast={toast}
            />
            {property.notes ? null : (
              <p className="dc-empty" style={{ marginTop: 8 }}>טרם נוסף תיאור — הזן טקסט חופשי למעלה או הפק תיאור ב-AI מתחת.</p>
            )}
            {/* Sprint 5 — AI description generator. Draft preview block
                appears only after a successful generate; the agent can
                accept (writes to notes) or discard. */}
            {aiDesc && (
              <div
                className="pd-panel-ai-draft"
                style={{
                  marginBlock: 16,
                  padding: 16,
                  borderRadius: 12,
                  background: 'rgba(180,139,76,0.08)',
                  border: '1px solid rgba(180,139,76,0.25)',
                }}
              >
                <h5 style={{ margin: '0 0 8px', color: '#7a5c2c' }}>
                  <Sparkles size={14} style={{ verticalAlign: 'middle' }} /> טיוטת תיאור מ-AI
                </h5>
                <textarea
                  className="form-textarea"
                  rows={6}
                  dir="auto"
                  value={aiDesc.description}
                  onChange={(e) => setAiDesc((p) => ({ ...p, description: e.target.value }))}
                  style={{ width: '100%', marginBottom: 8 }}
                />
                {aiDesc.highlights?.length > 0 && (
                  <ul style={{ margin: '0 0 12px', paddingInlineStart: 20 }}>
                    {aiDesc.highlights.map((h, i) => (
                      <li key={i} style={{ color: '#1e1a14', marginBlock: 2 }}>{h}</li>
                    ))}
                  </ul>
                )}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleSaveAiDescription}
                    disabled={aiBusy || !aiDesc.description.trim()}
                  >
                    <Check size={14} /> שמור תיאור
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => setAiDesc(null)}
                    disabled={aiBusy}
                  >
                    בטל טיוטה
                  </button>
                </div>
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => { setPanel(null); navigate(`/properties/${id}/edit`); }}
                disabled={aiBusy}
              >
                <Edit3 size={14} />ערוך הערות ומאפיינים
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleGenerateDescription}
                disabled={aiBusy}
                style={{
                  background: '#b48b4c',
                  color: '#ffffff',
                  borderColor: '#7a5c2c',
                }}
                aria-label="יצירת תיאור שיווקי ב-AI"
                title="יצירת תיאור שיווקי ב-AI"
              >
                <Sparkles size={14} />
                {aiBusy ? 'מייצר…' : 'יצירת תיאור ב-AI'}
              </button>
            </div>
          </div>
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

      {/* MLS parity — reminders (D1) */}
      {panel === 'reminders' && (
        <PropertyPanelSheet
          title="תזכורות לנכס"
          width="lg"
          onClose={() => setPanel(null)}
        >
          <RemindersPanel propertyId={property.id} />
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
          <ActivityPanel entityType="PROPERTY" entityId={property.id} />
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

      {exclusivityOpen && (
        <OwnerAgreementDialog
          property={property}
          onClose={() => setExclusivityOpen(false)}
          onCreated={() => { setExclusivityOpen(false); load(); }}
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

      {shareOpen && (
        <ShareDialog
          kind="property"
          entity={{ property, agent: user, templates }}
          onClose={() => setShareOpen(false)}
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
          aria-modal="true"
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
            src={lightboxImages[lightboxIdx] || images[lightboxIdx]}
            alt={property.street}
            width="1600"
            height="1200"
            decoding="async"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {/* Sprint 5 — AI-backed smart matcher drawer */}
      {aiMatchesOpen && (
        <AiMatchesDrawer
          propertyId={property.id}
          onClose={() => setAiMatchesOpen(false)}
        />
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
          className="btn btn-whatsapp"
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

// Per-asset documents block. Lists files scoped to this property,
// uploads new files (PDFs, dwg, zip, xlsx) attached to it, and offers
// a delete button per row. Files double as global library entries —
// the same row appears on /documents — so the agent can drop a PDF
// once and reach it from either surface.
function PropertyDocuments({ propertyId }) {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef(null);
  const reload = useCallback(async () => {
    try {
      const r = await api.listDocuments({ propertyId });
      setDocs(r.items || r.documents || []);
    } catch (e) {
      setErr(e?.message || 'שגיאת טעינה');
    } finally {
      setLoading(false);
    }
  }, [propertyId]);
  useEffect(() => { reload(); }, [reload]);
  const onUpload = async (file) => {
    if (!file || busy) return;
    setBusy(true);
    setErr(null);
    try {
      await api.uploadDocument(file, [], { propertyId });
      await reload();
    } catch (e) {
      setErr(e?.message || 'העלאה נכשלה');
    } finally {
      setBusy(false);
    }
  };
  const onDelete = async (id) => {
    setBusy(true);
    try {
      await api.deleteDocument(id);
      setDocs((cur) => cur.filter((d) => d.id !== id));
    } catch (e) {
      setErr(e?.message || 'מחיקה נכשלה');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="pd-documents animate-in animate-in-delay-5" style={{ marginTop: 16 }}>
      <div className="pd-documents-head" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <h4 style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <FileText size={16} /> מסמכים ({docs.length})
        </h4>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
        >
          <Upload size={13} />
          {busy ? 'מעלה…' : 'העלאת מסמך'}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.dwg,.zip,.xlsx,.docx,.jpg,.jpeg,.png,.heic"
          style={{ display: 'none' }}
          onChange={(e) => { onUpload(e.target.files?.[0]); e.target.value = ''; }}
        />
      </div>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const f = e.dataTransfer?.files?.[0];
          if (f) onUpload(f);
        }}
        style={{
          border: `2px dashed ${dragOver ? '#b48b4c' : 'rgba(30,26,20,0.12)'}`,
          background: dragOver ? '#fbf7f0' : '#fff',
          borderRadius: 12,
          padding: '14px 16px',
          marginBottom: 10,
          color: '#6b6356',
          fontSize: 13,
          textAlign: 'center',
        }}
      >
        גרור קובץ לכאן או לחץ "העלאת מסמך"
      </div>
      {err && <div style={{ color: '#b91c1c', fontSize: 13, marginBottom: 8 }}>{err}</div>}
      {loading ? (
        <div style={{ color: '#6b6356', fontSize: 13 }}>טוען…</div>
      ) : docs.length === 0 ? (
        <div style={{ color: '#6b6356', fontSize: 13 }}>אין מסמכים מצורפים לנכס זה.</div>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {docs.map((d) => (
            <li key={d.id} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              background: '#fff', border: '1px solid rgba(30,26,20,0.08)',
              borderRadius: 10, padding: '8px 12px',
            }}>
              <FileText size={14} style={{ color: '#b48b4c', flexShrink: 0 }} />
              <a
                href={`/api/documents/${d.id}/download`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ flex: 1, color: '#1e1a14', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              >
                {d.originalName}
              </a>
              <span style={{ fontSize: 12, color: '#6b6356' }}>{Math.round((d.sizeBytes || 0) / 1024)} KB</span>
              <button
                type="button"
                onClick={() => onDelete(d.id)}
                disabled={busy}
                aria-label="מחק"
                style={{ background: 'none', border: 0, color: '#b91c1c', cursor: 'pointer' }}
              >
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Price offers received on a property. Lists offers in reverse-chrono
// order, lets the agent add a new offer (buyer name + phone + amount +
// optional notes), update status (NEW / NEGOTIATING / ACCEPTED /
// DECLINED / WITHDRAWN), or delete a row. Used on PropertyDetail; the
// CRM later surfaces accepted offers as the closing-price candidate.
function PropertyOffers({ propertyId }) {
  const [offers, setOffers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [draft, setDraft] = useState({ buyerName: '', buyerPhone: '', amount: '', notes: '' });
  const [showAdd, setShowAdd] = useState(false);
  const reload = useCallback(async () => {
    try {
      const r = await api.listPropertyOffers(propertyId);
      setOffers(r.offers || []);
    } catch (e) {
      setErr(e?.message || 'שגיאת טעינה');
    } finally {
      setLoading(false);
    }
  }, [propertyId]);
  useEffect(() => { reload(); }, [reload]);
  const submit = async (e) => {
    e?.preventDefault?.();
    if (busy) return;
    if (!draft.buyerName.trim() || !draft.amount) {
      setErr('שם המציע והסכום הם שדות חובה');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await api.createPropertyOffer(propertyId, {
        buyerName: draft.buyerName.trim(),
        buyerPhone: draft.buyerPhone.trim() || null,
        amount: Number(draft.amount),
        notes: draft.notes.trim() || null,
      });
      setDraft({ buyerName: '', buyerPhone: '', amount: '', notes: '' });
      setShowAdd(false);
      await reload();
    } catch (e2) {
      setErr(e2?.message || 'הוספה נכשלה');
    } finally {
      setBusy(false);
    }
  };
  const setStatus = async (offerId, status) => {
    try {
      await api.updatePropertyOffer(propertyId, offerId, { status });
      setOffers((cur) => cur.map((o) => (o.id === offerId ? { ...o, status } : o)));
    } catch (e) {
      setErr(e?.message || 'עדכון נכשל');
    }
  };
  const remove = async (offerId) => {
    setBusy(true);
    try {
      await api.deletePropertyOffer(propertyId, offerId);
      setOffers((cur) => cur.filter((o) => o.id !== offerId));
    } catch (e) {
      setErr(e?.message || 'מחיקה נכשלה');
    } finally {
      setBusy(false);
    }
  };
  const STATUS_LABELS = {
    NEW: 'חדשה', NEGOTIATING: 'במו״מ', ACCEPTED: 'התקבלה',
    DECLINED: 'נדחתה', WITHDRAWN: 'בוטלה',
  };
  const STATUS_TONE = {
    NEW: '#b48b4c', NEGOTIATING: '#3b82f6', ACCEPTED: '#15803d',
    DECLINED: '#b91c1c', WITHDRAWN: '#6b6356',
  };
  return (
    <div className="pd-offers animate-in animate-in-delay-5" style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <h4 style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Banknote size={16} /> הצעות מחיר ({offers.length})
        </h4>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => setShowAdd((s) => !s)}
        >
          <UserPlus size={13} />
          {showAdd ? 'בטל' : 'הוסף הצעה'}
        </button>
      </div>
      {showAdd && (
        <form onSubmit={submit} style={{
          background: '#fbf7f0', border: '1px solid rgba(180,139,76,0.3)',
          borderRadius: 12, padding: 12, marginBottom: 10,
          display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8,
        }}>
          <input
            type="text" placeholder="שם המציע *"
            value={draft.buyerName}
            onChange={(e) => setDraft({ ...draft, buyerName: e.target.value })}
            className="form-input"
          />
          <input
            type="tel" placeholder="טלפון (אופציונלי)" dir="ltr"
            value={draft.buyerPhone}
            onChange={(e) => setDraft({ ...draft, buyerPhone: e.target.value })}
            className="form-input"
          />
          <input
            {...inputPropsForPrice()}
            placeholder="סכום הצעה (₪) *"
            value={draft.amount}
            onChange={(e) => setDraft({ ...draft, amount: e.target.value.replace(/[^\d]/g, '') })}
            className="form-input"
            style={{ gridColumn: '1 / -1', textAlign: 'right' }}
          />
          <textarea
            placeholder="הערות — תנאי מימון, התנייה במשכנתא, וכו׳"
            value={draft.notes}
            onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
            className="form-input"
            rows={2}
            style={{ gridColumn: '1 / -1', resize: 'vertical' }}
          />
          <button type="submit" className="btn btn-primary" disabled={busy} style={{ gridColumn: '1 / -1' }}>
            {busy ? 'שומר…' : 'שמור הצעה'}
          </button>
        </form>
      )}
      {err && <div style={{ color: '#b91c1c', fontSize: 13, marginBottom: 8 }}>{err}</div>}
      {loading ? (
        <div style={{ color: '#6b6356', fontSize: 13 }}>טוען…</div>
      ) : offers.length === 0 ? (
        <div style={{ color: '#6b6356', fontSize: 13 }}>אין הצעות מחיר רשומות לנכס זה.</div>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {offers.map((o) => (
            <li key={o.id} style={{
              background: '#fff', border: '1px solid rgba(30,26,20,0.08)',
              borderRadius: 10, padding: 12,
              display: 'flex', flexDirection: 'column', gap: 6,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                <div>
                  <strong style={{ fontSize: 15 }}>{o.buyerName}</strong>
                  {o.buyerPhone && (
                    <a href={`tel:${o.buyerPhone}`} style={{ color: '#6b6356', fontSize: 13, marginInlineStart: 8, textDecoration: 'none' }} dir="ltr">
                      {o.buyerPhone}
                    </a>
                  )}
                </div>
                <strong style={{ fontSize: 17, color: STATUS_TONE[o.status] || '#1e1a14' }}>
                  ₪{Number(o.amount).toLocaleString('he-IL')}
                </strong>
              </div>
              {o.notes && <div style={{ color: '#6b6356', fontSize: 13 }}>{o.notes}</div>}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <select
                  value={o.status}
                  onChange={(e) => setStatus(o.id, e.target.value)}
                  className="form-input"
                  style={{ width: 140, padding: '4px 8px', fontSize: 13 }}
                >
                  {Object.entries(STATUS_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
                <span style={{ color: '#6b6356', fontSize: 12, marginInlineStart: 'auto' }}>
                  {new Date(o.receivedAt).toLocaleDateString('he-IL', { day: 'numeric', month: 'short', year: 'numeric' })}
                </span>
                <button
                  type="button"
                  onClick={() => remove(o.id)}
                  disabled={busy}
                  aria-label="מחק"
                  style={{ background: 'none', border: 0, color: '#b91c1c', cursor: 'pointer' }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
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
    <a className="video-tile link-fallback" href={video.url} target="_blank" rel="noopener noreferrer">
      <span>▶ צפה בסרטון</span>
      <small>{video.title || video.url}</small>
    </a>
  );
}

// Inline free-text description editor for the property page. Lets the agent
// type a Yad2-style description directly without leaving the page; saves
// via PATCH /properties/:id with `notes`.
function NotesInlineEditor({ propertyId, initial, onSaved, toast }) {
  const [value, setValue] = useState(initial || '');
  const [saving, setSaving] = useState(false);
  const dirty = value !== (initial || '');
  useEffect(() => { setValue(initial || ''); }, [initial]);
  const save = async () => {
    setSaving(true);
    try {
      await api.updateProperty(propertyId, { notes: value.trim() || null });
      toast?.success?.(value.trim() ? 'התיאור נשמר' : 'התיאור נמחק');
      onSaved?.();
    } catch (e) {
      toast?.error?.(e?.message || 'שמירת התיאור נכשלה');
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="pd-panel-notes-editor" style={{ marginBottom: 12 }}>
      <h5 style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 800 }}>תיאור הנכס (טקסט חופשי)</h5>
      <textarea
        className="form-textarea"
        rows={5}
        dir="auto"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="כתוב תיאור שיווקי כמו ביד 2 — מיקום, אופי הדירה, מה מיוחד בה, סביבת המגורים, וכו׳"
        style={{ width: '100%', resize: 'vertical' }}
      />
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={save}
          disabled={!dirty || saving}
        >
          {saving ? 'שומר…' : 'שמור תיאור'}
        </button>
        {dirty && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setValue(initial || '')}
            disabled={saving}
          >
            בטל שינויים
          </button>
        )}
      </div>
    </div>
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
