// Marketing — Sprint 9 lane C. /marketing hub for agents. Three tabs:
//
//   סקירה         → 3 KPI tiles (views / inquiries / agreements) +
//                   top-performer cards + per-property table with an
//                   inline 14-day SVG sparkline and conversion %.
//   לידים מדפי נחיתה → PropertyInquiry inbox with "הפוך לליד" one-click
//                   promotion → links into /customers/:leadId on success.
//   הסכמי תיווך   → Agreement list (api.listAgreements) filtered by
//                   status pill row, copy-link action per row.
//
// Cream / gold DT palette, inline styles, RTL. Mobile (≤820 px) switches
// tables to stacked cards and the tab row becomes a horizontal scroller.
// Skeleton rows + centered empty states; toasts via useToast().

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Megaphone, Eye, MessageCircle, FileSignature, TrendingUp,
  Trophy, ArrowUpRight, Check, Copy, Inbox, ExternalLink,
  Clock, CheckCircle2, AlertTriangle, Ban, Sparkles,
} from 'lucide-react';
import api from '../lib/api';
import { useToast } from '../lib/toast';
import { displayText, displayNumber } from '../lib/display';
import { relativeTime } from '../lib/time';
import { useViewportMobile } from '../hooks/mobile';

// ─── DT tokens (verbatim — match every other ported page) ────
const DT = {
  cream: '#f7f3ec', cream2: '#efe9df', cream3: '#e8dfcf', cream4: '#fbf7f0',
  white: '#ffffff', ink: '#1e1a14', muted: '#6b6356',
  gold: '#b48b4c', goldLight: '#d9b774', goldDark: '#7a5c2c',
  goldSoft: 'rgba(180,139,76,0.12)',
  border: 'rgba(30,26,20,0.08)',
  success: '#15803d', danger: '#b91c1c',
};
const FONT = { fontFamily: 'Assistant, Heebo, -apple-system, sans-serif' };

// Tabs render as a pill row. Order matters — סקירה is the default.
const TABS = [
  { key: 'overview',   label: 'סקירה',           Icon: TrendingUp },
  { key: 'inquiries',  label: 'לידים מדפי נחיתה', Icon: Inbox },
  { key: 'agreements', label: 'הסכמי תיווך',     Icon: FileSignature },
];

// Agreement status → pill tone mapping. Keys match the Prisma string
// union ('SENT' | 'SIGNED' | 'EXPIRED' | 'CANCELLED').
const AGREEMENT_STATUSES = {
  SIGNED:    { label: 'נחתם',    tone: 'success', Icon: CheckCircle2 },
  SENT:      { label: 'ממתין',   tone: 'gold',    Icon: Clock },
  EXPIRED:   { label: 'פג תוקף', tone: 'muted',   Icon: AlertTriangle },
  CANCELLED: { label: 'בוטל',    tone: 'danger',  Icon: Ban },
};

const AGREEMENT_FILTERS = [
  { key: 'ALL',       label: 'הכול' },
  { key: 'SIGNED',    label: 'נחתם' },
  { key: 'SENT',      label: 'ממתין' },
  { key: 'EXPIRED',   label: 'פג תוקף' },
  { key: 'CANCELLED', label: 'בוטל' },
];

export default function Marketing() {
  const toast = useToast();
  const navigate = useNavigate();
  const isMobile = useViewportMobile(820);
  const [tab, setTab] = useState('overview');

  return (
    <div dir="rtl" style={{
      ...FONT,
      padding: isMobile ? '18px 14px 40px' : 28,
      color: DT.ink, minHeight: '100%',
      background: DT.cream,
    }}>
      {/* Shared shimmer keyframes — scoped to this page so the skeleton
          rows don't bleed into neighboring components. The app's base
          stylesheet already ships a `@keyframes shimmer` but defining it
          here keeps the page self-contained for future reuse. */}
      <style>{`
        @keyframes estia-mkt-shimmer {
          0%   { background-position: -220% 0; }
          100% { background-position: 220% 0; }
        }
        .estia-mkt-skel {
          background: linear-gradient(
            90deg,
            ${DT.cream4} 0%,
            ${DT.cream2} 50%,
            ${DT.cream4} 100%
          );
          background-size: 220% 100%;
          animation: estia-mkt-shimmer 1.6s ease-in-out infinite;
          border-radius: 8px;
        }
        .estia-mkt-tabscroll { scrollbar-width: none; -ms-overflow-style: none; }
        .estia-mkt-tabscroll::-webkit-scrollbar { display: none; }
      `}</style>

      {/* ─── Header ─────────────────────────────────────── */}
      <header style={{ marginBottom: isMobile ? 14 : 20 }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          color: DT.goldDark, fontSize: 11, fontWeight: 800,
          letterSpacing: 1, textTransform: 'uppercase',
        }}>
          <Megaphone size={12} aria-hidden="true" /> ESTIA · שיווק
        </div>
        <h1 style={{
          fontSize: isMobile ? 22 : 28, fontWeight: 800,
          letterSpacing: -0.7, margin: '4px 0 0',
        }}>ניהול שיווקי</h1>
        <p style={{
          margin: '6px 0 0', fontSize: isMobile ? 12 : 14,
          color: DT.muted, lineHeight: 1.5, maxWidth: 620,
        }}>
          ביצועי דפי הנחיתה, לידים שהתקבלו ישירות מהפרסום, וסטטוס הסכמי תיווך —
          הכול במקום אחד.
        </p>
      </header>

      {/* ─── Tab pill row ──────────────────────────────── */}
      <nav
        aria-label="טאבי ניהול שיווקי"
        className={isMobile ? 'estia-mkt-tabscroll' : undefined}
        style={{
          display: 'flex', gap: 8, marginBottom: isMobile ? 14 : 18,
          overflowX: isMobile ? 'auto' : 'visible',
          padding: isMobile ? '2px 2px 6px' : 0,
          // Let the scroller extend to the viewport edge on mobile.
          marginInline: isMobile ? -14 : 0,
          paddingInline: isMobile ? 14 : 0,
        }}
      >
        {TABS.map((t) => {
          const active = tab === t.key;
          const { Icon } = t;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              aria-pressed={active}
              style={{
                ...FONT,
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '9px 14px', borderRadius: 99,
                border: active
                  ? `1px solid ${DT.gold}`
                  : `1px solid ${DT.border}`,
                background: active ? DT.goldSoft : DT.white,
                color: active ? DT.goldDark : DT.ink,
                fontSize: 12, fontWeight: 700, cursor: 'pointer',
                whiteSpace: 'nowrap', flexShrink: 0,
              }}
            >
              <Icon size={13} aria-hidden="true" />
              <span>{t.label}</span>
            </button>
          );
        })}
      </nav>

      {/* ─── Tab body ──────────────────────────────────── */}
      {tab === 'overview'   && <OverviewTab   isMobile={isMobile} navigate={navigate} />}
      {tab === 'inquiries'  && <InquiriesTab  isMobile={isMobile} toast={toast} />}
      {tab === 'agreements' && <AgreementsTab isMobile={isMobile} toast={toast} />}
    </div>
  );
}

