import { Flame, Thermometer, Snowflake, Bell, Search, Home, Users, CalendarDays, ArrowUpRight } from 'lucide-react';

/**
 * In-browser phone mockup rendered entirely in CSS + React — no image
 * assets required, so the landing never ships a broken-photo state
 * while real screenshots are being prepared.
 *
 * Two variants:
 *   • variant="dashboard" (default, hero) — KPI row + agent's lead list
 *   • variant="leads"     (mobile section) — fuller lead list with avatars
 */
export default function DeviceMockup({ ariaLabel, variant = 'dashboard' }) {
  return (
    <div className="lp-device" role="img" aria-label={ariaLabel}>
      <div className="lp-device-frame">
        <div className="lp-device-notch" aria-hidden="true" />
        <div className="lp-device-screen">
          {variant === 'dashboard' ? <DashboardMock /> : <LeadsMock />}
        </div>
      </div>
    </div>
  );
}

/* ─── Dashboard variant — header, KPIs, today's leads ─── */
function DashboardMock() {
  return (
    <div className="lp-mock">
      <div className="lp-mock-status">
        <span className="lp-mock-time">9:41</span>
        <div className="lp-mock-status-icons">
          <span className="lp-mock-dot" /><span className="lp-mock-dot" /><span className="lp-mock-dot" />
        </div>
      </div>

      <header className="lp-mock-header">
        <div className="lp-mock-greet">
          <span className="lp-mock-hi">שלום, יוסי 👋</span>
          <span className="lp-mock-date">יום שלישי · 22 באפריל</span>
        </div>
        <span className="lp-mock-bell" aria-hidden="true"><Bell size={16} /></span>
      </header>

      <div className="lp-mock-kpis">
        <div className="lp-mock-kpi">
          <span className="lp-mock-kpi-icon"><Users size={14} /></span>
          <div>
            <span className="lp-mock-kpi-n">24</span>
            <span className="lp-mock-kpi-l">לידים</span>
          </div>
        </div>
        <div className="lp-mock-kpi">
          <span className="lp-mock-kpi-icon"><Home size={14} /></span>
          <div>
            <span className="lp-mock-kpi-n">12</span>
            <span className="lp-mock-kpi-l">נכסים</span>
          </div>
        </div>
        <div className="lp-mock-kpi lp-mock-kpi-accent">
          <span className="lp-mock-kpi-icon"><ArrowUpRight size={14} /></span>
          <div>
            <span className="lp-mock-kpi-n">3</span>
            <span className="lp-mock-kpi-l">עסקאות</span>
          </div>
        </div>
      </div>

      <div className="lp-mock-section-title">
        <span>לידים חמים היום</span>
        <span className="lp-mock-badge">4</span>
      </div>

      <ul className="lp-mock-list">
        {[
          { name: 'דוד לוי', sub: '4 חד׳ · רמת גן · עד ₪2.8M',       Icon: Flame,       tone: 'hot'  },
          { name: 'מיכל בן-עמי', sub: '3 חד׳ · רמלה · להשכרה',        Icon: Thermometer, tone: 'warm' },
          { name: 'יונתן כהן',  sub: 'מרפסת · ראשון לציון · ₪3.4M',   Icon: Flame,       tone: 'hot'  },
          { name: 'רחל שרון',   sub: 'פגישה מחר ב-14:30',             Icon: CalendarDays, tone: 'cold' },
        ].map((it) => (
          <li className="lp-mock-row" key={it.name}>
            <span className={`lp-mock-row-dot lp-mock-${it.tone}`} aria-hidden="true">
              <it.Icon size={10} />
            </span>
            <div className="lp-mock-row-body">
              <span className="lp-mock-row-name">{it.name}</span>
              <span className="lp-mock-row-sub">{it.sub}</span>
            </div>
          </li>
        ))}
      </ul>

      <div className="lp-mock-cta">
        <Search size={14} />
        <span>חיפוש מהיר…</span>
      </div>
    </div>
  );
}

/* ─── Leads variant — for the mobile-app section ─── */
function LeadsMock() {
  return (
    <div className="lp-mock">
      <div className="lp-mock-status">
        <span className="lp-mock-time">14:02</span>
        <div className="lp-mock-status-icons">
          <span className="lp-mock-dot" /><span className="lp-mock-dot" /><span className="lp-mock-dot" />
        </div>
      </div>
      <header className="lp-mock-header lp-mock-header-compact">
        <div className="lp-mock-greet">
          <span className="lp-mock-title-lg">הלידים שלי</span>
          <span className="lp-mock-date">24 פעילים · 4 חמים</span>
        </div>
        <span className="lp-mock-bell" aria-hidden="true"><Search size={16} /></span>
      </header>

      <div className="lp-mock-chip-row">
        <span className="lp-mock-chip lp-mock-chip-active">הכל · 24</span>
        <span className="lp-mock-chip">חם · 4</span>
        <span className="lp-mock-chip">פושר · 9</span>
        <span className="lp-mock-chip">קר · 11</span>
      </div>

      <ul className="lp-mock-list">
        {[
          { name: 'דוד לוי',     sub: '4 חד׳ · רמת גן · עד ₪2.8M',  tone: 'hot',  avatar: 'ד' },
          { name: 'מיכל בן-עמי', sub: '3 חד׳ · רמלה · להשכרה',       tone: 'warm', avatar: 'מ' },
          { name: 'יונתן כהן',    sub: 'מרפסת · ראשון לציון · ₪3.4M', tone: 'hot',  avatar: 'י' },
          { name: 'רחל שרון',     sub: 'פגישה מחר · 14:30',           tone: 'cold', avatar: 'ר' },
          { name: 'אבי ברוך',     sub: 'לא נענה 3 ימים',              tone: 'cold', avatar: 'א' },
        ].map((it) => (
          <li className="lp-mock-row lp-mock-row-roomy" key={it.name}>
            <span className={`lp-mock-avatar lp-mock-${it.tone}`} aria-hidden="true">{it.avatar}</span>
            <div className="lp-mock-row-body">
              <span className="lp-mock-row-name">{it.name}</span>
              <span className="lp-mock-row-sub">{it.sub}</span>
            </div>
            <span className={`lp-mock-row-pulse lp-mock-${it.tone}`} aria-hidden="true" />
          </li>
        ))}
      </ul>
    </div>
  );
}
