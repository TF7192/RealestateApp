// Sprint 10 — customisable team-stats dashboard. Renders below the
// scoreboard table on /team. 14 widget catalogue, agent picks any
// subset, drag-reorder + remove + reset. All numbers come from
// GET /api/team/stats — no mock data.
//
// Inline SVG bars / sparklines / donuts; we explicitly do NOT pull
// in a chart library (CLAUDE.md / no new deps).
//
// Layout persists per-user to localStorage. Default = 6 widgets.

import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, X, RotateCcw, GripVertical } from 'lucide-react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useViewportMobile } from '../hooks/mobile';
import Portal from './Portal';

const DT = {
  cream: '#f7f3ec', cream2: '#efe9df', cream3: '#e8dfcf', cream4: '#fbf7f0',
  white: '#ffffff', ink: '#1e1a14', muted: '#6b6356',
  gold: '#b48b4c', goldLight: '#d9b774', goldDark: '#7a5c2c',
  goldSoft: 'rgba(180,139,76,0.12)',
  border: 'rgba(30,26,20,0.08)',
  success: '#15803d', danger: '#b91c1c', info: '#2563eb',
};
const FONT = { fontFamily: 'Assistant, Heebo, -apple-system, sans-serif' };

const STORAGE_KEY = 'estia-team-stats-v1';
// 6-widget seed layout — covers the common questions an owner asks
// at a glance: where am I selling, asking-prices, lead heat, lead
// origin, deal-velocity, current-week activity.
const DEFAULT_LAYOUT = [
  'propsByCity', 'medianSale', 'leadTemp',
  'leadSources', 'weeklyDeals', 'newThisWeek',
];

// ─── Tiny SVG primitives (each ≤ 30 lines) ──────────────────────

function Bar({ items, max, color = DT.gold, hrefForItem }) {
  // Horizontal bar list. `items` is [{ label, value }]. `max` overrides
  // the auto-scaled max so multiple bars in a card share the same axis.
  const cap = max ?? Math.max(1, ...items.map((i) => i.value));
  return (
    <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 6 }}>
      {items.map((it) => {
        const pct = Math.max(2, Math.round((it.value / cap) * 100));
        const href = hrefForItem?.(it);
        const Row = (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
            <span style={{ minWidth: 80, color: DT.ink, fontWeight: 600, flexShrink: 0 }}>{it.label}</span>
            <div style={{ flex: 1, background: DT.cream2, borderRadius: 99, height: 8, position: 'relative' }}>
              <div style={{
                width: `${pct}%`, height: '100%', borderRadius: 99,
                background: `linear-gradient(180deg, ${DT.goldLight}, ${color})`,
              }} />
            </div>
            <span style={{ fontWeight: 700, color: DT.ink, minWidth: 36, textAlign: 'left', fontVariantNumeric: 'tabular-nums' }}>{it.value}</span>
          </div>
        );
        return (
          <li key={it.label}>
            {href ? <Link to={href} style={{ textDecoration: 'none' }}>{Row}</Link> : Row}
          </li>
        );
      })}
    </ul>
  );
}

function Sparkline({ points, width = 220, height = 48 }) {
  // Inline SVG path. `points` is a numeric array; we map evenly
  // across the width and scale Y to the data range.
  if (!points?.length) return <div style={{ height, color: DT.muted, fontSize: 12 }}>—</div>;
  const max = Math.max(...points, 1);
  const min = Math.min(...points, 0);
  const range = max - min || 1;
  const stepX = points.length === 1 ? 0 : width / (points.length - 1);
  const d = points.map((v, i) => {
    const x = i * stepX;
    const y = height - ((v - min) / range) * (height - 6) - 3;
    return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(' ');
  return (
    <svg width={width} height={height} style={{ overflow: 'visible' }}>
      <path d={d} fill="none" stroke={DT.gold} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
      <path d={`${d} L ${width} ${height} L 0 ${height} Z`} fill={DT.goldSoft} stroke="none" />
    </svg>
  );
}

function Donut({ segments, size = 96 }) {
  // segments: [{ label, value, color }]. Renders a donut + a centred
  // total. Falls back to a muted ring when there's no data.
  const total = segments.reduce((s, x) => s + x.value, 0);
  const r = size / 2 - 6;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size / 2} cy={size / 2} r={r} stroke={DT.cream2} strokeWidth={10} fill="none" />
      {total > 0 && segments.map((s, i) => {
        const len = (s.value / total) * c;
        const dasharray = `${len} ${c - len}`;
        const el = (
          <circle key={i} cx={size / 2} cy={size / 2} r={r}
            stroke={s.color} strokeWidth={10} fill="none"
            strokeDasharray={dasharray}
            strokeDashoffset={-offset}
            transform={`rotate(-90 ${size / 2} ${size / 2})`} />
        );
        offset += len;
        return el;
      })}
      <text x={size / 2} y={size / 2 + 5} textAnchor="middle"
        style={{ fontSize: 16, fontWeight: 800, fill: DT.ink, fontFamily: FONT.fontFamily }}>
        {total}
      </text>
    </svg>
  );
}

