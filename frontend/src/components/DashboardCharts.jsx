// DashboardCharts — five at-a-glance visualisations for /dashboard.
// Each one is wrapped in a DCard-shaped container and answers a
// concrete question the agent should ask themselves daily:
//
//   1. PipelineDonut          — "Where is my deal volume sitting?"
//   2. LeadSourceDonut        — "Which channel is feeding me leads?"
//   3. MatchCoverageGauge     — "Am I serving my pipeline?"
//   4. DaysOnMarketBar        — "Which listings are stale?"
//   5. SilenceBucketsBar      — "Who am I about to lose to silence?"
//
// All five compute client-side from data already fetched on /dashboard
// (leads, properties, deals). No new API calls.
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  RadialBarChart, RadialBar, PolarAngleAxis,
} from 'recharts';

const TOK = {
  ink: '#1e1a14', muted: '#6b6356',
  cream4: '#fbf7f0',
  gold: '#b48b4c', goldLight: '#d9b774', goldDark: '#7a5c2c',
  goldSoft: 'rgba(180,139,76,0.12)',
  border: 'rgba(30,26,20,0.08)',
  hot: '#b91c1c', warm: '#b45309', cold: '#475569',
  success: '#15803d',
};

// Hebrew label for any deal status. Includes legacy uppercase enums
// + the lowercase variants the API has returned at various points.
const DEAL_STAGE_LABELS = {
  NEW:         'חדשה',
  NEGOTIATION: 'במשא ומתן',
  OFFER:       'הצעה פתוחה',
  CONTRACT:    'בחתימת חוזה',
  CLOSED:      'נסגרה',
  LOST:        'נפלה',
};
const DEAL_STAGE_ORDER = ['NEW', 'NEGOTIATION', 'OFFER', 'CONTRACT', 'CLOSED'];
const DEAL_STAGE_COLORS = {
  NEW:         '#a8a39a',
  NEGOTIATION: TOK.warm,
  OFFER:       TOK.gold,
  CONTRACT:    TOK.goldDark,
  CLOSED:      TOK.success,
};

const cardShell = {
  background: '#fff', border: `1px solid ${TOK.border}`,
  borderRadius: 14, padding: 18, minHeight: 220,
};
const titleStyle = {
  fontSize: 15, fontWeight: 800, color: TOK.ink,
  marginBottom: 4,
};
const subStyle = {
  fontSize: 12, color: TOK.muted, marginBottom: 12,
};

