import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { RoomsChips } from '../components/MobilePickers';
import {
  UserPlus,
  Search,
  Phone,
  MessageSquare,
  Flame,
  Thermometer,
  Snowflake,
  Calendar,
  FileText,
  Edit3,
  Trash2,
  HelpCircle,
  Sparkles,
  LayoutGrid,
  List as ListIcon,
  MoreHorizontal,
  ChevronDown,
  ChevronUp,
  ArrowUpDown,
  X,
  SlidersHorizontal,
  Home,
  Briefcase,
  CheckCircle2,
  User,
  Star,
} from 'lucide-react';
import api from '../lib/api';
import { useRouteScrollRestore } from '../hooks/useScrollRestore';
import { useDebouncedValue } from '../lib/useDebouncedValue';
import ConfirmDialog from '../components/ConfirmDialog';
import CustomerEditDialog from '../components/CustomerEditDialog';
import InlineText from '../components/InlineText';
import Chip from '../components/Chip';
import Portal from '../components/Portal';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { SERIOUSNESS_LABELS } from '../lib/mlsLabels';
import SwipeRow from '../components/SwipeRow';
import WhatsAppIcon from '../components/WhatsAppIcon';
import PullRefresh from '../components/PullRefresh';
import { OverflowSheet } from '../components/MobilePickers';
import { useVisibilityBump, primeContactBump, useViewportMobile, useDelayedFlag } from '../hooks/mobile';
import PageTour from '../components/PageTour';
import { pageCache } from '../lib/pageCache';
import haptics from '../lib/haptics';
import { useToast, optimisticUpdate } from '../lib/toast';
import { relativeTime, absoluteTime } from '../lib/time';
import { relativeDate } from '../lib/relativeDate';
import { waUrl, telUrl } from '../lib/waLink';
import { leadMatchesProperty } from './Properties';
import CustomerFiltersPanel from '../components/CustomerFiltersPanel';
import SavedSearchMenu from '../components/SavedSearchMenu';
import FavoriteStar from '../components/FavoriteStar';
import './Customers.css';

// Sprint 2 C2 — translate a UI filter object into the array-of-pairs
// shape that api.listLeads → URLSearchParams understands for the
// backend's repeated-key array params (`cities=A&cities=B`). Empty /
// null values are dropped so we don't send `?minPrice=`.
function filtersToQuery(filters) {
  const pairs = [];
  for (const [k, v] of Object.entries(filters || {})) {
    if (v === null || v === undefined || v === '' || v === false) continue;
    if (Array.isArray(v)) {
      for (const item of v) if (item != null && item !== '') pairs.push([k, String(item)]);
    } else if (v === true) {
      pairs.push([k, '1']);
    } else {
      pairs.push([k, String(v)]);
    }
  }
  return pairs;
}

// Count the top-level filter groups that are "active" — shown on the
// filter trigger button as a summary chip. Arrays contribute 1 per
// non-empty group; scalars / booleans contribute 1 when set.
function countActiveFilters(filters) {
  return Object.entries(filters || {}).filter(([, v]) => {
    if (Array.isArray(v)) return v.length > 0;
    return v !== null && v !== undefined && v !== '' && v !== false;
  }).length;
}

function statusIcon(status) {
  switch (status) {
    case 'HOT': return <Flame size={13} />;
    case 'WARM': return <Thermometer size={13} />;
    case 'COLD': return <Snowflake size={13} />;
    default: return null;
  }
}

function statusBadgeClass(status) {
  return {
    HOT: 'badge-danger',
    WARM: 'badge-warning',
    COLD: 'badge-info',
  }[status] || 'badge-gold';
}

function statusLabel(status) {
  return { HOT: 'חם', WARM: 'חמים', COLD: 'קר' }[status] || status;
}

// P2-M17: short reason pill — emoji + status word + relative-date suffix
function statusReason(lead) {
  const status = lead.status || 'WARM';
  const lastContactLabel = lead.lastContact ? relativeDate(lead.lastContact).label : null;
  const daysSince = lead.lastContact
    ? Math.round((Date.now() - new Date(lead.lastContact).getTime()) / 86400000)
    : null;

  if (status === 'HOT') {
    return { emoji: '🔥', label: 'חם', suffix: lastContactLabel || 'חדש' };
  }
  if (status === 'COLD') {
    if (daysSince != null && daysSince > 30) {
      return { emoji: '❄️', label: 'קר', suffix: `${daysSince} ימים ללא קשר` };
    }
    return { emoji: '❄️', label: 'קר', suffix: lastContactLabel || 'ללא קשר' };
  }
  return { emoji: '🟡', label: 'חמים', suffix: lastContactLabel || 'חדש' };
}

// S11: return the number of days since last contact IF it's stale enough to
// warrant a pill, and the lead isn't already flagged COLD (which has its own
// "X ימים ללא קשר" suffix in statusReason and would double-signal).
// 10 days is the threshold the empathy log's stale-lead workflow settled on:
// short enough that HOT leads don't go silent on real estate's fast clock,
// long enough that an agent who reached out last Tuesday doesn't get nagged.
const STALE_THRESHOLD_DAYS = 10;
function stalePillDays(lead) {
  const status = lead.status || 'WARM';
  if (status === 'COLD') return null;
  if (!lead.lastContact) return null;
  const days = Math.round((Date.now() - new Date(lead.lastContact).getTime()) / 86400000);
  return days >= STALE_THRESHOLD_DAYS ? days : null;
}