function KpiBig({ value, caption, delta, deltaLabel }) {
  return (
    <div style={{ display: 'grid', gap: 4 }}>
      <div style={{ fontSize: 28, fontWeight: 800, color: DT.ink, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </div>
      {caption && <div style={{ fontSize: 12, color: DT.muted }}>{caption}</div>}
      {typeof delta === 'number' && (
        <div style={{
          fontSize: 11, fontWeight: 700,
          color: delta > 0 ? DT.success : delta < 0 ? DT.danger : DT.muted,
        }}>
          {delta > 0 ? '▲' : delta < 0 ? '▼' : '·'} {Math.abs(delta)} {deltaLabel || ''}
        </div>
      )}
    </div>
  );
}

// ─── Format helpers ─────────────────────────────────────────────
function fmtPrice(n) {
  if (!n) return '₪0';
  if (n >= 1_000_000) return `₪${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `₪${Math.round(n / 1_000)}K`;
  return `₪${n}`;
}
function fmtPct(x) {
  if (x == null) return '—';
  return `${Math.round(x * 100)}%`;
}
const SOURCE_LABELS = {
  yad2: 'יד2', whatsapp: 'וואטסאפ', facebook: 'פייסבוק',
  manual: 'הזנה ידנית', referral: 'הפניה', site: 'אתר',
};
const STATUS_LABELS = { HOT: 'חם', WARM: 'פושר', COLD: 'קר' };

// ─── Widget catalogue ───────────────────────────────────────────
// Each entry has `kind` (stable id used in localStorage), `title`
// (Hebrew copy on the card), `tooltip` (small subtitle), and a
// `render(data)` function that returns the body. The picker modal
// reads this directly so adding a widget = appending one entry.
export const WIDGETS = [
  {
    kind: 'propsByCity',
    title: 'נכסים לפי עיר',
    tooltip: '10 הערים המובילות במלאי המשרד',
    render: (d) => {
      const items = (d.propertiesByCity || []).slice(0, 10).map((r) => ({ label: r.city, value: r.count }));
      if (items.length === 0) return <Empty />;
      return <Bar items={items} hrefForItem={(it) => `/properties?city=${encodeURIComponent(it.label)}`} />;
    },
  },
  {
    kind: 'medianSale',
    title: 'חציון מחיר מכירה לפי עיר',
    tooltip: 'נכסי מכירה פעילים, חציון בשקלים',
    render: (d) => <PriceTable rows={d.medianSalePriceByCity} />,
  },
  {
    kind: 'medianRent',
    title: 'חציון שכר חודשי לפי עיר',
    tooltip: 'נכסי השכרה פעילים, חציון בשקלים',
    render: (d) => <PriceTable rows={d.medianRentPriceByCity} />,
  },
  {
    kind: 'leadTemp',
    title: 'טמפרטורת לידים',
    tooltip: 'חלוקה לפי דירוג חום הליד',
    render: (d) => {
      const t = d.leadTemperature || { HOT: 0, WARM: 0, COLD: 0, unspecified: 0 };
      const total = (t.HOT || 0) + (t.WARM || 0) + (t.COLD || 0) + (t.unspecified || 0);
      if (!total) return <Empty />;
      const segs = [
        { key: 'HOT',  label: 'חם',    value: t.HOT,  color: DT.danger,
          href: '/customers?status=HOT' },
        { key: 'WARM', label: 'פושר',  value: t.WARM, color: DT.gold,
          href: '/customers?status=WARM' },
        { key: 'COLD', label: 'קר',    value: t.COLD, color: DT.info,
          href: '/customers?status=COLD' },
      ];
      return (
        <div style={{ display: 'grid', gap: 10 }}>
          <div style={{ display: 'flex', height: 12, borderRadius: 99, overflow: 'hidden', background: DT.cream2 }}>
            {segs.map((s) => (
              <Link key={s.key} to={s.href} title={`${s.label}: ${s.value}`}
                style={{
                  width: total ? `${(s.value / total) * 100}%` : 0,
                  background: s.color,
                }} />
            ))}
          </div>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 4, fontSize: 12 }}>
            {segs.map((s) => (
              <li key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: s.color, flexShrink: 0 }} />
                <Link to={s.href} style={{ color: DT.ink, textDecoration: 'none', fontWeight: 600, flex: 1 }}>
                  {s.label}
                </Link>
                <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{s.value}</span>
              </li>
            ))}
            {t.unspecified ? (
              <li style={{ display: 'flex', alignItems: 'center', gap: 8, color: DT.muted }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: DT.cream3, flexShrink: 0 }} />
                <span style={{ flex: 1 }}>ללא דירוג</span>
                <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{t.unspecified}</span>
              </li>
            ) : null}
          </ul>
        </div>
      );
    },
  },
  {
    kind: 'leadSources',
    title: 'מקור לידים',
    tooltip: 'מאיפה הגיעו הלידים האחרונים',
    render: (d) => {
      const items = (d.leadSources || []).slice(0, 8).map((r) => ({
        label: SOURCE_LABELS[r.source] || r.source, value: r.count,
      }));
      if (items.length === 0) return <Empty />;
      return <Bar items={items} />;
    },
  },
  {
    kind: 'rooms',
    title: 'חדרים במלאי',
    tooltip: 'התפלגות חדרים בכל הנכסים הפעילים',
    render: (d) => {
      const items = (d.roomsDistribution || []).map((r) => ({ label: `${r.rooms} חד'`, value: r.count }));
      if (!items.some((i) => i.value)) return <Empty />;
      return <Bar items={items} />;
    },
  },
  {
    kind: 'priceBands',
    title: 'טווחי מחיר נכסים',
    tooltip: 'התפלגות מחירי שיווק במלאי',
    render: (d) => {
      const items = (d.priceBands || []).map((r) => ({ label: r.band, value: r.count }));
      if (!items.some((i) => i.value)) return <Empty />;
      return <Bar items={items} />;
    },
  },
  {
    kind: 'weeklyDeals',
    title: 'עסקאות חתומות — 12 שבועות',
    tooltip: 'מספר עסקאות שנחתמו בכל שבוע',
    render: (d) => {
      const series = d.weeklySignedDeals || [];
      const counts = series.map((w) => w.count);
      const total = counts.reduce((s, n) => s + n, 0);
      if (!total) return <Empty />;
      return (
        <div style={{ display: 'grid', gap: 8 }}>
          <Sparkline points={counts} width={300} height={56} />
          <div style={{ display: 'flex', gap: 12, fontSize: 12, color: DT.muted, justifyContent: 'space-between' }}>
            <span>סה״כ {total} עסקאות</span>
            <Link to="/deals?tab=signed" style={{ color: DT.gold, textDecoration: 'none', fontWeight: 700 }}>פתח עסקאות</Link>
          </div>
        </div>
      );
    },
  },
  {
    kind: 'commissionsYtd',
    title: 'עמלות מצטברות',
    tooltip: 'מתחילת השנה הקלנדרית',
    render: (d) => <KpiBig value={fmtPrice(d.totalCommissionsYtd || 0)} caption="YTD לפי עסקאות חתומות" />,
  },
  {
    kind: 'topReferrers',
    title: 'מרפרים מובילים לדפי נחיתה',
    tooltip: 'דומיין שממנו הגיעו הצופים',
    render: (d) => {
      const items = (d.topReferrers || []).map((r) => ({ label: r.host, value: r.count }));
      if (items.length === 0) return <Empty hint="אין צפיות עדיין" />;
      return <Bar items={items} />;
    },
  },
  {
    kind: 'inquiryConv',
    title: 'המרת פניות → לידים',
    tooltip: 'יחס בין פניות למודעות לבין לידים בפועל',
    render: (d) => (
      <KpiBig
        value={fmtPct(d.inquiryToLeadConvRate)}
        caption="פניות שהפכו ללידים אקטיביים"
      />
    ),
  },
  {
    kind: 'avgDays',
    title: 'ממוצע ימים עד חתימה',
    tooltip: 'מהיצירה ועד תאריך החתימה',
    render: (d) => (
      <KpiBig
        value={d.avgDaysToSign != null ? `${d.avgDaysToSign}` : '—'}
        caption={d.avgDaysToSign != null ? 'ימים בממוצע' : 'אין עדיין עסקאות חתומות'}
      />
    ),
  },
  {
    kind: 'assetSplit',
    title: 'מגורים מול מסחרי',
    tooltip: 'חלוקה של המלאי לפי סוג נכס',
    render: (d) => {
      const a = d.assetClassSplit || { residential: 0, commercial: 0 };
      const total = a.residential + a.commercial;
      if (!total) return <Empty />;
      return (
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'auto 1fr', alignItems: 'center' }}>
          <Donut segments={[
            { label: 'מגורים', value: a.residential, color: DT.gold },
            { label: 'מסחרי', value: a.commercial,   color: DT.goldDark },
          ]} />
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 6, fontSize: 12 }}>
            <li style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: DT.gold }} />
              <span style={{ flex: 1, color: DT.ink, fontWeight: 600 }}>מגורים</span>
              <span style={{ fontWeight: 700 }}>{a.residential}</span>
            </li>
            <li style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: DT.goldDark }} />
              <span style={{ flex: 1, color: DT.ink, fontWeight: 600 }}>מסחרי</span>
              <span style={{ fontWeight: 700 }}>{a.commercial}</span>
            </li>
          </ul>
        </div>
      );
    },
  },
  {
    kind: 'newThisWeek',
    title: 'חדש השבוע',
    tooltip: 'נוסף מאז יום שני האחרון',
    render: (d) => {
      const tw = d.newThisWeek || { leads: 0, properties: 0 };
      const lw = d.newLastWeek || { leads: 0, properties: 0 };
      return (
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' }}>
          <KpiBig value={tw.leads} caption="לידים חדשים"
            delta={tw.leads - lw.leads} deltaLabel="מהשבוע שעבר" />
          <KpiBig value={tw.properties} caption="נכסים חדשים"
            delta={tw.properties - lw.properties} deltaLabel="מהשבוע שעבר" />
        </div>
      );
    },
  },
];

