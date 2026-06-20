// Market Discovery — redesigned 2026-05-01.
//
// LEGAL/SAFETY: this page only renders metadata returned from
// /api/market-discovery/listings. Backend stores no images,
// descriptions, phone numbers, or HTML from sources. Every card/row
// surfaces "פתח במקור" so the source remains canonical.
//
// Architecture:
//   - PulseStrip       → 4 KPI tiles (clickable filters)
//   - FilterRail       → sticky left rail (desktop) / bottom sheet (mobile)
//   - ListingRow/Card  → main feed; row layout by default, cards as toggle
//   - ListingDrawer    → right-side detail panel on row click
//   - MatchSendDialog  → WhatsApp template for matched leads
//   - Email signup → ⌘ button on the page header (labelled when off)

import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Building2, Filter, Mail, MailCheck, Eye, EyeOff, List, Grid, X, Sparkles, Tags, MapPin } from 'lucide-react';
import api from './../lib/api';
import { useToast } from './../lib/toast';
import { freshLabel } from './marketDiscovery/freshLabel';
import EmptyState from './../components/EmptyState';
import PulseStrip from './marketDiscovery/PulseStrip';
import FilterRail from './marketDiscovery/FilterRail';
import ListingRow from './marketDiscovery/ListingRow';
import ListingCard from './marketDiscovery/ListingCard';
import ListingDrawer from './marketDiscovery/ListingDrawer';
import MatchSendDialog from './marketDiscovery/MatchSendDialog';
import EmailSignupModal from './marketDiscovery/EmailSignupModal';
import MarketTagManager from './marketDiscovery/MarketTagManager';
import CityFilterBar from './marketDiscovery/CityFilterBar';
import PopoverPortal from './marketDiscovery/PopoverPortal';
import './MarketDiscovery.css';

const SORTS = [
  { value: 'firstSeenAt-desc', label: 'חדש לישן' },
  { value: 'price-asc',        label: 'מחיר מהזול ליקר' },
  { value: 'price-desc',       label: 'מחיר מהיקר לזול' },
  { value: 'pricePerSqm-asc',  label: 'מחיר למ״ר נמוך' },
];


const DEFAULT_FILTERS = {
  city: '', neighborhood: '', propertyType: '',
  kind: '',
  posterType: 'private',
  minPrice: '', maxPrice: '',
  minRooms: '', maxRooms: '',
  minSqm: '', maxSqm: '',
  status: 'active',
  firstSeenAfter: '3d',
  // Client-only filters (not sent to server) — applied after fetch.
  matchedOnly: false,
  hideViewed: false,
  hideDuplicated: false,
};

const VIEWED_KEY = 'marketDiscovery.viewedListingIds';
const VIEW_MODE_KEY = 'marketDiscovery.viewMode';

