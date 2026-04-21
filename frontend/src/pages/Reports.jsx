import { useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  Building2,
  Users,
  Handshake,
  CalendarDays,
  Megaphone,
  Download,
} from 'lucide-react';
import api from '../lib/api';
import { useToast } from '../lib/toast';
import { displayPrice } from '../lib/display';
import DateRangePicker from '../components/DateRangePicker';
import './Reports.css';

// E1 — Reports page.
//
// Pulls the five owner-scoped report endpoints in parallel whenever the
// date range changes. Counts surface as KPI tiles; the Deals tile adds
// a sub-line with total commission and per-status breakdown. B5 CSV
// export buttons render as <a href={api.exportUrl(kind)}> — the API
// helper returns a URL string, the browser handles the download.

const CSV_KINDS = [
  { kind: 'properties', label: 'נכסים',  Icon: Building2 },
  { kind: 'leads',      label: 'לקוחות',  Icon: Users },
  { kind: 'deals',      label: 'עסקאות',  Icon: Handshake },
];

const STATUS_LABELS = {
  OPEN:      'פתוחה',
  PENDING:   'בהמתנה',
  WON:       'נסגרה',
  LOST:      'אבדה',
  CANCELLED: 'בוטלה',
};

export default function Reports() {
  const toast = useToast();
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
          api.reportDeals(params).catch(() => ({ count: 0, totalCommission: 0, byStatus: {} })),
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

  const tiles = [
    { key: 'properties', label: 'נכסים חדשים',  Icon: Building2,   count: data.newProperties?.count || 0 },
    { key: 'customers',  label: 'לקוחות חדשים',  Icon: Users,       count: data.newCustomers?.count || 0 },
    { key: 'deals',      label: 'עסקאות',        Icon: Handshake,   count: data.deals?.count || 0 },
    { key: 'viewings',   label: 'צפיות',         Icon: CalendarDays, count: data.viewings?.count || 0 },
    { key: 'marketing',  label: 'פעולות שיווק', Icon: Megaphone,   count: data.marketingActions?.count || 0 },
  ];

  const byStatus = data.deals?.byStatus || {};
  const byStatusEntries = Object.entries(byStatus);

  return (
    <div className="reports-page" dir="rtl">
      <header className="reports-header">
        <div className="reports-title">
          <BarChart3 size={22} aria-hidden="true" />
          <h1>דוחות</h1>
        </div>
        <p className="reports-subtitle">
          סקירת ביצועים לפי טווח תאריכים. בחר/י טווח והמספרים יתעדכנו.
        </p>
      </header>

      <section className="reports-filters" aria-label="מסנני דוח">
        <DateRangePicker from={from} to={to} onChange={onDateChange} />
      </section>

      <section
        className="reports-tiles"
        aria-label="תוצאות הדוח"
        aria-busy={loading ? 'true' : 'false'}
      >
        {tiles.map((t) => (
          <article key={t.key} className="report-tile">
            <div className="report-tile-icon" aria-hidden="true">
              <t.Icon size={20} />
            </div>
            <div className="report-tile-body">
              <div className="report-tile-label">{t.label}</div>
              <div className="report-tile-count">{t.count}</div>
              {t.key === 'deals' && (
                <div className="report-tile-sub">
                  <span>עמלה כוללת: </span>
                  <strong>{displayPrice(data.deals?.totalCommission ?? 0)}</strong>
                </div>
              )}
            </div>
          </article>
        ))}
      </section>

      {byStatusEntries.length > 0 && (
        <section className="reports-status" aria-label="פילוח עסקאות לפי סטטוס">
          <h2>עסקאות לפי סטטוס</h2>
          <ul className="reports-status-list">
            {byStatusEntries.map(([status, count]) => (
              <li key={status} className="reports-status-item">
                <span className="reports-status-label">
                  {STATUS_LABELS[status] || status}
                </span>
                <span className="reports-status-count">{count}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="reports-export" aria-label="ייצוא CSV">
        <h2>ייצוא CSV</h2>
        <p className="reports-export-hint">
          הקבצים מיוצאים לפי הנתונים הזמינים בחשבון שלך.
        </p>
        <div className="reports-export-actions">
          {CSV_KINDS.map((c) => (
            <a
              key={c.kind}
              href={api.exportUrl(c.kind)}
              download
              className="btn btn-secondary"
              data-testid={`csv-${c.kind}`}
            >
              <Download size={16} aria-hidden="true" />
              <span>ייצוא {c.label}</span>
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}