const WIDGET_BY_KIND = Object.fromEntries(WIDGETS.map((w) => [w.kind, w]));

function Empty({ hint = 'אין עדיין נתונים' }) {
  return <div style={{ color: DT.muted, fontSize: 12, padding: '14px 0', textAlign: 'center' }}>{hint}</div>;
}

function PriceTable({ rows }) {
  const list = rows || [];
  if (list.length === 0) return <Empty />;
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
      <thead>
        <tr style={{ color: DT.muted, fontSize: 11, textAlign: 'right' }}>
          <th style={{ padding: '4px 0', fontWeight: 700 }}>עיר</th>
          <th style={{ padding: '4px 0', fontWeight: 700, textAlign: 'left' }}>חציון</th>
          <th style={{ padding: '4px 0', fontWeight: 700, textAlign: 'left' }}>כמות נכסים</th>
        </tr>
      </thead>
      <tbody>
        {list.map((r) => (
          <tr key={r.city} style={{ borderTop: `1px solid ${DT.border}` }}>
            <td style={{ padding: '6px 0', fontWeight: 600 }}>{r.city}</td>
            <td style={{ padding: '6px 0', textAlign: 'left', fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>{fmtPrice(r.median)}</td>
            <td style={{ padding: '6px 0', textAlign: 'left', color: DT.muted }}>{r.count}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ─── Persistence helpers ────────────────────────────────────────
function readLayout() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_LAYOUT.slice();
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.widgets)) {
      const valid = parsed.widgets.filter((k) => WIDGET_BY_KIND[k]);
      return valid.length ? valid : DEFAULT_LAYOUT.slice();
    }
  } catch { /* ignore */ }
  return DEFAULT_LAYOUT.slice();
}
function writeLayout(widgets) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ widgets })); } catch { /* ignore */ }
}