// ──────────────────────────────────────────────────────────────────
// 1. PipelineDonut — replaces the previous "צינור עסקאות" list card.
// ──────────────────────────────────────────────────────────────────
export function PipelineDonut({ deals = [] }) {
  const data = useMemo(() => {
    const buckets = {};
    for (const d of deals) {
      const k = (d.status || d.stage || 'NEW').toUpperCase();
      buckets[k] = (buckets[k] || 0) + 1;
    }
    return DEAL_STAGE_ORDER
      .filter((k) => buckets[k] > 0)
      .map((k) => ({
        key: k,
        name: DEAL_STAGE_LABELS[k] || k,
        value: buckets[k],
        color: DEAL_STAGE_COLORS[k],
      }));
  }, [deals]);
  const total = data.reduce((s, d) => s + d.value, 0);

  return (
    <div style={cardShell} dir="rtl">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div>
          <div style={titleStyle}>צינור עסקאות</div>
          <div style={subStyle}>{total} עסקאות בכל השלבים</div>
        </div>
        <Link to="/deals" style={{ color: TOK.gold, fontSize: 12, fontWeight: 700, textDecoration: 'none' }}>
          לכל העסקאות
        </Link>
      </div>
      {total === 0 ? (
        <EmptyChart label="אין עסקאות פעילות כרגע" />
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 150, height: 150, flexShrink: 0 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={data}
                  innerRadius={45}
                  outerRadius={70}
                  paddingAngle={2}
                  dataKey="value"
                  stroke="none"
                >
                  {data.map((d) => (
                    <Cell key={d.key} fill={d.color} />
                  ))}
                </Pie>
                <Tooltip content={<DonutTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, flex: 1 }}>
            {data.map((d) => (
              <li
                key={d.key}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  gap: 8, padding: '4px 0', fontSize: 13,
                }}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <i style={{
                    display: 'inline-block', width: 9, height: 9, borderRadius: 99,
                    background: d.color,
                  }} />
                  {d.name}
                </span>
                <strong style={{ color: TOK.ink, fontVariantNumeric: 'tabular-nums' }}>{d.value}</strong>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// 2. LeadSourceDonut — "where do my leads come from?"
// ──────────────────────────────────────────────────────────────────
const SOURCE_LABELS = {
  yad2: 'יד 2', facebook: 'פייסבוק', site: 'אתר',
  referral: 'הפניה', referral_client: 'הפניה מלקוח',
  open_house: 'בית פתוח', sign: 'שלט', tour: 'סיור סוכנים',
  whatsapp: 'וואטסאפ', manual: 'הזנה ידנית', other: 'אחר',
};
const SOURCE_PALETTE = [
  TOK.gold, TOK.goldDark, TOK.warm, TOK.success,
  '#3b82f6', '#a855f7', '#ec4899', '#0ea5e9',
  '#84cc16', '#f97316', '#6b7280',
];

export function LeadSourceDonut({ leads = [] }) {
  const data = useMemo(() => {
    const buckets = new Map();
    for (const l of leads) {
      const raw = (l.source || 'other').toString().trim();
      const key = raw.toLowerCase();
      buckets.set(key, (buckets.get(key) || 0) + 1);
    }
    const arr = Array.from(buckets.entries())
      .map(([k, v]) => ({
        key: k, value: v,
        name: SOURCE_LABELS[k] || k || 'אחר',
      }))
      .sort((a, b) => b.value - a.value);
    return arr.map((d, i) => ({ ...d, color: SOURCE_PALETTE[i % SOURCE_PALETTE.length] }));
  }, [leads]);
  const total = data.reduce((s, d) => s + d.value, 0);

  return (
    <div style={cardShell} dir="rtl">
      <div style={titleStyle}>ערוצי לידים</div>
      <div style={subStyle}>מקור הלידים בתיק שלך</div>
      {total === 0 ? (
        <EmptyChart label="אין לידים עדיין" />
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 150, height: 150, flexShrink: 0 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={data}
                  innerRadius={45}
                  outerRadius={70}
                  paddingAngle={2}
                  dataKey="value"
                  stroke="none"
                >
                  {data.map((d) => (
                    <Cell key={d.key} fill={d.color} />
                  ))}
                </Pie>
                <Tooltip content={<DonutTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, flex: 1 }}>
            {data.slice(0, 6).map((d) => (
              <li
                key={d.key}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  gap: 8, padding: '3px 0', fontSize: 13,
                }}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <i style={{
                    display: 'inline-block', width: 9, height: 9, borderRadius: 99,
                    background: d.color,
                  }} />
                  {d.name}
                </span>
                <strong style={{ color: TOK.ink, fontVariantNumeric: 'tabular-nums' }}>{d.value}</strong>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// 3. MatchCoverageGauge — "am I serving my pipeline?"
//    % of active leads that have at least one matching property.
// ──────────────────────────────────────────────────────────────────
function leadHasAnyMatch(lead, properties) {
  // Lightweight client-side matcher mirroring the server's loose
  // criteria: same city + budget within ±15%. Cheap enough for
  // O(leads × properties) on a single agent's pipeline.
  if (!lead || !Array.isArray(properties)) return false;
  const wantsBuy = lead.lookingFor === 'BUY';
  const wantsRent = lead.lookingFor === 'RENT';
  const cities = Array.isArray(lead.cities) && lead.cities.length
    ? lead.cities
    : (lead.city ? [lead.city] : []);
  for (const p of properties) {
    if ((p.status || '').toUpperCase() !== 'ACTIVE') continue;
    if (wantsBuy && p.category !== 'SALE') continue;
    if (wantsRent && p.category !== 'RENT') continue;
    if (cities.length && !cities.includes(p.city)) continue;
    if (lead.budget && p.marketingPrice) {
      const lo = lead.budget * 0.85;
      const hi = lead.budget * 1.15;
      if (p.marketingPrice < lo || p.marketingPrice > hi) continue;
    }
    return true;
  }
  return false;
}

export function MatchCoverageGauge({ leads = [], properties = [] }) {
  const { covered, total, pct } = useMemo(() => {
    const active = leads.filter((l) => {
      const s = (l.status || '').toUpperCase();
      return s === 'HOT' || s === 'WARM';
    });
    let covered = 0;
    for (const l of active) {
      if (leadHasAnyMatch(l, properties)) covered++;
    }
    const total = active.length;
    return {
      covered,
      total,
      pct: total === 0 ? 0 : Math.round((covered / total) * 100),
    };
  }, [leads, properties]);

  const data = [{ name: 'covered', value: pct, fill: pct >= 70 ? TOK.success : pct >= 40 ? TOK.gold : TOK.hot }];

  return (
    <div style={cardShell} dir="rtl">
      <div style={titleStyle}>כיסוי התאמות</div>
      <div style={subStyle}>אחוז המתעניינים שיש להם נכס תואם בתיק שלך</div>
      {total === 0 ? (
        <EmptyChart label="אין לידים פעילים" />
      ) : (
        <div style={{ position: 'relative', height: 150 }}>
          <ResponsiveContainer>
            <RadialBarChart
              innerRadius="68%"
              outerRadius="100%"
              data={data}
              startAngle={90}
              endAngle={-270}
            >
              <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
              <RadialBar
                background={{ fill: TOK.goldSoft }}
                clockWise
                dataKey="value"
                cornerRadius={10}
              />
            </RadialBarChart>
          </ResponsiveContainer>
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            pointerEvents: 'none',
          }}>
            <div style={{ fontSize: 30, fontWeight: 800, color: TOK.ink, letterSpacing: -1 }}>{pct}%</div>
            <div style={{ fontSize: 11, color: TOK.muted, marginTop: 2 }}>
              {covered} מתוך {total}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// 4. DaysOnMarketBar — "which listings are stale?"
// ──────────────────────────────────────────────────────────────────
export function DaysOnMarketBar({ properties = [] }) {
  const data = useMemo(() => {
    const buckets = [
      { key: '0-30',  label: '0–30 ימים',   max: 30,         color: TOK.success, count: 0 },
      { key: '30-60', label: '30–60 ימים',  max: 60,         color: TOK.gold,    count: 0 },
      { key: '60-90', label: '60–90 ימים',  max: 90,         color: TOK.warm,    count: 0 },
      { key: '90+',   label: '90+ ימים',    max: Infinity,   color: TOK.hot,     count: 0 },
    ];
    const now = Date.now();
    for (const p of properties) {
      if ((p.status || '').toUpperCase() !== 'ACTIVE') continue;
      const created = p.listedAt || p.createdAt;
      if (!created) continue;
      const ageDays = Math.floor((now - new Date(created).getTime()) / 86_400_000);
      for (const b of buckets) {
        if (ageDays <= b.max) { b.count++; break; }
      }
    }
    return buckets;
  }, [properties]);
  const total = data.reduce((s, b) => s + b.count, 0);

  return (
    <div style={cardShell} dir="rtl">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div>
          <div style={titleStyle}>גיל מודעה</div>
          <div style={subStyle}>נכסים פעילים לפי ותק במאגר — ככל שהמודעה ותיקה יותר, כדאי לרענן</div>
        </div>
        <Link to="/properties" style={{ color: TOK.gold, fontSize: 12, fontWeight: 700, textDecoration: 'none' }}>
          לכל הנכסים
        </Link>
      </div>
      {total === 0 ? (
        <EmptyChart label="אין נכסים פעילים" />
      ) : (
        <div style={{ height: 150 }}>
          <ResponsiveContainer>
            <BarChart data={data} margin={{ top: 6, right: 0, bottom: 0, left: 0 }}>
              <CartesianGrid stroke={TOK.border} vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: TOK.muted }}
                axisLine={false}
                tickLine={false}
                reversed
              />
              <YAxis
                tick={{ fontSize: 11, fill: TOK.muted }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
                orientation="right"
              />
              <Tooltip cursor={{ fill: TOK.goldSoft }} content={<BarTooltip />} />
              <Bar dataKey="count" radius={[8, 8, 0, 0]}>
                {data.map((d) => (
                  <Cell key={d.key} fill={d.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// 5. SilenceBucketsBar — "who am I about to lose to silence?"
// ──────────────────────────────────────────────────────────────────
export function SilenceBucketsBar({ leads = [] }) {
  const data = useMemo(() => {
    const buckets = [
      { key: 'fresh',  label: 'פחות מ-3 ימים',  max: 3,          color: TOK.success, count: 0 },
      { key: '3-7',    label: '3–7 ימים',       max: 7,          color: TOK.gold,    count: 0 },
      { key: '7-14',   label: '7–14 ימים',      max: 14,         color: TOK.warm,    count: 0 },
      { key: '14+',    label: '14 ימים ויותר',   max: Infinity,   color: TOK.hot,     count: 0 },
    ];
    const now = Date.now();
    for (const l of leads) {
      const s = (l.status || '').toUpperCase();
      // Only count active leads — closed/lost don't need follow-up.
      if (s === 'CLOSED' || s === 'LOST') continue;
      const last = l.lastContact || l.updatedAt || l.createdAt;
      if (!last) continue;
      const ageDays = Math.floor((now - new Date(last).getTime()) / 86_400_000);
      for (const b of buckets) {
        if (ageDays <= b.max) { b.count++; break; }
      }
    }
    return buckets;
  }, [leads]);
  const total = data.reduce((s, b) => s + b.count, 0);
  // Highlight at-risk count (3+ days silence) in the subtitle so an
  // agent grokking the dashboard at a glance sees the action number
  // without parsing the chart.
  const atRisk = data[2].count + data[3].count;

  return (
    <div style={cardShell} dir="rtl">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div>
          <div style={titleStyle}>מתעניינים ללא מענה</div>
          <div style={subStyle}>
            {atRisk > 0
              ? <><strong style={{ color: TOK.hot }}>{atRisk}</strong> מתעניינים זקוקים למעקב</>
              : 'כל המתעניינים בקשר עדכני — כל הכבוד'}
          </div>
        </div>
        <Link to="/customers?filter=stale" style={{ color: TOK.gold, fontSize: 12, fontWeight: 700, textDecoration: 'none' }}>
          לרשימת מתעניינים
        </Link>
      </div>
      {total === 0 ? (
        <EmptyChart label="אין מתעניינים פעילים" />
      ) : (
        <div style={{ height: 150 }}>
          <ResponsiveContainer>
            <BarChart data={data} margin={{ top: 6, right: 0, bottom: 0, left: 0 }}>
              <CartesianGrid stroke={TOK.border} vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: TOK.muted }}
                axisLine={false}
                tickLine={false}
                reversed
              />
              <YAxis
                tick={{ fontSize: 11, fill: TOK.muted }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
                orientation="right"
              />
              <Tooltip cursor={{ fill: TOK.goldSoft }} content={<BarTooltip />} />
              <Bar dataKey="count" radius={[8, 8, 0, 0]}>
                {data.map((d) => (
                  <Cell key={d.key} fill={d.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Shared bits
// ──────────────────────────────────────────────────────────────────
function EmptyChart({ label }) {
  return (
    <div style={{
      height: 150, display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 13, color: TOK.muted, background: TOK.cream4, borderRadius: 10,
    }}>{label}</div>
  );
}

function DonutTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const p = payload[0]?.payload;
  if (!p) return null;
  return (
    <div style={{
      background: TOK.ink, color: '#fff', padding: '6px 10px',
      borderRadius: 6, fontSize: 12, fontWeight: 700, direction: 'rtl',
    }}>
      {p.name}: <span style={{ fontVariantNumeric: 'tabular-nums' }}>{p.value}</span>
    </div>
  );
}

function BarTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: TOK.ink, color: '#fff', padding: '6px 10px',
      borderRadius: 6, fontSize: 12, fontWeight: 700, direction: 'rtl',
    }}>
      {label}: <span style={{ fontVariantNumeric: 'tabular-nums' }}>{payload[0].value}</span>
    </div>
  );
}
