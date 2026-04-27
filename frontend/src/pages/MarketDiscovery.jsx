// Market Discovery — מודעות חדשות בשוק.
//
// Phase 2 (this version): full filter UI, sort, match deep-link surfacing,
// last-scan timestamp.
// Phase 1 (prior): list + duplicate.
//
// LEGAL/SAFETY: this page only renders metadata returned from
// /api/market-discovery/listings — the backend stores no images,
// descriptions, phone numbers, or HTML. Every card surfaces the
// "פתח במקור" link so the source remains canonical.

import { useEffect, useId, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Building2, ExternalLink, Copy as CopyIcon, Filter, X,
  Sparkles, ChevronDown,
  Mail, MailCheck, CheckCircle2, User, Briefcase,
} from 'lucide-react';
import api from '../lib/api';
import { useToast } from '../lib/toast';
import { displayPriceShort } from '../lib/display';
import { relLabel } from '../lib/relativeDate';
import EmptyState from '../components/EmptyState';
import Portal from '../components/Portal';
import useInfiniteScroll from '../lib/useInfiniteScroll';
import {
  inputPropsForPrice, inputPropsForRooms, inputPropsForSqm,
  inputPropsForCity,
} from '../lib/inputProps';

const DT = {
  cream: '#f7f3ec', cream2: '#efe9df', white: '#fff',
  ink: '#1e1a14', muted: '#6b6356',
  gold: '#b48b4c', goldDark: '#7a5c2c', goldSoft: 'rgba(180,139,76,0.12)',
  border: 'rgba(30,26,20,0.08)',
  success: '#15803d', successSoft: 'rgba(21,128,61,0.08)',
};
const FONT = { fontFamily: 'Assistant, Heebo, -apple-system, sans-serif' };

// Sort options. Matched listings (those with a topMatch from the
// reactor for the current agent) ALWAYS bubble to the top regardless
// of which option is selected — sort applies inside each "matched"
// vs "unmatched" group. The labels below describe the secondary
// (unmatched-group) order.
const SORTS = [
  { value: 'firstSeenAt-desc', label: 'נראה לראשונה — חדש לישן' },
  { value: 'price-asc',        label: 'מחיר — מהזול ליקר' },
  { value: 'price-desc',       label: 'מחיר — מהיקר לזול' },
  { value: 'pricePerSqm-asc',  label: 'מחיר למ״ר — נמוך לגבוה' },
];

