import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
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
  Upload,
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
import ViewToggle from '../components/ViewToggle';
import DataTable from '../components/DataTable';
import Pagination from '../components/Pagination';
import { paginate } from '../lib/pagination';
import useInfiniteScroll from '../lib/useInfiniteScroll';
import { useViewMode } from '../lib/useViewMode';
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
import AdvancedFilters from '../components/AdvancedFilters';
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

function statusLabel(t, status) {
  return {
    HOT: t('list.status.hot'),
    WARM: t('list.status.warm'),
    COLD: t('list.status.cold'),
  }[status] || status;
}

// P2-M17: short reason pill — emoji + status word + relative-date suffix
function statusReason(t, lead) {
  const status = lead.status || 'WARM';
  const lastContactLabel = lead.lastContact ? relativeDate(lead.lastContact).label : null;
  const daysSince = lead.lastContact
    ? Math.round((Date.now() - new Date(lead.lastContact).getTime()) / 86400000)
    : null;

  if (status === 'HOT') {
    return { emoji: '🔥', label: t('list.statusReason.hot'), suffix: lastContactLabel || t('list.statusReason.new') };
  }
  if (status === 'COLD') {
    if (daysSince != null && daysSince > 30) {
      return { emoji: '❄️', label: t('list.statusReason.cold'), suffix: t('list.statusReason.daysNoContact', { days: daysSince }) };
    }
    return { emoji: '❄️', label: t('list.statusReason.cold'), suffix: lastContactLabel || t('list.statusReason.noContact') };
  }
  return { emoji: '🟡', label: t('list.statusReason.warm'), suffix: lastContactLabel || t('list.statusReason.new') };
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
  const { t } = useTranslation('customers');
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const isMobile = useViewportMobile(820);
  const [viewMode, setViewMode] = useViewMode('customers', 'cards');
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

  // L-A — inline shared <AdvancedFilters> panel ported from the
  // properties page. Lead-specific fields (category desired,
  // seriousness) ride along via the `extra` slot. Values live in
  // `advLeadFilters` + stage into `serverFilters` on Apply / Clear.
  const [showInlineAdvanced, setShowInlineAdvanced] = useState(false);
  const [advLeadFilters, setAdvLeadFilters] = useState({
    city: '',
    minPrice: null,
    maxPrice: null,
    minRooms: '',
    maxRooms: '',
    lookingFor: '',   // '' | 'BUY' | 'RENT'
    seriousness: '',  // '' | 'VERY' | 'MEDIUM' | 'SORT_OF'
    customerStatus: '', // '' | 'ACTIVE' | 'INACTIVE' | 'COLD'
  });

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
    if (f === 'hot') return t('list.filters.incoming.hot');
    if (f === 'warm') return t('list.filters.incoming.warm');
    if (f === 'cold') return t('list.filters.incoming.cold');
    if (f && /^inactive(\d+)$/.test(f)) return t('list.filters.incoming.inactive', { days: f.match(/^inactive(\d+)$/)[1] });
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

      // L-A — shared advanced-filter panel (inline). Client-side so
      // the fetch isn't re-issued on every knob turn; backend filter
      // drawer (CustomerFiltersPanel) continues to do server-side work
      // via serverFilters.
      if (advLeadFilters.city && l.city !== advLeadFilters.city) return false;
      if (advLeadFilters.lookingFor && l.lookingFor !== advLeadFilters.lookingFor) return false;
      if (advLeadFilters.seriousness && (l.seriousnessOverride || 'NONE') !== advLeadFilters.seriousness) return false;
      if (advLeadFilters.customerStatus && (l.customerStatus || 'ACTIVE') !== advLeadFilters.customerStatus) return false;
      if (advLeadFilters.minPrice != null && (l.budget == null || l.budget < Number(advLeadFilters.minPrice))) return false;
      if (advLeadFilters.maxPrice != null && (l.budget == null || l.budget > Number(advLeadFilters.maxPrice))) return false;
      if (advLeadFilters.minRooms !== '' && advLeadFilters.minRooms != null) {
        const r = parseFloat(l.rooms);
        if (!Number.isFinite(r) || r < Number(advLeadFilters.minRooms)) return false;
      }
      if (advLeadFilters.maxRooms !== '' && advLeadFilters.maxRooms != null) {
        const r = parseFloat(l.rooms);
        if (!Number.isFinite(r) || r > Number(advLeadFilters.maxRooms)) return false;
      }

      if (!debouncedSearch) return true;
      const s = debouncedSearch.toLowerCase();
      return (
        l.name?.toLowerCase().includes(s) ||
        l.city?.toLowerCase().includes(s) ||
        l.phone?.includes(s)
      );
    });
  }, [leads, lookingForFilter, interestFilter, statusFilter, inactiveFilter, debouncedSearch, onlyFavorites, favoriteIds, advLeadFilters]);

  // Table view keeps the numbered pager; card/dense view uses infinite
  // scroll. Both reset when filters change.
  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [lookingForFilter, interestFilter, statusFilter, inactiveFilter, debouncedSearch, onlyFavorites]);
  const paged = useMemo(() => paginate(filtered, { page, pageSize: 8 }), [filtered, page]);
  const infinite = useInfiniteScroll(filtered.length, { pageSize: 8, initial: 8 });
  const cardVisible = useMemo(() => filtered.slice(0, infinite.visible), [filtered, infinite.visible]);

  const handleWhatsApp = (lead) => {
    primeContactBump(lead.id);
    haptics.tap();
    // L-6 — open with noopener+noreferrer set so Capacitor's WebView
    // keeps the Estia session intact when wa.me opens in a new surface.
    // `noreferrer` implies `noopener` but set explicitly for clarity.
    window.open(
      waUrl(lead.phone, t('list.card.whatsappHello', { name: lead.name })),
      '_blank',
      'noopener,noreferrer',
    );
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
        label: label || t('list.patchSuccess.saving'),
        success: success || t('list.patchSuccess.saved'),
        onSave: () => api.updateLead(leadId, patch),
      });
    } catch {
      // Rewind by re-fetching on failure
      await loadLeads();
    }
  };

  const handleStatusChange = (lead, newStatus) =>
    patchLead(lead.id, { status: newStatus }, { success: t('list.status.updatedTo', { status: statusLabel(t, newStatus) }) });

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
      toast.error(e?.message || t('list.favorite.failed'));
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
      toast.success(t('list.delete.toastRemoved', { name: snapshot.name }), {
        duration: 10_000,
        action: {
          label: t('list.delete.undo'),
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
              toast.success(t('list.delete.restored'));
            } catch (e) {
              toast.error(e?.message || t('list.delete.restoreFailed'));
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
            <h2>{t('list.title')}</h2>
            <p>{t('list.loading')}</p>
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
            <h2>{t('list.title')}</h2>
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
          title: t('list.tour.title'),
          content: t('list.tour.content') },
      ]}
    />
    <div className="customers-page">
      <div className="page-header animate-in">
        <div className="page-header-info">
          <h2>{t('list.title')}</h2>
          <p>{t('list.countFormat', { filtered: filtered.length, total: leads.length })}</p>
        </div>
        <div className="page-header-actions">
          {/* Sprint 2 C2 + Sprint 7 B3/B4 — advanced filter drawer,
              saved-search menu, and "only favorites" toggle sit here
              between the view switch and the primary "ליד חדש" CTA. */}
          <ViewToggle value={viewMode} onChange={setViewMode} />
          <button
            type="button"
            className={`btn btn-ghost btn-sm ${serverFilterCount > 0 ? 'is-active' : ''}`}
            onClick={() => setAdvancedFilterOpen(true)}
            aria-label={serverFilterCount > 0 ? t('list.filters.advancedAriaWithCount', { count: serverFilterCount }) : t('list.filters.advancedAria')}
            title={t('list.filters.advancedTitle')}
          >
            <SlidersHorizontal size={14} aria-hidden="true" />
            <span>{t('list.filters.advanced')}</span>
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
            aria-label={t('list.filters.onlyFavorites')}
            title={t('list.filters.onlyFavoritesTitle')}
          >
            <Star
              size={14}
              aria-hidden="true"
              fill={onlyFavorites ? 'currentColor' : 'none'}
            />
            <span>{t('list.filters.onlyFavorites')}</span>
          </button>
          <div className="view-toggle" role="group" aria-label={t('list.view.ariaLabel')}>
            <button
              type="button"
              className={`view-toggle-btn ${view === 'cards' ? 'active' : ''}`}
              onClick={() => changeView('cards')}
              title={t('list.view.cardsTitle')}
            >
              <LayoutGrid size={14} />
              {t('list.view.cards')}
            </button>
            <button
              type="button"
              className={`view-toggle-btn ${view === 'list' ? 'active' : ''}`}
              onClick={() => changeView('list')}
              title={t('list.view.listTitle')}
            >
              <ListIcon size={14} />
              {t('list.view.list')}
            </button>
          </div>
          {/* F-4 + F-16 — templates link removed from header. It duplicates
              the sidebar entry and competed with "ליד חדש" (4×/day vs
              1×/month). Canonical header pattern: primary CTA rightmost,
              tertiary actions into overflow menus. */}
          <Link
            to="/import/leads"
            className="btn btn-ghost btn-sm"
            title="ייבוא לידים מ-Excel / CSV"
          >
            <Upload size={14} aria-hidden="true" />
            <span>ייבוא מ-Excel</span>
          </Link>
          <Link to="/customers/new" className="btn btn-primary">
            <UserPlus size={18} />
            {t('list.newLead')}
          </Link>
        </div>
      </div>

      {incomingFilterLabel && statusFilter !== 'all' && (
        <div className="filter-breadcrumb animate-in">
          <span>{t('list.filters.incoming.showing', { label: incomingFilterLabel })}</span>
          <button
            type="button"
            className="fb-clear"
            onClick={() => {
              setStatusFilter('all');
              window.history.replaceState({}, '', '/customers');
            }}
          >
            {t('list.filters.incoming.clear')}
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
              placeholder={t('list.searchPlaceholder')}
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
            aria-label={t('list.filters.openSort')}
          >
            <SlidersHorizontal size={16} aria-hidden="true" />
            <span>{activeFilterCount > 0 ? t('list.filters.filterWithCount', { count: activeFilterCount }) : t('list.filters.filter')}</span>
          </button>
          {activeFilterCount > 0 && (
            <button
              type="button"
              className="filters-clear-link"
              onClick={() => { haptics.tap(); clearFilters(); }}
            >
              {t('list.filters.clear')}
            </button>
          )}
        </div>

        {/* Desktop keeps the 3-row layout */}
        <div className="filters-desktop">
          <div className="filter-tabs">
            {[
              { key: 'all', label: t('list.filters.lookingFor.all') },
              { key: 'BUY', label: t('list.filters.lookingFor.buy') },
              { key: 'RENT', label: t('list.filters.lookingFor.rent') },
            ].map((f) => (
              <button
                key={f.key}
                type="button"
                className={`filter-tab ${lookingForFilter === f.key ? 'active' : ''}`}
                onClick={() => setLookingForFilter(f.key)}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="filter-tabs">
            {[
              { key: 'all', label: t('list.filters.interest.all') },
              { key: 'PRIVATE', label: t('list.filters.interest.private') },
              { key: 'COMMERCIAL', label: t('list.filters.interest.commercial') },
            ].map((f) => (
              <button
                key={f.key}
                type="button"
                className={`filter-tab ${interestFilter === f.key ? 'active' : ''}`}
                onClick={() => setInterestFilter(f.key)}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="filter-tabs">
            {[
              { key: 'all', label: t('list.filters.status.all') },
              { key: 'HOT', label: t('list.filters.status.hot') },
              { key: 'WARM', label: t('list.filters.status.warm') },
              { key: 'COLD', label: t('list.filters.status.cold') },
            ].map((f) => (
              <button
                key={f.key}
                type="button"
                className={`filter-tab ${statusFilter === f.key ? 'active' : ''}`}
                onClick={() => setStatusFilter(f.key)}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* L-A — shared AdvancedFilters panel for leads. Same layout the
          properties page uses (N-11), with lead-specific selects
          injected via the `extra` slot. `setShowInlineAdvanced`
          toggles the panel; "נקה סינון" inside the panel clears +
          collapses it (matches N-12). */}
      <div className="customers-adv-toggle">
        <button
          type="button"
          className={`btn btn-ghost btn-sm ${showInlineAdvanced ? 'is-active' : ''}`}
          onClick={() => setShowInlineAdvanced((v) => !v)}
          aria-expanded={showInlineAdvanced}
        >
          <SlidersHorizontal size={14} aria-hidden="true" />
          <span>{showInlineAdvanced ? 'הסתר סינון מתקדם' : 'סינון מתקדם'}</span>
        </button>
      </div>
      {showInlineAdvanced && (
        <AdvancedFilters
          className="animate-in"
          config={{
            fields: ['city', 'price', 'rooms'],
            cities: Array.from(new Set(leads.map((l) => l.city).filter(Boolean))),
            extra: (
              <>
                <div className="form-group">
                  <label className="form-label">מחפש</label>
                  <select
                    className="form-input"
                    value={advLeadFilters.lookingFor}
                    onChange={(e) => setAdvLeadFilters((p) => ({ ...p, lookingFor: e.target.value }))}
                  >
                    <option value="">הכל</option>
                    <option value="BUY">קנייה</option>
                    <option value="RENT">השכרה</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">רצינות</label>
                  <select
                    className="form-input"
                    value={advLeadFilters.seriousness}
                    onChange={(e) => setAdvLeadFilters((p) => ({ ...p, seriousness: e.target.value }))}
                  >
                    <option value="">הכל</option>
                    <option value="VERY">רציני מאוד</option>
                    <option value="MEDIUM">בינוני</option>
                    <option value="SORT_OF">פחות</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">סטטוס לקוח</label>
                  <select
                    className="form-input"
                    value={advLeadFilters.customerStatus}
                    onChange={(e) => setAdvLeadFilters((p) => ({ ...p, customerStatus: e.target.value }))}
                  >
                    <option value="">הכל</option>
                    <option value="ACTIVE">פעיל</option>
                    <option value="INACTIVE">לא פעיל</option>
                    <option value="PAUSED">מוקפא</option>
                  </select>
                </div>
              </>
            ),
          }}
          values={advLeadFilters}
          onChange={(k, v) => setAdvLeadFilters((p) => ({ ...p, [k]: v }))}
          onClear={() => {
            setAdvLeadFilters({
              city: '',
              minPrice: null,
              maxPrice: null,
              minRooms: '',
              maxRooms: '',
              lookingFor: '',
              seriousness: '',
              customerStatus: '',
            });
            setShowInlineAdvanced(false);
          }}
        />
      )}

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
          onBumpLastContact={(lead) => patchLead(lead.id, { lastContact: new Date().toISOString() }, { success: t('list.patchSuccess.lastContactUpdated') })}
        />
      ) : (viewMode === 'table' && !isMobile) ? (
        <>
        <DataTable
          ariaLabel="טבלת לקוחות"
          rows={paged.slice}
          rowKey={(l) => l.id}
          onRowClick={(l) => navigate(`/customers/${l.id}`)}
          columns={[
            {
              key: 'name', header: t('list.card.nameHeader', { defaultValue: 'שם' }), sortable: true,
              sortValue: (l) => l.name,
              render: (l) => <strong>{l.name}</strong>,
            },
            {
              key: 'status', header: 'סטטוס', sortable: true,
              sortValue: (l) => l.status || l.stage || '',
              render: (l) => <span className="cell-muted">{l.status || l.stage || '—'}</span>,
            },
            {
              key: 'lookingFor', header: 'מחפש', sortable: true,
              sortValue: (l) => l.lookingFor || '',
              render: (l) => (
                <span className={`cell-pill ${l.lookingFor === 'RENT' ? 'is-blue' : 'is-gold'}`}>
                  {l.lookingFor === 'RENT' ? 'השכרה' : 'קנייה'}
                </span>
              ),
            },
            {
              key: 'interest', header: 'סוג', sortable: true,
              sortValue: (l) => l.interestType || '',
              render: (l) => <span className="cell-muted">{l.interestType === 'COMMERCIAL' ? 'מסחרי' : 'פרטי'}</span>,
            },
            {
              key: 'city', header: 'עיר', sortable: true,
              sortValue: (l) => l.city || '',
              render: (l) => l.city || <span className="cell-muted">—</span>,
            },
            {
              key: 'rooms', header: 'חד׳', sortable: true, className: 'cell-num',
              sortValue: (l) => l.rooms,
              render: (l) => l.rooms ?? '—',
            },
            {
              key: 'budget', header: 'תקציב', sortable: true, className: 'cell-num',
              sortValue: (l) => Number(l.budget) || 0,
              render: (l) => (
                <span>
                  {l.priceRangeLabel
                    || (l.budget ? `₪${Number(l.budget).toLocaleString('he-IL')}` : <span className="cell-muted">—</span>)}
                </span>
              ),
            },
            {
              key: 'lastContact', header: 'מגע אחרון', sortable: true,
              sortValue: (l) => (l.lastContact ? new Date(l.lastContact).getTime() : 0),
              render: (l) => {
                const d = stalePillDays(l);
                const txt = l.lastContact ? new Date(l.lastContact).toLocaleDateString('he-IL') : '—';
                return d
                  ? <span className="cell-pill is-gold" title={`${d} ימים ללא מגע`}>{txt}</span>
                  : <span className="cell-muted">{txt}</span>;
              },
            },
            {
              key: 'preApproval', header: 'אישור עקרוני',
              render: (l) => l.preApproval
                ? <span className="cell-pill is-green">יש</span>
                : <span className="cell-muted">—</span>,
            },
          ]}
        />
        {/* Table-view pager — card grid below uses an infinite-scroll
            sentinel instead of numbered pages. */}
        {paged.needsPager && (
          <Pagination page={paged.page} pageCount={paged.pageCount} onPage={setPage} />
        )}
        </>
      ) : (
      <div className="customers-grid animate-in animate-in-delay-3">
        {cardVisible.map((lead) => {
          const expanded = expandedId === lead.id;

          // ── Mobile: collapsed dense row + swipe actions + tap to expand ──
          if (isMobile) {
            const swipeActions = [
              {
                icon: Phone,
                label: t('list.swipe.call'),
                color: 'gold',
                onClick: () => handleTel(lead),
              },
              {
                icon: WhatsAppIcon,
                label: t('list.swipe.whatsapp'),
                color: 'green',
                onClick: () => handleWhatsApp(lead),
              },
              {
                icon: MessageSquare,
                label: t('list.swipe.sms'),
                color: 'blue',
                onClick: () => handleSms(lead),
              },
            ];
            const reason = statusReason(t, lead);
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
                              <span className="ccm-active-pill" title={t('list.card.preApprovalTitle')}>
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
                                    patchLead(lead.id, { lastContact: new Date().toISOString() }, { success: t('list.patchSuccess.lastContactUpdated') });
                                  }}
                                  title={t('list.card.stalePillTitle')}
                                >
                                  {t('list.card.stalePill', { days: stale })}
                                </button>
                              );
                            })()}
                            {matchCountMobile > 0 && (
                              <Link
                                to={`/properties${lead.city ? `?city=${encodeURIComponent(lead.city)}` : ''}`}
                                onClick={(e) => e.stopPropagation()}
                                className="cc-match-pill cc-match-pill-mobile"
                                title={t('list.card.matchPillTitle', { count: matchCountMobile })}
                              >
                                <Sparkles size={10} />
                                <strong>{matchCountMobile}</strong>
                              </Link>
                            )}
                          </div>
                          <div className="ccm-sub">
                            {[
                              lead.city,
                              lead.rooms && t('list.card.roomsShort', { count: lead.rooms }),
                              lead.priceRangeLabel,
                            ].filter(Boolean).join(' · ') || t('list.placeholders.dash')}
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
                            title={lead.statusExplanation || t('list.status.change')}
                          >
                            {statusIcon(lead.status)}
                            {statusLabel(t, lead.status)}
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
                                { success: t('list.patchSuccess.seriousnessUpdated', { label: SERIOUSNESS_LABELS[value] || value }) },
                              )}
                            />
                          </span>
                        </div>

                        <div className="customer-card-body">
                          <div className="cc-row">
                            <span className="cc-label">{t('list.card.lookingForLabel')}</span>
                            <span className="cc-value">
                              {lead.lookingFor === 'RENT' ? t('list.card.lookingForRent') : t('list.card.lookingForBuy')} · {lead.interestType === 'COMMERCIAL' ? t('list.card.interestCommercial') : t('list.card.interestPrivate')}
                            </span>
                          </div>
                          <div className="cc-row">
                            <span className="cc-label">{t('list.card.cityLabel')}</span>
                            <span className="cc-value inline-edit">
                              <InlineText
                                value={lead.city || ''}
                                onCommit={(v) => patchLead(lead.id, { city: v || null }, { success: t('list.patchSuccess.cityUpdated') })}
                                placeholder={t('list.card.addCityPlaceholder')}
                              />
                            </span>
                          </div>
                          <div className="cc-row">
                            <span className="cc-label">{t('list.card.roomsLabel')}</span>
                            <span className="cc-value">
                              {/* F-11 — numeric chip picker replaces the
                                  free-text inline edit so values always
                                  match the numeric filter / match logic. */}
                              <RoomsInlinePicker
                                value={lead.rooms}
                                onChange={(v) => patchLead(lead.id, { rooms: v }, { success: t('list.patchSuccess.roomsUpdated') })}
                              />
                            </span>
                          </div>
                          <div className="cc-row">
                            <span className="cc-label">{t('list.card.budgetLabel')}</span>
                            <span className="cc-value inline-edit">
                              <InlineText
                                value={lead.priceRangeLabel || ''}
                                onCommit={(v) => patchLead(lead.id, { priceRangeLabel: v || null })}
                                placeholder={t('list.card.addBudgetPlaceholder')}
                              />
                            </span>
                          </div>
                          {lead.sector && lead.sector !== 'כללי' && (
                            <div className="cc-row">
                              <span className="cc-label">{t('list.card.sectorLabel')}</span>
                              <span className="cc-value">{lead.sector}</span>
                            </div>
                          )}
                          {lead.schoolProximity && (
                            <div className="cc-row">
                              <span className="cc-label">{t('list.card.schoolLabel')}</span>
                              <span className="cc-value">{lead.schoolProximity}</span>
                            </div>
                          )}
                          <div className="cc-row">
                            <span className="cc-label">{t('list.card.preApprovalLabel')}</span>
                            <span className="cc-value">
                              {lead.preApproval
                                ? <span className="cc-pos">{t('list.card.preApprovalHas')}</span>
                                : <span className="cc-muted">{t('list.card.preApprovalNone')}</span>}
                            </span>
                          </div>
                        </div>

                        {/* Description dropped on the mobile card too —
                            keep only the notes field. */}
                        <div className="customer-notes">
                          <InlineText
                            value={lead.notes || ''}
                            onCommit={(v) => patchLead(lead.id, { notes: v || null }, { success: t('list.patchSuccess.notesUpdated') })}
                            multiline
                            dir="auto"
                            placeholder={t('list.card.notesPlaceholder')}
                            className="customer-notes-inline"
                          />
                        </div>

                        <div className="ccm-last-contact-wrap">
                          <button
                            type="button"
                            className="cc-last-contact"
                            title={lead.lastContact ? absoluteTime(lead.lastContact) : t('list.card.lastContactTitle')}
                            onClick={(e) => {
                              e.stopPropagation();
                              patchLead(lead.id, { lastContact: new Date().toISOString() }, { success: t('list.patchSuccess.lastContactUpdated') });
                            }}
                          >
                            <Calendar size={12} />
                            {lead.lastContact ? relativeTime(lead.lastContact) : t('list.card.noContact')}
                          </button>
                        </div>

                        {/* F-7 — SMS demoted to overflow sheet; WhatsApp
                            now dominates the rail because it's the #1
                            daily action (20:1 over SMS for Israeli agents).
                            Remaining 3 slots grow to 56×56 per rail-xl
                            class. */}
                        <div className="ccm-actions ccm-rail ccm-rail-xl">
                          <a
                            href={waUrl(lead.phone, t('list.card.whatsappHello', { name: lead.name }))}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="ccm-rail-btn ccm-rail-wa"
                            onClick={(e) => {
                              e.stopPropagation();
                              primeContactBump(lead.id);
                              haptics.tap();
                            }}
                            aria-label={t('list.card.whatsappTo', { name: lead.name })}
                            title={t('list.card.whatsappTo', { name: lead.name })}
                          >
                            <WhatsAppIcon size={24} className="wa-green" />
                            <span className="ccm-rail-label">{t('list.card.whatsapp')}</span>
                          </a>
                          <a
                            href={telUrl(lead.phone)}
                            className="ccm-rail-btn ccm-rail-call"
                            onClick={(e) => {
                              e.stopPropagation();
                              primeContactBump(lead.id);
                              haptics.tap();
                            }}
                            aria-label={t('list.card.callTo', { name: lead.name })}
                            title={t('list.card.callTo', { name: lead.name })}
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
                            aria-label={t('list.card.moreActionsTo', { name: lead.name })}
                            title={t('list.card.moreActions')}
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
          const lookingForLabel = lead.lookingFor === 'RENT' ? t('list.card.lookingForRent') : t('list.card.lookingForBuy');
          const interestLabel =
            lead.interestType === 'COMMERCIAL' ? t('list.card.interestCommercial') : t('list.card.interestPrivate');
          const InterestIcon = lead.interestType === 'COMMERCIAL' ? Briefcase : Home;
          return (
            <div
              key={lead.id}
              ref={(el) => { if (el) cardRefs.current[lead.id] = el; }}
              className={`customer-card cc-v2 ${highlightId === lead.id ? 'highlight' : ''}`}
              role="link"
              tabIndex={0}
              onClick={(e) => {
                // L-7 — whole card navigates. Previously this bailed
                // on every button/anchor/input under the card, which
                // meant only the lead's name would navigate (the rest
                // of the card is pickers, chips, and inline editors).
                // Now only the notes block and the footer action row
                // opt out via `.no-card-nav` — everything else clicks
                // through to the detail page.
                if (e.target.closest('.no-card-nav')) return;
                navigate(`/customers/${lead.id}`);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  if (e.target !== e.currentTarget) return;
                  e.preventDefault();
                  navigate(`/customers/${lead.id}`);
                }
              }}
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
                        { success: t('list.patchSuccess.seriousnessUpdated', { label: SERIOUSNESS_LABELS[value] || value }) },
                      )}
                    />
                  </div>
                </div>

                <div className="cc-v2-mid">
                  <div className="cc-v2-mid-row cc-v2-headline">
                    <InterestIcon size={12} />
                    <span>
                      {t('list.card.lookingForLabel')}: <strong>{interestLabel}</strong> · <strong>{lookingForLabel}</strong>
                    </span>
                  </div>
                  <div className="cc-v2-mid-row">
                    <span className="cc-v2-chip">
                      {lead.city || t('list.card.cityUnknown')}
                    </span>
                    <span className="cc-v2-chip">
                      {lead.rooms ? t('list.card.roomsShort', { count: lead.rooms }) : t('list.card.roomsUnknown')}
                    </span>
                    <span className="cc-v2-chip cc-v2-chip-budget">
                      {lead.priceRangeLabel
                        || (lead.budget ? `₪${Number(lead.budget).toLocaleString('he-IL')}` : t('list.card.budgetUnknown'))}
                    </span>
                  </div>
                  {matchCount > 0 && (
                    <Link
                      to={`/properties${lead.city ? `?city=${encodeURIComponent(lead.city)}` : ''}`}
                      className="cc-match-pill cc-v2-match-pill"
                      title={t('list.card.matchPillDescTitle', { count: matchCount, name: lead.name })}
                    >
                      <Sparkles size={11} />
                      <strong>{matchCount}</strong>
                      <span>{t('list.card.matchPillLabel')}</span>
                    </Link>
                  )}
                </div>

                <div className="cc-v2-right">
                  {lead.preApproval && (
                    <span className="cc-v2-preapproval" title={t('list.card.preApprovalMortgageTitle')}>
                      <CheckCircle2 size={12} />
                      {t('list.card.preApprovalLabel')}
                    </span>
                  )}
                  {(() => {
                    const stale = stalePillDays(lead);
                    if (!stale) return null;
                    return (
                      <button
                        type="button"
                        className="cc-v2-stale-pill"
                        onClick={() => patchLead(lead.id, { lastContact: new Date().toISOString() }, { success: t('list.patchSuccess.lastContactUpdated') })}
                        title={t('list.card.stalePillTitle')}
                      >
                        {t('list.card.stalePill', { days: stale })}
                      </button>
                    );
                  })()}
                </div>
              </div>

              {/* L-8 (cont.) — the lead card used to expose both a
                  short-description field AND a notes field; that was
                  two free-text surfaces side-by-side, so agents only
                  used notes. Description input removed here; the
                  value is still editable in the lead detail page. */}
              <div className="customer-notes cc-v2-notes no-card-nav" onClick={(e) => e.stopPropagation()}>
                <InlineText
                  value={lead.notes || ''}
                  onCommit={(v) => patchLead(lead.id, { notes: v || null }, { success: t('list.patchSuccess.notesUpdated') })}
                  multiline
                  dir="auto"
                  placeholder={t('list.card.notesPlaceholder')}
                  className="customer-notes-inline"
                />
              </div>

              <div className="customer-card-footer cc-v2-footer no-card-nav" onClick={(e) => e.stopPropagation()}>
                <div className="customer-dates">
                  <button
                    type="button"
                    className="cc-last-contact"
                    title={lead.lastContact ? absoluteTime(lead.lastContact) : t('list.card.lastContactTitle')}
                    onClick={() => patchLead(lead.id, { lastContact: new Date().toISOString() }, { success: t('list.patchSuccess.lastContactUpdated') })}
                  >
                    <Calendar size={12} />
                    {lead.lastContact ? relativeTime(lead.lastContact) : t('list.card.noContact')}
                  </button>
                </div>
                <div className="customer-actions">
                  {/* F-2 — WhatsApp is the single daily action; upgrade
                      it to a filled primary (green) button so it's not
                      visually identical to Delete. Edit + Delete move to
                      an overflow menu so the destructive action can't be
                      fat-fingered. */}
                  <a
                    href={waUrl(lead.phone, t('list.card.whatsappHello', { name: lead.name }))}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-wa btn-sm"
                    title={t('list.card.whatsapp')}
                    aria-label={t('list.card.whatsappTo', { name: lead.name })}
                    onClick={() => { primeContactBump(lead.id); haptics.tap(); }}
                  >
                    <WhatsAppIcon size={14} className="wa-green" />
                    <span>{t('list.card.whatsapp')}</span>
                  </a>
                  <a
                    href={telUrl(lead.phone)}
                    className="btn btn-ghost btn-sm"
                    title={lead.phone}
                    aria-label={t('list.card.callTo', { name: lead.name })}
                    onClick={() => { primeContactBump(lead.id); haptics.tap(); }}
                  >
                    <Phone size={14} />
                    <span className="hide-sm">{lead.phone}</span>
                  </a>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setOverflowLead(lead)}
                    title={t('list.card.moreActions')}
                    aria-label={t('list.card.moreActionsTo', { name: lead.name })}
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
                ? t('list.empty.noneTitle')
                : t('list.empty.filteredTitle')}
            </h3>
            <p>
              {leads.length === 0
                ? t('list.empty.noneBody')
                : t('list.empty.filteredBody')}
            </p>
            <Link to="/customers/new" className="btn btn-primary btn-lg">
              <UserPlus size={18} />
              {t('list.newLead')}
            </Link>
          </div>
        )}
        {/* Infinite-scroll sentinel for the card grid. */}
        {infinite.hasMore && (
          <div ref={infinite.sentinelRef} className="infinite-sentinel" aria-hidden="true" />
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
          title={t('list.delete.title')}
          message={t('list.delete.message', { name: deleteTarget.name })}
          confirmLabel={t('list.delete.confirm')}
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
            label: t('list.overflow.openCard'),
            description: t('list.overflow.openCardDesc'),
            onClick: () => navigate(`/customers/${overflowLead.id}`),
          },
          {
            icon: Phone,
            label: t('list.overflow.call'),
            description: overflowLead.phone,
            onClick: () => handleTel(overflowLead),
          },
          {
            icon: MessageSquare,
            label: t('list.overflow.sms'),
            description: overflowLead.phone,
            onClick: () => handleSms(overflowLead),
          },
          {
            icon: Edit3,
            label: t('list.overflow.edit'),
            onClick: () => setEditDialog(overflowLead),
          },
          {
            icon: Trash2,
            label: t('list.overflow.delete'),
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
  const { t } = useTranslation('customers');
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
                <span>{t('list.table.headerName')}</span>{renderSortIcon('name')}
              </th>
              <th onClick={() => toggleSort('city')} className={`cl-th cl-th-sortable ${sortKey === 'city' ? 'sorted' : ''}`}>
                <span>{t('list.table.headerCity')}</span>{renderSortIcon('city')}
              </th>
              <th onClick={() => toggleSort('rooms')} className={`cl-th cl-th-sortable cl-th-num ${sortKey === 'rooms' ? 'sorted' : ''}`}>
                <span>{t('list.table.headerRooms')}</span>{renderSortIcon('rooms')}
              </th>
              <th onClick={() => toggleSort('budget')} className={`cl-th cl-th-sortable cl-th-num ${sortKey === 'budget' ? 'sorted' : ''}`}>
                <span>{t('list.table.headerBudget')}</span>{renderSortIcon('budget')}
              </th>
              <th onClick={() => toggleSort('status')} className={`cl-th cl-th-sortable ${sortKey === 'status' ? 'sorted' : ''}`}>
                <span>{t('list.table.headerStatus')}</span>{renderSortIcon('status')}
              </th>
              <th onClick={() => toggleSort('lastContact')} className={`cl-th cl-th-sortable cl-th-num ${sortKey === 'lastContact' ? 'sorted' : ''}`}>
                <span>{t('list.table.headerLastContact')}</span>{renderSortIcon('lastContact')}
              </th>
              <th className="cl-th cl-th-actions">{t('list.table.headerActions')}</th>
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
                  title={t('list.table.openCardTitle', { name: lead.name })}
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
                      <small>{lead.source || t('list.placeholders.dash')}</small>
                    </span>
                    {matches > 0 && (
                      <span className="cl-match-pill" title={t('list.card.matchPillTitle', { count: matches })}>
                        <Sparkles size={10} />
                        {matches}
                      </span>
                    )}
                  </td>
                  <td className="cl-td cl-muted">{lead.city || t('list.placeholders.dash')}</td>
                  <td className="cl-td cl-td-num cl-muted">{lead.rooms || t('list.placeholders.dash')}</td>
                  <td className="cl-td cl-td-num cl-muted">
                    {lead.budget
                      ? `₪${Number(lead.budget).toLocaleString('he-IL')}`
                      : (lead.priceRangeLabel || t('list.placeholders.dash'))}
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
                            title={t('list.table.stalePillTitle')}
                            onClick={(e) => {
                              e.stopPropagation();
                              onBumpLastContact(lead);
                            }}
                          >
                            {t('list.table.stalePill', { days: stale })}
                          </button>
                        );
                      }
                      return lastRel ? lastRel.label : t('list.placeholders.dash');
                    })()}
                  </td>
                  <td className="cl-td cl-td-actions" onClick={(e) => e.stopPropagation()}>
                    <a
                      href={telUrl(lead.phone)}
                      className="cl-btn"
                      title={lead.phone}
                      aria-label={t('list.card.callTo', { name: lead.name })}
                      onClick={() => { primeContactBump(lead.id); haptics.tap(); }}
                    >
                      <Phone size={13} />
                    </a>
                    <a
                      href={waUrl(lead.phone, t('list.card.whatsappHello', { name: lead.name }))}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="cl-btn"
                      title={t('list.table.waTitle')}
                      aria-label={t('list.card.whatsappTo', { name: lead.name })}
                      onClick={() => { primeContactBump(lead.id); haptics.tap(); }}
                    >
                      <WhatsAppIcon size={13} className="wa-green" />
                    </a>
                    <button type="button" className="cl-btn" title={t('list.table.editTitle')} onClick={() => onEdit(lead)}>
                      <Edit3 size={13} />
                    </button>
                    <button type="button" className="cl-btn danger" title={t('list.table.deleteTitle')} onClick={() => onDelete(lead)}>
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
            <p>{t('list.empty.filteredShort')}</p>
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
                <small>{lead.source || t('list.placeholders.dash')}</small>
              </span>
            </span>
            <span>
              <StatusPicker lead={lead} onChange={onStatusChange} />
            </span>
            <span className="cl-type">
              <Chip tone="neutral">
                {lead.interestType === 'COMMERCIAL' ? t('list.card.interestCommercial') : t('list.card.interestPrivate')}
              </Chip>
              <Chip tone={lead.lookingFor === 'RENT' ? 'rent' : 'buy'}>
                {lead.lookingFor === 'RENT' ? t('list.filters.lookingFor.rent') : t('list.filters.lookingFor.buy')}
              </Chip>
            </span>
            <span className="cl-muted">{lead.city || t('list.placeholders.dash')}</span>
            <span className="cl-muted">{lead.rooms || t('list.placeholders.dash')}</span>
            <span className="cl-muted">{lead.priceRangeLabel || t('list.placeholders.dash')}</span>
            <span
              className={`cl-muted ${stalePillDays(lead) ? 'cl-stale' : ''}`}
              title={lead.lastContact ? absoluteTime(lead.lastContact) : ''}
            >
              {lead.lastContact ? relativeTime(lead.lastContact) : t('list.placeholders.dash')}
            </span>
            <span className="cl-actions">
              <a
                href={telUrl(lead.phone)}
                className="cl-btn"
                title={lead.phone}
                aria-label={t('list.card.callTo', { name: lead.name })}
                onClick={() => { primeContactBump(lead.id); haptics.tap(); }}
              >
                <Phone size={13} />
              </a>
              <a
                href={waUrl(lead.phone, t('list.card.whatsappHello', { name: lead.name }))}
                target="_blank"
                rel="noopener noreferrer"
                className="cl-btn"
                title={t('list.table.waTitle')}
                aria-label={t('list.card.whatsappTo', { name: lead.name })}
                onClick={() => { primeContactBump(lead.id); haptics.tap(); }}
              >
                <WhatsAppIcon size={13} className="wa-green" />
              </a>
              <button type="button" className="cl-btn" title={t('list.table.editTitle')} onClick={() => onEdit(lead)}>
                <Edit3 size={13} />
              </button>
              <button type="button" className="cl-btn danger" title={t('list.table.deleteTitle')} onClick={() => onDelete(lead)}>
                <Trash2 size={13} />
              </button>
            </span>
          </div>
        );
      })}
      {leads.length === 0 && (
        <div className="customers-empty">
          <p>{t('list.empty.filteredShort')}</p>
        </div>
      )}
    </div>
  );
}

