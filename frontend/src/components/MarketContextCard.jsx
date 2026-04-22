import { useCallback, useEffect, useMemo, useState } from 'react';
import { TrendingUp, RefreshCw, Home, Key, AlertCircle, ExternalLink, Loader2 } from 'lucide-react';
import api from '../lib/api';
import { useToast } from '../lib/toast';
import { displayPrice } from '../lib/display';
import { relativeDate } from '../lib/relativeDate';
import { startRefresh, subscribeMarketScan, getScanFor } from '../lib/marketScanStore';
import './MarketContextCard.css';

// Market-context card on PropertyDetail.
//
// Pulls recent transactions for the property's street from
// nadlan.gov.il, both purchases and rents. The data is on-demand:
// agents click "רענן נתוני שוק" to fire a Playwright crawl on the
// backend (5–20s wait). Once fetched, results are cached 24h, so
// repeat clicks return instantly.
//
// Two tabs (קנייה / השכרה) — same UI, different `kind`. Each tab
// remembers its own freshness independently.

const KIND_LABEL = {
  buy: 'קנייה',
  rent: 'השכרה',
};

function inferKindDefault(category) {
  return category === 'RENT' ? 'rent' : 'buy';
}

export default function MarketContextCard({ propertyId, propertyCategory, propertyStreet, propertyCity }) {
  const toast = useToast();
  const [kind, setKind] = useState(() => inferKindDefault(propertyCategory));
  // Per-kind state: { loading, refreshing, data, error }
  const [byKind, setByKind] = useState({});
  const state = byKind[kind] || { loading: false, refreshing: false, data: null, error: null };

  const setKindState = useCallback((k, patch) => {
    setByKind((prev) => ({ ...prev, [k]: { ...(prev[k] || {}), ...patch } }));
  }, []);

  // On mount + on kind switch: silently fetch the cached row. Never
  // block the UI — the card shows its CTA empty state immediately,
  // and if there's cached data it swaps in when the fetch resolves.
  //
  // The earlier version watched `byKind` in deps which re-ran the
  // effect on every state write, relying on a guard to bail — any
  // glitch in that guard put the card into an infinite fetch loop
  // and left the agent staring at "טוען…" before they ever clicked.
  // Tracking completion in a ref keeps the effect's deps minimal.
  const loadedKindsRef = useRef(new Set());
  useEffect(() => {
    if (!propertyId) return;
    const mark = `${propertyId}:${kind}`;
    if (loadedKindsRef.current.has(mark)) return;
    loadedKindsRef.current.add(mark);
    let cancelled = false;
    (async () => {
      try {
        const res = await api.marketContextGet(propertyId, kind);
        if (cancelled) return;
        setKindState(kind, { data: res || null });
      } catch {
        if (cancelled) return;
        // Silent — cached fetch failing isn't worth a visible error.
        // The CTA still works; the agent can pull fresh data.
      }
    })();
    return () => { cancelled = true; };
  }, [propertyId, kind, setKindState]);

  // Subscribe to the global market-scan store so the button state /
  // spinner reflect an in-flight crawl even if the agent navigated away
  // and back (or triggered the same scan from elsewhere).
  const [scanTick, setScanTick] = useState(0);
  useEffect(() => subscribeMarketScan(() => setScanTick((t) => t + 1)), []);
  const scanEntry = propertyId ? getScanFor(propertyId, kind) : null;
  const scanning  = scanEntry?.status === 'running';

  const handleRefresh = useCallback(async () => {
    setKindState(kind, { error: null });
    try {
      // Async job — store handles polling + the completion event. The
      // card just shows "running" while scanning === true and surfaces
      // the result when the store resolves.
      const res = await startRefresh(propertyId, kind);
      setKindState(kind, { refreshing: false, data: res });
      toast.success(res?.cached ? 'הנתונים עדיין טריים — מוצגים מהמטמון' : 'הנתונים התעדכנו');
    } catch (e) {
      setKindState(kind, { refreshing: false, error: e?.message || 'הבקשה נכשלה' });
      toast.error(e?.message || 'שליפת נתוני השוק נכשלה');
    }
  }, [propertyId, kind, setKindState, toast]);
  // Keep scanTick referenced so lint doesn't flag it unused. The tick
  // is the state handle that forces a re-render when the store changes.
  void scanTick;

  const deals = state.data?.payload?.deals || [];
  const stats = useMemo(() => computeStats(deals), [deals]);
  const sparkData = useMemo(() => buildSparkSeries(deals), [deals]);
  const fetchedRel = state.data?.fetchedAt
    ? relativeDate(state.data.fetchedAt)?.label || ''
    : '';

  return (
    <section className="market-card" aria-label="נתוני שוק">
      <header className="market-card-head">
        <div className="market-card-title">
          <TrendingUp size={18} aria-hidden="true" />
          <h3>נתוני שוק לרחוב</h3>
        </div>
        <div className="market-card-actions">
          <div className="market-tabs" role="tablist" aria-label="סוג עסקה">
            <button
              role="tab"
              type="button"
              className={`market-tab ${kind === 'buy' ? 'is-active' : ''}`}
              aria-selected={kind === 'buy'}
              onClick={() => setKind('buy')}
            >
              <Home size={14} aria-hidden="true" />
              <span>קנייה</span>
            </button>
            <button
              role="tab"
              type="button"
              className={`market-tab ${kind === 'rent' ? 'is-active' : ''}`}
              aria-selected={kind === 'rent'}
              onClick={() => setKind('rent')}
            >
              <Key size={14} aria-hidden="true" />
              <span>השכרה</span>
            </button>
          </div>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={handleRefresh}
            disabled={scanning || state.loading}
            title="שליפת עסקאות אחרונות מ-nadlan.gov.il"
          >
            {scanning
              ? <Loader2 size={14} className="spin" aria-hidden="true" />
              : <RefreshCw size={14} aria-hidden="true" />}
            <span>{scanning ? 'שולף נתונים…' : (state.data ? 'רענן' : 'משוך נתונים')}</span>
          </button>
        </div>
      </header>

      <p className="market-source">
        מקור: <a href="https://www.nadlan.gov.il/" target="_blank" rel="noopener noreferrer">
          nadlan.gov.il <ExternalLink size={11} aria-hidden="true" />
        </a>
        {' · '}
        רחוב: <strong>{propertyStreet || '—'}{propertyCity ? `, ${propertyCity}` : ''}</strong>
        {fetchedRel && state.data && (
          <> · עודכן <time>{fetchedRel}</time></>
        )}
      </p>

      {scanning && (
        <div className="market-running" role="status" aria-live="polite">
          <Loader2 size={14} className="spin" aria-hidden="true" />
          <span>
            שולף נתוני עסקאות אחרונות מ-nadlan.gov.il — זה יכול לקחת עד דקה.
            אפשר להמשיך לעבוד, תישלח התראה בסיום.
          </span>
        </div>
      )}

      {state.error && (
        <div className="market-error" role="alert">
          <AlertCircle size={14} aria-hidden="true" />
          <span>{state.error}</span>
          {/* P-14 — retry is a first-class affordance inside the error
              panel so agents don't have to hunt for the refresh button
              in the header when a scrape fails. */}
          <button
            type="button"
            className="btn btn-ghost btn-sm market-retry"
            onClick={handleRefresh}
            disabled={scanning}
          >
            <RefreshCw size={13} aria-hidden="true" />
            נסה שוב
          </button>
        </div>
      )}

      {state.loading && !state.data ? (
        <div className="market-empty">טוען…</div>
      ) : !state.data ? (
        <div className="market-empty">
          לא נשלפו עדיין נתונים מ-nadlan.gov.il עבור {KIND_LABEL[kind]}.{' '}
          לחיצה על &quot;משוך נתונים&quot; תפתח דפדפן ברקע ותביא את העסקאות האחרונות לרחוב הזה.
        </div>
      ) : deals.length === 0 ? (
        <div className="market-empty">
          לא נמצאו עסקאות {KIND_LABEL[kind]} לרחוב הזה.
          {state.data?.payload?.error && (
            <> <span className="market-empty-hint">({state.data.payload.error})</span></>
          )}
        </div>
      ) : (
        <>
          <div className="market-kpis">
            <Kpi label="עסקאות" value={String(deals.length)} />
            <Kpi label="חציון מחיר" value={stats.medianPrice ? displayPrice(stats.medianPrice) : '—'} />
            <Kpi label={kind === 'rent' ? '₪/חודש לחדר' : '₪/מ״ר חציון'}
                 value={stats.medianPerSqm ? `₪${stats.medianPerSqm.toLocaleString('he-IL')}` : '—'} />
            <Kpi label="טווח" value={stats.range || '—'} />
          </div>

          {sparkData.length > 1 && (
            <div className="market-spark" aria-label="גרף מחירים לאורך זמן">
              <Sparkline points={sparkData} />
              <div className="market-spark-axis">
                <span>{sparkData[0].label}</span>
                <span>{sparkData[sparkData.length - 1].label}</span>
              </div>
            </div>
          )}

          <div className="market-table-wrap">
            <table className="market-table">
              <thead>
                <tr>
                  <th>תאריך</th>
                  <th>כתובת</th>
                  <th className="cell-num">חד׳</th>
                  <th className="cell-num">מ״ר</th>
                  <th className="cell-num">קומה</th>
                  <th className="cell-num">מחיר</th>
                  <th className="cell-num">₪/מ״ר</th>
                </tr>
              </thead>
              <tbody>
                {deals.slice(0, 20).map((d, i) => (
                  <tr key={i}>
                    <td>{formatDealDate(d.dealDate)}</td>
                    <td>{d.street || '—'}</td>
                    <td className="cell-num">{d.rooms ?? '—'}</td>
                    <td className="cell-num">{d.sqm ?? '—'}</td>
                    <td className="cell-num">{d.floor ?? '—'}</td>
                    <td className="cell-num"><strong>{d.price ? displayPrice(d.price) : '—'}</strong></td>
                    <td className="cell-num">{d.pricePerSqm ? `₪${Number(d.pricePerSqm).toLocaleString('he-IL')}` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

function Kpi({ label, value }) {
  return (
    <div className="market-kpi">
      <span className="market-kpi-label">{label}</span>
      <strong className="market-kpi-value">{value}</strong>
    </div>
  );
}

function median(arr) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

function computeStats(deals) {
  const prices = deals.map((d) => d.price).filter((n) => Number.isFinite(n));
  const perSqm = deals.map((d) => d.pricePerSqm).filter((n) => Number.isFinite(n));
  const dates = deals
    .map((d) => parseDealDate(d.dealDate))
    .filter(Boolean)
    .sort((a, b) => a - b);
  const range = dates.length > 1
    ? `${formatYearMonth(dates[0])} – ${formatYearMonth(dates[dates.length - 1])}`
    : null;
  return {
    medianPrice: median(prices),
    medianPerSqm: median(perSqm),
    range,
  };
}

function buildSparkSeries(deals) {
  // Group deals by year-month, take median price per month, sort.
  const buckets = new Map();
  for (const d of deals) {
    const t = parseDealDate(d.dealDate);
    if (!t || !Number.isFinite(d.price)) continue;
    const k = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}`;
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(d.price);
  }
  return Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, prices]) => ({ label: k, value: median(prices) }));
}

function Sparkline({ points }) {
  const W = 600;
  const H = 80;
  const PAD = 4;
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(1, max - min);
  const xStep = (W - PAD * 2) / Math.max(1, points.length - 1);
  const yFor = (v) => PAD + (1 - (v - min) / span) * (H - PAD * 2);
  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${PAD + i * xStep} ${yFor(p.value)}`).join(' ');
  const area = `M ${PAD} ${H - PAD} ${points.map((p, i) => `L ${PAD + i * xStep} ${yFor(p.value)}`).join(' ')} L ${PAD + (points.length - 1) * xStep} ${H - PAD} Z`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="market-spark-svg" aria-hidden="true">
      <defs>
        <linearGradient id="market-spark-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#b48b4c" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#b48b4c" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#market-spark-grad)" />
      <path d={d} fill="none" stroke="#8a6932" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function parseDealDate(s) {
  if (!s) return null;
  // Accept ISO, dd/mm/yyyy, dd-mm-yyyy, yyyy-mm-dd.
  if (s instanceof Date) return Number.isNaN(s.getTime()) ? null : s;
  const iso = new Date(s);
  if (!Number.isNaN(iso.getTime())) return iso;
  const m = String(s).match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  return null;
}

function formatDealDate(s) {
  const t = parseDealDate(s);
  if (!t) return s || '—';
  return t.toLocaleDateString('he-IL');
}

function formatYearMonth(t) {
  return t.toLocaleDateString('he-IL', { month: 'short', year: 'numeric' });
}