// ─── Main component ─────────────────────────────────────────────
export default function TeamStatsDashboard({ data }) {
  const [widgets, setWidgets] = useState(() => readLayout());
  const [pickerOpen, setPickerOpen] = useState(false);
  const isMobile = useViewportMobile(820);

  useEffect(() => { writeLayout(widgets); }, [widgets]);

  const addWidget = (kind) => {
    setWidgets((prev) => prev.includes(kind) ? prev : [...prev, kind]);
    setPickerOpen(false);
  };
  const removeWidget = (kind) => setWidgets((prev) => prev.filter((k) => k !== kind));
  const resetLayout = () => setWidgets(DEFAULT_LAYOUT.slice());
  const reorder = (from, to) => {
    setWidgets((prev) => {
      if (from === to || from < 0 || to < 0 || from >= prev.length || to >= prev.length) {
        return prev;
      }
      const next = prev.slice();
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  };

  return (
    <section style={{ ...FONT, marginTop: 28 }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 14, gap: 12, flexWrap: 'wrap',
      }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0, letterSpacing: -0.4, color: DT.ink }}>
            סטטיסטיקות צוות
          </h2>
          <div style={{ fontSize: 12, color: DT.muted, marginTop: 2 }}>
            ניתן להוסיף, להסיר ולסדר ויג'טים — הפריסה נשמרת אוטומטית.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" onClick={() => setPickerOpen(true)}
            style={{
              ...FONT,
              background: `linear-gradient(180deg, ${DT.goldLight}, ${DT.gold})`,
              color: DT.ink, border: 'none',
              padding: '9px 14px', borderRadius: 10,
              fontSize: 13, fontWeight: 800, cursor: 'pointer',
              display: 'inline-flex', gap: 6, alignItems: 'center',
              boxShadow: '0 4px 10px rgba(180,139,76,0.25)',
            }}>
            <Plus size={14} /> הוסף גרף
          </button>
          <button type="button" onClick={resetLayout}
            style={{
              ...FONT, background: 'transparent', color: DT.muted,
              border: `1px solid ${DT.border}`,
              padding: '9px 14px', borderRadius: 10,
              fontSize: 12, fontWeight: 700, cursor: 'pointer',
              display: 'inline-flex', gap: 6, alignItems: 'center',
            }}>
            <RotateCcw size={13} /> אפס פריסה
          </button>
        </div>
      </div>

      {widgets.length === 0 ? (
        <div style={{
          background: DT.cream4, border: `1px dashed ${DT.border}`, borderRadius: 14,
          padding: 32, textAlign: 'center',
        }}>
          <div style={{ fontSize: 14, color: DT.muted, marginBottom: 10 }}>
            עדיין לא נוסף ויג'ט. בחרו מה להציג כאן.
          </div>
          <button type="button" onClick={() => setPickerOpen(true)}
            style={{
              ...FONT,
              background: `linear-gradient(180deg, ${DT.goldLight}, ${DT.gold})`,
              color: DT.ink, border: 'none',
              padding: '10px 18px', borderRadius: 10,
              fontSize: 13, fontWeight: 800, cursor: 'pointer',
              display: 'inline-flex', gap: 6, alignItems: 'center',
            }}>
            <Plus size={14} /> הוסף גרף ראשון
          </button>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: 14,
        }}>
          {widgets.map((kind, i) => {
            const w = WIDGET_BY_KIND[kind];
            if (!w) return null;
            return (
              <WidgetCard
                key={kind}
                widget={w}
                data={data}
                index={i}
                onRemove={() => removeWidget(kind)}
                onReorder={reorder}
                draggable={!isMobile}
              />
            );
          })}
        </div>
      )}

      {pickerOpen && (
        <PickerModal
          activeKinds={widgets}
          onPick={addWidget}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </section>
  );
}