// Inline dropdown to pick HOT/WARM/COLD manually, with auto-suggestion badge.
function StatusPicker({ lead, onChange }) {
  const { t } = useTranslation('customers');
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
        type="button"
        className={`badge ${statusBadgeClass(lead.status)} status-badge-btn`}
        onClick={() => setOpen((v) => !v)}
        title={lead.statusExplanation || t('list.status.change')}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        {statusIcon(lead.status)}
        {statusLabel(t, lead.status)}
        {lead.suggestedStatus && !isAutoMatch && (
          <Sparkles size={11} className="sp-auto-hint" title={t('list.status.autoSuggestionDiffers')} />
        )}
      </button>
      {open && (
        <div className="status-menu" role="menu">
          <div className="status-menu-hint">
            <HelpCircle size={12} />
            <span>{lead.statusExplanation || t('list.status.hint')}</span>
          </div>
          {['HOT', 'WARM', 'COLD'].map((s) => (
            <button
              key={s}
              type="button"
              role="menuitem"
              className={`status-menu-item ${lead.status === s ? 'active' : ''}`}
              onClick={async () => {
                setOpen(false);
                if (s !== lead.status) await onChange(lead, s);
              }}
            >
              {statusIcon(s)}
              <span>{statusLabel(t, s)}</span>
              {lead.suggestedStatus === s && <span className="sp-auto">{t('list.status.autoSuggestionLabel')}</span>}
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
  const { t } = useTranslation('customers');
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
  const label = value != null && value !== '' ? t('list.rooms.valueFormat', { count: value }) : t('list.placeholders.dash');
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
            {t('list.rooms.clear')}
          </button>
        </div>
      )}
    </span>
  );
}

// Mobile status-chip bottom sheet. Shows full explanation + quick-switch rows.
function StatusInfoSheet({ lead, onClose, onChange }) {
  const { t } = useTranslation('customers');
  useEffect(() => {
    if (!lead) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [lead]);

  if (!lead) return null;

  const statuses = [
    { key: 'HOT', label: t('list.status.hot'), icon: <Flame size={18} /> },
    { key: 'WARM', label: t('list.status.warm'), icon: <Thermometer size={18} /> },
    { key: 'COLD', label: t('list.status.cold'), icon: <Snowflake size={18} /> },
  ];

  return (
    <div className="mpk-back mpk-overflow-back" onClick={onClose} role="dialog" aria-modal="true">
      <div className="mpk-sheet mpk-overflow sis-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="mpk-handle" />
        <header className="mpk-head">
          <h3>{t('list.statusSheet.title')}</h3>
          <button type="button" className="mpk-close" onClick={onClose} aria-label={t('list.statusSheet.close')}>
            <X size={18} />
          </button>
        </header>
        <div className="sis-explain">
          <div className="sis-current">
            <span className={`badge ${statusBadgeClass(lead.status)}`}>
              {statusIcon(lead.status)}
              {statusLabel(t, lead.status)}
            </span>
            <span className="sis-current-name">{lead.name}</span>
          </div>
          <p className="sis-reason">
            {lead.statusExplanation || t('list.statusSheet.reasonFallback')}
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
                {lead.suggestedStatus === s.key && <small>{t('list.statusSheet.autoSuggestion')}</small>}
              </div>
            </button>
          ))}
        </div>
        <button type="button" className="mpk-cancel" onClick={onClose}>{t('list.statusSheet.cancel')}</button>
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
  const { t } = useTranslation('customers');
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
    <div className="mpk-back mpk-overflow-back" onClick={onClose} role="dialog" aria-modal="true">
      <div className="mpk-sheet mpk-overflow filter-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="mpk-handle" />
        <header className="mpk-head">
          <h3>{t('list.filterSheet.title')}</h3>
          <button type="button" className="mpk-close" onClick={onClose} aria-label={t('list.filterSheet.close')}>
            <X size={18} />
          </button>
        </header>
        <div className="filter-sheet-body">
          <Group
            title={t('list.filterSheet.groupSearch')}
            options={[
              { key: 'all', label: t('list.filters.lookingFor.all') },
              { key: 'BUY', label: t('list.filters.lookingFor.buy') },
              { key: 'RENT', label: t('list.filters.lookingFor.rent') },
            ]}
            value={lookingForFilter}
            onChange={onLookingForChange}
          />
          <Group
            title={t('list.filterSheet.groupPropertyType')}
            options={[
              { key: 'all', label: t('list.filters.interest.all') },
              { key: 'PRIVATE', label: t('list.filters.interest.private') },
              { key: 'COMMERCIAL', label: t('list.filters.interest.commercial') },
            ]}
            value={interestFilter}
            onChange={onInterestChange}
          />
          <Group
            title={t('list.filterSheet.groupStatus')}
            options={[
              { key: 'all', label: t('list.filters.status.all') },
              { key: 'HOT', label: t('list.filters.status.hot') },
              { key: 'WARM', label: t('list.filters.status.warm') },
              { key: 'COLD', label: t('list.filters.status.cold') },
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
            {t('list.filterSheet.clear')}
          </button>
          <button
            type="button"
            className="filter-sheet-apply"
            onClick={onClose}
          >
            {t('list.filterSheet.showResults', { count: matchCount })}
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
  const { t } = useTranslation('customers');
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
        aria-label={t('list.seriousness.label', { label: currentLabel })}
        title={t('list.seriousness.changeTitle')}
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
            aria-label={t('list.seriousness.chooseAria')}
            style={popStyle}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="seriousness-pop-title">{t('list.seriousness.title')}</div>
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
  const { t } = useTranslation('customers');
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
        aria-label={t('list.placeholders.descriptionAria')}
        placeholder={t('list.placeholders.addDescription')}
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
      title={t('list.placeholders.descriptionEditTitle')}
    >
      {empty ? t('list.placeholders.addDescription') : value}
    </span>
  );
}
