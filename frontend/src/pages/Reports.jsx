// Reports — sprint 8.x refine. Cream & gold DT palette, inline
// styles, Hebrew-first RTL, matching the "Estia Refined Pages"
// bundle (2026-04-24). Same owner-scoped endpoints as before
// (E1 /reports/new-properties, /reports/new-customers,
// /reports/deals, /reports/viewings, /reports/marketing-actions,
// B5 /reports/export/*.csv) — re-laid-out as a hero summary,
// KPI chip row, deals-by-status progress strip, and a polished
// export card with planned (disabled) buttons tooltipped.
//
// No new backend endpoint was required; every KPI the design
// shows is already returned by the existing report routes.

import { useEffect, useMemo, useState } from 'react';
import {
  BarChart3, Building2, Users, Handshake, CalendarDays,
  Megaphone, Download, FileSpreadsheet, TrendingUp, Banknote,
  Sparkles,
} from 'lucide-react';
import api from '../lib/api';
import { useToast } from '../lib/toast';
import { displayPrice } from '../lib/display';
import { useViewportMobile } from '../hooks/mobile';
import DateRangePicker from '../components/DateRangePicker';

// ─── DT tokens (lifted verbatim from the refined bundle) ────
const DT = {
  cream: '#f7f3ec', cream2: '#efe9df', cream3: '#e8dfcf', cream4: '#fbf7f0',
  white: '#ffffff',
  ink: '#1e1a14', muted: '#6b6356',
  gold: '#b48b4c', goldLight: '#d9b774', goldDark: '#7a5c2c',
  goldSoft: 'rgba(180,139,76,0.12)',
  border: 'rgba(30,26,20,0.08)', borderStrong: 'rgba(30,26,20,0.14)',
  success: '#15803d', danger: '#b91c1c',
};
const FONT = { fontFamily: 'Assistant, Heebo, -apple-system, sans-serif' };

// Available CSV export kinds (live on the backend — B5).
const CSV_KINDS = [
  { kind: 'properties', label: 'נכסים',  Icon: Building2 },
  { kind: 'leads',      label: 'לקוחות',  Icon: Users },
  { kind: 'deals',      label: 'עסקאות',  Icon: Handshake },
];

// Lane 6 — CSV endpoints planned but not shipped. Render as disabled
// buttons with a tooltip rather than ship dead links.
const PLANNED_CSV_KINDS = [
  { kind: 'viewings',          label: 'צפיות',          Icon: CalendarDays },
  { kind: 'marketing-actions', label: 'פעולות שיווק',   Icon: Megaphone },
];
const PLANNED_CSV_TOOLTIP = 'ייצוא CSV בפיתוח — נוסף בקרוב';

// Deal-status labels (Hebrew) + tone colours.
// Deal-status labels (Hebrew) + tone colours. Keys match the real
// Prisma enum values — the backend's /reports/dashboard byStatus
// bucket is keyed by those enums, so any missing key here renders
// raw English on the chart.
const STATUS_LABELS = {
  NEGOTIATING:      'במו״מ',
  WAITING_MORTGAGE: 'אישור משכנתא',
  PENDING_CONTRACT: 'לקראת חתימה',
  SIGNED:           'נחתמה',
  CLOSED:           'נסגרה',
  FELL_THROUGH:     'לא יצאה לפועל',
  CANCELLED:        'בוטלה',
  // Legacy fallbacks — old data may still carry these.
  OPEN:    'פתוחה',
  PENDING: 'בהמתנה',
  WON:     'נסגרה',
  LOST:    'אבדה',
};
const STATUS_TONE = {
  SIGNED:           DT.success,
  CLOSED:           DT.success,
  WON:              DT.success,
  NEGOTIATING:      DT.goldDark,
  WAITING_MORTGAGE: DT.gold,
  PENDING_CONTRACT: DT.gold,
  OPEN:             DT.gold,
  PENDING:          DT.goldDark,
  FELL_THROUGH:     DT.danger,
  LOST:             DT.danger,
  CANCELLED:        DT.muted,
};