function WidgetCard({ widget, data, index, onRemove, onReorder, draggable }) {
  const onDragStart = (e) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
  };
  const onDragOver = (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; };
  const onDrop = (e) => {
    e.preventDefault();
    const from = Number(e.dataTransfer.getData('text/plain'));
    if (!Number.isNaN(from) && from !== index) onReorder(from, index);
  };
  return (
    <div
      onDragOver={draggable ? onDragOver : undefined}
      onDrop={draggable ? onDrop : undefined}
      style={{
        background: DT.white,
        border: `1px solid ${DT.border}`,
        borderRadius: 14,
        padding: 16,
        position: 'relative',
        display: 'grid',
        gap: 12,
        gridTemplateRows: 'auto 1fr',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        {draggable && (
          <button type="button" draggable
            onDragStart={onDragStart}
            aria-label="גרור לסידור"
            title="גרור לסידור"
            style={{
              ...FONT, background: 'transparent', border: 'none',
              cursor: 'grab', color: DT.muted, padding: 0, lineHeight: 0,
            }}>
            <GripVertical size={16} />
          </button>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: DT.ink }}>{widget.title}</div>
          {widget.tooltip && (
            <div style={{ fontSize: 11, color: DT.muted, marginTop: 2 }}>{widget.tooltip}</div>
          )}
        </div>
        <button type="button" onClick={onRemove}
          aria-label={`הסר ${widget.title}`} title="הסר ויג'ט"
          style={{
            ...FONT, background: 'transparent', border: 'none',
            color: DT.muted, cursor: 'pointer', padding: 4, borderRadius: 6,
            lineHeight: 0,
          }}>
          <X size={14} />
        </button>
      </div>
      <div style={{ minHeight: 0 }}>{widget.render(data || {})}</div>
    </div>
  );
}

function PickerModal(props) {
  return <Portal><PickerModalInner {...props} /></Portal>;
}
function PickerModalInner({ activeKinds, onPick, onClose }) {
  const panelRef = useRef(null);
  useFocusTrap(panelRef, { onEscape: onClose });
  return (
    <div
      role="presentation"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(30,26,20,0.6)',
        display: 'grid', placeItems: 'center', padding: 16,
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="הוסף ויג'ט"
        style={{
          ...FONT,
          background: DT.cream, color: DT.ink,
          borderRadius: 16, padding: 22,
          width: 'min(640px, 100%)',
          maxHeight: '85vh', overflowY: 'auto',
          border: `1px solid ${DT.border}`,
          boxShadow: '0 14px 50px rgba(30,26,20,0.18)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>הוסף ויג'ט</div>
            <div style={{ fontSize: 12, color: DT.muted, marginTop: 2 }}>בחרו מה להוסיף לדשבורד הצוות</div>
          </div>
          <button type="button" onClick={onClose} aria-label="סגור"
            style={{
              ...FONT, background: DT.white, border: `1px solid ${DT.border}`,
              padding: 8, borderRadius: 8, cursor: 'pointer', lineHeight: 0,
            }}>
            <X size={14} />
          </button>
        </div>
        <div style={{
          display: 'grid', gap: 10,
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        }}>
          {WIDGETS.map((w) => {
            const already = activeKinds.includes(w.kind);
            return (
              <button
                key={w.kind}
                type="button"
                onClick={() => !already && onPick(w.kind)}
                disabled={already}
                title={already ? 'כבר במסך' : w.tooltip}
                style={{
                  ...FONT,
                  textAlign: 'right',
                  background: already ? DT.cream2 : DT.white,
                  color: already ? DT.muted : DT.ink,
                  border: `1px solid ${already ? DT.border : DT.gold}`,
                  borderRadius: 10, padding: 12,
                  cursor: already ? 'not-allowed' : 'pointer',
                  display: 'grid', gap: 4,
                  opacity: already ? 0.65 : 1,
                }}
              >
                <span style={{ fontSize: 13, fontWeight: 800 }}>{w.title}</span>
                <span style={{ fontSize: 11, color: DT.muted }}>
                  {already ? 'כבר במסך' : w.tooltip}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// Suppress unused-import warning if status labels go unused for now —
// reserved for a future card variant.
void STATUS_LABELS;
