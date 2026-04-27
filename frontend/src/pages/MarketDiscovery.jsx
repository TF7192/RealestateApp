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

import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Building2, ExternalLink, Copy as CopyIcon, Filter, X,
  Sparkles, ChevronDown, ChevronRight, ChevronLeft,
  Mail, MailCheck, CheckCircle2, User, Briefcase,
} from 'lucide-react';
import api from '../lib/api';
import { useToast } from '../lib/toast';
import { displayPriceShort } from '../lib/display';
import { relLabel } from '../lib/relativeDate';
import EmptyState from '../components/EmptyState';
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
    kind: '',          // '' = sale + rent, 'forsale', 'rent'
    posterType: '',    // '' = all, 'private', 'agency'
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
  const [emailPref, setEmailPref] = useState(null);  // null = loading
  const [emailSaving, setEmailSaving] = useState(false);
  const [sort, setSort] = useState('firstSeenAt-desc');
  // Pagination — 10 listings per page so the agent isn't drowning
  // in 50 cards on first paint. Matched listings always pop to the
  // top of the page (server-side); pagination walks through the rest
  // by the agent's chosen sort.
  const PAGE_SIZE = 10;
  const [offset, setOffset] = useState(0);

  // Reset pagination whenever filters or sort change — otherwise
  // the agent ends up on "page 7" of a fresh filter that only has
  // 3 items and sees an empty page.
  useEffect(() => { setOffset(0); }, [filters, sort]);
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
  useEffect(() => {
    let cancelled = false;
    api.getNotificationPreferences().then(
      (res) => { if (!cancelled) setEmailPref(!!res?.marketMatchEmailEnabled); },
      () => { if (!cancelled) setEmailPref(false); },
    );
    return () => { cancelled = true; };
  }, []);

  const toggleEmailPref = async () => {
    if (emailSaving || emailPref == null) return;
    const next = !emailPref;
    setEmailSaving(true);
    setEmailPref(next);  // optimistic
    try {
      await api.updateNotificationPreferences({ marketMatchEmailEnabled: next });
      toast.success?.(next ? 'התראות במייל הופעלו' : 'התראות במייל בוטלו');
    } catch (err) {
      setEmailPref(!next);  // revert
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
    api.listMarketListings({ ...filters, sort, limit: PAGE_SIZE, offset }).then(
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
  }, [filters, sort, offset]);

  const update = (k) => (v) =>
    setFilters((f) => ({ ...f, [k]: v?.target ? v.target.value : v }));

  const clearFilters = () =>
    setFilters({
      city: '', neighborhood: '', propertyType: '',
      kind: '', posterType: '',
      minPrice: '', maxPrice: '',
      minRooms: '', maxRooms: '',
      minSqm: '', maxSqm: '',
      status: 'active',
      firstSeenAfter: '24h',
    });

  const activeFilterCount = useMemo(() => {
    return Object.entries(filters).filter(([k, v]) =>
      v !== ''
        && !(k === 'status' && v === 'active')
        && !(k === 'firstSeenAfter' && v === '24h'),
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
          <button
            type="button"
            onClick={toggleEmailPref}
            disabled={emailPref == null || emailSaving}
            aria-pressed={!!emailPref}
            title={emailPref ? 'בטל קבלת התראות במייל על התאמות' : 'הפעל קבלת התראות במייל כשנמצאת התאמה לליד'}
            style={{
              ...FONT, cursor: emailSaving ? 'wait' : 'pointer',
              background: emailPref ? DT.successSoft : DT.white,
              color: emailPref ? DT.success : DT.ink,
              border: `1px solid ${emailPref ? DT.success : DT.border}`,
              padding: '10px 14px', borderRadius: 10, fontSize: 13, fontWeight: 700,
              display: 'inline-flex', gap: 6, alignItems: 'center',
              minHeight: 44,
              opacity: emailPref == null || emailSaving ? 0.6 : 1,
            }}
          >
            {emailPref ? <MailCheck size={14} /> : <Mail size={14} />}
            {emailPref ? 'התראות במייל פעילות' : 'התרע במייל על התאמה'}
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
          <FilterField label="מפרסם">
            <select value={filters.posterType} onChange={update('posterType')}
              style={fieldInputStyle}>
              <option value="">הכל</option>
              <option value="private">פרטי בלבד</option>
              <option value="agency">תיווך בלבד</option>
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

      <div style={{ display: 'grid', gap: 10 }}>
        {orderedItems.map((l) => {
          const isMatched = !!l.topMatch || l.id === matchedListingId;
          const isDuplicated = !!l.duplicatedByMe;
          // Visual hierarchy: duplicated (already-acted) takes precedence
          // over matched (still-actionable). Both cases mirror the
          // התאמות פומביות card style — colored 1px border + soft shadow.
          const accent = isDuplicated ? DT.success
                       : isMatched   ? DT.gold
                       : null;
          const accentSoft = isDuplicated ? DT.successSoft
                           : isMatched   ? DT.goldSoft
                           : null;
          return (
          <article
            key={l.id}
            data-matched={isMatched ? 'true' : undefined}
            data-duplicated={isDuplicated ? 'true' : undefined}
            style={{
              background: DT.white,
              border: `1px solid ${accent || DT.border}`,
              borderRadius: 14,
              padding: 14,
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1fr) auto',
              gap: 14,
              alignItems: 'center',
              boxShadow: accent
                ? `0 4px 14px ${accentSoft.replace('0.08', '0.18').replace('0.12', '0.22')}`
                : '0 1px 0 rgba(30,26,20,0.03)',
            }}
          >
            <div style={{ minWidth: 0 }}>
              {/* Status badges row — match, duplicated, source, poster type */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginBottom: 6 }}>
                {isDuplicated && (
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    background: DT.success, color: DT.white,
                    fontSize: 10, fontWeight: 800, letterSpacing: 0.4,
                    padding: '2px 8px', borderRadius: 99,
                  }}>
                    <CheckCircle2 size={10} /> בנכסים שלך
                  </span>
                )}
                {isMatched && !isDuplicated && (
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    background: DT.gold, color: DT.white,
                    fontSize: 10, fontWeight: 800, letterSpacing: 0.4,
                    padding: '2px 8px', borderRadius: 99,
                  }}>
                    <Sparkles size={10} />
                    {l.topMatch
                      ? `מתאים לליד שלך · ${l.topMatch.score}/100`
                      : 'מתאים לליד שלך'}
                  </span>
                )}
                {l.source === 'yad2' && <Yad2Badge />}
                {l.kind && (
                  <span style={kindPillStyle}>
                    {l.kind === 'rent' ? 'להשכרה' : 'למכירה'}
                  </span>
                )}
                {l.posterType && (
                  <span style={{
                    ...kindPillStyle,
                    background: DT.cream2, color: DT.muted,
                  }}>
                    {l.posterType === 'agency'
                      ? <><Briefcase size={9} /> תיווך</>
                      : <><User size={9} /> פרטי</>}
                  </span>
                )}
              </div>
              <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {[l.street, l.neighborhood, l.city].filter(Boolean).join(' · ') || 'נכס'}
              </div>
              <div style={{ fontSize: 12, color: DT.muted, marginBottom: 6 }}>
                {[
                  l.propertyType,
                  l.rooms != null ? `${l.rooms} חד׳` : null,
                  l.sizeSqm != null ? `${l.sizeSqm} מ״ר` : null,
                  l.floor != null ? `קומה ${l.floor}` : null,
                ].filter(Boolean).join(' · ')}
              </div>
              <div style={{ display: 'flex', gap: 12, alignItems: 'baseline', flexWrap: 'wrap' }}>
                {l.price != null && (
                  <span style={{ fontSize: 18, fontWeight: 800, color: DT.gold }}>
                    {displayPriceShort(l.price)}
                    {l.kind === 'rent' && (
                      <span style={{ fontSize: 11, fontWeight: 600, color: DT.muted, marginInlineStart: 4 }}>
                        / חודש
                      </span>
                    )}
                  </span>
                )}
                {l.pricePerSqm != null && l.kind !== 'rent' && (
                  <span style={{ fontSize: 12, color: DT.muted }}>
                    {`₪${l.pricePerSqm.toLocaleString('he-IL')} / מ״ר`}
                  </span>
                )}
                <span style={{ fontSize: 11, color: DT.muted }}>
                  נראה לראשונה {relLabel(l.firstSeenAt)}
                </span>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 130 }}>
              <a
                href={l.originalUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  ...FONT, textDecoration: 'none', textAlign: 'center',
                  background: DT.cream2, color: DT.ink, border: `1px solid ${DT.border}`,
                  padding: '8px 10px', borderRadius: 10, fontSize: 12, fontWeight: 700,
                  display: 'inline-flex', gap: 6, alignItems: 'center', justifyContent: 'center',
                  minHeight: 40,
                }}
              >
                <ExternalLink size={13} /> פתח במקור
              </a>
              {isDuplicated ? (
                <button
                  type="button"
                  onClick={() => navigate(`/properties/${l.duplicatedByMe}/edit`)}
                  style={{
                    ...FONT, cursor: 'pointer', textAlign: 'center',
                    background: DT.success, color: DT.white, border: 'none',
                    padding: '8px 10px', borderRadius: 10, fontSize: 12, fontWeight: 800,
                    display: 'inline-flex', gap: 6, alignItems: 'center', justifyContent: 'center',
                    minHeight: 44, boxShadow: '0 4px 12px rgba(21,128,61,0.25)',
                  }}
                >
                  <CheckCircle2 size={13} /> פתח בנכסים שלי
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => duplicate(l.id)}
                  style={{
                    ...FONT, cursor: 'pointer', textAlign: 'center',
                    background: `linear-gradient(135deg, ${DT.gold}, ${DT.goldDark})`,
                    color: DT.ink, border: 'none',
                    padding: '8px 10px', borderRadius: 10, fontSize: 12, fontWeight: 800,
                    display: 'inline-flex', gap: 6, alignItems: 'center', justifyContent: 'center',
                    minHeight: 44, boxShadow: '0 4px 12px rgba(180,139,76,0.28)',
                  }}
                >
                  <CopyIcon size={13} /> שכפל לנכסים שלי
                </button>
              )}
            </div>
          </article>
          );
        })}
      </div>

      {/* Pagination — 10 per page. Hidden when there's only one
          page of results. Hebrew RTL: "previous" is the right
          chevron (towards the start of a Hebrew sentence) and
          "next" is the left chevron. */}
      {!loading && total > PAGE_SIZE && (
        <div style={{
          display: 'flex', justifyContent: 'center', alignItems: 'center',
          gap: 12, marginTop: 18,
        }}>
          <button
            type="button"
            onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
            disabled={offset === 0}
            style={paginationBtnStyle(offset === 0)}
          >
            <ChevronRight size={14} /> הקודם
          </button>
          <span style={{ fontSize: 12, color: DT.muted, fontWeight: 700 }}>
            עמוד {Math.floor(offset / PAGE_SIZE) + 1} מתוך {Math.max(1, Math.ceil(total / PAGE_SIZE))}
          </span>
          <button
            type="button"
            onClick={() => setOffset((o) => o + PAGE_SIZE)}
            disabled={offset + PAGE_SIZE >= total}
            style={paginationBtnStyle(offset + PAGE_SIZE >= total)}
          >
            הבא <ChevronLeft size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

function paginationBtnStyle(disabled) {
  return {
    fontFamily: 'Assistant, Heebo, -apple-system, sans-serif',
    cursor: disabled ? 'not-allowed' : 'pointer',
    background: '#fff',
    color: '#1e1a14',
    border: '1px solid rgba(30,26,20,0.08)',
    padding: '8px 14px',
    borderRadius: 10,
    fontSize: 13,
    fontWeight: 700,
    display: 'inline-flex',
    gap: 4,
    alignItems: 'center',
    minHeight: 40,
    opacity: disabled ? 0.4 : 1,
  };
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
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 0,
        height: 18, borderRadius: 4, overflow: 'hidden',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        fontSize: 11, fontWeight: 900, letterSpacing: 0.3,
        boxShadow: '0 1px 0 rgba(0,0,0,0.08)',
        verticalAlign: 'middle',
      }}
      aria-label="מקור: יד2"
    >
      <span style={{
        background: '#1f2937', color: '#fff',
        padding: '0 5px', height: '100%', display: 'inline-flex', alignItems: 'center',
      }}>yad</span>
      <span style={{
        background: '#fb923c', color: '#1f2937',
        padding: '0 5px', height: '100%', display: 'inline-flex', alignItems: 'center',
      }}>2</span>
    </span>
  );
}

const kindPillStyle = {
  display: 'inline-flex', alignItems: 'center', gap: 3,
  background: 'rgba(180,139,76,0.10)', color: '#7a5c2c',
  fontSize: 10, fontWeight: 700, letterSpacing: 0.2,
  padding: '2px 7px', borderRadius: 99,
};
