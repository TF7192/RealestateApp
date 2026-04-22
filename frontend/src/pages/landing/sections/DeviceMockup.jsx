import {
  Flame, Thermometer, Snowflake,
  Bell, Search, Home, Users, CalendarDays, ArrowUpRight,
  Phone, MessageCircle, MapPin, Bed, Maximize,
  Sparkles, TrendingUp, Zap, Star,
} from 'lucide-react';

/**
 * In-browser phone mockup — rendered entirely with HTML + CSS + lucide
 * icons. Zero image requests so the landing never shows a broken-photo
 * state while real screenshots are prepared.
 *
 * Variants:
 *   • "dashboard"  — hero: agent's live dashboard (KPIs, pipeline,
 *                    hot-leads list, today's calendar slot, AI badge)
 *   • "property"   — mobile section: a property detail card with a
 *                    gold-gradient "photo" hero, price, feature chips,
 *                    owner block, and WhatsApp action row
 */
export default function DeviceMockup({ ariaLabel, variant = 'dashboard' }) {
  return (
    <div className="lp-device" role="img" aria-label={ariaLabel}>
      <div className="lp-device-frame">
        <div className="lp-device-notch" aria-hidden="true" />
        <div className="lp-device-screen">
          {variant === 'property' ? <PropertyMock /> : <DashboardMock />}
        </div>
      </div>
    </div>
  );
}

/* ─── Hero — full live dashboard ─── */
function DashboardMock() {
  return (
    <div className="lp-mock">
      <div className="lp-mock-status">
        <span className="lp-mock-time">9:41</span>
        <div className="lp-mock-status-icons">
          <span className="lp-mock-sig" />
          <span className="lp-mock-wifi" />
          <span className="lp-mock-batt" />
        </div>
      </div>

      <header className="lp-mock-header">
        <div className="lp-mock-greet">
          <span className="lp-mock-hi">שלום, יוסי <span className="lp-mock-wave">👋</span></span>
          <span className="lp-mock-date">יום שלישי · 22 באפריל</span>
        </div>
        <div className="lp-mock-header-actions">
          <span className="lp-mock-icon-btn" aria-hidden="true"><Search size={14} /></span>
          <span className="lp-mock-icon-btn lp-mock-bell-btn" aria-hidden="true">
            <Bell size={14} />
            <span className="lp-mock-bell-dot" />
          </span>
        </div>
      </header>

      <div className="lp-mock-ai-banner">
        <span className="lp-mock-ai-icon"><Sparkles size={12} /></span>
        <div>
          <strong>AI מציע:</strong> 3 לידים מתאימים לנכס ברמלה
        </div>
        <ArrowUpRight size={12} />
      </div>

      <div className="lp-mock-kpis">
        <div className="lp-mock-kpi">
          <span className="lp-mock-kpi-icon"><Users size={12} /></span>
          <div>
            <span className="lp-mock-kpi-n">24</span>
            <span className="lp-mock-kpi-l">לידים פעילים</span>
          </div>
          <span className="lp-mock-kpi-delta up">+3</span>
        </div>
        <div className="lp-mock-kpi">
          <span className="lp-mock-kpi-icon"><Home size={12} /></span>
          <div>
            <span className="lp-mock-kpi-n">12</span>
            <span className="lp-mock-kpi-l">נכסים</span>
          </div>
          <span className="lp-mock-kpi-delta">8 פעילים</span>
        </div>
        <div className="lp-mock-kpi lp-mock-kpi-accent">
          <span className="lp-mock-kpi-icon"><TrendingUp size={12} /></span>
          <div>
            <span className="lp-mock-kpi-n">₪8.4M</span>
            <span className="lp-mock-kpi-l">בצנרת</span>
          </div>
        </div>
      </div>

      <div className="lp-mock-section-title">
        <span><Flame size={11} style={{ color: 'var(--danger)', verticalAlign: -1 }} /> לידים חמים היום</span>
        <span className="lp-mock-link">הכל ←</span>
      </div>

      <ul className="lp-mock-list">
        {[
          { avatar: 'ד', name: 'דוד לוי',       sub: '4 חד׳ · רמת גן · עד ₪2.8M',   Icon: Flame,       tone: 'hot',  time: 'לפני 8 דק׳' },
          { avatar: 'מ', name: 'מיכל בן-עמי',   sub: 'פגישה היום · 14:30',          Icon: CalendarDays, tone: 'warm', time: 'היום'   },
          { avatar: 'י', name: 'יונתן כהן',     sub: 'מרפסת · ראשון לציון · ₪3.4M', Icon: Flame,       tone: 'hot',  time: 'אתמול'  },
        ].map((it) => (
          <li className="lp-mock-row" key={it.name}>
            <span className={`lp-mock-avatar lp-mock-${it.tone}`} aria-hidden="true">{it.avatar}</span>
            <div className="lp-mock-row-body">
              <span className="lp-mock-row-name">{it.name}</span>
              <span className="lp-mock-row-sub">{it.sub}</span>
            </div>
            <div className="lp-mock-row-meta">
              <span className={`lp-mock-dotpulse lp-mock-${it.tone}`} aria-hidden="true" />
              <span className="lp-mock-row-time">{it.time}</span>
            </div>
          </li>
        ))}
      </ul>

      <div className="lp-mock-calendar-strip">
        <span className="lp-mock-cal-icon"><CalendarDays size={13} /></span>
        <div className="lp-mock-cal-body">
          <span className="lp-mock-cal-title">פגישה עם מיכל בן-עמי</span>
          <span className="lp-mock-cal-sub">14:30 · רחוב הרצל 42, רמלה</span>
        </div>
        <span className="lp-mock-cal-time">עוד 2ש׳</span>
      </div>

      <nav className="lp-mock-tabbar" aria-hidden="true">
        <span className="lp-mock-tab is-active"><Home size={14} /> בית</span>
        <span className="lp-mock-tab"><Users size={14} /> לידים</span>
        <span className="lp-mock-tab lp-mock-tab-fab" aria-hidden="true">+</span>
        <span className="lp-mock-tab"><Zap size={14} /> פעולות</span>
        <span className="lp-mock-tab"><CalendarDays size={14} /> יומן</span>
      </nav>
    </div>
  );
}