// ═══ Overview tab ═══════════════════════════════════════════════
function OverviewTab({ isMobile, navigate }) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await api.marketingOverview();
        if (!cancelled) setData(res || {});
      } catch (e) {
        if (!cancelled) setError(e?.message || 'טעינת הסקירה נכשלה');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Backend returns { funnel: { viewsLast30d, inquiriesLast30d,
  // agreementsSigned }, topPerformers, byProperty }. The KPI tiles
  // and per-property table read from those nested paths — the
  // previous `data?.viewsLast30d` / `data?.properties` shape was
  // flat and always evaluated to 0 / empty.
  const kpis = useMemo(() => ([
    {
      key: 'views',
      label: 'צפיות ב-30 יום',
      value: data?.funnel?.viewsLast30d ?? 0,
      Icon: Eye,
    },
    {
      key: 'inquiries',
      label: 'פניות ב-30 יום',
      value: data?.funnel?.inquiriesLast30d ?? 0,
      Icon: MessageCircle,
    },
    {
      key: 'agreements',
      label: 'הסכמים חתומים',
      value: data?.funnel?.agreementsSigned ?? 0,
      Icon: FileSignature,
    },
  ]), [data]);

  const topPerformers = (data?.topPerformers || []).slice(0, 3);
  const rows = data?.byProperty || data?.properties || [];

  if (error && !loading) {
    return (
      <EmptyBlock
        icon={<AlertTriangle size={36} aria-hidden="true" />}
        title="לא הצלחנו לטעון את הסקירה"
        description={error}
      />
    );
  }

  return (
    <>
      {/* KPI tiles */}
      <section
        aria-label="סיכום ביצועים"
        style={{
          display: 'grid',
          gridTemplateColumns: isMobile
            ? 'repeat(3, minmax(0, 1fr))'
            : 'repeat(3, minmax(0, 1fr))',
          gap: isMobile ? 8 : 14,
          marginBottom: isMobile ? 14 : 18,
        }}
      >
        {kpis.map((k) => (
          <KpiTile key={k.key} kpi={k} loading={loading} isMobile={isMobile} />
        ))}
      </section>

      {/* Top performers — Perf 2026-04-25: Lighthouse flagged this section
          as the biggest CLS contributor (~0.28) on /marketing. Skeleton
          placeholder while loading reserves the same vertical space the
          rendered cards will take, so the per-property table below
          doesn't jump when data arrives. */}
      {loading && (
        <section
          aria-hidden="true"
          style={{
            background: DT.white, border: `1px solid ${DT.border}`,
            borderRadius: 14, padding: isMobile ? 14 : 18,
            marginBottom: isMobile ? 14 : 18,
            // Match the rendered section's typical height so reflow stays flat.
            minHeight: isMobile ? 280 : 200,
          }}
        >
          <div className="estia-mkt-skel" style={{ height: 14, width: 60, marginBottom: 12 }} />
          <div className="estia-mkt-skel" style={{ height: 18, width: 160, marginBottom: 14 }} />
          <div style={{
            display: 'grid', gap: 10,
            gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, minmax(0, 1fr))',
          }}>
            {[0, 1, 2].map((i) => (
              <div key={i} className="estia-mkt-skel" style={{ height: isMobile ? 64 : 110 }} />
            ))}
          </div>
        </section>
      )}
      {!loading && topPerformers.length > 0 && (
        <section
          aria-label="המנצחים השבוע"
          style={{
            background: DT.white, border: `1px solid ${DT.border}`,
            borderRadius: 14, padding: isMobile ? 14 : 18,
            marginBottom: isMobile ? 14 : 18,
          }}
        >
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            fontSize: 10, color: DT.goldDark, fontWeight: 800,
            letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10,
          }}>
            <Trophy size={11} aria-hidden="true" /> Top 3
          </div>
          <h2 style={{
            fontSize: 15, fontWeight: 800, margin: '0 0 12px',
          }}>המנצחים השבוע</h2>
          <div style={{
            display: 'grid', gap: 10,
            gridTemplateColumns: isMobile
              ? '1fr'
              : 'repeat(3, minmax(0, 1fr))',
          }}>
            {topPerformers.map((p, i) => (
              <TopPerformerCard key={p.propertyId || p.id || i} p={p} rank={i + 1} />
            ))}
          </div>
        </section>
      )}

      {/* Per-property table */}
      <section
        aria-label="ביצועי נכסים"
        style={{
          background: DT.white, border: `1px solid ${DT.border}`,
          borderRadius: 14, padding: isMobile ? 0 : 4,
          overflow: 'hidden',
        }}
      >
        <div style={{
          padding: isMobile ? '14px 14px 10px' : '14px 16px 8px',
          display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', gap: 8,
        }}>
          <h2 style={{
            fontSize: 15, fontWeight: 800, margin: 0, color: DT.ink,
          }}>ביצועים לפי נכס</h2>
          <span style={{ fontSize: 11, color: DT.muted, fontWeight: 600 }}>
            {loading ? '…' : `${rows.length} נכסים`}
          </span>
        </div>

        {loading && <TableSkeleton isMobile={isMobile} rows={5} />}

        {!loading && rows.length === 0 && (
          <EmptyBlock
            icon={<Megaphone size={36} aria-hidden="true" />}
            title="אין עדיין נתוני שיווק"
            description="ברגע שדפי הנחיתה שלך יתחילו לקבל צפיות, הנתונים יופיעו כאן."
            ctaLabel="עבור לנכסים"
            onCta={() => navigate('/properties')}
            padInline={isMobile}
          />
        )}

        {!loading && rows.length > 0 && (
          isMobile ? (
            <div style={{ padding: '0 10px 12px' }}>
              {rows.map((r) => (
                <PropertyRowCard key={r.propertyId || r.id} r={r} navigate={navigate} />
              ))}
            </div>
          ) : (
            <PropertyTable rows={rows} navigate={navigate} />
          )
        )}
      </section>
    </>
  );
}

