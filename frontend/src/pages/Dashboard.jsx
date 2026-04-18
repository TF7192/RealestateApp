import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Building2,
  Store,
  Target,
  Handshake,
  TrendingUp,
  ArrowUpLeft,
  Plus,
  UserPlus,
  Flame,
  MessageCircle,
  FileText,
  Clock3,
  UserCircle,
  Sun,
  PhoneCall,
  Sparkles,
} from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import ShareCatalogDialog from '../components/ShareCatalogDialog';
import PullRefresh from '../components/PullRefresh';
import { relativeDate } from '../lib/relativeDate';
import { shareSheet } from '../native/share';
import { useViewportMobile, useDelayedFlag } from '../hooks/mobile';
import { pageCache } from '../lib/pageCache';
import haptics from '../lib/haptics';
import './Dashboard.css';

function formatPrice(price) {
  if (!price) return '₪0';
  if (price < 10000) return `₪${price.toLocaleString('he-IL')}/חודש`;
  return `₪${price.toLocaleString('he-IL')}`;
}

export default function Dashboard() {
  // Seed from cache so a return trip paints stats instantly. If no
  // cache exists (first visit) we fall back to loading = true.
  const _cached = pageCache.get('dashboard');
  const [data, setData] = useState(_cached || null);
  const [loading, setLoading] = useState(!_cached);

  const load = async () => {
    try {
      const [summary, props, leads, owners] = await Promise.all([
        api.dashboard(),
        api.listProperties({ mine: '1' }),
        api.listLeads(),
        api.listOwners().catch(() => ({ items: [] })),
      ]);
      const next = {
        summary,
        properties: props.items || [],
        leads: leads.items || [],
        owners: owners.items || [],
      };
      setData(next);
      pageCache.set('dashboard', next);
      // Seed per-page caches too so hopping to /properties /customers
      // /owners right after the Dashboard loads paints them instantly.
      pageCache.set('properties', next.properties);
      pageCache.set('customers',  next.leads);
      pageCache.set('owners',     next.owners);
    } catch {
      setData((d) => d || { summary: null, properties: [], leads: [], owners: [] });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await load();
      if (cancelled) return;
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const showSkel = useDelayedFlag(loading, 220);
  if (loading && showSkel) {
    return (
      <PullRefresh onRefresh={load}>
        <div className="dashboard">
          <WelcomeSection />
          <div className="stats-grid">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="stat-card skel" style={{ height: 72 }} />
            ))}
          </div>
        </div>
      </PullRefresh>
    );
  }
  if (loading) {
    // Below the skeleton threshold: show just the welcome so the page
    // chrome is present but no empty stat cards flash before the real
    // numbers arrive.
    return (
      <PullRefresh onRefresh={load}>
        <div className="dashboard">
          <WelcomeSection />
        </div>
      </PullRefresh>
    );
  }

  const summary = data?.summary || {};
  const properties = data?.properties || [];
  const leads = data?.leads || [];
  const owners = data?.owners || [];

  // Real counts, never mock
  const res = summary.properties?.residential || { total: 0, sale: 0, rent: 0 };
  const com = summary.properties?.commercial  || { total: 0, sale: 0, rent: 0 };
  const leadStats = summary.leads || { total: 0, hot: 0, warm: 0, cold: 0 };
  const dealStats = summary.deals || { total: 0, active: 0, signed: 0, totalCommission: 0 };
  const ownersTotal = owners.length;
  const ownersActive = owners.filter((o) => (o.propertyCount || 0) > 0).length;

  const hotLeads = leads.filter((l) => l.status === 'HOT').slice(0, 6);

  // Marketing progress — only count actions on the user's own properties
  const actions = properties.flatMap((p) =>
    Object.values(p.marketingActions || {})
  );
  const completedActions = actions.filter(Boolean).length;
  const totalActions = actions.length;
  const progressPct = totalActions ? Math.round((completedActions / totalActions) * 100) : 0;

  const stats = [
    {
      icon: Building2,
      label: 'נכסי מגורים פעילים',
      value: res.total,
      sub: `${res.sale} מכירה · ${res.rent} השכרה`,
      color: 'var(--gold)',
      bg: 'var(--gold-glow)',
      to: '/properties?assetClass=residential',
    },
    {
      icon: Store,
      label: 'נכסים מסחריים פעילים',
      value: com.total,
      sub: `${com.sale} מכירה · ${com.rent} השכרה`,
      color: 'var(--warning)',
      bg: 'var(--warning-bg)',
      to: '/properties?assetClass=commercial',
    },
    {
      icon: Target,
      label: 'לידים חמים',
      value: leadStats.hot,
      sub: `מתוך ${leadStats.total} לקוחות`,
      color: 'var(--danger)',
      bg: 'var(--danger-bg)',
      to: '/customers?filter=hot',
    },
    {
      icon: Handshake,
      label: 'עסקאות פעילות',
      value: dealStats.active,
      sub: `${dealStats.signed} נסגרו`,
      color: 'var(--success)',
      bg: 'var(--success-bg)',
      to: '/deals',
    },
    {
      icon: TrendingUp,
      label: 'עמלות',
      value: formatPrice(dealStats.totalCommission),
      sub: 'סה״כ עמלות שנגבו',
      color: 'var(--info)',
      bg: 'var(--info-bg)',
      to: '/deals?tab=signed',
    },
    {
      icon: UserCircle,
      label: 'בעלי נכסים',
      value: ownersTotal,
      sub: `${ownersActive} עם נכסים פעילים`,
      color: 'var(--gold)',
      bg: 'var(--gold-glow)',
      to: '/owners',
    },
  ];

  const hasAnyContent = properties.length > 0 || leads.length > 0;

  // ── Marketing / follow-up signals ──────────────────────────────
  const now = Date.now();
  const staleThresholdDays = 30;
  const staleLeads = leads.filter((l) => {
    if (!l.lastContact) return false;
    const diffDays = (now - new Date(l.lastContact).getTime()) / (1000 * 60 * 60 * 24);
    return diffDays >= staleThresholdDays && l.status !== 'COLD';
  });

  return (
    <PullRefresh onRefresh={load}>
      <div className="dashboard">
        <WelcomeSection />

        <TodayStrip leads={leads} properties={properties} />

        <KpiScroller stats={stats} />

        {staleLeads.length > 0 && (
        <div className="dash-signals animate-in animate-in-delay-2">
          {staleLeads.length > 0 && (() => {
            const oldest = staleLeads
              .map((l) => new Date(l.lastContact).getTime())
              .sort((a, b) => a - b)[0];
            const rel = relativeDate(oldest);
            return (
              <Link
                to="/customers?filter=inactive30"
                className="sig-card sig-muted"
                onClick={() => haptics.tap()}
              >
                <Clock3 size={18} />
                <div>
                  <strong>{staleLeads.length} לידים ללא קשר {staleThresholdDays} ימים</strong>
                  <small>
                    הוותיק: <span className={`rel-${rel.severity}`}>{rel.label}</span>
                  </small>
                </div>
              </Link>
            );
          })()}
          <Link
            to="/templates"
            className="sig-card sig-gold"
            onClick={() => haptics.tap()}
          >
            <FileText size={18} />
            <div>
              <strong>תבניות הודעה</strong>
              <small>התאם את ההודעות שיישלחו מהנכסים</small>
            </div>
          </Link>
        </div>
      )}

      {!hasAnyContent ? (
        <div className="dashboard-empty animate-in animate-in-delay-2">
          <div className="de-illustration">🏡</div>
          <h3>ברוך הבא ל-Estia</h3>
          <p>עוד אין לך נתונים. התחל בקליטת הנכס הראשון שלך או הוסף ליד חדש.</p>
          <div className="de-actions">
            <Link to="/properties/new" className="btn btn-primary btn-lg">
              <Plus size={16} /> קליטת נכס
            </Link>
            <Link to="/customers/new" className="btn btn-secondary btn-lg">
              <UserPlus size={16} /> ליד חדש
            </Link>
          </div>
        </div>
      ) : (
        <div className="dashboard-grid">
          {/* Marketing progress — agent's own properties */}
          <div className="card dashboard-card animate-in animate-in-delay-3">
            <div className="card-header">
              <h3>התקדמות שיווק</h3>
              <span className="badge badge-gold">
                {progressPct}%
              </span>
            </div>
            <div className="marketing-progress">
              <div className="progress-bar">
                <div
                  className="progress-fill"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <span className="progress-text">
                {completedActions} מתוך {totalActions} פעולות הושלמו
              </span>
            </div>

            <div className="property-progress-list">
              {properties.slice(0, 4).map((prop) => {
                const acts = Object.values(prop.marketingActions || {});
                const done = acts.filter(Boolean).length;
                const total = acts.length || 1;
                const pct = Math.round((done / total) * 100);
                const updatedTs = prop.updatedAt || prop.createdAt;
                const rel = updatedTs ? relativeDate(updatedTs) : null;
                return (
                  <Link
                    key={prop.id}
                    to={`/properties/${prop.id}`}
                    className="property-progress-item"
                    onClick={() => haptics.tap()}
                  >
                    <div className="ppi-info">
                      <span className="ppi-name">
                        {prop.street}, {prop.city}
                      </span>
                      <span className="ppi-pct">{pct}%</span>
                    </div>
                    <div className="progress-bar small">
                      <div className="progress-fill" style={{ width: `${pct}%` }} />
                    </div>
                    {rel && (
                      <span className={`ppi-updated rel-${rel.severity}`}>
                        עודכן {rel.label}
                      </span>
                    )}
                  </Link>
                );
              })}
              {properties.length === 0 && (
                <div className="de-inline">אין עדיין נכסים. <Link to="/properties/new">הוסף ראשון</Link></div>
              )}
            </div>
          </div>

          {/* Hot leads — pulled from the agent's own leads */}
          <div className="card dashboard-card animate-in animate-in-delay-5">
            <div className="card-header">
              <h3>לידים חמים</h3>
              <Link to="/customers" className="btn btn-ghost btn-sm">
                הכל
                <ArrowUpLeft size={14} />
              </Link>
            </div>
            <div className="hot-leads-list">
              {hotLeads.map((lead) => {
                const lastTs = lead.lastContact || lead.updatedAt || lead.createdAt;
                const rel = lastTs ? relativeDate(lastTs) : null;
                return (
                  <Link
                    key={lead.id}
                    to={`/customers?selected=${lead.id}`}
                    className="hot-lead-item"
                    onClick={() => haptics.tap()}
                  >
                    <div className="lead-avatar hot">
                      {lead.name.charAt(0)}
                    </div>
                    <div className="lead-info">
                      <span className="lead-name">{lead.name}</span>
                      <span className="lead-details">
                        {[lead.city, lead.rooms ? `${lead.rooms} חד׳` : null, lead.priceRangeLabel]
                          .filter(Boolean).join(' · ')}
                      </span>
                      {rel && (
                        <span className={`lead-last rel-${rel.severity}`}>
                          קשר אחרון: {rel.label}
                        </span>
                      )}
                    </div>
                    <Flame size={16} className="lead-flame" />
                  </Link>
                );
              })}
              {hotLeads.length === 0 && (
                <div className="de-inline">
                  אין לידים חמים כרגע.{' '}
                  <Link to="/customers/new">הוסף ליד</Link>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      </div>
    </PullRefresh>
  );
}

function KpiScroller({ stats }) {
  const trackRef = useRef(null);
  const [activeIdx, setActiveIdx] = useState(0);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return undefined;
    const onScroll = () => {
      const cards = track.querySelectorAll('.stat-card');
      if (!cards.length) return;
      const center = track.scrollLeft + track.clientWidth / 2;
      let best = 0;
      let bestDist = Infinity;
      cards.forEach((el, i) => {
        const cardCenter = el.offsetLeft + el.offsetWidth / 2;
        const d = Math.abs(cardCenter - center);
        if (d < bestDist) { bestDist = d; best = i; }
      });
      setActiveIdx(best);
    };
    track.addEventListener('scroll', onScroll, { passive: true });
    return () => track.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <>
      <div className="stats-grid" ref={trackRef}>
        {stats.map((stat, i) => (
          <Link
            key={stat.label}
            to={stat.to}
            className={`stat-card animate-in animate-in-delay-${Math.min(i + 1, 5)}`}
            onClick={() => haptics.tap()}
          >
            <div className="stat-icon" style={{ background: stat.bg, color: stat.color }}>
              <stat.icon size={22} />
            </div>
            <div className="stat-info">
              <span className="stat-value">{stat.value}</span>
              <span className="stat-label">{stat.label}</span>
              <span className="stat-sub">{stat.sub}</span>
            </div>
          </Link>
        ))}
      </div>
      <div className="stats-dots" aria-hidden="true">
        {stats.map((_, i) => (
          <span
            key={i}
            className={`stats-dot ${i === activeIdx ? 'active' : ''}`}
          />
        ))}
      </div>
    </>
  );
}

// S12 · TodayStrip — the "morning-coffee" summary that answers
// "what do I need to do today?" in one glance. Deliberately calm: no
// counts-in-red, no exclamation marks, no call-to-action verbs. Each
// item is a one-tap link into the filtered page so the agent can act
// without reading long copy.
//
// Only renders tiles that have content — the strip disappears entirely
// on a quiet day rather than showing "0 things to do!" cheerleader copy.
function TodayStrip({ leads = [], properties = [] }) {
  const now = Date.now();
  const DAY = 86400000;

  // Stale leads (HOT/WARM only, ≥10 days) — same threshold as the
  // customer-list pill (S11) so the numbers line up.
  const staleLeads = leads.filter((l) => {
    if (!l.lastContact) return false;
    if (l.status === 'COLD') return false;
    return (now - new Date(l.lastContact).getTime()) / DAY >= 10;
  });

  // Hot leads untouched for even a day. "Hot" means the agent said so —
  // letting a hot lead sit overnight is the expensive miss.
  const hotSilent = leads.filter((l) => {
    if (l.status !== 'HOT') return false;
    if (!l.lastContact) return true;
    return (now - new Date(l.lastContact).getTime()) / DAY >= 1;
  });

  // Properties with no marketing actions ticked yet — likely new intakes
  // where the agent hasn't started promotion.
  const unmarketed = properties.filter((p) => {
    const acts = Object.values(p.marketingActions || {});
    if (!acts.length) return true;
    return acts.every((v) => !v);
  });

  const tiles = [];
  if (hotSilent.length > 0) {
    tiles.push({
      key: 'hot',
      to: '/customers?filter=hot',
      icon: PhoneCall,
      title: `${hotSilent.length} לידים חמים ממתינים`,
      sub: 'עוד לא נוצר קשר היום',
      tone: 'danger',
    });
  }
  if (staleLeads.length > 0) {
    tiles.push({
      key: 'stale',
      to: '/customers?filter=inactive10',
      icon: Clock3,
      title: `${staleLeads.length} לידים ללא קשר 10+ ימים`,
      sub: 'שווה לחזור אליהם',
      tone: 'warn',
    });
  }
  if (unmarketed.length > 0) {
    tiles.push({
      key: 'promo',
      to: '/properties?filter=unmarketed',
      icon: Sparkles,
      title: `${unmarketed.length} נכסים ללא שיווק`,
      sub: 'התחל עם פעולה אחת',
      tone: 'gold',
    });
  }

  if (tiles.length === 0) return null;

  return (
    <section className="today-strip animate-in animate-in-delay-1" aria-label="סדר היום">
      <header className="today-strip-head">
        <Sun size={14} aria-hidden="true" />
        <h3>היום</h3>
      </header>
      <div className="today-strip-rail">
        {tiles.map((t) => {
          const Icon = t.icon;
          return (
            <Link
              key={t.key}
              to={t.to}
              className={`today-tile today-tile-${t.tone}`}
              onClick={() => haptics.tap()}
            >
              <span className="today-tile-icon"><Icon size={16} /></span>
              <span className="today-tile-meta">
                <strong>{t.title}</strong>
                <small>{t.sub}</small>
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function WelcomeSection() {
  const { user } = useAuth();
  const [shareOpen, setShareOpen] = useState(false);
  const isMobile = useViewportMobile();

  const displayName = user?.displayName || 'סוכן';
  const catalogUrl = user?.slug
    ? `${window.location.origin}/agents/${encodeURI(user.slug)}`
    : (user?.id ? `${window.location.origin}/a/${user.id}` : null);

  const handleShare = async () => {
    haptics.tap();
    if (!catalogUrl) return;
    if (isMobile) {
      const text = [
        `שלום, זה ${displayName || 'הסוכן שלך'}.`,
        'ריכזתי עבורך את כל הנכסים שלי במקום אחד:',
      ].join('\n');
      const ok = await shareSheet({
        title: 'הקטלוג שלי',
        text,
        url: catalogUrl,
      });
      // If native/webshare worked (or clipboard fallback did), we're done.
      if (ok) return;
    }
    // Fallback: open the preview dialog (desktop or share sheet unavailable)
    setShareOpen(true);
  };

  return (
    <>
      <div className="welcome-section animate-in">
        <div className="welcome-content">
          <h2>שלום, {displayName.split(' ')[0]}</h2>
          <p>סיכום פעילות יומי</p>
        </div>
        <div className="welcome-actions">
          <button
            className="btn btn-primary btn-lg"
            onClick={handleShare}
            disabled={!catalogUrl}
            title="תצוגה מקדימה ושיתוף"
          >
            <MessageCircle size={18} />
            שתף את הנכסים שלי
          </button>
          <Link to="/properties/new" className="btn btn-ghost btn-lg">
            <Plus size={18} />
            קליטת נכס
          </Link>
          <Link to="/customers/new" className="btn btn-ghost btn-lg">
            <UserPlus size={18} />
            ליד חדש
          </Link>
        </div>
      </div>
      {shareOpen && catalogUrl && (
        <ShareCatalogDialog
          catalogUrl={catalogUrl}
          agentName={displayName}
          onClose={() => setShareOpen(false)}
        />
      )}
    </>
  );
}