export default function MarketDiscovery() {
  const [searchParams, setSearchParams] = useSearchParams();
  const matchId = searchParams.get('match');

  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastScan, setLastScan] = useState(null);
  const [matchContext, setMatchContext] = useState(null);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [filters, setFilters] = useState({
    city: '', neighborhood: '', propertyType: '',
    kind: '',                  // '' = sale + rent, 'forsale', 'rent'
    posterType: 'private',     // default: private only — agents already
                               // know most local agencies' inventory and
                               // care about raw deal flow first.
    minPrice: '', maxPrice: '',
    minRooms: '', maxRooms: '',
    minSqm: '', maxSqm: '',
    status: 'active',
    firstSeenAfter: '24h',  // server defaults to 24h; explicit so the
                            // user can flip it to '7d' / 'all'.
  });
  // Notification-channel toggle — wired to UserNotificationPreference.
  // marketMatchEmailEnabled. Surfaces the same setting that
  // /settings/notifications exposes, but in-context here so the agent
  // can opt into the email pipeline directly from the page they want
  // notifications about.
  const [emailPref, setEmailPref] = useState(null);  // null = loading; { enabled, deliveryEmail, accountEmail }
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [emailDraft, setEmailDraft] = useState('');
  const [sort, setSort] = useState('firstSeenAt-desc');
  // Pagination — fetch a deep window from the backend (100), then
  // reveal 15 cards at a time via infinite scroll. Matches Properties
  // page UX (no pager buttons; the page just grows as you scroll).
  const FETCH_LIMIT = 100;
  const REVEAL_PAGE = 15;
  const navigate = useNavigate();
  const toast = useToast();

  // Fetch the latest scan summary for the "נסרק לפני X" header. Don't
  // gate the rest of the page on it — if the watcher never ran (dev,
  // fresh deploy) the page should still render the empty state.
  useEffect(() => {
    let cancelled = false;
    api.getMarketLastScan().then(
      (res) => { if (!cancelled) setLastScan(res?.run || null); },
      () => { /* tolerate failure — header just hides */ },
    );
    return () => { cancelled = true; };
  }, []);

  // Email-notification preference — auto-creates the row if missing.
  // Loads in parallel with the user's account email so the popup can
  // pre-fill the input.
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.getNotificationPreferences().catch(() => null),
      api.getMe().catch(() => null),
    ]).then(([pref, me]) => {
      if (cancelled) return;
      // /api/me returns { user: { email, ... } } — the unwrap was
      // missing before, so accountEmail came back '' and the popup
      // never pre-filled.
      const accountEmail = me?.user?.email || me?.email || '';
      setEmailPref({
        enabled: !!pref?.marketMatchEmailEnabled,
        deliveryEmail: pref?.customDeliveryEmail || null,
        accountEmail,
      });
    });
    return () => { cancelled = true; };
  }, []);

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
      // If the user typed their own login email, store it as null
      // (= use account default) so the row stays clean.
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

  // Match deep-link from a Notification: ?match=:id. Fetch the match,
  // surface a "מתאים לליד שלך" banner with the lead context, and mark
  // the match as `viewed`. The endpoint is idempotent — refreshing the
  // page doesn't re-bump the status from `dismissed`/`duplicated`.
  useEffect(() => {
    if (!matchId) { setMatchContext(null); return undefined; }
    let cancelled = false;
    api.getMarketMatch(matchId).then(
      (res) => { if (!cancelled) setMatchContext(res?.match || null); },
      (err) => { if (!cancelled) toast.error?.(err?.message || 'התאמה לא נמצאה'); },
    );
    return () => { cancelled = true; };
  }, [matchId, toast]);

  // Listings fetch — re-runs whenever filters or sort change. The
  // backend caps `limit` at 100; pagination is Phase 2.5 if needed.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.listMarketListings({ ...filters, sort, limit: FETCH_LIMIT, offset: 0 }).then(
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
  }, [filters, sort]);

  const update = (k) => (v) =>
    setFilters((f) => ({ ...f, [k]: v?.target ? v.target.value : v }));

  const clearFilters = () =>
    setFilters({
      city: '', neighborhood: '', propertyType: '',
      kind: '', posterType: 'private',
      minPrice: '', maxPrice: '',
      minRooms: '', maxRooms: '',
      minSqm: '', maxSqm: '',
      status: 'active',
      firstSeenAfter: '24h',
    });

  const activeFilterCount = useMemo(() => {
    // posterType + firstSeenAfter have non-empty defaults — exclude
    // them from the chip count so the icon doesn't show "2 active"
    // on a fresh page load.
    return Object.entries(filters).filter(([k, v]) =>
      v !== ''
        && !(k === 'status' && v === 'active')
        && !(k === 'firstSeenAfter' && v === '24h')
        && !(k === 'posterType' && v === 'private'),
    ).length;
  }, [filters]);

  const duplicate = async (listingId) => {
    try {
      const body = matchId ? { matchId } : {};
      const res = await api.duplicateMarketListing(listingId, body);
      toast.success?.('הנכס הועתק לרשימה שלך');
      navigate(`/properties/${res.propertyId}/edit`);
    } catch (err) {
      toast.error?.(err?.message || 'שכפול נכשל');
    }
  };

  // The matched listing should pop to the top of the list (visually
  // and logically) — it's why the agent clicked the notification. If
  // it's not in the current filter result we still render it via the
  // `matchContext.marketListing` so the agent always sees what they
  // came for.
  const matchedListingId = matchContext?.marketListing?.id;
  const orderedItems = useMemo(() => {
    if (!matchedListingId) return items;
    const m = items.find((x) => x.id === matchedListingId);
    if (m) return [m, ...items.filter((x) => x.id !== matchedListingId)];
    if (matchContext?.marketListing) return [matchContext.marketListing, ...items];
    return items;
  }, [items, matchedListingId, matchContext]);

  // Infinite scroll — initial reveal = REVEAL_PAGE, sentinel pulls
  // another batch when it scrolls into view.
  const infinite = useInfiniteScroll(orderedItems.length, {
    pageSize: REVEAL_PAGE,
    initial: REVEAL_PAGE,
    rootMargin: '300px',
  });
  const visibleItems = useMemo(
    () => orderedItems.slice(0, infinite.visible),
    [orderedItems, infinite.visible],
  );

  return (
    <div dir="rtl" style={{ ...FONT, padding: 28, color: DT.ink, minHeight: '100%' }}>
      {/* Header */}
      <div style={{ marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: -0.7, margin: 0 }}>
            מודעות חדשות בשוק
          </h1>
          <div style={{ fontSize: 13, color: DT.muted, marginTop: 4 }}>
            {loading
              ? 'טוען…'
              : `${total.toLocaleString('he-IL')} מודעות תואמות לחיפוש`}
            {lastScan && (
              <span style={{ marginInlineStart: 10, color: DT.muted }}>
                · נסרק {relLabel(lastScan.startedAt)}
              </span>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Poster-type filter — promoted to the header row per UX
              feedback: "פרטי vs מתווך" is one of the two axes the agent
              decides upfront (alongside sale/rent), so it sits next to
              the email-signup CTA rather than buried in the filter
              drawer. Default = פרטי only. */}
          <div role="tablist" aria-label="מפרסם" style={{
            display: 'inline-flex', borderRadius: 10, overflow: 'hidden',
            border: `1px solid ${DT.border}`, height: 44,
          }}>
            {[
              { value: 'private', label: 'פרטי' },
              { value: 'agency',  label: 'תיווך' },
              { value: '',        label: 'הכל' },
            ].map((opt) => {
              const active = filters.posterType === opt.value;
              return (
                <button
                  key={opt.value || 'all'}
                  role="tab"
                  type="button"
                  aria-selected={active}
                  onClick={() => setFilters((f) => ({ ...f, posterType: opt.value }))}
                  style={{
                    ...FONT, cursor: 'pointer',
                    background: active ? DT.ink : DT.white,
                    color: active ? DT.white : DT.ink,
                    border: 'none',
                    padding: '0 14px', fontSize: 13, fontWeight: 700,
                    minWidth: 60,
                  }}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={openEmailModal}
            disabled={emailPref == null}
            aria-pressed={!!emailPref?.enabled}
            title={emailPref?.enabled
              ? `התראות פעילות — נשלחות אל ${emailPref?.deliveryEmail || emailPref?.accountEmail}`
              : 'הירשמ/י לקבלת מייל בכל פעם שנמצאת התאמה לליד פעיל'}
            style={{
              ...FONT, cursor: 'pointer',
              background: emailPref?.enabled ? DT.successSoft : DT.white,
              color: emailPref?.enabled ? DT.success : DT.ink,
              border: `1px solid ${emailPref?.enabled ? DT.success : DT.border}`,
              padding: '10px 14px', borderRadius: 10, fontSize: 13, fontWeight: 700,
              display: 'inline-flex', gap: 6, alignItems: 'center',
              minHeight: 44,
              opacity: emailPref == null ? 0.6 : 1,
            }}
          >
            {emailPref?.enabled ? <MailCheck size={14} /> : <Mail size={14} />}
            {emailPref?.enabled ? 'התראות פעילות' : 'רישום להתראות מייל'}
          </button>
          <button
            type="button"
            onClick={() => setFiltersOpen((v) => !v)}
            style={{
              ...FONT, cursor: 'pointer',
              background: filtersOpen ? DT.goldSoft : DT.white,
              color: DT.ink, border: `1px solid ${DT.border}`,
              padding: '10px 14px', borderRadius: 10, fontSize: 13, fontWeight: 700,
              display: 'inline-flex', gap: 6, alignItems: 'center',
              minHeight: 44,
            }}
          >
            <Filter size={14} /> סינון
            {activeFilterCount > 0 && (
              <span style={{ background: DT.gold, color: DT.ink, borderRadius: 99, padding: '0 6px', fontSize: 11, marginInlineStart: 4 }}>
                {activeFilterCount}
              </span>
            )}
          </button>
          <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              aria-label="מיון"
              style={{
                ...FONT,
                appearance: 'none',
                WebkitAppearance: 'none',
                MozAppearance: 'none',
                // padding-inline-start big enough to clear the absolute
                // ChevronDown icon below; padding-end keeps the label
                // off the start edge.
                padding: '10px 32px 10px 14px',
                borderRadius: 10,
                border: `1px solid ${DT.border}`,
                background: DT.white,
                fontSize: 13, fontWeight: 700, color: DT.ink,
                minHeight: 44,
                cursor: 'pointer',
                // Fix RTL chevron mirror in some Chromium builds.
                direction: 'rtl',
              }}
            >
              {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <span
              aria-hidden="true"
              style={{
                position: 'absolute',
                insetInlineStart: 10,
                pointerEvents: 'none',
                color: DT.muted,
                display: 'inline-flex',
              }}
            >
              <ChevronDown size={14} />
            </span>
          </div>
        </div>
      </div>

      {/* Kind tabs — sale / rent / all. Sits between header and the
          collapsible filter panel; primary axis of the catalogue, so
          it stays visible even when the filter drawer is closed. */}
      <div role="tablist" aria-label="סוג עסקה" style={{
        display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap',
      }}>
        {[
          { value: '',        label: 'הכל' },
          { value: 'forsale', label: 'למכירה' },
          { value: 'rent',    label: 'להשכרה' },
        ].map((opt) => {
          const active = filters.kind === opt.value;
          return (
            <button
              key={opt.value || 'all'}
              role="tab"
              aria-selected={active}
              type="button"
              onClick={() => setFilters((f) => ({ ...f, kind: opt.value }))}
              style={{
                ...FONT, cursor: 'pointer',
                background: active ? DT.ink : DT.white,
                color: active ? DT.white : DT.ink,
                border: `1px solid ${active ? DT.ink : DT.border}`,
                padding: '8px 16px', borderRadius: 99,
                fontSize: 13, fontWeight: 700, minHeight: 36,
              }}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      {/* Match deep-link banner */}
      {matchContext && (
        <div role="status" style={{
          background: DT.successSoft, border: `1px solid ${DT.success}33`,
          borderRadius: 12, padding: '12px 14px', marginBottom: 14,
          display: 'flex', alignItems: 'flex-start', gap: 10,
        }}>
          <Sparkles size={18} style={{ color: DT.success, flexShrink: 0, marginTop: 2 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 800 }}>
              נכס חדש מתאים לליד שלך
              {matchContext.lead?.name && (
                <span style={{ marginInlineStart: 6, color: DT.muted, fontWeight: 500 }}>
                  · {matchContext.lead.name}
                </span>
              )}
            </div>
            {Array.isArray(matchContext.reasonsJson) && matchContext.reasonsJson.length > 0 && (
              <div style={{ fontSize: 12, color: DT.muted, marginTop: 4 }}>
                {`התאמה (${matchContext.score}/100): ${matchContext.reasonsJson.join(' · ')}`}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => setSearchParams({})}
            aria-label="סגור"
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: DT.muted, padding: 4,
            }}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Filters panel — collapsed by default on mobile, opens via button */}
      {filtersOpen && (
        <div style={{
          background: DT.white, border: `1px solid ${DT.border}`, borderRadius: 14,
          padding: 14, marginBottom: 14,
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: 10,
        }}>
          <FilterField label="עיר">
            <input value={filters.city} onChange={update('city')}
              placeholder="הכל"
              {...inputPropsForCity()}
              style={fieldInputStyle} />
          </FilterField>
          <FilterField label="שכונה">
            <input value={filters.neighborhood} onChange={update('neighborhood')}
              placeholder="הכל" style={fieldInputStyle} />
          </FilterField>
          <FilterField label="סוג נכס">
            <input value={filters.propertyType} onChange={update('propertyType')}
              placeholder="דירה / בית / …" style={fieldInputStyle} />
          </FilterField>
          <FilterField label="מינימום חדרים">
            <input value={filters.minRooms} onChange={update('minRooms')}
              placeholder="—" {...inputPropsForRooms()} style={fieldInputStyle} />
          </FilterField>
          <FilterField label="מקסימום חדרים">
            <input value={filters.maxRooms} onChange={update('maxRooms')}
              placeholder="—" {...inputPropsForRooms()} style={fieldInputStyle} />
          </FilterField>
          <FilterField label="מחיר מינימלי">
            <input value={filters.minPrice} onChange={update('minPrice')}
              placeholder="—" {...inputPropsForPrice()} style={fieldInputStyle} />
          </FilterField>
          <FilterField label="מחיר מקסימלי">
            <input value={filters.maxPrice} onChange={update('maxPrice')}
              placeholder="—" {...inputPropsForPrice()} style={fieldInputStyle} />
          </FilterField>
          <FilterField label="מינימום מ״ר">
            <input value={filters.minSqm} onChange={update('minSqm')}
              placeholder="—" {...inputPropsForSqm()} style={fieldInputStyle} />
          </FilterField>
          <FilterField label="מקסימום מ״ר">
            <input value={filters.maxSqm} onChange={update('maxSqm')}
              placeholder="—" {...inputPropsForSqm()} style={fieldInputStyle} />
          </FilterField>
          <FilterField label="סטטוס">
            <select value={filters.status} onChange={update('status')}
              style={fieldInputStyle}>
              <option value="active">פעיל בלבד</option>
              <option value="">הכל</option>
              <option value="removed">הוסר</option>
              <option value="unknown">לא ידוע</option>
            </select>
          </FilterField>
          <FilterField label="טווח זמן">
            <select value={filters.firstSeenAfter} onChange={update('firstSeenAfter')}
              style={fieldInputStyle}>
              <option value="24h">24 שעות אחרונות</option>
              <option value="7d">שבוע אחרון</option>
              <option value="30d">30 יום אחרונים</option>
              <option value="all">הכל</option>
            </select>
          </FilterField>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
            <button type="button" onClick={clearFilters}
              style={{
                ...FONT, cursor: 'pointer',
                background: DT.cream2, color: DT.ink, border: `1px solid ${DT.border}`,
                padding: '10px 14px', borderRadius: 10, fontSize: 13, fontWeight: 700,
                minHeight: 44, width: '100%',
              }}>
              נקה הכל
            </button>
          </div>
        </div>
      )}

      {error && (
        <div role="alert" style={{ background: 'rgba(220, 38, 38, 0.08)', color: '#b91c1c', padding: 12, borderRadius: 10, marginBottom: 14 }}>
          {error}
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

      {/* 2-col on desktop, 1-col on mobile. Per UX feedback the cards
          looked cramped at 3-up; widening to 2-up gives the price + match
          banner real estate to breathe. */}
      <style>{`
        .market-grid {
          display: grid;
          gap: 16px;
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
        @media (max-width: 720px) {
          .market-grid { grid-template-columns: 1fr; }
        }
        .market-card {
          transition: transform 120ms ease, box-shadow 120ms ease;
        }
        .market-card:hover {
          transform: translateY(-2px);
        }
      `}</style>
      <div className="market-grid">
        {visibleItems.map((l) => {
          const isMatched = (Array.isArray(l.matches) && l.matches.length > 0)
            || !!l.topMatch
            || l.id === matchedListingId;
          const isDuplicated = !!l.duplicatedByMe;
          // Names of all leads that match this listing — capped at 3
          // visible + "+N" overflow so the badge stays compact.
          const matchedNames = (Array.isArray(l.matches) ? l.matches : [])
            .map((m) => m && m.leadName)
            .filter(Boolean);
          const namesShown = matchedNames.slice(0, 3).join(', ');
          const namesOverflow = matchedNames.length > 3 ? matchedNames.length - 3 : 0;
          // Visual hierarchy: duplicated (already-acted) → green;
          // matched → strong gold (richer than the soft 1px border we
          // had before — 2px + saturated shadow + tinted background).
          const accent = isDuplicated ? DT.success
                       : isMatched   ? DT.gold
                       : null;
          return (
          <article
            key={l.id}
            className="market-card"
            data-matched={isMatched ? 'true' : undefined}
            data-duplicated={isDuplicated ? 'true' : undefined}
            style={{
              position: 'relative',
              background: isMatched && !isDuplicated
                ? 'linear-gradient(180deg, rgba(180,139,76,0.10), #fff 50%)'
                : DT.white,
              border: accent ? `2px solid ${accent}` : `1px solid ${DT.border}`,
              borderRadius: 16,
              padding: 18,
              paddingTop: isMatched && !isDuplicated ? 18 : 18,
              display: 'flex', flexDirection: 'column', gap: 12,
              minHeight: 240,
              boxShadow: isDuplicated
                ? '0 8px 22px rgba(21,128,61,0.20)'
                : isMatched
                ? '0 10px 26px rgba(180,139,76,0.30)'
                : '0 2px 6px rgba(30,26,20,0.05)',
              overflow: 'hidden',
            }}
          >
            {/* Top accent strip on matched cards — adds an immediate
                visual cue without competing with the lead-name banner */}
            {isMatched && !isDuplicated && (
              <div style={{
                position: 'absolute', top: 0, insetInline: 0, height: 4,
                background: `linear-gradient(90deg, ${DT.gold}, ${DT.goldDark}, ${DT.gold})`,
              }} />
            )}
            {isDuplicated && (
              <div style={{
                position: 'absolute', top: 0, insetInline: 0, height: 4,
                background: DT.success,
              }} />
            )}

            {/* Lead-match banner — full-width, large, golden */}
            {isMatched && !isDuplicated && (
              <div style={{
                display: 'flex', alignItems: 'flex-start', gap: 10,
                background: 'rgba(180,139,76,0.16)',
                border: `1px solid rgba(180,139,76,0.45)`,
                borderRadius: 12, padding: '10px 12px',
              }}>
                <Sparkles size={20} style={{ color: DT.goldDark, flexShrink: 0, marginTop: 1 }} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{
                    fontSize: 11, fontWeight: 700, color: DT.goldDark,
                    letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 2,
                  }}>
                    התאמה לליד
                  </div>
                  <div style={{
                    fontSize: 15, fontWeight: 800, color: DT.ink, lineHeight: 1.3,
                  }}>
                    {namesShown
                      ? `${namesShown}${namesOverflow ? ` +${namesOverflow}` : ''}`
                      : 'ליד שלך'}
                  </div>
                </div>
              </div>
            )}
            {isDuplicated && (
              <div style={{
                display: 'inline-flex', alignSelf: 'flex-start', alignItems: 'center', gap: 6,
                background: DT.success, color: DT.white,
                fontSize: 12, fontWeight: 800, letterSpacing: 0.3,
                padding: '5px 12px', borderRadius: 99,
              }}>
                <CheckCircle2 size={13} /> בנכסים שלך
              </div>
            )}

            {/* Source / kind / poster pills row */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
              {l.source === 'yad2' && <Yad2Badge />}
              {l.kind && (
                <span style={{
                  ...kindPillStyle,
                  background: l.kind === 'rent'
                    ? 'rgba(59,130,246,0.12)'
                    : 'rgba(180,139,76,0.10)',
                  color: l.kind === 'rent' ? '#1e40af' : '#7a5c2c',
                }}>
                  {l.kind === 'rent' ? 'להשכרה' : 'למכירה'}
                </span>
              )}
              {l.posterType && (
                <span style={{
                  ...kindPillStyle,
                  background: DT.cream2, color: DT.muted,
                }}>
                  {l.posterType === 'agency'
                    ? <><Briefcase size={10} /> תיווך</>
                    : <><User size={10} /> פרטי</>}
                </span>
              )}
              <span style={{ marginInlineStart: 'auto', fontSize: 11, color: DT.muted, fontWeight: 600 }}>
                {relLabel(l.firstSeenAt)}
              </span>
            </div>

            {/* Address — primary identifier */}
            <div>
              <div style={{
                fontSize: 18, fontWeight: 800, marginBottom: 4,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                color: DT.ink, lineHeight: 1.3,
              }}>
                {[l.street, l.neighborhood, l.city].filter(Boolean).join(' · ') || 'נכס'}
              </div>
              <div style={{ fontSize: 13, color: DT.muted, fontWeight: 600 }}>
                {[
                  l.propertyType,
                  l.rooms != null ? `${l.rooms} חד׳` : null,
                  l.sizeSqm != null ? `${l.sizeSqm} מ״ר` : null,
                  l.floor != null ? `קומה ${l.floor}` : null,
                ].filter(Boolean).join(' · ')}
              </div>
            </div>

            {/* Big price */}
            {l.price != null && (
              <div style={{
                display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap',
                paddingTop: 4, paddingBottom: 4,
                borderTop: `1px dashed ${DT.border}`,
                borderBottom: `1px dashed ${DT.border}`,
              }}>
                <span style={{
                  fontSize: 26, fontWeight: 900, color: DT.goldDark,
                  letterSpacing: -0.5,
                }}>
                  {displayPriceShort(l.price)}
                </span>
                {l.kind === 'rent' && (
                  <span style={{ fontSize: 12, fontWeight: 700, color: DT.muted }}>
                    / חודש
                  </span>
                )}
                {l.pricePerSqm != null && l.kind !== 'rent' && (
                  <span style={{ fontSize: 12, color: DT.muted, marginInlineStart: 'auto' }}>
                    {`₪${l.pricePerSqm.toLocaleString('he-IL')} / מ״ר`}
                  </span>
                )}
              </div>
            )}

            {/* Action row at the bottom of the card */}
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: 8,
              marginTop: 'auto', paddingTop: 2,
            }}>
              <a
                href={l.originalUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  ...FONT, textDecoration: 'none', textAlign: 'center',
                  background: DT.cream2, color: DT.ink, border: `1px solid ${DT.border}`,
                  padding: '10px 12px', borderRadius: 10, fontSize: 13, fontWeight: 700,
                  display: 'inline-flex', gap: 6, alignItems: 'center', justifyContent: 'center',
                  minHeight: 44,
                }}
              >
                <ExternalLink size={14} /> פתח במקור
              </a>
              {isDuplicated ? (
                <button
                  type="button"
                  onClick={() => navigate(`/properties/${l.duplicatedByMe}/edit`)}
                  style={{
                    ...FONT, cursor: 'pointer', textAlign: 'center',
                    background: DT.success, color: DT.white, border: 'none',
                    padding: '10px 12px', borderRadius: 10, fontSize: 13, fontWeight: 800,
                    display: 'inline-flex', gap: 6, alignItems: 'center', justifyContent: 'center',
                    minHeight: 44, boxShadow: '0 4px 12px rgba(21,128,61,0.30)',
                  }}
                >
                  <CheckCircle2 size={14} /> פתח אצלי
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => duplicate(l.id)}
                  style={{
                    ...FONT, cursor: 'pointer', textAlign: 'center',
                    background: `linear-gradient(135deg, ${DT.gold}, ${DT.goldDark})`,
                    color: DT.white, border: 'none',
                    padding: '10px 12px', borderRadius: 10, fontSize: 13, fontWeight: 800,
                    display: 'inline-flex', gap: 6, alignItems: 'center', justifyContent: 'center',
                    minHeight: 44, boxShadow: '0 4px 14px rgba(180,139,76,0.35)',
                  }}
                >
                  <CopyIcon size={14} /> שכפל לנכסים שלי
                </button>
              )}
            </div>
          </article>
          );
        })}
      </div>

      {/* Infinite-scroll sentinel — invisible div that triggers the
          next batch reveal when it scrolls within 300px of the
          viewport. Replaces the prior pager buttons. */}
      {infinite.hasMore && (
        <div
          ref={infinite.sentinelRef}
          aria-hidden="true"
          style={{ height: 24, width: '100%' }}
        />
      )}

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

// Email-signup popup. Renders into a Portal so the backdrop covers
// sidebar + topbar (the page-local fixed div couldn't darken those).
// Pre-fills the user's account email when first opened — emailDraft
// initial value is set by openEmailModal() in the parent. Submitting
// flips marketMatchEmailEnabled=true and stores the override (or null
// if it equals the account email so the row stays clean).
function EmailSignupModal({
  open, onClose, emailPref, emailDraft, setEmailDraft,
  emailSaving, onSubmit, onDisable,
}) {
  const titleId = useId();
  if (!open) return null;
  return (
    <Portal>
      <div
        dir="rtl"
        onClick={onClose}
        style={{
          ...FONT,
          position: 'fixed', inset: 0,
          background: 'rgba(30,26,20,0.55)',
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 16,
          zIndex: 1200,
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          onClick={(e) => e.stopPropagation()}
          style={{
            width: '100%', maxWidth: 440,
            maxHeight: 'calc(100dvh - 32px)',
            overflow: 'auto',
            background: DT.white, color: DT.ink,
            border: `1px solid ${DT.border}`,
            borderRadius: 14,
            boxShadow: '0 20px 60px rgba(30,26,20,0.25)',
            padding: 22,
            display: 'flex', flexDirection: 'column', gap: 14,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{
              width: 36, height: 36, borderRadius: 10,
              background: DT.goldSoft, color: DT.goldDark,
              display: 'grid', placeItems: 'center', flexShrink: 0,
            }}><Mail size={18} /></span>
            <h2 id={titleId} style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>
              רישום להתראות מייל
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="סגור"
              style={{
                marginInlineStart: 'auto', background: 'transparent',
                border: 'none', cursor: 'pointer', color: DT.muted,
                padding: 4, display: 'inline-flex',
              }}
            >
              <X size={18} />
            </button>
          </div>
          <p style={{ fontSize: 13, color: DT.muted, lineHeight: 1.55, margin: 0 }}>
            נשלח לך מייל בכל פעם שנמצאת התאמה חדשה לליד פעיל — מייל אחד בלבד לכל התאמה (ללא ספאם).
          </p>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 11, color: DT.muted, fontWeight: 700 }}>
              כתובת לקבלת ההתראות
            </span>
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              value={emailDraft}
              onChange={(e) => setEmailDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') onSubmit(); }}
              placeholder={emailPref?.accountEmail || 'name@example.com'}
              style={{
                ...FONT, fontSize: 14, color: DT.ink, background: DT.white,
                border: `1px solid ${DT.border}`, borderRadius: 10,
                padding: '12px 14px', outline: 'none',
                direction: 'ltr', textAlign: 'left',
              }}
              autoFocus
            />
            {emailPref?.accountEmail && emailDraft !== emailPref.accountEmail && (
              <button type="button"
                onClick={() => setEmailDraft(emailPref.accountEmail)}
                style={{
                  ...FONT, background: 'transparent', border: 'none',
                  color: DT.muted, fontSize: 11, cursor: 'pointer',
                  textAlign: 'start', padding: 0,
                  textDecoration: 'underline',
                }}>
                שחזר לכתובת ברירת המחדל ({emailPref.accountEmail})
              </button>
            )}
          </label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'center' }}>
            {emailPref?.enabled && (
              <button
                type="button"
                onClick={onDisable}
                disabled={emailSaving}
                style={{
                  ...FONT, cursor: emailSaving ? 'wait' : 'pointer',
                  background: DT.white, color: '#b91c1c',
                  border: `1px solid ${DT.border}`,
                  padding: '10px 14px', borderRadius: 10,
                  fontSize: 13, fontWeight: 700, minHeight: 44,
                  marginInlineEnd: 'auto',
                }}
              >
                בטל רישום
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              disabled={emailSaving}
              style={{
                ...FONT, cursor: emailSaving ? 'wait' : 'pointer',
                background: DT.cream2, color: DT.ink,
                border: `1px solid ${DT.border}`,
                padding: '10px 14px', borderRadius: 10,
                fontSize: 13, fontWeight: 700, minHeight: 44,
              }}
            >
              ביטול
            </button>
            <button
              type="button"
              onClick={onSubmit}
              disabled={emailSaving || !emailDraft}
              style={{
                ...FONT, cursor: emailSaving ? 'wait' : 'pointer',
                background: `linear-gradient(135deg, ${DT.gold}, ${DT.goldDark})`,
                color: DT.ink, border: 'none',
                padding: '10px 18px', borderRadius: 10,
                fontSize: 13, fontWeight: 800, minHeight: 44,
                boxShadow: '0 4px 12px rgba(180,139,76,0.28)',
                opacity: emailSaving || !emailDraft ? 0.6 : 1,
                display: 'inline-flex', alignItems: 'center', gap: 6,
              }}
            >
              <MailCheck size={14} /> אשר רישום
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}

const fieldInputStyle = {
  width: '100%', boxSizing: 'border-box',
  padding: '10px 12px', borderRadius: 8,
  border: `1px solid ${DT.border}`, background: DT.white,
  fontSize: 13, color: DT.ink, fontFamily: FONT.fontFamily,
  minHeight: 44,
};

function FilterField({ label, children }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontFamily: FONT.fontFamily }}>
      <span style={{ fontSize: 11, color: DT.muted, fontWeight: 700 }}>{label}</span>
      {children}
    </label>
  );
}

// Source badge — recognizable Yad2 brand pill. The watcher writes
// `source='yad2'` on every row; future Madlan/Komo sources will get
// their own badge components rendered the same way.
function Yad2Badge() {
  return (
    <span
      title="מקור: יד2"
      aria-label="מקור: יד2"
      style={{
        display: 'inline-flex', alignItems: 'center',
        height: 18, padding: '0 8px', borderRadius: 4,
        background: '#F1A828', color: '#171717',
        fontFamily: 'Arial, system-ui, -apple-system, sans-serif',
        fontSize: 11, fontWeight: 900, letterSpacing: 0.1,
        boxShadow: '0 1px 0 rgba(0,0,0,0.08)',
        verticalAlign: 'middle',
        // direction:ltr keeps "yad2" reading left-to-right inside our
        // RTL document so the wordmark renders correctly.
        direction: 'ltr',
      }}
    >yad2</span>
  );
}

const kindPillStyle = {
  display: 'inline-flex', alignItems: 'center', gap: 3,
  background: 'rgba(180,139,76,0.10)', color: '#7a5c2c',
  fontSize: 10, fontWeight: 700, letterSpacing: 0.2,
  padding: '2px 7px', borderRadius: 99,
};