/* ─── Mobile section — property detail card ─── */
function PropertyMock() {
  return (
    <div className="lp-mock">
      <div className="lp-mock-status">
        <span className="lp-mock-time">14:02</span>
        <div className="lp-mock-status-icons">
          <span className="lp-mock-sig" />
          <span className="lp-mock-wifi" />
          <span className="lp-mock-batt" />
        </div>
      </div>

      <div className="lp-mock-property-hero">
        <div className="lp-mock-property-photo" aria-hidden="true">
          <span className="lp-mock-photo-badge"><Star size={10} /> בלעדי</span>
          <span className="lp-mock-photo-count">1 / 14</span>
          <span className="lp-mock-photo-house" aria-hidden="true">🏡</span>
        </div>
      </div>

      <div className="lp-mock-property-head">
        <div>
          <span className="lp-mock-property-type">דירה · מכירה</span>
          <h4 className="lp-mock-property-addr">הרצל 42, רמת גן</h4>
          <span className="lp-mock-property-meta"><MapPin size={10} /> הבורסה</span>
        </div>
        <div className="lp-mock-property-price">
          <span className="lp-mock-price">₪2,850,000</span>
          <span className="lp-mock-price-sqm">₪29,689 למ״ר</span>
        </div>
      </div>

      <div className="lp-mock-chips-row">
        <span className="lp-mock-feat"><Bed size={10} /> 4 חד׳</span>
        <span className="lp-mock-feat"><Maximize size={10} /> 96 מ״ר</span>
        <span className="lp-mock-feat">קומה 3/5</span>
        <span className="lp-mock-feat lp-mock-feat-gold">מרפסת שמש</span>
      </div>

      <div className="lp-mock-owner-card">
        <span className="lp-mock-avatar lp-mock-warm" aria-hidden="true">ש</span>
        <div className="lp-mock-owner-body">
          <span className="lp-mock-owner-name">שמעון כהן</span>
          <span className="lp-mock-owner-sub">בעלים · מרץ 2023</span>
        </div>
        <span className="lp-mock-owner-pill">פנוי מיידי</span>
      </div>

      <div className="lp-mock-action-row">
        <span className="lp-mock-action lp-mock-action-wa"><MessageCircle size={14} /> שליחה ללקוח</span>
        <span className="lp-mock-action"><Phone size={14} /></span>
      </div>

      <div className="lp-mock-tag-row">
        <span className="lp-mock-mini-chip">3 לקוחות מתאימים</span>
        <span className="lp-mock-mini-chip lp-mock-mini-chip-ai">
          <Sparkles size={9} /> תיאור חדש
        </span>
      </div>

      <nav className="lp-mock-tabbar" aria-hidden="true">
        <span className="lp-mock-tab"><Home size={14} /> בית</span>
        <span className="lp-mock-tab is-active"><Home size={14} /> נכסים</span>
        <span className="lp-mock-tab lp-mock-tab-fab">+</span>
        <span className="lp-mock-tab"><Users size={14} /> לקוחות</span>
        <span className="lp-mock-tab"><CalendarDays size={14} /> יומן</span>
      </nav>
    </div>
  );
}
