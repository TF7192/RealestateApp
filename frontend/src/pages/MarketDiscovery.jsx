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
//   - EmailSignupBanner→ contextual nudge when matches exist + pref off

import { useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Building2, Filter, Settings, Eye, EyeOff, List, Grid, X, Sparkles } from 'lucide-react';
import api from './../lib/api';
import { useToast } from './../lib/toast';
import { freshLabel } from './marketDiscovery/freshLabel';
import EmptyState from './../components/EmptyState';
import useInfiniteScroll from './../lib/useInfiniteScroll';
import PulseStrip from './marketDiscovery/PulseStrip';
import FilterRail from './marketDiscovery/FilterRail';
import ListingRow from './marketDiscovery/ListingRow';
import ListingCard from './marketDiscovery/ListingCard';
import ListingDrawer from './marketDiscovery/ListingDrawer';
import MatchSendDialog from './marketDiscovery/MatchSendDialog';
import EmailSignupBanner from './marketDiscovery/EmailSignupBanner';
import { shouldShowEmailBanner } from './marketDiscovery/emailBannerGate';
import EmailSignupModal from './marketDiscovery/EmailSignupModal';
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
  const [emailBannerHidden, setEmailBannerHidden] = useState(false);

  // Email pref state — same shape as the legacy page.
  const [emailPref, setEmailPref] = useState(null);
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [emailDraft, setEmailDraft] = useState('');

  const FETCH_LIMIT = 100;
  const REVEAL_PAGE = 15;

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

  // Listings fetch — re-runs whenever server-side filters or sort change.
  // matchedOnly / hideViewed / hideDuplicated are post-filtered client-side
  // so changing them doesn't refetch.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const serverFilters = stripClientFilters(filters);
    api.listMarketListings({ ...serverFilters, sort, limit: FETCH_LIMIT, offset: 0 }).then(
      (res) => {
        if (cancelled) return;
        setItems(res?.items || []);
        setTotal(res?.total || 0);
        setLoading(false);
        setError(null);
      },
      (err) => {
        if (cancelled) return;
        setError(err?.message || 'טעינה נכשלה');
        setLoading(false);
      },
    );
    return () => { cancelled = true; };
    // matchedOnly / hideViewed / hideDuplicated are client-side filters
    // (applied to `orderedItems` below) — they intentionally don't
    // re-trigger this fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.city, filters.neighborhood, filters.propertyType, filters.kind,
      filters.posterType, filters.minPrice, filters.maxPrice, filters.minRooms,
      filters.maxRooms, filters.minSqm, filters.maxSqm, filters.status,
      filters.firstSeenAfter, sort]);

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

  const infinite = useInfiniteScroll(orderedItems.length, {
    pageSize: REVEAL_PAGE,
    initial: REVEAL_PAGE,
    rootMargin: '300px',
  });
  const visibleItems = useMemo(
    () => orderedItems.slice(0, infinite.visible),
    [orderedItems, infinite.visible],
  );

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
      else toast.error?.('אין ליד מתאים למודעה הזו');
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
      toast.success?.('נרשמת בהצלחה — נשלח מייל בכל פעם שנמצאת התאמה לליד');
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

  const showEmailBanner = !emailBannerHidden
    && shouldShowEmailBanner(emailPref, pulse?.matchesForMe?.count);

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
            type="button"
            className="md-icon-button"
            onClick={() => updateFilters({ hideViewed: !filters.hideViewed })}
            aria-pressed={!!filters.hideViewed}
            title={filters.hideViewed ? 'מציג גם נצפים' : 'הסתר מודעות שכבר ראיתי'}
          >
            {filters.hideViewed ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
          <button
            type="button"
            className="md-icon-button"
            onClick={openEmailModal}
            aria-pressed={!!emailPref?.enabled}
            title={emailPref?.enabled
              ? `התראות מייל פעילות`
              : 'הגדרות התראות'}
            style={emailPref?.enabled
              ? { borderColor: 'var(--success)', color: 'var(--success)', background: 'var(--success-bg)' }
              : undefined}
          >
            <Settings size={16} />
          </button>
        </div>
      </div>

      <PulseStrip
        pulse={pulse}
        loading={pulseLoading}
        onApply={(patch) => updateFilters(patch)}
      />

      {showEmailBanner && (
        <EmailSignupBanner
          matchCount={pulse?.matchesForMe?.count || 0}
          onActivate={openEmailModal}
          onDismiss={() => setEmailBannerHidden(true)}
        />
      )}

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
                { value: '',        label: 'הכל' },
                { value: 'forsale', label: 'למכירה' },
                { value: 'rent',    label: 'להשכרה' },
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
                  נכס חדש מתאים לליד שלך
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

          {infinite.hasMore && !loading && (
            <div ref={infinite.sentinelRef} aria-hidden style={{ height: 24 }} />
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