export default function MarketDiscovery() {
  const [searchParams, setSearchParams] = useSearchParams();
  const matchId = searchParams.get('match');
  const navigate = useNavigate();
  const toast = useToast();

  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMoreServer, setHasMoreServer] = useState(false);
  const [error, setError] = useState(null);
  const [lastScan, setLastScan] = useState(null);
  const [pulse, setPulse] = useState(null);
  const [pulseLoading, setPulseLoading] = useState(true);
  const [matchContext, setMatchContext] = useState(null);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [sort, setSort] = useState('firstSeenAt-desc');
  const [viewMode, setViewMode] = useState(() => {
    try { return localStorage.getItem(VIEW_MODE_KEY) || 'rows'; }
    catch { return 'rows'; }
  });
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [drawerListing, setDrawerListing] = useState(null);
  const [sendDialog, setSendDialog] = useState(null);
  const [viewedIds, setViewedIds] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem(VIEWED_KEY) || '[]')); }
    catch { return new Set(); }
  });

  // 2026-06-02 — per-asset tags + inline city/area filter.
  // `tags` is the agent's full catalogue (used by the picker, manager,
  // and filter bar). `selectedTagIds` is the active filter (OR-semantics).
  // `cityScope` is the agent's saved specialtyCities — both consumed by
  // the backend's listings endpoint when present.
  const [tags, setTags] = useState([]);
  const [selectedTagIds, setSelectedTagIds] = useState([]);
  const [tagManagerOpen, setTagManagerOpen] = useState(false);
  const [cityScope, setCityScope] = useState([]);
  const [citiesOpen, setCitiesOpen] = useState(false);
  const citiesBtnRef = useRef(null);
  const citiesPopRef = useRef(null);

  // Close the cities popover on outside click / Escape. The popover is
  // portaled to <body>, so exclude both the trigger and the popover node.
  useEffect(() => {
    if (!citiesOpen) return undefined;
    const onDown = (e) => {
      if (citiesBtnRef.current?.contains(e.target)) return;
      if (citiesPopRef.current?.contains(e.target)) return;
      setCitiesOpen(false);
    };
    const onKey = (e) => { if (e.key === 'Escape') setCitiesOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [citiesOpen]);

  // Email pref state — same shape as the legacy page.
  const [emailPref, setEmailPref] = useState(null);
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [emailDraft, setEmailDraft] = useState('');

  const PAGE_SIZE = 25;

  // Persist viewMode.
  useEffect(() => {
    try { localStorage.setItem(VIEW_MODE_KEY, viewMode); } catch { /* ignore */ }
  }, [viewMode]);

  // Last-scan summary — shown next to the page title.
  useEffect(() => {
    let cancelled = false;
    api.getMarketLastScan().then(
      (res) => { if (!cancelled) setLastScan(res?.run || null); },
      () => { /* tolerate */ },
    );
    return () => { cancelled = true; };
  }, []);

  // Pulse tiles — independent fetch, doesn't gate the listing list.
  useEffect(() => {
    let cancelled = false;
    setPulseLoading(true);
    api.getMarketPulse().then(
      (res) => { if (!cancelled) { setPulse(res); setPulseLoading(false); } },
      () => { if (!cancelled) setPulseLoading(false); },
    );
    return () => { cancelled = true; };
  }, []);

  // Email-pref + account email.
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.getNotificationPreferences().catch(() => null),
      api.getMe().catch(() => null),
    ]).then(([pref, me]) => {
      if (cancelled) return;
      const accountEmail = me?.user?.email || me?.email || '';
      setEmailPref({
        enabled: !!pref?.marketMatchEmailEnabled,
        deliveryEmail: pref?.customDeliveryEmail || null,
        accountEmail,
      });
    });
    return () => { cancelled = true; };
  }, []);

  // 2026-06-02 — load this agent's MarketTag catalogue once. The picker
  // popover, the filter bar, and the manager dialog all read from this
  // single state — they don't re-fetch. We refresh after every mutation
  // (create/update/delete) so the inline UI stays in sync.
  const refreshTags = useCallback(async () => {
    try {
      const res = await api.listMarketTags();
      setTags(res?.tags || []);
    } catch { /* tolerate */ }
  }, []);
  useEffect(() => { refreshTags(); }, [refreshTags]);

  // 2026-06-02 — load saved specialty-cities so the inline city bar at
  // the top of the page is pre-populated. The bar mutates this state +
  // persists via PATCH /me/specialty-cities; the backend listings
  // endpoint reads the same field, so a refresh after a city change
  // keeps the feed consistent with the bar.
  useEffect(() => {
    let cancelled = false;
    api.getSpecialtyCities()
      .then((res) => { if (!cancelled) setCityScope(res?.cities || []); })
      .catch(() => { /* tolerate empty */ });
    return () => { cancelled = true; };
  }, []);

  // Match deep-link via ?match=:id.
  useEffect(() => {
    if (!matchId) { setMatchContext(null); return undefined; }
    let cancelled = false;
    api.getMarketMatch(matchId).then(
      (res) => { if (!cancelled) setMatchContext(res?.match || null); },
      (err) => { if (!cancelled) toast.error?.(err?.message || 'התאמה לא נמצאה'); },
    );
    return () => { cancelled = true; };
  }, [matchId, toast]);

  // Listings fetch — first page on filter/sort change.
  //
  // We do server-side pagination instead of one big 100-row pull because
  // the row payload includes per-listing match-resolution that grows
  // linearly with leads. Pulling 25 at a time keeps first-render under a
  // second even on agents with hundreds of leads.
  //
  // matchedOnly / hideViewed / hideDuplicated are post-filtered client-side
  // so changing them doesn't refetch.
  const reqIdRef = useRef(0);
  useEffect(() => {
    const myReqId = ++reqIdRef.current;
    setLoading(true);
    setItems([]);
    setHasMoreServer(false);
    const serverFilters = stripClientFilters(filters);
    const tagParam = selectedTagIds.length > 0 ? { tagIds: selectedTagIds.join(',') } : {};
    api.listMarketListings({ ...serverFilters, ...tagParam, sort, limit: PAGE_SIZE, offset: 0 }).then(
      (res) => {
        if (myReqId !== reqIdRef.current) return;
        const fetched = res?.items || [];
        setItems(fetched);
        setTotal(res?.total || 0);
        setHasMoreServer(fetched.length >= PAGE_SIZE && fetched.length < (res?.total || 0));
        setLoading(false);
        setError(null);
      },
      (err) => {
        if (myReqId !== reqIdRef.current) return;
        setError(err?.message || 'טעינה נכשלה');
        setLoading(false);
      },
    );
    // matchedOnly / hideViewed / hideDuplicated are client-side filters
    // (applied to `orderedItems` below) — they intentionally don't
    // re-trigger this fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.city, filters.neighborhood, filters.propertyType, filters.kind,
      filters.posterType, filters.minPrice, filters.maxPrice, filters.minRooms,
      filters.maxRooms, filters.minSqm, filters.maxSqm, filters.status,
      filters.firstSeenAfter, sort,
      // 2026-06-02 — re-fetch when the active tag filter or the saved
      // city scope changes. selectedTagIds → tagIds query param.
      // cityScope persists to the User row and the backend reads it
      // back on the next /listings call.
      selectedTagIds, cityScope]);

  // Fetch the next page of listings, appending to `items`. The stale-
  // request check (req-id) prevents an in-flight next-page from clobbering
  // a fresh full-reload triggered by a filter change.
  const fetchMore = useCallback(async () => {
    if (loading || loadingMore || !hasMoreServer) return;
    const myReqId = reqIdRef.current;
    setLoadingMore(true);
    try {
      const serverFilters = stripClientFilters(filters);
      const tagParam = selectedTagIds.length > 0 ? { tagIds: selectedTagIds.join(',') } : {};
      const res = await api.listMarketListings({
        ...serverFilters, ...tagParam, sort,
        limit: PAGE_SIZE,
        offset: items.length,
      });
      if (myReqId !== reqIdRef.current) return;
      const fetched = res?.items || [];
      setItems((prev) => prev.concat(fetched));
      setTotal(res?.total || 0);
      setHasMoreServer(
        fetched.length >= PAGE_SIZE
          && (items.length + fetched.length) < (res?.total || 0),
      );
    } catch (err) {
      if (myReqId === reqIdRef.current) toast.error?.(err?.message || 'טעינה נכשלה');
    } finally {
      setLoadingMore(false);
    }
  }, [loading, loadingMore, hasMoreServer, filters, sort, items.length, toast, selectedTagIds]);

  const updateFilters = useCallback((patch) => {
    setFilters((f) => {
      // Pulse-tile shortcut: clicking "פרטי השבוע" should toggle between
      // private-only and all posters. We intercept the sentinel value
      // here so the consumer can stay declarative.
      if (patch.posterType === 'all-toggle') {
        const next = { ...patch, posterType: f.posterType === 'private' ? '' : 'private' };
        return { ...f, ...next };
      }
      return { ...f, ...patch };
    });
  }, []);

  const clearFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
  }, []);

  const activeFilterCount = useMemo(() => {
    return Object.entries(filters).filter(([k, v]) => {
      if (v === '' || v === false || v == null) return false;
      if (k === 'status' && v === 'active') return false;
      if (k === 'firstSeenAfter' && v === '3d') return false;
      if (k === 'posterType' && v === 'private') return false;
      return true;
    }).length;
  }, [filters]);

  // Apply client-only filters + matched listing pin.
  const matchedListingId = matchContext?.marketListing?.id;
  const orderedItems = useMemo(() => {
    let list = items;
    if (filters.matchedOnly) {
      list = list.filter((l) => Array.isArray(l.matches) && l.matches.length > 0);
    }
    if (filters.hideViewed) {
      list = list.filter((l) => !viewedIds.has(l.id));
    }
    if (filters.hideDuplicated) {
      list = list.filter((l) => !l.duplicatedByMe);
    }
    if (matchedListingId) {
      const m = list.find((x) => x.id === matchedListingId);
      if (m) list = [m, ...list.filter((x) => x.id !== matchedListingId)];
      else if (matchContext?.marketListing) list = [matchContext.marketListing, ...list];
    }
    return list;
  }, [items, filters.matchedOnly, filters.hideViewed, filters.hideDuplicated,
      viewedIds, matchedListingId, matchContext]);

  // Sentinel for "load next page from server". Triggers `fetchMore`
  // when within 400px of the bottom; happy-dom doesn't ship
  // IntersectionObserver, so the test environment skips the observer
  // entirely and the page just doesn't auto-paginate there.
  const sentinelRef = useRef(null);
  useEffect(() => {
    if (!hasMoreServer || loadingMore || loading) return undefined;
    const node = sentinelRef.current;
    if (!node) return undefined;
    if (typeof IntersectionObserver === 'undefined') return undefined;
    const obs = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          fetchMore();
          break;
        }
      }
    }, { rootMargin: '400px' });
    obs.observe(node);
    return () => obs.disconnect();
  }, [hasMoreServer, loadingMore, loading, fetchMore]);

  const visibleItems = orderedItems;

  const markViewed = useCallback((listingId) => {
    setViewedIds((prev) => {
      if (prev.has(listingId)) return prev;
      const next = new Set(prev);
      next.add(listingId);
      // FIFO cap to keep storage bounded.
      if (next.size > 1000) {
        const arr = Array.from(next);
        for (let i = 0; i < arr.length - 1000; i++) next.delete(arr[i]);
      }
      try { localStorage.setItem(VIEWED_KEY, JSON.stringify(Array.from(next))); }
      catch { /* ignore */ }
      return next;
    });
  }, []);

  const handleOpenListing = useCallback((listing) => {
    setDrawerListing(listing);
    markViewed(listing.id);
  }, [markViewed]);

  const handleDuplicate = useCallback(async (listing) => {
    try {
      const body = matchId ? { matchId } : {};
      const res = await api.duplicateMarketListing(listing.id, body);
      toast.success?.('הנכס הועתק לרשימה שלך');
      navigate(`/properties/${res.propertyId}/edit`);
    } catch (err) {
      toast.error?.(err?.message || 'שכפול נכשל');
    }
  }, [matchId, navigate, toast]);

  const handleOpenMine = useCallback((listing) => {
    if (listing.duplicatedByMe) navigate(`/properties/${listing.duplicatedByMe}/edit`);
  }, [navigate]);

  const handleOverflow = useCallback(async (listing, action) => {
    const target = listing && listing.id ? listing : drawerListing;
    if (action === 'mark-viewed' && target) markViewed(target.id);
    else if (action === 'copy-link' && target?.originalUrl) {
      try {
        await navigator.clipboard.writeText(target.originalUrl);
        toast.success?.('קישור הועתק');
      } catch { toast.error?.('שגיאה בהעתקה'); }
    } else if (action === 'dismiss' && target) {
      // Dismiss the FIRST match for this listing (if any). When no match
      // exists, just hide locally via viewed-set.
      const m = (target.matches || [])[0];
      if (m?.id) {
        try {
          await api.dismissMarketMatch(m.id);
          toast.success?.('המודעה נדחתה');
          setItems((rows) => rows.filter((r) => r.id !== target.id));
        } catch (err) {
          toast.error?.(err?.message || 'שגיאה');
        }
      } else {
        markViewed(target.id);
      }
    } else if (action === 'send-to-lead' && target) {
      const m = (target.matches || [])[0];
      if (m) setSendDialog({ match: m, listing: target });
      else toast.error?.('אין מתעניין מתאים למודעה הזו');
    }
  }, [drawerListing, markViewed, toast]);

  const handleDismissMatchInDrawer = useCallback(async (match) => {
    try {
      await api.dismissMarketMatch(match.id);
      setItems((rows) => rows.map((r) => {
        if (!r.matches?.some((m) => m.id === match.id)) return r;
        const remaining = r.matches.filter((m) => m.id !== match.id);
        // Reset topMatch too — otherwise the row stays styled as
        // "matched" even after the only match was dismissed.
        return {
          ...r,
          matches: remaining,
          topMatch: remaining.length > 0 ? remaining[0] : null,
        };
      }));
      // Keep the drawer in sync with the freshly-mutated row.
      setDrawerListing((cur) => {
        if (!cur || !cur.matches?.some((m) => m.id === match.id)) return cur;
        const remaining = cur.matches.filter((m) => m.id !== match.id);
        return {
          ...cur,
          matches: remaining,
          topMatch: remaining.length > 0 ? remaining[0] : null,
        };
      });
      toast.success?.('ההתאמה נדחתה');
    } catch (err) {
      toast.error?.(err?.message || 'שגיאה');
    }
  }, [toast]);

  // 2026-06-02 — Tag handlers. Optimistic local-state updates so the
  // chip UI on each row reacts instantly; we reconcile from the server
  // on next refresh (refreshTags / refetch on filter change).
  const handleAttachTag = useCallback(async (listingId, tag) => {
    setItems((rows) => rows.map((r) => (
      r.id === listingId && !r.assignedTagIds?.includes(tag.id)
        ? { ...r, assignedTagIds: [...(r.assignedTagIds || []), tag.id] }
        : r
    )));
    try {
      await api.assignMarketTag(tag.id, listingId);
    } catch (err) {
      toast.error?.(err?.message || 'הצמדת תגית נכשלה');
      // Roll back the optimistic change.
      setItems((rows) => rows.map((r) => (
        r.id === listingId
          ? { ...r, assignedTagIds: (r.assignedTagIds || []).filter((id) => id !== tag.id) }
          : r
      )));
    }
  }, [toast]);

  const handleDetachTag = useCallback(async (listingId, tag) => {
    setItems((rows) => rows.map((r) => (
      r.id === listingId
        ? { ...r, assignedTagIds: (r.assignedTagIds || []).filter((id) => id !== tag.id) }
        : r
    )));
    try {
      await api.unassignMarketTag(tag.id, listingId);
    } catch (err) {
      toast.error?.(err?.message || 'הסרת תגית נכשלה');
      setItems((rows) => rows.map((r) => (
        r.id === listingId && !r.assignedTagIds?.includes(tag.id)
          ? { ...r, assignedTagIds: [...(r.assignedTagIds || []), tag.id] }
          : r
      )));
    }
  }, [toast]);

  const handleCreateTag = useCallback(async ({ name, color }) => {
    try {
      const res = await api.createMarketTag({ name, color });
      const tag = res?.tag;
      if (tag) setTags((prev) => [...prev, tag].sort((a, b) => a.name.localeCompare(b.name, 'he')));
      return tag;
    } catch (err) {
      toast.error?.(err?.message || 'יצירת תגית נכשלה');
      return null;
    }
  }, [toast]);

  // Used by the per-row picker — creates a tag and attaches it to the
  // current listing in one shot. Sequenced (create → attach) because
  // the assign endpoint needs the tag id.
  const handleCreateAndAttach = useCallback(async (listingId, { name, color }) => {
    const tag = await handleCreateTag({ name, color });
    if (tag) await handleAttachTag(listingId, tag);
  }, [handleCreateTag, handleAttachTag]);

  const handleUpdateTag = useCallback(async (tagId, patch) => {
    try {
      const res = await api.updateMarketTag(tagId, patch);
      const updated = res?.tag;
      if (updated) {
        setTags((prev) => prev.map((t) => (t.id === tagId ? { ...t, ...updated } : t)));
      }
    } catch (err) {
      toast.error?.(err?.message || 'עדכון תגית נכשל');
    }
  }, [toast]);

  const handleDeleteTag = useCallback(async (tagId) => {
    try {
      await api.deleteMarketTag(tagId);
      setTags((prev) => prev.filter((t) => t.id !== tagId));
      setSelectedTagIds((prev) => prev.filter((id) => id !== tagId));
      // Strip the deleted tag id from any rows currently rendered so
      // we don't show a stale chip until the next refetch.
      setItems((rows) => rows.map((r) => ({
        ...r,
        assignedTagIds: (r.assignedTagIds || []).filter((id) => id !== tagId),
      })));
    } catch (err) {
      toast.error?.(err?.message || 'מחיקת תגית נכשלה');
    }
  }, [toast]);

  const toggleTagFilter = useCallback((tagId) => {
    setSelectedTagIds((prev) => (
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]
    ));
  }, []);

  // 2026-06-02 — Persist city-scope changes back to /me/specialty-cities
  // so Profile + the next visit see the same list. Optimistic local
  // state so the chip strip + the filtered feed update immediately.
  const handleCityScopeChange = useCallback(async (next) => {
    const prev = cityScope;
    setCityScope(next);
    try {
      await api.setSpecialtyCities(next);
    } catch (err) {
      toast.error?.(err?.message || 'שמירת ערים נכשלה');
      setCityScope(prev);
    }
  }, [cityScope, toast]);

  // Email modal handlers.
  const openEmailModal = () => {
    if (emailPref == null) return;
    setEmailDraft(emailPref.deliveryEmail || emailPref.accountEmail || '');
    setEmailModalOpen(true);
  };
  const submitEmailModal = async () => {
    const trimmed = (emailDraft || '').trim();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      toast.error?.('כתובת מייל לא תקינה');
      return;
    }
    setEmailSaving(true);
    try {
      const customDeliveryEmail =
        trimmed.toLowerCase() === (emailPref.accountEmail || '').toLowerCase()
          ? null
          : trimmed;
      await api.updateNotificationPreferences({
        marketMatchEmailEnabled: true,
        customDeliveryEmail,
      });
      setEmailPref({ ...emailPref, enabled: true, deliveryEmail: customDeliveryEmail });
      setEmailModalOpen(false);
      toast.success?.('נרשמת בהצלחה — נשלח מייל בכל פעם שנמצאת התאמה למתעניין');
    } catch (err) {
      toast.error?.(err?.message || 'שמירה נכשלה');
    } finally {
      setEmailSaving(false);
    }
  };
  const disableEmailPref = async () => {
    if (emailSaving || emailPref == null) return;
    setEmailSaving(true);
    try {
      await api.updateNotificationPreferences({ marketMatchEmailEnabled: false });
      setEmailPref({ ...emailPref, enabled: false });
      setEmailModalOpen(false);
      toast.success?.('התראות במייל בוטלו');
    } catch (err) {
      toast.error?.(err?.message || 'שמירה נכשלה');
    } finally {
      setEmailSaving(false);
    }
  };

  const isStale = !lastScan || (Date.now() - new Date(lastScan.startedAt).getTime()) > 90 * 60 * 1000;

  return (
    <div dir="rtl" className="md-page">
      <div className="md-head">
        <div style={{ minWidth: 0 }}>
          <h1>מודעות חדשות בשוק</h1>
          <div className="md-subtitle">
            {!isStale && <span className="md-pulse-dot" aria-hidden />}
            <span>{loading ? 'טוען…' : `${total.toLocaleString('he-IL')} מודעות`}</span>
            {lastScan && <span>נסרק {freshLabel(lastScan.startedAt)}</span>}
          </div>
        </div>

        <div className="md-head-actions">
          <button
            ref={citiesBtnRef}
            type="button"
            className="md-icon-button"
            onClick={() => setCitiesOpen((v) => !v)}
            aria-pressed={citiesOpen || cityScope.length > 0}
            aria-expanded={citiesOpen}
            title="ערים שבהן אני עובד/ת"
          >
            <MapPin size={16} />
            {cityScope.length > 0 && (
              <span className="md-icon-badge" aria-hidden>{cityScope.length}</span>
            )}
          </button>
          {citiesOpen && (
            <PopoverPortal anchorRef={citiesBtnRef}>
              <div ref={citiesPopRef} className="md-cities-pop">
                <CityFilterBar value={cityScope} onChange={handleCityScopeChange} />
              </div>
            </PopoverPortal>
          )}
          <button
            type="button"
            className="md-icon-button"
            onClick={() => updateFilters({ hideViewed: !filters.hideViewed })}
            aria-pressed={!!filters.hideViewed}
            title={filters.hideViewed ? 'מציג גם נצפים' : 'הסתר מודעות שכבר ראיתי'}
          >
            {filters.hideViewed ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
          {emailPref?.enabled ? (
            <button
              type="button"
              className="md-icon-button"
              onClick={openEmailModal}
              aria-pressed
              title="התראות מייל פעילות — לחצ/י לעדכון"
              style={{
                borderColor: 'var(--success)',
                color: 'var(--success)',
                background: 'var(--success-bg)',
              }}
            >
              <MailCheck size={16} />
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={openEmailModal}
              disabled={emailPref == null}
              title="קבל מייל בכל פעם שנמצאת התאמה למתעניין"
              style={{ minHeight: 40, padding: '8px 14px', fontSize: 13 }}
            >
              <Mail size={14} />
              הירשם להתראות מייל
            </button>
          )}
        </div>
      </div>

      <PulseStrip
        pulse={pulse}
        loading={pulseLoading}
        onApply={(patch) => updateFilters(patch)}
      />

      {/* 2026-06-02 — horizontal tag filter strip. OR-semantics across
          selected chips. The "ניהול תגיות" affordance sits on the far
          end so the most-used surface (toggling) stays one tap away. */}
      <div className="md-tag-bar" role="toolbar" aria-label="פילטר תגיות">
        <span className="md-tag-bar-label">
          <Tags size={12} />
          תגיות
        </span>
        {tags.length === 0 && (
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            עדיין אין תגיות — לחצ/י "ניהול תגיות" כדי להתחיל.
          </span>
        )}
        {tags.map((t) => {
          const active = selectedTagIds.includes(t.id);
          return (
            <button
              key={t.id}
              type="button"
              className="md-tag-filter-chip"
              data-active={active ? 'true' : 'false'}
              onClick={() => toggleTagFilter(t.id)}
              aria-pressed={active}
            >
              <span className="md-tag-filter-dot" style={{ background: t.color }} aria-hidden />
              {t.name}
            </button>
          );
        })}
        {selectedTagIds.length > 0 && (
          <button
            type="button"
            className="md-tag-manage-btn"
            onClick={() => setSelectedTagIds([])}
            title="נקה פילטר תגיות"
            style={{ marginInlineStart: 4 }}
          >
            <X size={12} />
            נקה
          </button>
        )}
        <button
          type="button"
          className="md-tag-manage-btn"
          onClick={() => setTagManagerOpen(true)}
        >
          <Tags size={12} />
          ניהול תגיות
        </button>
      </div>

      <div className="md-layout">
        <FilterRail
          filters={filters}
          onUpdate={updateFilters}
          onClear={clearFilters}
          mobileOpen={mobileFiltersOpen}
          onCloseMobile={() => setMobileFiltersOpen(false)}
        />

        <div className="md-content">
          <div className="md-toolbar">
            <button
              type="button"
              className="md-mobile-filters"
              onClick={() => setMobileFiltersOpen(true)}
            >
              <Filter size={14} /> סינון
              {activeFilterCount > 0 && <span className="md-active-filter-badge">{activeFilterCount}</span>}
            </button>

            <div className="md-segmented compact" role="tablist" aria-label="סוג עסקה">
              {[
                { value: '',          label: 'הכל' },
                { value: 'forsale',   label: 'למכירה' },
                { value: 'rent',      label: 'להשכרה' },
                { value: 'commercial', label: 'מסחרי' },
              ].map((opt) => (
                <button
                  key={opt.value || '_all'}
                  type="button"
                  role="tab"
                  aria-pressed={filters.kind === opt.value}
                  onClick={() => updateFilters({ kind: opt.value })}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <div className="md-toolbar-spacer" />

            <select
              className="md-sort-select"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              aria-label="מיון"
            >
              {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>

            <div className="md-view-toggle" role="tablist" aria-label="תצוגה">
              <button
                type="button"
                role="tab"
                aria-pressed={viewMode === 'rows'}
                onClick={() => setViewMode('rows')}
                title="תצוגת רשימה"
              >
                <List size={16} />
              </button>
              <button
                type="button"
                role="tab"
                aria-pressed={viewMode === 'cards'}
                onClick={() => setViewMode('cards')}
                title="תצוגת כרטיסיות"
              >
                <Grid size={16} />
              </button>
            </div>
          </div>

          {matchContext && (
            <div className="md-match-banner" role="status">
              <Sparkles size={18} style={{ color: 'var(--success)', flexShrink: 0, marginTop: 2 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="md-match-banner-title">
                  נכס חדש מתאים למתעניין שלך
                  {matchContext.lead?.name && (
                    <span style={{ marginInlineStart: 6, color: 'var(--text-muted)', fontWeight: 500 }}>
                      · {matchContext.lead.name}
                    </span>
                  )}
                </div>
                {Array.isArray(matchContext.reasonsJson) && matchContext.reasonsJson.length > 0 && (
                  <div className="md-match-banner-sub">
                    {`התאמה (${matchContext.score}/100): ${matchContext.reasonsJson.join(' · ')}`}
                  </div>
                )}
              </div>
              <button
                type="button"
                className="md-icon-button"
                onClick={() => setSearchParams({})}
                aria-label="סגור"
                style={{ width: 32, height: 32 }}
              >
                <X size={14} />
              </button>
            </div>
          )}

          {error && (
            <div role="alert" style={{ background: 'var(--danger-bg)', color: 'var(--danger)', padding: 12, borderRadius: 'var(--radius-sm)' }}>
              {error}
            </div>
          )}

          {loading && (
            <div className="md-rows" aria-hidden>
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="md-skeleton-row" />
              ))}
            </div>
          )}

          {!loading && orderedItems.length === 0 && (
            <EmptyState
              icon={<Building2 size={28} />}
              title="אין מודעות תואמות"
              description={
                activeFilterCount > 0
                  ? 'נסה/י להרחיב את הסינון, או נקה אותו.'
                  : 'הסורק רץ פעם בשעה ויאסוף מודעות חדשות מ-Yad2 ומקורות נוספים. חזור/חזרי אחר כך.'
              }
            />
          )}

          {!loading && visibleItems.length > 0 && viewMode === 'rows' && (
            <div className="md-rows">
              {visibleItems.map((l) => (
                <ListingRow
                  key={l.id}
                  listing={l}
                  isMatched={isMatchedListing(l, matchedListingId)}
                  isDuplicated={!!l.duplicatedByMe}
                  onOpen={handleOpenListing}
                  onOpenMine={handleOpenMine}
                  onDuplicate={handleDuplicate}
                  onOverflow={(target, action) => handleOverflow(target, action)}
                  tags={tags}
                  onAttachTag={(tag) => handleAttachTag(l.id, tag)}
                  onDetachTag={(tag) => handleDetachTag(l.id, tag)}
                  onCreateAndAttachTag={(payload) => handleCreateAndAttach(l.id, payload)}
                />
              ))}
            </div>
          )}

          {!loading && visibleItems.length > 0 && viewMode === 'cards' && (
            <div className="md-cards">
              {visibleItems.map((l) => (
                <ListingCard
                  key={l.id}
                  listing={l}
                  isMatched={isMatchedListing(l, matchedListingId)}
                  isDuplicated={!!l.duplicatedByMe}
                  onOpen={handleOpenListing}
                  onOpenMine={handleOpenMine}
                  onDuplicate={handleDuplicate}
                />
              ))}
            </div>
          )}

          {hasMoreServer && !loading && (
            <div
              ref={sentinelRef}
              aria-hidden
              style={{
                height: 64,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--text-muted)',
                fontSize: 13,
              }}
            >
              {loadingMore ? 'טוען עוד…' : ''}
            </div>
          )}
        </div>
      </div>

      {drawerListing && (
        <ListingDrawer
          listing={drawerListing}
          onClose={() => setDrawerListing(null)}
          onDuplicate={(l) => { setDrawerListing(null); handleDuplicate(l); }}
          onOpenMine={(l) => { setDrawerListing(null); handleOpenMine(l); }}
          onSendToLead={(match, listing) => setSendDialog({ match, listing })}
          onDismissMatch={handleDismissMatchInDrawer}
        />
      )}

      <MatchSendDialog
        open={!!sendDialog}
        match={sendDialog?.match}
        listing={sendDialog?.listing}
        onClose={() => setSendDialog(null)}
      />

      <MarketTagManager
        open={tagManagerOpen}
        tags={tags}
        onCreate={handleCreateTag}
        onUpdate={handleUpdateTag}
        onDelete={handleDeleteTag}
        onClose={() => setTagManagerOpen(false)}
      />

      <EmailSignupModal
        open={emailModalOpen}
        onClose={() => setEmailModalOpen(false)}
        emailPref={emailPref}
        emailDraft={emailDraft}
        setEmailDraft={setEmailDraft}
        emailSaving={emailSaving}
        onSubmit={submitEmailModal}
        onDisable={disableEmailPref}
      />
    </div>
  );
}

function isMatchedListing(listing, matchedListingId) {
  return (Array.isArray(listing.matches) && listing.matches.length > 0)
    || !!listing.topMatch
    || listing.id === matchedListingId;
}

function stripClientFilters(filters) {
  // matchedOnly / hideViewed / hideDuplicated are client-side only —
  // strip before sending to the listings endpoint.
  const CLIENT_KEYS = new Set(['matchedOnly', 'hideViewed', 'hideDuplicated']);
  const out = {};
  for (const [k, v] of Object.entries(filters)) {
    if (!CLIENT_KEYS.has(k)) out[k] = v;
  }
  return out;
}