export default function Customers() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const isMobile = useViewportMobile(820);
  useRouteScrollRestore();
  // Seed from cache so tab returns don't flash the empty state.
  const _cachedLeads = pageCache.get('customers');
  const [leads, setLeads] = useState(_cachedLeads || []);
  const [properties, setProperties] = useState(pageCache.get('properties') || []);
  const [loading, setLoading] = useState(!_cachedLeads);
  // Sprint 1 / MLS parity — Task C1. Seed the קונים / שוכרים segment
  // from the URL (`?segment=buyers|renters|all`) so deep links hydrate
  // and sharing / copy-paste works. Segment ↔ lookingFor mapping:
  //   buyers  → BUY   → קונים
  //   renters → RENT  → שוכרים
  //   all     → 'all' → both tabs off
  const [lookingForFilter, setLookingForFilter] = useState(() => {
    try {
      const seg = new URLSearchParams(window.location.search).get('segment');
      if (seg === 'buyers') return 'BUY';
      if (seg === 'renters') return 'RENT';
    } catch { /* SSR / no window — fall through */ }
    return 'all';
  });
  const [interestFilter, setInterestFilter] = useState('all'); // all | PRIVATE | COMMERCIAL
  const [statusFilter, setStatusFilter] = useState('all');
  // S12: `inactive` lets the Dashboard Today strip deep-link straight into a
  // stale-lead view. Value is the day threshold (10 from today-strip,
  // 30 from the legacy signals card) or null for "no inactive filter".
  const [inactiveFilter, setInactiveFilter] = useState(null);
  const [search, setSearch] = useState('');
  const [highlightId, setHighlightId] = useState(null);
  const [editDialog, setEditDialog] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [expandedId, setExpandedId] = useState(null); // mobile: which card is open
  const [overflowLead, setOverflowLead] = useState(null); // mobile: ⋯ sheet target
  const [statusSheetLead, setStatusSheetLead] = useState(null); // mobile: status pill sheet
  const [filterSheetOpen, setFilterSheetOpen] = useState(false); // mobile: filter sheet
  // P1-M17: list-first on mobile, cards on desktop. User selection still wins via localStorage.
  const [view, setView] = useState(() => {
    try {
      const stored = localStorage.getItem('estia-customers-view');
      if (stored === 'cards' || stored === 'list') return stored;
    } catch { /* ignore */ }
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 900px)').matches) {
      return 'list';
    }
    return 'cards';
  });
  const cardRefs = useRef({});

  // Sprint 2 C2 + Sprint 7 B3/B4 — server-side Nadlan-parity filters,
  // saved searches, and favorite toggle.
  //
  // `serverFilters` holds the object produced by <CustomerFiltersPanel>
  // and is echoed into api.listLeads via filtersToQuery. Separate from
  // the in-memory `lookingForFilter` / `interestFilter` / `statusFilter`
  // chips above which filter the already-fetched array client-side.
  const [serverFilters, setServerFilters] = useState({});
  const [advancedFilterOpen, setAdvancedFilterOpen] = useState(false);
  const [favoriteIds, setFavoriteIds] = useState(() => new Set());
  const [onlyFavorites, setOnlyFavorites] = useState(false);

  const changeView = (v) => {
    setView(v);
    try { localStorage.setItem('estia-customers-view', v); } catch { /* ignore */ }
  };

  const loadLeads = useCallback(async (overrideFilters) => {
    // Sprint 2 C2 — honor the advanced filter drawer by passing its
    // object into api.listLeads. Array values become repeated keys
    // (?cities=A&cities=B). When no filter is set we fall back to a
    // bare call so URLSearchParams doesn't echo empty `?` noise.
    const f = overrideFilters ?? serverFilters;
    const params = Object.keys(f || {}).length ? filtersToQuery(f) : undefined;
    const r = await api.listLeads(params);
    const next = r.items || [];
    setLeads(next);
    pageCache.set('customers', next);
  }, [serverFilters]);

  useEffect(() => {
    loadLeads().finally(() => setLoading(false));
    // Load the agent's properties so we can show "N נכסים תואמים" pills (P3-D1).
    api.listProperties({ mine: '1' })
      .then((res) => {
        const next = res?.items || [];
        setProperties(next);
        pageCache.set('properties', next);
      })
      .catch(() => { /* ignore — pills simply hide */ });
    // Sprint 7 B4 — seed the favorites set so each row's star reflects
    // the current state without waiting for the first toggle. Empty
    // set on failure is fine; each row just shows an empty star.
    api.listFavorites('LEAD')
      .then((r) => {
        const ids = new Set((r?.items || []).map((f) => f.entityId));
        setFavoriteIds(ids);
      })
      .catch(() => { /* ignore */ });
  }, [loadLeads]);

  // P3-D1: precompute match counts keyed by lead id
  const matchCountByLead = useMemo(() => {
    const out = {};
    if (!properties.length) return out;
    for (const lead of leads) {
      let n = 0;
      for (const p of properties) if (leadMatchesProperty(lead, p)) n += 1;
      if (n > 0) out[lead.id] = n;
    }
    return out;
  }, [leads, properties]);

  // P3-M1: when the user returns from tel:/wa: links, bump lastContact
  useVisibilityBump(async (leadId) => {
    try {
      await api.updateLead(leadId, { lastContact: new Date().toISOString() });
      await loadLeads();
    } catch { /* ignore */ }
  });

  useEffect(() => {
    const sel = searchParams.get('selected');
    if (sel) {
      setHighlightId(sel);
      const t = setTimeout(() => {
        const el = cardRefs.current[sel];
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 250);
      return () => clearTimeout(t);
    }
    const f = searchParams.get('filter');
    if (f === 'hot' || f === 'warm' || f === 'cold') setStatusFilter(f.toUpperCase());
    if (f && /^inactive(\d+)$/.test(f)) {
      setInactiveFilter(Number(f.match(/^inactive(\d+)$/)[1]));
    } else if (!f) {
      setInactiveFilter(null);
    }
  }, [searchParams]);

  // Breadcrumb shown when the user arrived via an incoming filter
  const incomingFilterLabel = (() => {
    const f = searchParams.get('filter');
    if (f === 'hot') return 'לידים חמים';
    if (f === 'warm') return 'לידים חמימים';
    if (f === 'cold') return 'לידים קרים';
    if (f && /^inactive(\d+)$/.test(f)) return `לידים ללא קשר ${f.match(/^inactive(\d+)$/)[1]}+ ימים`;
    return null;
  })();

  // F-3.4 / F-8.5 — debounce the search input so the filter + card
  // render only re-runs once the agent has paused typing.
  const debouncedSearch = useDebouncedValue(search, 200);
  const filtered = useMemo(() => {
    const now = Date.now();
    const DAY = 86400000;
    return leads.filter((l) => {
      if (lookingForFilter !== 'all' && l.lookingFor !== lookingForFilter) return false;
      if (interestFilter !== 'all' && l.interestType !== interestFilter) return false;
      if (statusFilter !== 'all' && l.status !== statusFilter) return false;
      if (inactiveFilter != null) {
        // COLD is the "already parked" state; the inactive view is for
        // leads that should still be live, so exclude COLD here.
        if (l.status === 'COLD') return false;
        if (!l.lastContact) return false;
        const days = (now - new Date(l.lastContact).getTime()) / DAY;
        if (days < inactiveFilter) return false;
      }
      // Sprint 7 B4 — "רק מועדפים" toggle narrows to the starred set.
      if (onlyFavorites && !favoriteIds.has(l.id)) return false;
      if (!debouncedSearch) return true;
      const s = debouncedSearch.toLowerCase();
      return (
        l.name?.toLowerCase().includes(s) ||
        l.city?.toLowerCase().includes(s) ||
        l.phone?.includes(s)
      );
    });
  }, [leads, lookingForFilter, interestFilter, statusFilter, inactiveFilter, debouncedSearch, onlyFavorites, favoriteIds]);

  const handleWhatsApp = (lead) => {
    primeContactBump(lead.id);
    haptics.tap();
    window.open(waUrl(lead.phone, `שלום ${lead.name}`), '_blank');
  };

  const handleTel = (lead) => {
    primeContactBump(lead.id);
    haptics.tap();
    window.open(telUrl(lead.phone), '_self');
  };

  const handleSms = (lead) => {
    primeContactBump(lead.id);
    haptics.tap();
    window.open(`sms:${lead.phone}`, '_self');
  };

  // Sprint 1 / MLS parity — Task C1. Keep `?segment=` in sync with the
  // active looking-for filter so back/forward + deep-link copy work.
  // Uses history.replaceState rather than useSearchParams's setter so
  // the effect doesn't fight the other `searchParams` useEffect above
  // (which reads, not writes).
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      const prev = url.searchParams.get('segment');
      const next =
        lookingForFilter === 'BUY'  ? 'buyers'
        : lookingForFilter === 'RENT' ? 'renters'
        : null;
      if (next && prev === next) return;
      if (!next && !prev)         return;
      if (next) url.searchParams.set('segment', next);
      else      url.searchParams.delete('segment');
      window.history.replaceState({}, '', url.toString());
    } catch { /* SSR / exotic env — ignore */ }
  }, [lookingForFilter]);

  // P1-M11: count of non-default filters active for the mobile filter pill
  const activeFilterCount =
    (lookingForFilter !== 'all' ? 1 : 0) +
    (interestFilter !== 'all' ? 1 : 0) +
    (statusFilter !== 'all' ? 1 : 0) +
    (inactiveFilter != null ? 1 : 0);

  const clearFilters = () => {
    setLookingForFilter('all');
    setInterestFilter('all');
    setStatusFilter('all');
    setInactiveFilter(null);
  };

  const patchLead = async (leadId, patch, { label, success } = {}) => {
    // Optimistic in-place update
    setLeads((cur) => cur.map((l) => (l.id === leadId ? { ...l, ...patch } : l)));
    try {
      await optimisticUpdate(toast, {
        label: label || 'שומר…',
        success: success || 'נשמר',
        onSave: () => api.updateLead(leadId, patch),
      });
    } catch {
      // Rewind by re-fetching on failure
      await loadLeads();
    }
  };

  const handleStatusChange = (lead, newStatus) =>
    patchLead(lead.id, { status: newStatus }, { success: `סטטוס עודכן ל-${newStatus === 'HOT' ? 'חם' : newStatus === 'WARM' ? 'חמים' : 'קר'}` });

  // Sprint 7 B4 — toggle a lead's favorite state. We update the local
  // set optimistically before awaiting the API so the star flips as
  // soon as the agent taps. A failure rolls back + surfaces a toast.
  const handleToggleFavorite = async (leadId, nextActive) => {
    setFavoriteIds((cur) => {
      const copy = new Set(cur);
      if (nextActive) copy.add(leadId);
      else copy.delete(leadId);
      return copy;
    });
    try {
      if (nextActive) {
        await api.addFavorite({ entityType: 'LEAD', entityId: leadId });
      } else {
        await api.removeFavorite('LEAD', leadId);
      }
    } catch (e) {
      // Rollback
      setFavoriteIds((cur) => {
        const copy = new Set(cur);
        if (nextActive) copy.delete(leadId);
        else copy.add(leadId);
        return copy;
      });
      toast.error(e?.message || 'שינוי המועדפים נכשל');
    }
  };

  // Sprint 2 C2 — the advanced-filter drawer commits here. We store
  // the new server filter set and immediately re-fetch.
  const handleApplyServerFilters = async (nextFilters) => {
    setServerFilters(nextFilters);
    try {
      await loadLeads(nextFilters);
    } catch { /* toast handled by api layer */ }
  };

  const serverFilterCount = useMemo(
    () => countActiveFilters(serverFilters),
    [serverFilters],
  );

  const confirmDeleteLead = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    // F-3 — best-effort undo. Snapshot the lead so the toast action can
    // re-POST it via api.createLead. Backend stays hard-delete for now;
    // a proper soft-delete is a separate backend ticket (see review).
    const snapshot = deleteTarget;
    try {
      await api.deleteLead(snapshot.id);
      setDeleteTarget(null);
      await loadLeads();
      toast.success(`נמחק "${snapshot.name}"`, {
        duration: 10_000,
        action: {
          label: 'בטל',
          onClick: async () => {
            try {
              await api.createLead({
                name: snapshot.name,
                phone: snapshot.phone,
                interestType: snapshot.interestType,
                lookingFor: snapshot.lookingFor,
                city: snapshot.city,
                street: snapshot.street,
                rooms: snapshot.rooms,
                status: snapshot.status,
                notes: snapshot.notes,
              });
              await loadLeads();
              toast.success('הליד שוחזר');
            } catch (e) {
              toast.error(e?.message || 'שחזור נכשל');
            }
          },
        },
      });
    } catch { /* ignore */ }
    setDeleting(false);
  };

  // Only render skeletons if loading has dragged on past the flash-threshold.
  // Fast navigations swap straight from blank-under-header to real data.
  const showSkel = useDelayedFlag(loading, 220);
  if (loading && showSkel) {
    return (
      <div className="customers-page">
        <div className="page-header animate-in">
          <div className="page-header-info">
            <h2>לקוחות</h2>
            <p>טוען...</p>
          </div>
        </div>
        <div className="customers-grid">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="customer-card skel-card">
              <div className="skel skel-circle" />
              <div className="skel skel-line w-70" />
              <div className="skel skel-line w-50" />
              <div className="skel skel-line w-90" />
              <div className="skel skel-line w-40" />
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (loading) {
    // First ~220ms of loading: show just the page header, no skeletons or
    // empty state, so fast fetches resolve into their real data without
    // any flash.
    return (
      <div className="customers-page">
        <div className="page-header animate-in">
          <div className="page-header-info">
            <h2>לקוחות</h2>
          </div>
        </div>
      </div>
    );
  }

  return (
    <PullRefresh onRefresh={loadLeads}>
    <PageTour
      pageKey="customers"
      steps={[
        { target: 'body', placement: 'center',
          title: 'הלקוחות שלך',
          content: 'לקוחות מתעניינים לפי חום הליד (חם/פושר/קר). כשיש התאמה בין לקוח לנכס היא מופיעה אוטומטית בכרטיס הנכס.' },
      ]}
    />
    <div className="customers-page">
      <div className="page-header animate-in">
        <div className="page-header-info">
          <h2>לקוחות</h2>
          <p>{filtered.length} מתוך {leads.length} לקוחות</p>
        </div>
        <div className="page-header-actions">
          {/* Sprint 2 C2 + Sprint 7 B3/B4 — advanced filter drawer,
              saved-search menu, and "only favorites" toggle sit here
              between the view switch and the primary "ליד חדש" CTA. */}
          <button
            type="button"
            className={`btn btn-ghost btn-sm ${serverFilterCount > 0 ? 'is-active' : ''}`}
            onClick={() => setAdvancedFilterOpen(true)}
            aria-label={`סינון מתקדם${serverFilterCount > 0 ? ` (${serverFilterCount})` : ''}`}
            title="סינון מתקדם"
          >
            <SlidersHorizontal size={14} aria-hidden="true" />
            <span>סינון מתקדם</span>
            {serverFilterCount > 0 && (
              <span className="cust-filter-count" aria-hidden="true">{serverFilterCount}</span>
            )}
          </button>
          <SavedSearchMenu
            entityType="LEAD"
            currentFilters={serverFilters}
            onLoad={handleApplyServerFilters}
          />
          <button
            type="button"
            className={`btn btn-ghost btn-sm ${onlyFavorites ? 'is-active' : ''}`}
            onClick={() => setOnlyFavorites((v) => !v)}
            aria-pressed={onlyFavorites}
            aria-label="רק מועדפים"
            title="הצג רק מועדפים"
          >
            <Star
              size={14}
              aria-hidden="true"
              fill={onlyFavorites ? 'currentColor' : 'none'}
            />
            <span>רק מועדפים</span>
          </button>
          <div className="view-toggle" role="group" aria-label="תצוגה">
            <button
              className={`view-toggle-btn ${view === 'cards' ? 'active' : ''}`}
              onClick={() => changeView('cards')}
              title="תצוגת כרטיסים"
            >
              <LayoutGrid size={14} />
              כרטיסים
            </button>
            <button
              className={`view-toggle-btn ${view === 'list' ? 'active' : ''}`}
              onClick={() => changeView('list')}
              title="תצוגת רשימה"
            >
              <ListIcon size={14} />
              רשימה
            </button>
          </div>
          {/* F-4 + F-16 — templates link removed from header. It duplicates
              the sidebar entry and competed with "ליד חדש" (4×/day vs
              1×/month). Canonical header pattern: primary CTA rightmost,
              tertiary actions into overflow menus. */}
          <Link to="/customers/new" className="btn btn-primary">
            <UserPlus size={18} />
            ליד חדש
          </Link>
        </div>
      </div>

      {incomingFilterLabel && statusFilter !== 'all' && (
        <div className="filter-breadcrumb animate-in">
          <span>מוצג: {incomingFilterLabel}</span>
          <button
            className="fb-clear"
            onClick={() => {
              setStatusFilter('all');
              window.history.replaceState({}, '', '/customers');
            }}
          >
            נקה סינון
          </button>
        </div>
      )}

      {/* Filter strip — search is sticky (P1-M12) */}
      <div className="filters-bar animate-in animate-in-delay-2">
        <div className="sticky-search">
          <div className="search-box">
            <Search size={18} />
            <input
              type="search"
              inputMode="search"
              enterKeyHint="search"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              placeholder="חיפוש לפי שם, עיר, טלפון..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* P1-M11: mobile gets ONE filter pill that opens a bottom sheet */}
        <div className="filters-mobile-row">
          <button
            type="button"
            className={`filters-pill ${activeFilterCount > 0 ? 'active' : ''}`}
            onClick={() => { haptics.tap(); setFilterSheetOpen(true); }}
            aria-label="פתח סינון"
          >
            <SlidersHorizontal size={16} aria-hidden="true" />
            <span>סנן{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}</span>
          </button>
          {activeFilterCount > 0 && (
            <button
              type="button"
              className="filters-clear-link"
              onClick={() => { haptics.tap(); clearFilters(); }}
            >
              נקה סינון
            </button>
          )}
        </div>

        {/* Desktop keeps the 3-row layout */}
        <div className="filters-desktop">
          <div className="filter-tabs">
            {[
              { key: 'all', label: 'הכל' },
              { key: 'BUY', label: 'קונים' },
              { key: 'RENT', label: 'שוכרים' },
            ].map((f) => (
              <button
                key={f.key}
                className={`filter-tab ${lookingForFilter === f.key ? 'active' : ''}`}
                onClick={() => setLookingForFilter(f.key)}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="filter-tabs">
            {[
              { key: 'all', label: 'כל הסוגים' },
              { key: 'PRIVATE', label: 'פרטי' },
              { key: 'COMMERCIAL', label: 'מסחרי' },
            ].map((f) => (
              <button
                key={f.key}
                className={`filter-tab ${interestFilter === f.key ? 'active' : ''}`}
                onClick={() => setInterestFilter(f.key)}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="filter-tabs">
            {[
              { key: 'all', label: 'הכל' },
              { key: 'HOT', label: 'חם' },
              { key: 'WARM', label: 'חמים' },
              { key: 'COLD', label: 'קר' },
            ].map((f) => (
              <button
                key={f.key}
                className={`filter-tab ${statusFilter === f.key ? 'active' : ''}`}
                onClick={() => setStatusFilter(f.key)}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {view === 'list' ? (
        <CustomerList
          leads={filtered}
          highlightId={highlightId}
          cardRefs={cardRefs}
          isMobile={isMobile}
          matchCountByLead={matchCountByLead}
          favoriteIds={favoriteIds}
          onToggleFavorite={handleToggleFavorite}
          onStatusChange={handleStatusChange}
          onEdit={setEditDialog}
          onDelete={setDeleteTarget}
          onNavigate={(id) => navigate(`/customers/${id}`)}
          onBumpLastContact={(lead) => patchLead(lead.id, { lastContact: new Date().toISOString() }, { success: 'קשר אחרון עודכן' })}
        />
      ) : (
      <div className="customers-grid animate-in animate-in-delay-3">
        {filtered.map((lead) => {
          const expanded = expandedId === lead.id;

          // ── Mobile: collapsed dense row + swipe actions + tap to expand ──
          if (isMobile) {
            const swipeActions = [
              {
                icon: Phone,
                label: 'התקשר',
                color: 'gold',
                onClick: () => handleTel(lead),
              },
              {
                icon: WhatsAppIcon,
                label: 'וואטסאפ',
                color: 'green',
                onClick: () => handleWhatsApp(lead),
              },
              {
                icon: MessageSquare,
                label: 'SMS',
                color: 'blue',
                onClick: () => handleSms(lead),
              },
            ];
            const reason = statusReason(lead);
            const reasonStatusClass = `ccm-reason-${lead.status || 'WARM'}`;
            const matchCountMobile = matchCountByLead[lead.id] || 0;
            return (
              <div
                key={lead.id}
                ref={(el) => { if (el) cardRefs.current[lead.id] = el; }}
                className={`customer-card customer-card-mobile ${highlightId === lead.id ? 'highlight' : ''} ${expanded ? 'is-expanded' : 'is-collapsed'}`}
              >
                <SwipeRow actions={swipeActions}>
                  <div className="ccm-body">
                    <div className="ccm-row-outer">
                      <div
                        role="button"
                        tabIndex={0}
                        className="ccm-row-btn"
                        onClick={() => {
                          haptics.tap();
                          setExpandedId(expanded ? null : lead.id);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            haptics.tap();
                            setExpandedId(expanded ? null : lead.id);
                          }
                        }}
                        aria-expanded={expanded}
                      >
                        <div className="ccm-avatar" aria-hidden="true">
                          {lead.name.charAt(0)}
                        </div>
                        <div className="ccm-mid">
                          <div className="ccm-name-row">
                            <strong className="ccm-name">{lead.name}</strong>
                            {/* Sprint 7 B4 — favorite toggle; stop
                                propagation is handled inside FavoriteStar. */}
                            <FavoriteStar
                              active={favoriteIds.has(lead.id)}
                              onToggle={(next) => handleToggleFavorite(lead.id, next)}
                              className="fav-star-sm"
                            />
                            {/* P2-M17: status reason pill inline next to name */}
                            <span className={`ccm-reason-pill ${reasonStatusClass}`} title={lead.statusExplanation || ''}>
                              <span className="ccm-reason-emoji" aria-hidden="true">{reason.emoji}</span>
                              <strong>{reason.label}</strong>
                              <span className="ccm-reason-sep" aria-hidden="true">·</span>
                              <span className="ccm-reason-suffix">{reason.suffix}</span>
                            </span>
                            {lead.preApproval && (
                              <span className="ccm-active-pill" title="אישור עקרוני">
                                <CheckCircle2 size={10} />
                              </span>
                            )}
                            {(() => {
                              // S11: stale-lead pill — HOT/WARM leads that
                              // haven't been contacted in ≥10 days. A tap
                              // bumps lastContact to now (same action as the
                              // footer "קשר אחרון" button), so the pill is a
                              // fix affordance, not just a warning.
                              const stale = stalePillDays(lead);
                              if (!stale) return null;
                              return (
                                <button
                                  type="button"
                                  className="ccm-stale-pill"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    patchLead(lead.id, { lastContact: new Date().toISOString() }, { success: 'קשר אחרון עודכן' });
                                  }}
                                  title="לחץ לעדכון קשר אחרון לעכשיו"
                                >
                                  {stale} ימים ללא קשר
                                </button>
                              );
                            })()}
                            {matchCountMobile > 0 && (
                              <Link
                                to={`/properties${lead.city ? `?city=${encodeURIComponent(lead.city)}` : ''}`}
                                onClick={(e) => e.stopPropagation()}
                                className="cc-match-pill cc-match-pill-mobile"
                                title={`${matchCountMobile} נכסים תואמים`}
                              >
                                <Sparkles size={10} />
                                <strong>{matchCountMobile}</strong>
                              </Link>
                            )}
                          </div>
                          <div className="ccm-sub">
                            {[
                              lead.city,
                              lead.rooms && `${lead.rooms} חד׳`,
                              lead.priceRangeLabel,
                            ].filter(Boolean).join(' · ') || '—'}
                          </div>
                        </div>
                        <span className={`ccm-chev ${expanded ? 'open' : ''}`} aria-hidden="true">
                          <ChevronDown size={16} />
                        </span>
                      </div>
                    </div>

                    {/* Expanded details */}
                    <div className={`ccm-expand ${expanded ? 'open' : ''}`}>
                      <div className="ccm-expand-inner">
                        {/* Status pill (tap to open sheet) */}
                        <div className="ccm-status-row">
                          <button
                            type="button"
                            className={`badge ${statusBadgeClass(lead.status)} status-badge-btn`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setStatusSheetLead(lead);
                            }}
                            title={lead.statusExplanation || 'שנה סטטוס'}
                          >
                            {statusIcon(lead.status)}
                            {statusLabel(lead.status)}
                            {lead.suggestedStatus && lead.status !== lead.suggestedStatus && (
                              <Sparkles size={11} className="sp-auto-hint" />
                            )}
                          </button>
                          <span onClick={(e) => e.stopPropagation()}>
                            <SeriousnessPicker
                              lead={lead}
                              onChange={(value) => patchLead(
                                lead.id,
                                { seriousnessOverride: value },
                                { success: `רצינות עודכנה ל-${SERIOUSNESS_LABELS[value] || value}` },
                              )}
                            />
                          </span>
                        </div>

                        <div className="customer-card-body">
                          <div className="cc-row">
                            <span className="cc-label">מחפש</span>
                            <span className="cc-value">
                              {lead.lookingFor === 'RENT' ? 'לשכור' : 'לקנות'} · {lead.interestType === 'COMMERCIAL' ? 'מסחרי' : 'פרטי'}
                            </span>
                          </div>
                          <div className="cc-row">
                            <span className="cc-label">עיר</span>
                            <span className="cc-value inline-edit">
                              <InlineText
                                value={lead.city || ''}
                                onCommit={(v) => patchLead(lead.id, { city: v || null }, { success: 'עיר עודכנה' })}
                                placeholder="הוסף עיר"
                              />
                            </span>
                          </div>
                          <div className="cc-row">
                            <span className="cc-label">חדרים</span>
                            <span className="cc-value">
                              {/* F-11 — numeric chip picker replaces the
                                  free-text inline edit so values always
                                  match the numeric filter / match logic. */}
                              <RoomsInlinePicker
                                value={lead.rooms}
                                onChange={(v) => patchLead(lead.id, { rooms: v }, { success: 'חדרים עודכנו' })}
                              />
                            </span>
                          </div>
                          <div className="cc-row">
                            <span className="cc-label">תקציב</span>
                            <span className="cc-value inline-edit">
                              <InlineText
                                value={lead.priceRangeLabel || ''}
                                onCommit={(v) => patchLead(lead.id, { priceRangeLabel: v || null })}
                                placeholder="הוסף תקציב"
                              />
                            </span>
                          </div>
                          {lead.sector && lead.sector !== 'כללי' && (
                            <div className="cc-row">
                              <span className="cc-label">מגזר</span>
                              <span className="cc-value">{lead.sector}</span>
                            </div>
                          )}
                          {lead.schoolProximity && (
                            <div className="cc-row">
                              <span className="cc-label">קירבה לבית ספר</span>
                              <span className="cc-value">{lead.schoolProximity}</span>
                            </div>
                          )}
                          <div className="cc-row">
                            <span className="cc-label">אישור עקרוני</span>
                            <span className="cc-value">
                              {lead.preApproval
                                ? <span className="cc-pos">יש</span>
                                : <span className="cc-muted">אין</span>}
                            </span>
                          </div>
                        </div>

                        <div className="customer-description" onClick={(e) => e.stopPropagation()}>
                          <DescriptionInline
                            value={lead.description || ''}
                            onCommit={(v) => patchLead(
                              lead.id,
                              { description: v || null },
                              { success: 'תיאור עודכן' },
                            )}
                          />
                        </div>

                        <div className="customer-notes">
                          <InlineText
                            value={lead.notes || ''}
                            onCommit={(v) => patchLead(lead.id, { notes: v || null }, { success: 'הערות עודכנו' })}
                            multiline
                            dir="auto"
                            placeholder="הוסף הערות..."
                            className="customer-notes-inline"
                          />
                        </div>

                        <div className="ccm-last-contact-wrap">
                          <button
                            type="button"
                            className="cc-last-contact"
                            title={lead.lastContact ? absoluteTime(lead.lastContact) : 'לחץ לעדכון קשר אחרון לעכשיו'}
                            onClick={(e) => {
                              e.stopPropagation();
                              patchLead(lead.id, { lastContact: new Date().toISOString() }, { success: 'קשר אחרון עודכן' });
                            }}
                          >
                            <Calendar size={12} />
                            {lead.lastContact ? relativeTime(lead.lastContact) : 'ללא קשר'}
                          </button>
                        </div>

                        {/* F-7 — SMS demoted to overflow sheet; WhatsApp
                            now dominates the rail because it's the #1
                            daily action (20:1 over SMS for Israeli agents).
                            Remaining 3 slots grow to 56×56 per rail-xl
                            class. */}
                        <div className="ccm-actions ccm-rail ccm-rail-xl">
                          <a
                            href={waUrl(lead.phone, `שלום ${lead.name}`)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="ccm-rail-btn ccm-rail-wa"
                            onClick={(e) => {
                              e.stopPropagation();
                              primeContactBump(lead.id);
                              haptics.tap();
                            }}
                            aria-label={`וואטסאפ ל${lead.name}`}
                            title={`וואטסאפ ל${lead.name}`}
                          >
                            <WhatsAppIcon size={24} />
                            <span className="ccm-rail-label">וואטסאפ</span>
                          </a>
                          <a
                            href={telUrl(lead.phone)}
                            className="ccm-rail-btn ccm-rail-call"
                            onClick={(e) => {
                              e.stopPropagation();
                              primeContactBump(lead.id);
                              haptics.tap();
                            }}
                            aria-label={`התקשר ל${lead.name}`}
                            title={`התקשר ל${lead.name}`}
                          >
                            <Phone size={22} aria-hidden="true" />
                          </a>
                          <button
                            type="button"
                            className="ccm-rail-btn ccm-rail-more"
                            onClick={(e) => {
                              e.stopPropagation();
                              setOverflowLead(lead);
                            }}
                            aria-label={`פעולות נוספות ל${lead.name}`}
                            title="פעולות נוספות"
                          >
                            <MoreHorizontal size={22} aria-hidden="true" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </SwipeRow>
              </div>
            );
          }

          // ── Desktop: tighter 3-block card (left avatar / middle stats / right pre-approval) ──
          const matchCount = matchCountByLead[lead.id] || 0;
          const lookingForLabel = lead.lookingFor === 'RENT' ? 'לשכור' : 'לקנות';
          const interestLabel =
            lead.interestType === 'COMMERCIAL' ? 'מסחרי' : 'פרטי';
          const InterestIcon = lead.interestType === 'COMMERCIAL' ? Briefcase : Home;
          return (
            <div
              key={lead.id}
              ref={(el) => { if (el) cardRefs.current[lead.id] = el; }}
              className={`customer-card cc-v2 ${highlightId === lead.id ? 'highlight' : ''}`}
            >
              <div className="cc-v2-grid">
                <div className="cc-v2-left">
                  <div className="customer-avatar">{lead.name.charAt(0)}</div>
                  <div className="cc-v2-name">
                    <div className="cc-v2-name-row">
                      <Link to={`/customers/${lead.id}`} className="customer-name-link">
                        <strong>{lead.name}</strong>
                      </Link>
                      {/* Sprint 7 B4 — favorite toggle inline with the name. */}
                      <FavoriteStar
                        active={favoriteIds.has(lead.id)}
                        onToggle={(next) => handleToggleFavorite(lead.id, next)}
                      />
                    </div>
                    <StatusPicker lead={lead} onChange={handleStatusChange} />
                    <SeriousnessPicker
                      lead={lead}
                      onChange={(value) => patchLead(
                        lead.id,
                        { seriousnessOverride: value },
                        { success: `רצינות עודכנה ל-${SERIOUSNESS_LABELS[value] || value}` },
                      )}
                    />
                  </div>
                </div>

                <div className="cc-v2-mid">
                  <div className="cc-v2-mid-row cc-v2-headline">
                    <InterestIcon size={12} />
                    <span>
                      מחפש: <strong>{interestLabel}</strong> · <strong>{lookingForLabel}</strong>
                    </span>
                  </div>
                  <div className="cc-v2-mid-row">
                    <span className="cc-v2-chip">
                      {lead.city || 'עיר ?'}
                    </span>
                    <span className="cc-v2-chip">
                      {lead.rooms ? `${lead.rooms} חד׳` : '— חד׳'}
                    </span>
                    <span className="cc-v2-chip cc-v2-chip-budget">
                      {lead.priceRangeLabel
                        || (lead.budget ? `₪${Number(lead.budget).toLocaleString('he-IL')}` : 'תקציב ?')}
                    </span>
                  </div>
                  {matchCount > 0 && (
                    <Link
                      to={`/properties${lead.city ? `?city=${encodeURIComponent(lead.city)}` : ''}`}
                      className="cc-match-pill cc-v2-match-pill"
                      title={`${matchCount} נכסים שלך עונים לקריטריונים של ${lead.name}`}
                    >
                      <Sparkles size={11} />
                      <strong>{matchCount}</strong>
                      <span>נכסים תואמים</span>
                    </Link>
                  )}
                </div>

                <div className="cc-v2-right">
                  {lead.preApproval && (
                    <span className="cc-v2-preapproval" title="אישור עקרוני למשכנתא">
                      <CheckCircle2 size={12} />
                      אישור עקרוני
                    </span>
                  )}
                  {(() => {
                    const stale = stalePillDays(lead);
                    if (!stale) return null;
                    return (
                      <button
                        type="button"
                        className="cc-v2-stale-pill"
                        onClick={() => patchLead(lead.id, { lastContact: new Date().toISOString() }, { success: 'קשר אחרון עודכן' })}
                        title="לחץ לעדכון קשר אחרון לעכשיו"
                      >
                        {stale} ימים ללא קשר
                      </button>
                    );
                  })()}
                </div>
              </div>

              <div className="customer-description cc-v2-description">
                <DescriptionInline
                  value={lead.description || ''}
                  onCommit={(v) => patchLead(
                    lead.id,
                    { description: v || null },
                    { success: 'תיאור עודכן' },
                  )}
                />
              </div>

              <div className="customer-notes cc-v2-notes">
                <InlineText
                  value={lead.notes || ''}
                  onCommit={(v) => patchLead(lead.id, { notes: v || null }, { success: 'הערות עודכנו' })}
                  multiline
                  dir="auto"
                  placeholder="הוסף הערות..."
                  className="customer-notes-inline"
                />
              </div>

              <div className="customer-card-footer cc-v2-footer">
                <div className="customer-dates">
                  <button
                    className="cc-last-contact"
                    title={lead.lastContact ? absoluteTime(lead.lastContact) : 'לחץ לעדכון קשר אחרון לעכשיו'}
                    onClick={() => patchLead(lead.id, { lastContact: new Date().toISOString() }, { success: 'קשר אחרון עודכן' })}
                  >
                    <Calendar size={12} />
                    {lead.lastContact ? relativeTime(lead.lastContact) : 'ללא קשר'}
                  </button>
                </div>
                <div className="customer-actions">
                  {/* F-2 — WhatsApp is the single daily action; upgrade
                      it to a filled primary (green) button so it's not
                      visually identical to Delete. Edit + Delete move to
                      an overflow menu so the destructive action can't be
                      fat-fingered. */}
                  <a
                    href={waUrl(lead.phone, `שלום ${lead.name}`)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-wa btn-sm"
                    title="שלח בוואטסאפ"
                    aria-label={`וואטסאפ ל${lead.name}`}
                    onClick={() => { primeContactBump(lead.id); haptics.tap(); }}
                  >
                    <WhatsAppIcon size={14} />
                    <span>וואטסאפ</span>
                  </a>
                  <a
                    href={telUrl(lead.phone)}
                    className="btn btn-ghost btn-sm"
                    title={lead.phone}
                    aria-label={`התקשר ל${lead.name}`}
                    onClick={() => { primeContactBump(lead.id); haptics.tap(); }}
                  >
                    <Phone size={14} />
                    <span className="hide-sm">{lead.phone}</span>
                  </a>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => setOverflowLead(lead)}
                    title="פעולות נוספות"
                    aria-label={`פעולות נוספות ל${lead.name}`}
                  >
                    <MoreHorizontal size={14} />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="customers-empty rich">
            <div className="ce-illustration">👥</div>
            <h3>
              {leads.length === 0
                ? 'אין עדיין לקוחות במערכת'
                : 'אין לקוחות בסינון הנוכחי'}
            </h3>
            <p>
              {leads.length === 0
                ? 'הוסף את הליד הראשון שלך כדי להתחיל לעקוב אחר הלקוחות הפוטנציאליים.'
                : 'נסה לשנות את הסינון או לחפש לקוח בשם אחר.'}
            </p>
            <Link to="/customers/new" className="btn btn-primary btn-lg">
              <UserPlus size={18} />
              ליד חדש
            </Link>
          </div>
        )}
      </div>
      )}

      {editDialog && (
        <CustomerEditDialog
          lead={editDialog}
          onClose={() => setEditDialog(null)}
          onSaved={async () => {
            setEditDialog(null);
            await loadLeads();
          }}
        />
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="מחיקת לקוח"
          message={`למחוק את "${deleteTarget.name}"? הפעולה אינה הפיכה.`}
          confirmLabel="מחק"
          onConfirm={confirmDeleteLead}
          onClose={() => setDeleteTarget(null)}
          busy={deleting}
        />
      )}

      {/* Mobile ⋯ overflow sheet for per-lead secondary actions (P1-M8).
          Desktop also routes Edit + Delete through here now (F-2) so the
          destructive action can't be mis-tapped. */}
      <OverflowSheet
        open={!!overflowLead}
        onClose={() => setOverflowLead(null)}
        title={overflowLead ? overflowLead.name : ''}
        actions={overflowLead ? [
          {
            icon: User,
            label: 'פתח כרטיס לקוח',
            description: 'היסטוריה, התאמות, עריכה מלאה',
            onClick: () => navigate(`/customers/${overflowLead.id}`),
          },
          {
            icon: Phone,
            label: 'התקשר',
            description: overflowLead.phone,
            onClick: () => handleTel(overflowLead),
          },
          {
            icon: MessageSquare,
            label: 'SMS',
            description: overflowLead.phone,
            onClick: () => handleSms(overflowLead),
          },
          {
            icon: Edit3,
            label: 'עריכה',
            onClick: () => setEditDialog(overflowLead),
          },
          {
            icon: Trash2,
            label: 'מחיקה',
            color: 'danger',
            onClick: () => setDeleteTarget(overflowLead),
          },
        ] : []}
      />

      {/* Mobile status-chip bottom sheet (P5-M3) */}
      <StatusInfoSheet
        lead={statusSheetLead}
        onClose={() => setStatusSheetLead(null)}
        onChange={(s) => {
          if (statusSheetLead && s !== statusSheetLead.status) {
            handleStatusChange(statusSheetLead, s);
          }
          setStatusSheetLead(null);
        }}
      />

      {/* P1-M11: Mobile filters bottom sheet */}
      {filterSheetOpen && (
        <FilterSheet
          allLeads={leads}
          inactiveFilter={inactiveFilter}
          lookingForFilter={lookingForFilter}
          interestFilter={interestFilter}
          statusFilter={statusFilter}
          onLookingForChange={setLookingForFilter}
          onInterestChange={setInterestFilter}
          onStatusChange={setStatusFilter}
          onClear={clearFilters}
          onClose={() => setFilterSheetOpen(false)}
        />
      )}

      {/* Sprint 2 C2 — Nadlan-parity advanced filter drawer. Opens
          from the "סינון מתקדם" button in the header; apply re-fetches
          /api/leads with the selected filters. */}
      <CustomerFiltersPanel
        open={advancedFilterOpen}
        filters={serverFilters}
        onApply={handleApplyServerFilters}
        onClose={() => setAdvancedFilterOpen(false)}
      />
    </div>
    </PullRefresh>
  );
}

// CustomerList — at ≥900 px renders a real sortable table (P2-D13);
// below 900 px keeps the existing card-style list rows for mobile scanning.
function CustomerList({
  leads,
  highlightId,
  cardRefs,
  isMobile,
  matchCountByLead = {},
  favoriteIds,
  onToggleFavorite,
  onStatusChange,
  onEdit,
  onDelete,
  onNavigate,
  onBumpLastContact,
}) {
  // F-9 — persist sort in URL so back-nav and shareable links preserve
  // the agent's preferred order (typical: "stale first" = lastContact desc).
  const [searchParams, setSearchParams] = useSearchParams();
  const urlSort = searchParams.get('sort');
  const urlDir  = searchParams.get('dir');
  const validKeys = ['name', 'city', 'rooms', 'budget', 'status', 'lastContact'];
  const [sortKey, setSortKey] = useState(validKeys.includes(urlSort) ? urlSort : 'name');
  const [sortDir, setSortDir] = useState(urlDir === 'desc' ? 'desc' : 'asc');

  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    if (sortKey === 'name' && sortDir === 'asc') {
      next.delete('sort'); next.delete('dir');
    } else {
      next.set('sort', sortKey);
      next.set('dir', sortDir);
    }
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortKey, sortDir]);

  const sorted = useMemo(() => {
    const arr = [...leads];
    const dir = sortDir === 'asc' ? 1 : -1;
    const get = (l) => {
      switch (sortKey) {
        case 'name':       return (l.name || '').toLowerCase();
        case 'city':       return (l.city || '').toLowerCase();
        case 'rooms':      return parseFloat(l.rooms) || 0;
        case 'budget':     return Number(l.budget) || 0;
        case 'status':     return ({ HOT: 0, WARM: 1, COLD: 2 })[l.status] ?? 3;
        case 'lastContact':return l.lastContact ? new Date(l.lastContact).getTime() : 0;
        default:           return '';
      }
    };
    arr.sort((a, b) => {
      const av = get(a);
      const bv = get(b);
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
    return arr;
  }, [leads, sortKey, sortDir]);

  const toggleSort = (key) => {
    if (key === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  };

  // Helper that returns an icon node for a sortable column header.
  // Declared as a regular function (not a component) so React's
  // rules-of-hooks linter is happy with it being defined here.
  const renderSortIcon = (col) => {
    if (sortKey !== col) return <ArrowUpDown size={11} className="cl-sort-icon" />;
    return sortDir === 'asc'
      ? <ChevronUp size={12} className="cl-sort-icon active" />
      : <ChevronDown size={12} className="cl-sort-icon active" />;
  };

  // ── Real table on desktop (≥900px) ───────────────────────────────
  if (!isMobile) {
    return (
      <div className="customer-table-wrap animate-in animate-in-delay-3">
        <table className="customer-table">
          <thead>
            <tr>
              <th onClick={() => toggleSort('name')} className={`cl-th cl-th-sortable ${sortKey === 'name' ? 'sorted' : ''}`}>
                <span>שם</span>{renderSortIcon('name')}
              </th>
              <th onClick={() => toggleSort('city')} className={`cl-th cl-th-sortable ${sortKey === 'city' ? 'sorted' : ''}`}>
                <span>עיר</span>{renderSortIcon('city')}
              </th>
              <th onClick={() => toggleSort('rooms')} className={`cl-th cl-th-sortable cl-th-num ${sortKey === 'rooms' ? 'sorted' : ''}`}>
                <span>חדרים</span>{renderSortIcon('rooms')}
              </th>
              <th onClick={() => toggleSort('budget')} className={`cl-th cl-th-sortable cl-th-num ${sortKey === 'budget' ? 'sorted' : ''}`}>
                <span>תקציב</span>{renderSortIcon('budget')}
              </th>
              <th onClick={() => toggleSort('status')} className={`cl-th cl-th-sortable ${sortKey === 'status' ? 'sorted' : ''}`}>
                <span>סטטוס</span>{renderSortIcon('status')}
              </th>
              <th onClick={() => toggleSort('lastContact')} className={`cl-th cl-th-sortable cl-th-num ${sortKey === 'lastContact' ? 'sorted' : ''}`}>
                <span>קשר אחרון</span>{renderSortIcon('lastContact')}
              </th>
              <th className="cl-th cl-th-actions">פעולות</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((lead) => {
              const matches = matchCountByLead[lead.id] || 0;
              const lastRel = lead.lastContact ? relativeDate(lead.lastContact) : null;
              return (
                <tr
                  key={lead.id}
                  ref={(el) => { if (el) cardRefs.current[lead.id] = el; }}
                  className={`cl-tr ${highlightId === lead.id ? 'highlight' : ''}`}
                  onClick={() => onNavigate?.(lead.id)}
                  role="link"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); onNavigate?.(lead.id); }
                  }}
                  title={`פתח כרטיס לקוח של ${lead.name}`}
                >
                  <td className="cl-td cl-td-name">
                    {/* Sprint 7 B4 — star sits on the row so agents can
                        flag a lead without opening the detail page. */}
                    {onToggleFavorite && (
                      <span onClick={(e) => e.stopPropagation()}>
                        <FavoriteStar
                          active={favoriteIds?.has(lead.id) || false}
                          onToggle={(next) => onToggleFavorite(lead.id, next)}
                          className="fav-star-sm"
                        />
                      </span>
                    )}
                    <span className="cl-avatar">{lead.name.charAt(0)}</span>
                    <span className="cl-name-text">
                      <strong>{lead.name}</strong>
                      <small>{lead.source || '—'}</small>
                    </span>
                    {matches > 0 && (
                      <span className="cl-match-pill" title={`${matches} נכסים תואמים`}>
                        <Sparkles size={10} />
                        {matches}
                      </span>
                    )}
                  </td>
                  <td className="cl-td cl-muted">{lead.city || '—'}</td>
                  <td className="cl-td cl-td-num cl-muted">{lead.rooms || '—'}</td>
                  <td className="cl-td cl-td-num cl-muted">
                    {lead.budget
                      ? `₪${Number(lead.budget).toLocaleString('he-IL')}`
                      : (lead.priceRangeLabel || '—')}
                  </td>
                  <td className="cl-td" onClick={(e) => e.stopPropagation()}>
                    <StatusPicker lead={lead} onChange={onStatusChange} />
                  </td>
                  <td
                    className={`cl-td cl-td-num cl-muted ${stalePillDays(lead) ? 'cl-td-stale' : ''}`}
                    title={lead.lastContact ? absoluteTime(lead.lastContact) : ''}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {/* F-17 — parity with the card view: if the lead is
                        stale, show a clickable red pill that bumps
                        lastContact to now. Previously the table cell was
                        just colored muted text; no affordance. */}
                    {(() => {
                      const stale = stalePillDays(lead);
                      if (stale && onBumpLastContact) {
                        return (
                          <button
                            type="button"
                            className="cl-stale-pill"
                            title="לחץ לעדכון קשר אחרון לעכשיו"
                            onClick={(e) => {
                              e.stopPropagation();
                              onBumpLastContact(lead);
                            }}
                          >
                            {stale} ימים ללא קשר
                          </button>
                        );
                      }
                      return lastRel ? lastRel.label : '—';
                    })()}
                  </td>
                  <td className="cl-td cl-td-actions" onClick={(e) => e.stopPropagation()}>
                    <a
                      href={telUrl(lead.phone)}
                      className="cl-btn"
                      title={lead.phone}
                      aria-label={`התקשר ל${lead.name}`}
                      onClick={() => { primeContactBump(lead.id); haptics.tap(); }}
                    >
                      <Phone size={13} />
                    </a>
                    <a
                      href={waUrl(lead.phone, `שלום ${lead.name}`)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="cl-btn"
                      title="וואטסאפ"
                      aria-label={`וואטסאפ ל${lead.name}`}
                      onClick={() => { primeContactBump(lead.id); haptics.tap(); }}
                    >
                      <WhatsAppIcon size={13} className="wa-green" />
                    </a>
                    <button className="cl-btn" title="עריכה" onClick={() => onEdit(lead)}>
                      <Edit3 size={13} />
                    </button>
                    <button className="cl-btn danger" title="מחיקה" onClick={() => onDelete(lead)}>
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {sorted.length === 0 && (
          <div className="customers-empty">
            <p>אין לקוחות בסינון הנוכחי</p>
          </div>
        )}
      </div>
    );
  }

  // ── Mobile keeps the existing dense card-row list ─────────────────
  return (
    <div className="customer-list animate-in animate-in-delay-3">
      {leads.map((lead) => {
        return (
          <div
            key={lead.id}
            ref={(el) => { if (el) cardRefs.current[lead.id] = el; }}
            className={`customer-list-row ${highlightId === lead.id ? 'highlight' : ''}`}
          >
            <span className="cl-name">
              {onToggleFavorite && (
                <FavoriteStar
                  active={favoriteIds?.has(lead.id) || false}
                  onToggle={(next) => onToggleFavorite(lead.id, next)}
                  className="fav-star-sm"
                />
              )}
              <span className="cl-avatar">{lead.name.charAt(0)}</span>
              <span className="cl-name-text">
                <strong>{lead.name}</strong>
                <small>{lead.source || '—'}</small>
              </span>
            </span>
            <span>
              <StatusPicker lead={lead} onChange={onStatusChange} />
            </span>
            <span className="cl-type">
              <Chip tone="neutral">
                {lead.interestType === 'COMMERCIAL' ? 'מסחרי' : 'פרטי'}
              </Chip>
              <Chip tone={lead.lookingFor === 'RENT' ? 'rent' : 'buy'}>
                {lead.lookingFor === 'RENT' ? 'שכירות' : 'קנייה'}
              </Chip>
            </span>
            <span className="cl-muted">{lead.city || '—'}</span>
            <span className="cl-muted">{lead.rooms || '—'}</span>
            <span className="cl-muted">{lead.priceRangeLabel || '—'}</span>
            <span
              className={`cl-muted ${stalePillDays(lead) ? 'cl-stale' : ''}`}
              title={lead.lastContact ? absoluteTime(lead.lastContact) : ''}
            >
              {lead.lastContact ? relativeTime(lead.lastContact) : '—'}
            </span>
            <span className="cl-actions">
              <a
                href={telUrl(lead.phone)}
                className="cl-btn"
                title={lead.phone}
                aria-label={`התקשר ל${lead.name}`}
                onClick={() => { primeContactBump(lead.id); haptics.tap(); }}
              >
                <Phone size={13} />
              </a>
              <a
                href={waUrl(lead.phone, `שלום ${lead.name}`)}
                target="_blank"
                rel="noopener noreferrer"
                className="cl-btn"
                title="וואטסאפ"
                aria-label={`וואטסאפ ל${lead.name}`}
                onClick={() => { primeContactBump(lead.id); haptics.tap(); }}
              >
                <WhatsAppIcon size={13} className="wa-green" />
              </a>
              <button className="cl-btn" title="עריכה" onClick={() => onEdit(lead)}>
                <Edit3 size={13} />
              </button>
              <button className="cl-btn danger" title="מחיקה" onClick={() => onDelete(lead)}>
                <Trash2 size={13} />
              </button>
            </span>
          </div>
        );
      })}
      {leads.length === 0 && (
        <div className="customers-empty">
          <p>אין לקוחות בסינון הנוכחי</p>
        </div>
      )}
    </div>
  );
}

// Inline dropdown to pick HOT/WARM/COLD manually, with auto-suggestion badge.
function StatusPicker({ lead, onChange }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const isAutoMatch = lead.suggestedStatus && lead.status === lead.suggestedStatus;

  // F-10 — outside-click + ESC close. The old mouseLeave-only handler
  // trapped keyboard users and mis-fired on trackpad drift.
  useEffect(() => {
    if (!open) return undefined;
    const onDocDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDocDown);
    document.addEventListener('touchstart', onDocDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocDown);
      document.removeEventListener('touchstart', onDocDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="status-picker" ref={wrapRef}>
      <button
        className={`badge ${statusBadgeClass(lead.status)} status-badge-btn`}
        onClick={() => setOpen((v) => !v)}
        title={lead.statusExplanation || 'שנה סטטוס'}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        {statusIcon(lead.status)}
        {statusLabel(lead.status)}
        {lead.suggestedStatus && !isAutoMatch && (
          <Sparkles size={11} className="sp-auto-hint" title="הצעה אוטומטית שונה מהסטטוס הנוכחי" />
        )}
      </button>
      {open && (
        <div className="status-menu" role="menu">
          <div className="status-menu-hint">
            <HelpCircle size={12} />
            <span>{lead.statusExplanation || 'בחר סטטוס לליד'}</span>
          </div>
          {['HOT', 'WARM', 'COLD'].map((s) => (
            <button
              key={s}
              role="menuitem"
              className={`status-menu-item ${lead.status === s ? 'active' : ''}`}
              onClick={async () => {
                setOpen(false);
                if (s !== lead.status) await onChange(lead, s);
              }}
            >
              {statusIcon(s)}
              <span>{statusLabel(s)}</span>
              {lead.suggestedStatus === s && <span className="sp-auto">הצעה אוטומטית</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// F-11 — tiny rooms chip picker used inline on the customer card.
// Clicking the value opens a 10-chip grid; picking a chip commits and
// closes. Replaces the free-text InlineText that let agents save "3-4"
// and break numeric matching.
function RoomsInlinePicker({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDocDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDocDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  const label = value != null && value !== '' ? `${value} חד׳` : '—';
  return (
    <span className="rooms-inline" ref={ref}>
      <button
        type="button"
        className={`inline-text ${value == null || value === '' ? 'is-empty' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {label}
      </button>
      {open && (
        <div className="rooms-inline-pop" role="menu">
          <RoomsChips
            value={value}
            onChange={(v) => { onChange?.(v); setOpen(false); }}
          />
          <button
            type="button"
            className="rooms-inline-clear"
            onClick={() => { onChange?.(null); setOpen(false); }}
          >
            נקה
          </button>
        </div>
      )}
    </span>
  );
}

// Mobile status-chip bottom sheet. Shows full explanation + quick-switch rows.
function StatusInfoSheet({ lead, onClose, onChange }) {
  useEffect(() => {
    if (!lead) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [lead]);

  if (!lead) return null;

  const statuses = [
    { key: 'HOT', label: 'חם', icon: <Flame size={18} /> },
    { key: 'WARM', label: 'חמים', icon: <Thermometer size={18} /> },
    { key: 'COLD', label: 'קר', icon: <Snowflake size={18} /> },
  ];

  return (
    <div className="mpk-back mpk-overflow-back" onClick={onClose} role="dialog">
      <div className="mpk-sheet mpk-overflow sis-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="mpk-handle" />
        <header className="mpk-head">
          <h3>שנה סטטוס</h3>
          <button className="mpk-close" onClick={onClose} aria-label="סגור">
            <X size={18} />
          </button>
        </header>
        <div className="sis-explain">
          <div className="sis-current">
            <span className={`badge ${statusBadgeClass(lead.status)}`}>
              {statusIcon(lead.status)}
              {statusLabel(lead.status)}
            </span>
            <span className="sis-current-name">{lead.name}</span>
          </div>
          <p className="sis-reason">
            {lead.statusExplanation || 'לא זוהתה פעילות אחרונה. עדכן קשר או שלח וואטסאפ כדי לקדם את הליד.'}
          </p>
        </div>
        <div className="mpk-overflow-list">
          {statuses.map((s) => (
            <button
              key={s.key}
              type="button"
              className={`mpk-overflow-row sis-row ${lead.status === s.key ? 'sel' : ''}`}
              onClick={() => onChange(s.key)}
            >
              {s.icon}
              <div className="mpk-overflow-meta">
                <strong>{s.label}</strong>
                {lead.suggestedStatus === s.key && <small>הצעה אוטומטית</small>}
              </div>
            </button>
          ))}
        </div>
        <button className="mpk-cancel" onClick={onClose}>ביטול</button>
      </div>
    </div>
  );
}

// P1-M11: Mobile filter bottom sheet — three groups stacked + clear.
// F-18 — live "show N results" button label so the agent sees the count
// update as they toggle chips.
function FilterSheet({
  allLeads = [],
  inactiveFilter,
  lookingForFilter,
  interestFilter,
  statusFilter,
  onLookingForChange,
  onInterestChange,
  onStatusChange,
  onClear,
  onClose,
}) {
  const matchCount = useMemo(() => {
    const now = Date.now();
    const DAY = 86400000;
    return allLeads.filter((l) => {
      if (lookingForFilter !== 'all' && l.lookingFor !== lookingForFilter) return false;
      if (interestFilter !== 'all' && l.interestType !== interestFilter) return false;
      if (statusFilter !== 'all' && l.status !== statusFilter) return false;
      if (inactiveFilter != null) {
        if (l.status === 'COLD') return false;
        if (!l.lastContact) return false;
        const days = (now - new Date(l.lastContact).getTime()) / DAY;
        if (days < inactiveFilter) return false;
      }
      return true;
    }).length;
  }, [allLeads, lookingForFilter, interestFilter, statusFilter, inactiveFilter]);
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  const Group = ({ title, options, value, onChange }) => (
    <div className="filter-sheet-group">
      <div className="filter-sheet-group-title">{title}</div>
      <div className="filter-sheet-chips">
        {options.map((o) => (
          <button
            key={o.key}
            type="button"
            className={`filter-sheet-chip ${value === o.key ? 'sel' : ''}`}
            onClick={() => onChange(o.key)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="mpk-back mpk-overflow-back" onClick={onClose} role="dialog">
      <div className="mpk-sheet mpk-overflow filter-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="mpk-handle" />
        <header className="mpk-head">
          <h3>סינון לקוחות</h3>
          <button className="mpk-close" onClick={onClose} aria-label="סגור">
            <X size={18} />
          </button>
        </header>
        <div className="filter-sheet-body">
          <Group
            title="חיפוש"
            options={[
              { key: 'all', label: 'הכל' },
              { key: 'BUY', label: 'קונים' },
              { key: 'RENT', label: 'שוכרים' },
            ]}
            value={lookingForFilter}
            onChange={onLookingForChange}
          />
          <Group
            title="סוג נכס"
            options={[
              { key: 'all', label: 'כל הסוגים' },
              { key: 'PRIVATE', label: 'פרטי' },
              { key: 'COMMERCIAL', label: 'מסחרי' },
            ]}
            value={interestFilter}
            onChange={onInterestChange}
          />
          <Group
            title="סטטוס"
            options={[
              { key: 'all', label: 'הכל' },
              { key: 'HOT', label: 'חם' },
              { key: 'WARM', label: 'חמים' },
              { key: 'COLD', label: 'קר' },
            ]}
            value={statusFilter}
            onChange={onStatusChange}
          />
        </div>
        <div className="filter-sheet-actions">
          <button
            type="button"
            className="filter-sheet-clear"
            onClick={() => { onClear(); }}
          >
            נקה סינון
          </button>
          <button
            type="button"
            className="filter-sheet-apply"
            onClick={onClose}
          >
            הצג {matchCount} תוצאות
          </button>
        </div>
      </div>
    </div>
  );
}

// Phase 4 Lane 3 / Task C4 — seriousness inline popover. The chip shows
// the Hebrew label of the lead's current seriousnessOverride value and
// opens a small Portal-mounted popover (role="dialog", aria-modal) with
// the four enum options. Picking one invokes `onChange(value)` which
// patches via api.updateLead; the host handles optimistic UI + rollback.
function SeriousnessPicker({ lead, onChange }) {
  const [open, setOpen] = useState(false);
  const [anchorRect, setAnchorRect] = useState(null);
  const triggerRef = useRef(null);
  const popRef = useRef(null);
  const current = lead.seriousnessOverride || 'NONE';
  const currentLabel = SERIOUSNESS_LABELS[current] || SERIOUSNESS_LABELS.NONE;

  useFocusTrap(popRef, { onEscape: () => setOpen(false) });

  useEffect(() => {
    if (!open) return undefined;
    // Position the popover under the trigger on open and whenever
    // the viewport scrolls/resizes.
    const sync = () => {
      const el = triggerRef.current;
      if (!el) return;
      setAnchorRect(el.getBoundingClientRect());
    };
    sync();
    const onDocDown = (e) => {
      const trg = triggerRef.current;
      const pop = popRef.current;
      if (trg && trg.contains(e.target)) return;
      if (pop && pop.contains(e.target)) return;
      setOpen(false);
    };
    window.addEventListener('resize', sync);
    window.addEventListener('scroll', sync, true);
    document.addEventListener('mousedown', onDocDown);
    document.addEventListener('touchstart', onDocDown);
    return () => {
      window.removeEventListener('resize', sync);
      window.removeEventListener('scroll', sync, true);
      document.removeEventListener('mousedown', onDocDown);
      document.removeEventListener('touchstart', onDocDown);
    };
  }, [open]);

  const pick = (value) => {
    setOpen(false);
    if (value !== current) {
      // Caller is responsible for optimistic update + toast / rollback.
      onChange?.(value);
    }
  };

  const popStyle = anchorRect
    ? {
        position: 'fixed',
        top: anchorRect.bottom + 6,
        // RTL-friendly positioning: the popover's inline-start edge
        // aligns with the trigger's inline-start edge.
        insetInlineStart: anchorRect.left,
        zIndex: 1000,
      }
    : { position: 'fixed', top: 0, insetInlineStart: 0, zIndex: 1000 };

  return (
    <>
      <button
        type="button"
        ref={triggerRef}
        className={`seriousness-chip seriousness-${current.toLowerCase()}`}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`רצינות: ${currentLabel}`}
        title="שנה רצינות"
      >
        <span className="seriousness-chip-label">{currentLabel}</span>
      </button>
      {open && (
        <Portal>
          <div
            ref={popRef}
            className="seriousness-pop"
            role="dialog"
            aria-modal="true"
            aria-label="בחר רצינות"
            style={popStyle}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="seriousness-pop-title">רצינות</div>
            <div className="seriousness-pop-list" role="menu">
              {Object.entries(SERIOUSNESS_LABELS).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  role="menuitem"
                  className={`seriousness-pop-item ${current === value ? 'active' : ''}`}
                  onClick={() => pick(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </Portal>
      )}
    </>
  );
}

// Phase 4 Lane 3 / Task L3 — inline description edit. Shows the
// description as a clickable span (with a muted placeholder when
// empty); a click swaps it for a textarea that commits on blur or
// Enter. Different from InlineText because L3 explicitly wants
// blur-to-save (InlineText's S17 policy reverts on blur).
//
// Max length is 500 chars (matches backend validation for the Lead
// description field).
function DescriptionInline({ value, onCommit, maxLength = 500 }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || '');
  const ref = useRef(null);

  useEffect(() => {
    if (!editing) setDraft(value || '');
  }, [value, editing]);

  useEffect(() => {
    if (editing) {
      setTimeout(() => {
        ref.current?.focus();
        try { ref.current?.setSelectionRange?.(draft.length, draft.length); } catch { /* jsdom */ }
      }, 10);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  const commit = () => {
    const next = (draft || '').trim();
    setEditing(false);
    if (next !== (value || '')) {
      try {
        onCommit?.(next);
      } catch { /* host surfaces toast */ }
    }
  };

  const cancel = () => {
    setDraft(value || '');
    setEditing(false);
  };

  const onKeyDown = (e) => {
    // Enter commits (without shift so shift+Enter allows multi-line
    // content while the agent is still typing).
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      commit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancel();
    }
  };

  if (editing) {
    return (
      <textarea
        ref={ref}
        value={draft}
        onChange={(e) => setDraft(e.target.value.slice(0, maxLength))}
        onBlur={commit}
        onKeyDown={onKeyDown}
        className="lead-description-input"
        rows={2}
        dir="auto"
        maxLength={maxLength}
        aria-label="תיאור"
        placeholder="הוסף תיאור קצר"
      />
    );
  }

  const empty = !value;
  return (
    <span
      role="button"
      tabIndex={0}
      className={`lead-description ${empty ? 'is-empty' : ''}`}
      onClick={() => setEditing(true)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setEditing(true);
        }
      }}
      dir="auto"
      title="לחץ לעריכת תיאור"
    >
      {empty ? 'הוסף תיאור קצר' : value}
    </span>
  );
}