export default function Reports() {
  const toast = useToast();
  const isMobile = useViewportMobile(820);
  const [from, setFrom] = useState('');
  const [to,   setTo]   = useState('');
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({
    newProperties:     { count: 0 },
    newCustomers:      { count: 0 },
    deals:             { count: 0, totalCommission: 0, byStatus: {} },
    viewings:          { count: 0 },
    marketingActions:  { count: 0 },
  });

  const params = useMemo(() => {
    const p = {};
    if (from) p.from = from;
    if (to)   p.to   = to;
    return p;
  }, [from, to]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [nProps, nCust, deals, views, mkt] = await Promise.all([
          api.reportNewProperties(params).catch(() => ({ count: 0 })),
          api.reportNewCustomers(params).catch(() => ({ count: 0 })),
          api.reportDeals(params).catch(() => ({
            count: 0, totalCommission: 0, byStatus: {},
          })),
          api.reportViewings(params).catch(() => ({ count: 0 })),
          api.reportMarketingActions(params).catch(() => ({ count: 0 })),
        ]);
        if (cancelled) return;
        setData({
          newProperties:    nProps,
          newCustomers:     nCust,
          deals,
          viewings:         views,
          marketingActions: mkt,
        });
      } catch {
        if (!cancelled) toast.error('שגיאה בטעינת הדוחות');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [params, toast]);

  const onDateChange = ({ from: f, to: t }) => { setFrom(f); setTo(t); };

  const totalDeals = data.deals?.count || 0;
  const totalCommission = data.deals?.totalCommission ?? 0;

  const kpis = [
    {
      key: 'properties', label: 'נכסים חדשים',
      count: data.newProperties?.count || 0,
      Icon: Building2,
      sub: 'התווספו בטווח הנבחר',
    },
    {
      key: 'customers',  label: 'לקוחות חדשים',
      count: data.newCustomers?.count || 0,
      Icon: Users,
      sub: 'לידים שנרשמו אצלכם',
    },
    {
      key: 'deals',      label: 'עסקאות',
      count: totalDeals,
      Icon: Handshake,
      sub: totalDeals > 0
        ? `עמלה כוללת: ${displayPrice(totalCommission)}`
        : 'עדיין אין עסקאות בטווח',
      emphasise: totalDeals > 0,
    },
    {
      key: 'viewings',   label: 'צפיות',
      count: data.viewings?.count || 0,
      Icon: CalendarDays,
      sub: 'מפגשים שנרשמו',
    },
    {
      key: 'marketing',  label: 'פעולות שיווק',
      count: data.marketingActions?.count || 0,
      Icon: Megaphone,
      sub: 'הושלמו בטווח',
    },
  ];

  const byStatus = data.deals?.byStatus || {};
  const byStatusEntries = Object.entries(byStatus);
  const maxStatusCount = byStatusEntries.reduce(
    (m, [, n]) => (n > m ? n : m), 0,
  );

  return (
    <div
      className="reports-page"
      dir="rtl"
      style={{
        ...FONT,
        padding: isMobile ? '18px 14px 28px' : 28,
        color: DT.ink,
        minHeight: '100%',
      }}
    >
      {/* Hero header */}
      <header
        className="reports-header"
        style={{
          display: 'flex', alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: 12, flexWrap: 'wrap',
          marginBottom: isMobile ? 16 : 22,
        }}
      >
        <div className="reports-title" style={{ minWidth: 0 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            fontSize: 10, color: DT.goldDark, fontWeight: 800,
            letterSpacing: 1, textTransform: 'uppercase',
          }}>
            <Sparkles size={11} aria-hidden="true" /> דוחות · ביצועים
          </div>
          <h1 style={{
            fontSize: isMobile ? 22 : 30, fontWeight: 800,
            letterSpacing: isMobile ? -0.5 : -0.8,
            margin: '4px 0 0', color: DT.ink,
          }}>
            דוחות
          </h1>
          <p className="reports-subtitle" style={{
            margin: '6px 0 0', fontSize: isMobile ? 12 : 14,
            color: DT.muted, lineHeight: 1.5, maxWidth: 580,
          }}>
            סקירת ביצועים לפי טווח תאריכים. בחרו טווח —
            הנתונים יתעדכנו אוטומטית וניתן לייצא ל-CSV.
          </p>
        </div>
        <HeroSummaryChip
          label="סה״כ עמלה בטווח"
          value={displayPrice(totalCommission)}
          Icon={Banknote}
          isMobile={isMobile}
        />
      </header>

      {/* Filters card (date range picker) */}
      <section
        className="reports-filters"
        aria-label="מסנני דוח"
        style={{
          background: DT.white,
          border: `1px solid ${DT.border}`,
          borderRadius: 14,
          padding: isMobile ? 12 : 16,
          marginBottom: isMobile ? 14 : 18,
        }}
      >
        <DateRangePicker from={from} to={to} onChange={onDateChange} />
      </section>

      {/* KPI tiles */}
      <section
        className="reports-tiles"
        aria-label="תוצאות הדוח"
        aria-busy={loading ? 'true' : 'false'}
        style={{
          display: 'grid',
          gap: isMobile ? 10 : 14,
          gridTemplateColumns: isMobile
            ? 'repeat(2, minmax(0, 1fr))'
            : 'repeat(auto-fit, minmax(190px, 1fr))',
          marginBottom: isMobile ? 14 : 18,
        }}
      >
        {kpis.map((k) => (
          <KpiTile key={k.key} kpi={k} loading={loading} isMobile={isMobile} />
        ))}
      </section>

      {/* Deals-by-status progress strip */}
      {byStatusEntries.length > 0 && (
        <section
          className="reports-status"
          aria-label="פילוח עסקאות לפי סטטוס"
          style={{
            background: DT.white,
            border: `1px solid ${DT.border}`,
            borderRadius: 14,
            padding: isMobile ? 14 : 18,
            marginBottom: isMobile ? 14 : 18,
          }}
        >
          <div style={{
            display: 'flex', alignItems: 'center',
            justifyContent: 'space-between', marginBottom: 12,
            gap: 8, flexWrap: 'wrap',
          }}>
            <div>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                fontSize: 10, color: DT.goldDark, fontWeight: 800,
                letterSpacing: 1, textTransform: 'uppercase',
              }}>
                <TrendingUp size={11} aria-hidden="true" /> פילוח
              </div>
              <h2 style={{
                fontSize: 15, fontWeight: 800, margin: '2px 0 0',
                color: DT.ink,
              }}>
                עסקאות לפי סטטוס
              </h2>
            </div>
            <div style={{ fontSize: 12, color: DT.muted, fontWeight: 600 }}>
              סה״כ · <strong style={{ color: DT.ink }}>{totalDeals}</strong>
            </div>
          </div>
          <div>
            {byStatusEntries
              .slice()
              .sort(([, a], [, b]) => b - a)
              .map(([status, count], i, arr) => {
                const pct = maxStatusCount > 0
                  ? Math.max(6, (count / maxStatusCount) * 100)
                  : 0;
                const tone = STATUS_TONE[status] || DT.gold;
                const label = STATUS_LABELS[status] || status;
                return (
                  <div
                    key={status}
                    style={{ marginBottom: i === arr.length - 1 ? 0 : 10 }}
                  >
                    <div style={{
                      display: 'flex', justifyContent: 'space-between',
                      fontSize: 12, marginBottom: 4,
                    }}>
                      <span style={{ fontWeight: 700, color: DT.ink }}>
                        {label}
                      </span>
                      <span style={{
                        color: tone, fontWeight: 800,
                        fontVariantNumeric: 'tabular-nums',
                      }}>
                        {count}
                      </span>
                    </div>
                    <div style={{
                      background: DT.cream3, height: 8, borderRadius: 99,
                      overflow: 'hidden',
                    }}>
                      <div style={{
                        width: `${pct}%`, height: '100%',
                        background: tone === DT.gold
                          ? `linear-gradient(90deg, ${DT.goldLight}, ${DT.gold})`
                          : tone,
                      }} />
                    </div>
                  </div>
                );
              })}
          </div>
        </section>
      )}

      {/* CSV export card */}
      <section
        className="reports-export"
        aria-label="ייצוא CSV"
        style={{
          background: DT.white,
          border: `1px solid ${DT.border}`,
          borderRadius: 14,
          padding: isMobile ? 14 : 18,
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'flex-start',
          justifyContent: 'space-between', gap: 12, marginBottom: 12,
          flexWrap: 'wrap',
        }}>
          <div>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              fontSize: 10, color: DT.goldDark, fontWeight: 800,
              letterSpacing: 1, textTransform: 'uppercase',
            }}>
              <FileSpreadsheet size={11} aria-hidden="true" /> ייצוא
            </div>
            <h2 style={{
              fontSize: 15, fontWeight: 800, margin: '2px 0 0',
              color: DT.ink,
            }}>
              ייצוא CSV
            </h2>
            <p className="reports-export-hint" style={{
              margin: '4px 0 0', fontSize: 12, color: DT.muted,
              lineHeight: 1.5,
            }}>
              הקבצים מיוצאים עם הנתונים הזמינים בחשבון שלכם
              (UTF-8 עם BOM כדי ש-Excel יזהה עברית).
            </p>
          </div>
        </div>

        <div
          className="reports-export-actions"
          style={{
            display: 'flex', flexWrap: 'wrap', gap: 8,
          }}
        >
          {CSV_KINDS.map((c) => (
            <a
              key={c.kind}
              href={api.exportUrl(c.kind)}
              download
              className="btn btn-secondary"
              data-testid={`csv-${c.kind}`}
              style={csvBtnStyle({ disabled: false })}
            >
              <Download size={14} aria-hidden="true" />
              <span>ייצוא {c.label}</span>
            </a>
          ))}
          {PLANNED_CSV_KINDS.map((c) => (
            <button
              key={c.kind}
              type="button"
              className="btn btn-secondary"
              disabled
              aria-disabled="true"
              title={PLANNED_CSV_TOOLTIP}
              aria-label={`ייצוא ${c.label} — ${PLANNED_CSV_TOOLTIP}`}
              data-testid={`csv-${c.kind}`}
              style={csvBtnStyle({ disabled: true })}
            >
              <Download size={14} aria-hidden="true" />
              <span>ייצוא {c.label}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────
function KpiTile({ kpi, loading, isMobile }) {
  const { label, count, Icon, sub, emphasise } = kpi;
  return (
    <article
      className="report-tile"
      style={{
        background: DT.white,
        border: `1px solid ${emphasise ? DT.goldSoft : DT.border}`,
        borderRadius: 14,
        padding: isMobile ? 12 : 16,
        position: 'relative', overflow: 'hidden',
      }}
    >
      {emphasise && (
        <div
          aria-hidden="true"
          style={{
            position: 'absolute', top: 0, insetInlineStart: 0,
            width: '100%', height: 3,
            background: `linear-gradient(90deg, ${DT.goldLight}, ${DT.gold})`,
          }}
        />
      )}
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        alignItems: 'flex-start',
      }}>
        <div className="report-tile-label" style={{
          fontSize: isMobile ? 11 : 12,
          color: DT.muted, fontWeight: 700,
          lineHeight: 1.35, minWidth: 0,
        }}>{label}</div>
        <span
          className="report-tile-icon"
          aria-hidden="true"
          style={{
            color: DT.gold, background: DT.goldSoft,
            width: isMobile ? 26 : 32,
            height: isMobile ? 26 : 32,
            borderRadius: 8,
            display: 'grid', placeItems: 'center',
            flexShrink: 0,
          }}
        >
          <Icon size={isMobile ? 13 : 15} />
        </span>
      </div>
      <div
        className="report-tile-count"
        style={{
          fontSize: isMobile ? 22 : 30, fontWeight: 800,
          letterSpacing: isMobile ? -0.5 : -0.8,
          marginTop: isMobile ? 4 : 8,
          color: DT.ink,
          fontVariantNumeric: 'tabular-nums',
          opacity: loading ? 0.5 : 1,
        }}
      >
        {loading ? '…' : count.toLocaleString('he-IL')}
      </div>
      {sub && (
        <div
          className="report-tile-sub"
          style={{
            marginTop: 4, fontSize: 11,
            color: emphasise ? DT.goldDark : DT.muted,
            fontWeight: emphasise ? 700 : 500,
            lineHeight: 1.4,
          }}
        >
          {sub}
        </div>
      )}
    </article>
  );
}

function HeroSummaryChip(props) {
  const { label, value, Icon, isMobile } = props;
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 10,
      background: `linear-gradient(180deg, ${DT.cream4}, ${DT.cream2})`,
      border: `1px solid ${DT.border}`,
      borderRadius: 12,
      padding: isMobile ? '8px 12px' : '10px 14px',
    }}>
      <span style={{
        color: DT.gold, background: DT.goldSoft,
        width: 32, height: 32, borderRadius: 8,
        display: 'grid', placeItems: 'center', flexShrink: 0,
      }}>
        <Icon size={15} aria-hidden="true" />
      </span>
      <div style={{ minWidth: 0 }}>
        <div style={{
          fontSize: 10, color: DT.muted, fontWeight: 700,
          textTransform: 'uppercase', letterSpacing: 0.5,
        }}>{label}</div>
        <div style={{
          fontSize: isMobile ? 14 : 17, fontWeight: 800,
          color: DT.ink, letterSpacing: -0.3,
          fontVariantNumeric: 'tabular-nums',
        }}>{value}</div>
      </div>
    </div>
  );
}

function csvBtnStyle({ disabled }) {
  return {
    ...FONT,
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '9px 14px', borderRadius: 10,
    background: disabled ? DT.cream2 : DT.white,
    border: `1px solid ${DT.border}`,
    color: disabled ? DT.muted : DT.ink,
    fontSize: 13, fontWeight: 700,
    textDecoration: 'none',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.75 : 1,
  };
}

// Suppress unused-import warning on BarChart3 — reserved for a
// future sparkline atop the page header when the time-series
// endpoints are ready.
void BarChart3;