function KpiTile({ kpi, loading, isMobile }) {
  const { Icon } = kpi;
  return (
    <div
      style={{
        background: DT.white, border: `1px solid ${DT.border}`,
        borderRadius: 14, padding: isMobile ? 12 : 16,
        display: 'flex', flexDirection: 'column', gap: 8,
      }}
    >
      <div style={{
        display: 'inline-flex', alignItems: 'center',
        width: 30, height: 30, borderRadius: 9,
        background: DT.goldSoft, color: DT.goldDark,
        justifyContent: 'center',
      }}>
        <Icon size={15} aria-hidden="true" />
      </div>
      {loading ? (
        <div className="estia-mkt-skel" style={{ height: 22, width: '60%' }} />
      ) : (
        <div style={{
          fontSize: 22, fontWeight: 800, color: DT.ink,
          letterSpacing: -0.5, fontVariantNumeric: 'tabular-nums',
        }}>{displayNumber(kpi.value)}</div>
      )}
      <div style={{
        fontSize: 11, color: DT.muted, fontWeight: 700,
        letterSpacing: 0.8, textTransform: 'uppercase',
      }}>{kpi.label}</div>
    </div>
  );
}

function TopPerformerCard({ p, rank }) {
  const street = [p.street, p.number].filter(Boolean).join(' ').trim();
  const city = p.city || '';
  const locator = [street || p.address, city].filter(Boolean).join(', ') || displayText(p.title);
  const pct = Number.isFinite(Number(p.conversionPct)) ? Number(p.conversionPct) : null;
  const target = p.propertyId || p.id;
  return (
    <Link
      to={target ? `/properties/${target}` : '#'}
      style={{
        display: 'block',
        background: DT.cream4,
        border: `1px solid ${DT.border}`,
        borderRadius: 12, padding: 12, textDecoration: 'none',
        color: DT.ink, position: 'relative',
      }}
    >
      <span style={{
        position: 'absolute', top: 10, insetInlineEnd: 10,
        width: 22, height: 22, borderRadius: 99,
        background: DT.gold, color: DT.white,
        display: 'grid', placeItems: 'center',
        fontSize: 11, fontWeight: 800,
      }}>#{rank}</span>
      <div style={{
        fontSize: 13, fontWeight: 800, marginBottom: 4,
        paddingInlineEnd: 26, lineHeight: 1.3,
      }}>{locator}</div>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        fontSize: 12, color: DT.muted, marginBottom: 8,
      }}>
        <Eye size={12} aria-hidden="true" />
        <span><strong style={{ color: DT.ink }}>{displayNumber(p.views30d ?? 0)}</strong> צפיות ב-30 יום</span>
      </div>
      {pct !== null && (
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          fontSize: 11, fontWeight: 800,
          padding: '3px 8px', borderRadius: 99,
          background: DT.goldSoft, color: DT.goldDark,
        }}>
          <ArrowUpRight size={11} aria-hidden="true" />
          {pct.toFixed(1)}% המרה
        </span>
      )}
    </Link>
  );
}

