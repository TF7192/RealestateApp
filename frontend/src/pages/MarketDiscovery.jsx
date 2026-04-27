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
  Sparkles, ArrowUpDown,
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

const SORTS = [
  { value: 'firstSeenAt-desc', label: 'נראה לראשונה — חדש לישן' },
  { value: 'price-asc',        label: 'מחיר — מהזול ליקר' },
  { value: 'price-desc',       label: 'מחיר — מהיקר לזול' },
  { value: 'pricePerSqm-asc',  label: 'מחיר למ״ר — נמוך לגבוה' },
];

function buildQuery(filters, sort) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) {
    if (v === '' || v == null) continue;
    params.set(k, v);
  }
  if (sort) params.set('sort', sort);
  const q = params.toString();
  return q ? `?${q}` : '';
}

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
    minPrice: '', maxPrice: '',
    minRooms: '', maxRooms: '',
    minSqm: '', maxSqm: '',
    status: 'active',
  });
  const [sort, setSort] = useState('firstSeenAt-desc');
  const navigate = useNavigate();
  const toast = useToast();

  // Fetch the latest scan summary for the "נסרק לפני X" header. Don't
  // gate the rest of the page on it — if the watcher never ran (dev,
  // fresh deploy) the page should still render the empty state.
  useEffect(() => {
    let cancelled = false;
    api.get('/market-discovery/last-scan').then(
      (res) => { if (!cancelled) setLastScan(res?.run || null); },
      () => { /* tolerate failure — header just hides */ },
    );
    return () => { cancelled = true; };
  }, []);

  // Match deep-link from a Notification: ?match=:id. Fetch the match,
  // surface a "מתאים לליד שלך" banner with the lead context, and mark
  // the match as `viewed`. The endpoint is idempotent — refreshing the
  // page doesn't re-bump the status from `dismissed`/`duplicated`.
  useEffect(() => {
    if (!matchId) { setMatchContext(null); return undefined; }
    let cancelled = false;
    api.get(`/market-discovery/match/${matchId}`).then(
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
    api.get(`/market-discovery/listings${buildQuery(filters, sort)}`).then(
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
      minPrice: '', maxPrice: '',
      minRooms: '', maxRooms: '',
      minSqm: '', maxSqm: '',
      status: 'active',
    });

  const activeFilterCount = useMemo(() => {
    return Object.entries(filters).filter(([k, v]) =>
      v !== '' && !(k === 'status' && v === 'active'),
    ).length;
  }, [filters]);

  const duplicate = async (listingId) => {
    try {
      const body = matchId ? { matchId } : {};
      const res = await api.post(`/market-discovery/listings/${listingId}/duplicate`, body);
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

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
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
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            aria-label="מיון"
            style={{
              ...FONT, padding: '10px 12px', borderRadius: 10,
              border: `1px solid ${DT.border}`, background: DT.white,
              fontSize: 13, fontWeight: 700, color: DT.ink, minHeight: 44,
            }}
          >
            {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
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
          body={
            activeFilterCount > 0
              ? 'נסה/י להרחיב את הסינון, או נקה אותו.'
              : 'הסורק רץ פעם בשעה ויאסוף מודעות חדשות מ-Yad2 ומקורות נוספים. חזור/חזרי אחר כך.'
          }
        />
      )}

      <div style={{ display: 'grid', gap: 10 }}>
        {orderedItems.map((l) => (
          <article
            key={l.id}
            data-matched={l.id === matchedListingId ? 'true' : undefined}
            style={{
              background: DT.white,
              border: l.id === matchedListingId
                ? `2px solid ${DT.success}`
                : `1px solid ${DT.border}`,
              borderRadius: 14,
              padding: 14,
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1fr) auto',
              gap: 14,
              alignItems: 'center',
            }}
          >
            <div style={{ minWidth: 0 }}>
              {l.id === matchedListingId && (
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  background: DT.success, color: DT.white,
                  fontSize: 10, fontWeight: 800, letterSpacing: 0.4,
                  padding: '2px 8px', borderRadius: 99, marginBottom: 6,
                }}>
                  <Sparkles size={10} /> מתאים לליד שלך
                </div>
              )}
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
                  </span>
                )}
                {l.pricePerSqm != null && (
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
            </div>
          </article>
        ))}
      </div>
    </div>
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