// ── Inline 14-day sparkline (80×24, gold stroke, no libs) ──
function Sparkline({ values = [], width = 80, height = 24 }) {
  const cleaned = (values || [])
    .map((v) => Number(v))
    .filter((v) => Number.isFinite(v));
  if (cleaned.length < 2) {
    return (
      <svg width={width} height={height} aria-hidden="true" role="img">
        <line
          x1={0} y1={height - 2} x2={width} y2={height - 2}
          stroke={DT.border} strokeWidth={1.5} strokeLinecap="round"
        />
      </svg>
    );
  }
  const max = Math.max(...cleaned);
  const min = Math.min(...cleaned);
  const span = max - min || 1;
  const n = cleaned.length;
  const stepX = n > 1 ? width / (n - 1) : width;
  const pad = 2;
  const points = cleaned.map((v, i) => {
    const x = i * stepX;
    // Flip Y so higher values are nearer the top.
    const y = pad + (height - pad * 2) * (1 - (v - min) / span);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const polyline = points.join(' ');
  const last = points[points.length - 1].split(',');
  return (
    <svg
      width={width} height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-label="מגמת צפיות 14 ימים" role="img"
    >
      <polyline
        points={polyline}
        fill="none"
        stroke={DT.gold}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={last[0]} cy={last[1]} r={1.8} fill={DT.goldDark} />
    </svg>
  );
}

function PropertyTable({ rows, navigate }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{
        width: '100%', borderCollapse: 'collapse', fontSize: 13,
      }}>
        <thead>
          <tr style={{
            background: DT.cream4, color: DT.muted,
            textAlign: 'start',
          }}>
            <Th>נכס</Th>
            <Th align="center">צפיות 30 יום</Th>
            <Th align="center">פניות 30 יום</Th>
            <Th align="center">הסכמים</Th>
            <Th align="center">המרה</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <TableRow key={r.propertyId || r.id} r={r} navigate={navigate} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Th({ children, align = 'start' }) {
  return (
    <th style={{
      padding: '10px 12px', textAlign: align,
      fontSize: 10, fontWeight: 800, letterSpacing: 1,
      textTransform: 'uppercase', borderBottom: `1px solid ${DT.border}`,
    }}>{children}</th>
  );
}

function Td({ children, align = 'start', bold }) {
  return (
    <td style={{
      padding: '11px 12px', textAlign: align,
      borderBottom: `1px solid ${DT.border}`,
      fontWeight: bold ? 700 : 500, color: DT.ink,
      fontVariantNumeric: align === 'center' ? 'tabular-nums' : 'normal',
    }}>{children}</td>
  );
}

function TableRow({ r, navigate }) {
  const target = r.propertyId || r.id;
  const street = [r.street, r.number].filter(Boolean).join(' ').trim();
  const locator = [street || r.address, r.city].filter(Boolean).join(', ')
    || displayText(r.title || 'נכס');
  const pct = Number.isFinite(Number(r.conversionPct)) ? Number(r.conversionPct) : null;
  return (
    <tr
      onClick={() => target && navigate(`/properties/${target}`)}
      style={{
        cursor: target ? 'pointer' : 'default',
        transition: 'background 0.12s',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = DT.cream4; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
    >
      <Td bold>
        <span style={{ display: 'block', maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {locator}
        </span>
      </Td>
      <Td align="center">{displayNumber(r.views30d ?? 0)}</Td>
      <Td align="center">{displayNumber(r.inquiries30d ?? 0)}</Td>
      <Td align="center">{displayNumber(r.agreementsSigned ?? 0)}</Td>
      <Td align="center">
        {pct !== null ? (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 3,
            fontSize: 11, fontWeight: 800,
            padding: '3px 8px', borderRadius: 99,
            background: DT.goldSoft, color: DT.goldDark,
          }}>{pct.toFixed(1)}%</span>
        ) : <span style={{ color: DT.muted }}>—</span>}
      </Td>
    </tr>
  );
}

function PropertyRowCard({ r, navigate }) {
  const target = r.propertyId || r.id;
  const street = [r.street, r.number].filter(Boolean).join(' ').trim();
  const locator = [street || r.address, r.city].filter(Boolean).join(', ')
    || displayText(r.title || 'נכס');
  const pct = Number.isFinite(Number(r.conversionPct)) ? Number(r.conversionPct) : null;
  return (
    <button
      type="button"
      onClick={() => target && navigate(`/properties/${target}`)}
      style={{
        ...FONT,
        display: 'block', width: '100%', textAlign: 'start',
        background: DT.white, border: `1px solid ${DT.border}`,
        borderRadius: 12, padding: 12, marginBottom: 8,
        cursor: target ? 'pointer' : 'default',
      }}
    >
      <div style={{
        fontSize: 13, fontWeight: 800, marginBottom: 8,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>{locator}</div>
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
        gap: 8, fontSize: 11, color: DT.muted, fontWeight: 600, marginBottom: 8,
      }}>
        <div>
          <div style={{ color: DT.ink, fontWeight: 800, fontSize: 14, fontVariantNumeric: 'tabular-nums' }}>
            {displayNumber(r.views30d ?? 0)}
          </div>
          <div>צפיות</div>
        </div>
        <div>
          <div style={{ color: DT.ink, fontWeight: 800, fontSize: 14, fontVariantNumeric: 'tabular-nums' }}>
            {displayNumber(r.inquiries30d ?? 0)}
          </div>
          <div>פניות</div>
        </div>
        <div>
          <div style={{ color: DT.ink, fontWeight: 800, fontSize: 14, fontVariantNumeric: 'tabular-nums' }}>
            {displayNumber(r.agreementsSigned ?? 0)}
          </div>
          <div>הסכמים</div>
        </div>
      </div>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 8,
      }}>
        <Sparkline values={r.viewsTrend || []} />
        {pct !== null && (
          <span style={{
            fontSize: 11, fontWeight: 800,
            padding: '3px 8px', borderRadius: 99,
            background: DT.goldSoft, color: DT.goldDark,
          }}>{pct.toFixed(1)}% המרה</span>
        )}
      </div>
    </button>
  );
}

// ═══ Inquiries tab ════════════════════════════════════════════
function InquiriesTab({ isMobile, toast }) {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [error, setError] = useState(null);
  // Maps inquiryId → resulting leadId once promoted. Swapped in so the
  // "הפוך לליד" button is replaced by a "פתח ליד" link to /customers/:id.
  const [promoted, setPromoted] = useState({});
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.listMarketingInquiries();
      setRows(res?.items || []);
    } catch (e) {
      setError(e?.message || 'טעינת הפניות נכשלה');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handlePromote = async (id) => {
    setBusyId(id);
    try {
      const res = await api.promoteMarketingInquiry(id);
      const leadId = res?.leadId || res?.lead?.id;
      if (leadId) setPromoted((p) => ({ ...p, [id]: leadId }));
      toast.success('הליד נוצר');
    } catch (e) {
      toast.error(e?.message || 'יצירת הליד נכשלה');
    } finally {
      setBusyId(null);
    }
  };

  if (error && !loading) {
    return (
      <EmptyBlock
        icon={<AlertTriangle size={36} aria-hidden="true" />}
        title="לא הצלחנו לטעון את הפניות"
        description={error}
      />
    );
  }

  return (
    <section style={{
      background: DT.white, border: `1px solid ${DT.border}`,
      borderRadius: 14, overflow: 'hidden',
    }}>
      <div style={{
        padding: isMobile ? '14px 14px 10px' : '14px 16px 8px',
        display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', gap: 8,
      }}>
        <h2 style={{
          fontSize: 15, fontWeight: 800, margin: 0, color: DT.ink,
        }}>פניות מדפי נחיתה</h2>
        <span style={{ fontSize: 11, color: DT.muted, fontWeight: 600 }}>
          {loading ? '…' : `${rows.length} פניות`}
        </span>
      </div>

      {loading && <TableSkeleton isMobile={isMobile} rows={4} />}

      {!loading && rows.length === 0 && (
        <EmptyBlock
          icon={<Inbox size={36} aria-hidden="true" />}
          title="אין עדיין פניות"
          description="כאשר מבקרים ישלחו טופס בדף נחיתה, הפנייה תופיע כאן מוכנה להפוך לליד."
          padInline={isMobile}
        />
      )}

      {!loading && rows.length > 0 && (
        isMobile ? (
          <div style={{ padding: '0 10px 12px' }}>
            {rows.map((r) => (
              <InquiryCard
                key={r.id} r={r}
                promotedLeadId={promoted[r.id]}
                busy={busyId === r.id}
                onPromote={() => handlePromote(r.id)}
              />
            ))}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: DT.cream4, color: DT.muted }}>
                  <Th>שם</Th>
                  <Th>טלפון</Th>
                  <Th>אימייל</Th>
                  <Th>הודעה</Th>
                  <Th>נכס</Th>
                  <Th>התקבלה</Th>
                  <Th align="center">פעולה</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <InquiryRow
                    key={r.id} r={r}
                    promotedLeadId={promoted[r.id]}
                    busy={busyId === r.id}
                    onPromote={() => handlePromote(r.id)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </section>
  );
}

function InquiryRow({ r, promotedLeadId, busy, onPromote }) {
  const msg = (r.message || '').trim();
  const truncated = msg.length > 60 ? `${msg.slice(0, 60)}…` : msg;
  const propLabel = r.property
    ? [
        [r.property.street, r.property.number].filter(Boolean).join(' ').trim()
          || r.property.address || 'נכס',
        r.property.city,
      ].filter(Boolean).join(', ')
    : (r.propertyLabel || '—');
  const propId = r.property?.id || r.propertyId;
  return (
    <tr>
      <Td bold>{displayText(r.contactName || r.name)}</Td>
      <Td>
        {r.contactPhone || r.phone ? (
          <a
            href={`tel:${(r.contactPhone || r.phone).replace(/[^+\d]/g, '')}`}
            style={{ color: DT.ink, textDecoration: 'none' }}
          >{r.contactPhone || r.phone}</a>
        ) : <span style={{ color: DT.muted }}>—</span>}
      </Td>
      <Td>
        {r.contactEmail || r.email ? (
          <a
            href={`mailto:${r.contactEmail || r.email}`}
            style={{ color: DT.ink, textDecoration: 'none' }}
          >{r.contactEmail || r.email}</a>
        ) : <span style={{ color: DT.muted }}>—</span>}
      </Td>
      <Td>
        <span
          title={msg || undefined}
          style={{ color: msg ? DT.ink : DT.muted }}
        >{truncated || '—'}</span>
      </Td>
      <Td>
        {propId ? (
          <Link to={`/properties/${propId}`} style={{ color: DT.goldDark, textDecoration: 'none', fontWeight: 700 }}>
            {propLabel}
          </Link>
        ) : propLabel}
      </Td>
      <Td>
        <span title={new Date(r.createdAt).toLocaleString('he-IL')} style={{ color: DT.muted }}>
          {relativeTime(r.createdAt)}
        </span>
      </Td>
      <Td align="center">
        {promotedLeadId ? (
          <Link to={`/customers/${promotedLeadId}`} style={openLeadStyle()}>
            <ExternalLink size={12} aria-hidden="true" /> פתח ליד
          </Link>
        ) : (
          <button
            type="button"
            onClick={onPromote}
            disabled={busy}
            style={goldBtnStyle(busy)}
          >
            {busy ? '…' : <><Check size={12} aria-hidden="true" /> הפוך לליד</>}
          </button>
        )}
      </Td>
    </tr>
  );
}

function InquiryCard({ r, promotedLeadId, busy, onPromote }) {
  const msg = (r.message || '').trim();
  const truncated = msg.length > 80 ? `${msg.slice(0, 80)}…` : msg;
  const propId = r.property?.id || r.propertyId;
  const propLabel = r.property
    ? [
        [r.property.street, r.property.number].filter(Boolean).join(' ').trim()
          || r.property.address || 'נכס',
        r.property.city,
      ].filter(Boolean).join(', ')
    : (r.propertyLabel || '');
  return (
    <div style={{
      background: DT.white, border: `1px solid ${DT.border}`,
      borderRadius: 12, padding: 12, marginBottom: 8,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
        <div style={{ fontSize: 14, fontWeight: 800 }}>{displayText(r.contactName || r.name)}</div>
        <div style={{ fontSize: 11, color: DT.muted }}>{relativeTime(r.createdAt)}</div>
      </div>
      <div style={{ fontSize: 12, color: DT.muted, marginBottom: 4 }}>
        {r.contactPhone || r.phone || '—'}
        {(r.contactEmail || r.email) && <> · {r.contactEmail || r.email}</>}
      </div>
      {propLabel && (
        <div style={{ fontSize: 12, color: DT.goldDark, fontWeight: 700, marginBottom: 6 }}>
          {propId ? <Link to={`/properties/${propId}`} style={{ color: DT.goldDark, textDecoration: 'none' }}>{propLabel}</Link> : propLabel}
        </div>
      )}
      {truncated && (
        <div style={{ fontSize: 12, color: DT.ink, marginBottom: 10, lineHeight: 1.5 }}>
          {truncated}
        </div>
      )}
      {promotedLeadId ? (
        <Link to={`/customers/${promotedLeadId}`} style={{ ...openLeadStyle(), width: '100%', justifyContent: 'center' }}>
          <ExternalLink size={12} aria-hidden="true" /> פתח ליד
        </Link>
      ) : (
        <button
          type="button" onClick={onPromote} disabled={busy}
          style={{ ...goldBtnStyle(busy), width: '100%', justifyContent: 'center' }}
        >
          {busy ? '…' : <><Check size={12} aria-hidden="true" /> הפוך לליד</>}
        </button>
      )}
    </div>
  );
}

// ═══ Agreements tab ═══════════════════════════════════════════
function AgreementsTab({ isMobile, toast }) {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [copiedId, setCopiedId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.listAgreements();
      setRows(res?.items || []);
    } catch (e) {
      setError(e?.message || 'טעינת ההסכמים נכשלה');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Resolve a shareable link for the row, if any. The backend doesn't
  // carry an explicit public link on Agreement today — fall back to any
  // of the known URL-like fields we might receive.
  const linkFor = (row) => row.shareUrl || row.url || row.link || row.publicUrl || null;

  const filtered = useMemo(() => {
    if (statusFilter === 'ALL') return rows;
    return rows.filter((r) => (r.status || 'SENT') === statusFilter);
  }, [rows, statusFilter]);

  const handleCopy = async (id, link) => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopiedId(id);
      setTimeout(() => setCopiedId((cur) => (cur === id ? null : cur)), 1600);
      toast.success('הקישור הועתק');
    } catch {
      toast.error('ההעתקה נכשלה — נסה שוב');
    }
  };

  if (error && !loading) {
    return (
      <EmptyBlock
        icon={<AlertTriangle size={36} aria-hidden="true" />}
        title="לא הצלחנו לטעון את ההסכמים"
        description={error}
      />
    );
  }

  return (
    <>
      {/* Status filter pill row */}
      <div style={{
        display: 'flex', gap: 6, marginBottom: isMobile ? 12 : 14,
        flexWrap: 'wrap',
      }}>
        {AGREEMENT_FILTERS.map((f) => {
          const active = statusFilter === f.key;
          return (
            <button
              key={f.key} type="button"
              onClick={() => setStatusFilter(f.key)}
              aria-pressed={active}
              style={{
                ...FONT,
                padding: '6px 12px', borderRadius: 99,
                border: active ? `1px solid ${DT.gold}` : `1px solid ${DT.border}`,
                background: active ? DT.goldSoft : DT.white,
                color: active ? DT.goldDark : DT.ink,
                fontSize: 11, fontWeight: 700, cursor: 'pointer',
              }}
            >{f.label}</button>
          );
        })}
      </div>

      <section style={{
        background: DT.white, border: `1px solid ${DT.border}`,
        borderRadius: 14, overflow: 'hidden',
      }}>
        <div style={{
          padding: isMobile ? '14px 14px 10px' : '14px 16px 8px',
          display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', gap: 8,
        }}>
          <h2 style={{ fontSize: 15, fontWeight: 800, margin: 0, color: DT.ink }}>
            הסכמי תיווך
          </h2>
          <span style={{ fontSize: 11, color: DT.muted, fontWeight: 600 }}>
            {loading ? '…' : `${filtered.length} הסכמים`}
          </span>
        </div>

        {loading && <TableSkeleton isMobile={isMobile} rows={4} />}

        {!loading && filtered.length === 0 && (
          <EmptyBlock
            icon={<FileSignature size={36} aria-hidden="true" />}
            title={statusFilter === 'ALL' ? 'אין עדיין הסכמי תיווך' : 'אין הסכמים בסטטוס הזה'}
            description={statusFilter === 'ALL'
              ? 'כשתשלח הסכם חתימה ראשון מכרטיס ליד, הוא יופיע כאן יחד עם הסטטוס.'
              : 'שנה את הסינון למעלה כדי לראות הסכמים בסטטוסים אחרים.'}
            padInline={isMobile}
          />
        )}

        {!loading && filtered.length > 0 && (
          isMobile ? (
            <div style={{ padding: '0 10px 12px' }}>
              {filtered.map((r) => (
                <AgreementCard
                  key={r.id} r={r}
                  link={linkFor(r)}
                  copied={copiedId === r.id}
                  onCopy={() => handleCopy(r.id, linkFor(r))}
                />
              ))}
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: DT.cream4, color: DT.muted }}>
                    <Th>חותם</Th>
                    <Th>טלפון</Th>
                    <Th>נכס</Th>
                    <Th align="center">סטטוס</Th>
                    <Th>נשלח</Th>
                    <Th>נחתם</Th>
                    <Th align="center">פעולה</Th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <AgreementRow
                      key={r.id} r={r}
                      link={linkFor(r)}
                      copied={copiedId === r.id}
                      onCopy={() => handleCopy(r.id, linkFor(r))}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </section>
    </>
  );
}

function AgreementStatusPill({ status }) {
  const meta = AGREEMENT_STATUSES[status] || {
    label: status || 'לא ידוע', tone: 'muted', Icon: AlertTriangle,
  };
  const tones = {
    success: { bg: 'rgba(21,128,61,0.1)', color: DT.success, border: 'rgba(21,128,61,0.28)' },
    gold:    { bg: DT.goldSoft,           color: DT.goldDark, border: 'rgba(180,139,76,0.32)' },
    muted:   { bg: DT.cream3,             color: DT.muted,    border: DT.border },
    danger:  { bg: 'rgba(185,28,28,0.08)', color: DT.danger,  border: 'rgba(185,28,28,0.28)' },
  };
  const t = tones[meta.tone] || tones.muted;
  const { Icon } = meta;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '3px 10px', borderRadius: 99,
      background: t.bg, color: t.color,
      border: `1px solid ${t.border}`,
      fontSize: 11, fontWeight: 800,
    }}>
      <Icon size={11} aria-hidden="true" /> {meta.label}
    </span>
  );
}

function AgreementRow({ r, link, copied, onCopy }) {
  const propLabel = r.property
    ? [
        [r.property.street, r.property.number].filter(Boolean).join(' ').trim()
          || r.property.address || 'נכס',
        r.property.city,
      ].filter(Boolean).join(', ')
    : '—';
  const propId = r.property?.id || r.propertyId;
  const sent = r.sentAt ? new Date(r.sentAt).toLocaleDateString('he-IL') : '—';
  const signed = r.signedAt ? new Date(r.signedAt).toLocaleDateString('he-IL') : '—';
  return (
    <tr>
      <Td bold>{displayText(r.signerName)}</Td>
      <Td>
        {r.signerPhone ? (
          <a href={`tel:${r.signerPhone.replace(/[^+\d]/g, '')}`}
            style={{ color: DT.ink, textDecoration: 'none' }}>{r.signerPhone}</a>
        ) : <span style={{ color: DT.muted }}>—</span>}
      </Td>
      <Td>
        {propId ? (
          <Link to={`/properties/${propId}`} style={{ color: DT.goldDark, textDecoration: 'none', fontWeight: 700 }}>
            {propLabel}
          </Link>
        ) : propLabel}
      </Td>
      <Td align="center"><AgreementStatusPill status={r.status || 'SENT'} /></Td>
      <Td><span style={{ color: DT.muted, fontVariantNumeric: 'tabular-nums' }}>{sent}</span></Td>
      <Td><span style={{ color: DT.muted, fontVariantNumeric: 'tabular-nums' }}>{signed}</span></Td>
      <Td align="center">
        {link ? (
          <button type="button" onClick={onCopy} style={goldBtnStyle(false)}>
            {copied ? <><Check size={12} aria-hidden="true" /> הועתק</> : <><Copy size={12} aria-hidden="true" /> העתק קישור</>}
          </button>
        ) : <span style={{ color: DT.muted, fontSize: 11 }}>—</span>}
      </Td>
    </tr>
  );
}

function AgreementCard({ r, link, copied, onCopy }) {
  const propLabel = r.property
    ? [
        [r.property.street, r.property.number].filter(Boolean).join(' ').trim()
          || r.property.address || 'נכס',
        r.property.city,
      ].filter(Boolean).join(', ')
    : '';
  const propId = r.property?.id || r.propertyId;
  const sent = r.sentAt ? new Date(r.sentAt).toLocaleDateString('he-IL') : '—';
  const signed = r.signedAt ? new Date(r.signedAt).toLocaleDateString('he-IL') : '—';
  return (
    <div style={{
      background: DT.white, border: `1px solid ${DT.border}`,
      borderRadius: 12, padding: 12, marginBottom: 8,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 800 }}>{displayText(r.signerName)}</div>
          {r.signerPhone && <div style={{ fontSize: 12, color: DT.muted }}>{r.signerPhone}</div>}
        </div>
        <AgreementStatusPill status={r.status || 'SENT'} />
      </div>
      {propLabel && (
        <div style={{ fontSize: 12, color: DT.goldDark, fontWeight: 700, marginBottom: 6 }}>
          {propId ? <Link to={`/properties/${propId}`} style={{ color: DT.goldDark, textDecoration: 'none' }}>{propLabel}</Link> : propLabel}
        </div>
      )}
      <div style={{ fontSize: 11, color: DT.muted, marginBottom: 10 }}>
        נשלח {sent} · נחתם {signed}
      </div>
      {link ? (
        <button type="button" onClick={onCopy} style={{ ...goldBtnStyle(false), width: '100%', justifyContent: 'center' }}>
          {copied ? <><Check size={12} aria-hidden="true" /> הועתק</> : <><Copy size={12} aria-hidden="true" /> העתק קישור</>}
        </button>
      ) : null}
    </div>
  );
}

// ═══ Shared bits: skeleton, empty, button styles ═════════════
function TableSkeleton({ rows = 4, isMobile }) {
  return (
    <div style={{ padding: isMobile ? '0 10px 12px' : '0 12px 14px' }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="estia-mkt-skel"
          style={{
            height: isMobile ? 72 : 44,
            marginBottom: 8,
          }}
        />
      ))}
    </div>
  );
}

function EmptyBlock({ icon, title, description, ctaLabel, onCta, padInline }) {
  return (
    <div style={{
      padding: padInline ? '28px 14px 34px' : '36px 24px 40px',
      textAlign: 'center', color: DT.ink,
    }}>
      <div style={{
        display: 'inline-flex', width: 56, height: 56,
        borderRadius: 99, background: DT.goldSoft, color: DT.goldDark,
        alignItems: 'center', justifyContent: 'center',
        marginBottom: 12,
      }}>
        {icon || <Sparkles size={30} aria-hidden="true" />}
      </div>
      <h3 style={{
        margin: '0 0 6px', fontSize: 16, fontWeight: 800,
      }}>{title}</h3>
      {description && (
        <p style={{
          margin: '0 auto', maxWidth: 420, color: DT.muted,
          fontSize: 13, lineHeight: 1.6,
        }}>{description}</p>
      )}
      {ctaLabel && onCta && (
        <button type="button" onClick={onCta} style={{
          ...FONT,
          marginTop: 14,
          background: `linear-gradient(180deg, ${DT.goldLight}, ${DT.gold})`,
          color: DT.ink, border: 'none',
          padding: '9px 16px', borderRadius: 9,
          fontSize: 12, fontWeight: 800, cursor: 'pointer',
        }}>{ctaLabel}</button>
      )}
    </div>
  );
}

function goldBtnStyle(disabled) {
  return {
    ...FONT,
    display: 'inline-flex', alignItems: 'center', gap: 4,
    background: disabled
      ? DT.cream3
      : `linear-gradient(180deg, ${DT.goldLight}, ${DT.gold})`,
    color: disabled ? DT.muted : DT.ink,
    border: 'none',
    padding: '6px 12px', borderRadius: 8,
    fontSize: 11, fontWeight: 800,
    cursor: disabled ? 'not-allowed' : 'pointer',
    whiteSpace: 'nowrap',
  };
}

function openLeadStyle() {
  return {
    ...FONT,
    display: 'inline-flex', alignItems: 'center', gap: 4,
    background: DT.white,
    color: DT.goldDark,
    border: `1px solid ${DT.gold}`,
    padding: '5px 11px', borderRadius: 8,
    fontSize: 11, fontWeight: 800,
    textDecoration: 'none', whiteSpace: 'nowrap',
  };
}
