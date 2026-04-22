import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
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
  Calculator as CalcIcon,
} from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import ShareCatalogDialog from '../components/ShareCatalogDialog';
import PullRefresh from '../components/PullRefresh';
import DeltaBadge from '../components/DeltaBadge';
import { Segmented } from '../components/SmartFields';
import { relativeDate } from '../lib/relativeDate';
import { shareSheet } from '../native/share';
import { useViewportMobile, useDelayedFlag } from '../hooks/mobile';
import useDashboardDeltas from '../hooks/useDashboardDeltas';
import { pageCache } from '../lib/pageCache';
import haptics from '../lib/haptics';
import './Dashboard.css';

// Period keys for DeltaBadge labels + the Segmented options. The actual
// Hebrew / English strings live in dashboard.json (period.*, periodLong.*)
// and are resolved inside the component where t() is available.
const PERIOD_KEYS = ['week', 'month', 'quarter'];

function formatPrice(price, rentPerSuffix) {
  if (!price) return '₪0';
  if (price < 10000) return `₪${price.toLocaleString('he-IL')}${rentPerSuffix}`;
  return `₪${price.toLocaleString('he-IL')}`;
}

export default function Dashboard() {
  const { t } = useTranslation('dashboard');
  // Seed from cache so a return trip paints stats instantly. If no
  // cache exists (first visit) we fall back to loading = true.
  const _cached = pageCache.get('dashboard');
  const [data, setData] = useState(_cached || null);
  const [loading, setLoading] = useState(!_cached);
  // B2 — rolling-delta window. Default "week" matches Nadlan One's
  // out-of-the-box dashboard. All three windows are fetched once on
  // mount (see useDashboardDeltas) so switching is instant.
  const [period, setPeriod] = useState('week');
  const deltas = useDashboardDeltas(period);

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
  // F-21 — when data came from the page cache we're probably refetching
  // fresher numbers in the background; mark the tiles with a shimmer
  // so an agent doesn't mistake "0 hot leads (stale)" for "genuinely 0".
  const isRefreshing = loading;

  // Real counts, never mock
  const res = summary.properties?.residential || { total: 0, sale: 0, rent: 0 };
  const com = summary.properties?.commercial  || { total: 0, sale: 0, rent: 0 };
  const leadStats = summary.leads || { total: 0, hot: 0, warm: 0, cold: 0 };
  const dealStats = summary.deals || { total: 0, active: 0, signed: 0, totalCommission: 0 };
  const ownersTotal = owners.length;
  const ownersActive = owners.filter((o) => (o.propertyCount || 0) > 0).length;

  // Note: hot-leads-list and marketing-progress card were removed in
  // favor of the richer 3-card grid (PipelineHealthCard, ActionQueueCard,
  // ConversionFunnelCard). See lower in the file.

  const stats = [
    {
      icon: Building2,
      label: t('stats.residentialActive'),
      value: res.total,
      sub: t('stats.saleRentFormat', { sale: res.sale, rent: res.rent }),
      color: 'var(--gold)',
      bg: 'var(--gold-glow)',
      to: '/properties?assetClass=residential',
      deltaKey: 'properties',
    },
    {
      icon: Store,
      label: t('stats.commercialActive'),
      value: com.total,
      sub: t('stats.saleRentFormat', { sale: com.sale, rent: com.rent }),
      color: 'var(--warning)',
      bg: 'var(--warning-bg)',
      to: '/properties?assetClass=commercial',
      deltaKey: 'properties',
    },
    {
      icon: Target,
      label: t('stats.hotLeads'),
      value: leadStats.hot,
      sub: t('stats.leadsTotalFormat', { count: leadStats.total }),
      color: 'var(--danger)',
      bg: 'var(--danger-bg)',
      to: '/customers?filter=hot',
      deltaKey: 'customers',
    },
    {
      icon: Handshake,
      label: t('stats.dealsActive'),
      value: dealStats.active,
      sub: t('stats.dealsClosedFormat', { count: dealStats.signed }),
      color: 'var(--success)',
      bg: 'var(--success-bg)',
      to: '/deals',
      deltaKey: 'deals',
    },
    {
      icon: TrendingUp,
      label: t('stats.commissions'),
      value: formatPrice(dealStats.totalCommission, t('rentPer')),
      sub: t('stats.commissionsSub'),
      color: 'var(--info)',
      bg: 'var(--info-bg)',
      to: '/deals?tab=signed',
      // Commission-total doesn't map cleanly to a count delta, so we
      // intentionally don't show a pill here.
      deltaKey: null,
    },
    {
      icon: UserCircle,
      label: t('stats.owners'),
      value: ownersTotal,
      sub: t('stats.ownersActiveFormat', { count: ownersActive }),
      color: 'var(--gold)',
      bg: 'var(--gold-glow)',
      to: '/owners',
      // No report endpoint for owners deltas yet.
      deltaKey: null,
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

  const periodOptions = PERIOD_KEYS.map((key) => ({ value: key, label: t(`period.${key}`) }));

  return (
    <PullRefresh onRefresh={load}>
      <div className="dashboard">
        <WelcomeSection />

        <TodayStrip leads={leads} properties={properties} />

        <div className="kpi-period-row">
          <span className="kpi-period-label">{t('periodLabel')}</span>
          <Segmented
            value={period}
            onChange={setPeriod}
            options={periodOptions}
            ariaLabel={t('periodAria')}
          />
        </div>

        <KpiScroller
          stats={stats}
          refreshing={isRefreshing}
          deltaBucket={deltas[period]}
          periodLabel={t(`periodLong.${period}`)}
        />

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
                  <strong>{t('staleLeads.title', { count: staleLeads.length, days: staleThresholdDays })}</strong>
                  <small>
                    {t('staleLeads.oldest')}<span className={`rel-${rel.severity}`}>{rel.label}</span>
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
              <strong>{t('templates.title')}</strong>
              <small>{t('templates.description')}</small>
            </div>
          </Link>
        </div>
      )}

      {!hasAnyContent ? (
        <div className="dashboard-empty animate-in animate-in-delay-2">
          <div className="de-illustration">🏡</div>
          <h3>{t('empty.welcomeTitle')}</h3>
          <p>{t('empty.welcomeBody')}</p>
          <div className="de-actions">
            <Link to="/properties/new" className="btn btn-primary btn-lg">
              <Plus size={16} /> {t('ctas.newProperty')}
            </Link>
            <Link to="/customers/new" className="btn btn-secondary btn-lg">
              <UserPlus size={16} /> {t('ctas.newLead')}
            </Link>
          </div>
        </div>
      ) : (
        <div className="dashboard-grid dashboard-grid-rich">
          <PipelineHealthCard leads={leads} dealStats={dealStats} />
          <ActionQueueCard
            leads={leads}
            properties={properties}
            staleThresholdDays={staleThresholdDays}
          />
          {/* D-1 — משפך המרה card removed. The conversion numbers it
              showed (leads → hot → active → signed) repeated data
              already surfaced across the KPI scroller above, and the
              funnel's "signed deals" row was misleading for agents
              still closing their first deal. Card + its CSS deleted
              together so the grid reflows cleanly to two cards. */}
        </div>
      )}
      </div>
    </PullRefresh>
  );
}

function KpiScroller({ stats, refreshing = false, deltaBucket = null, periodLabel = '' }) {
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
        {stats.map((stat, i) => {
          // Per-KPI delta — null means either the bucket failed to load
          // or this stat doesn't map to a report endpoint (owners,
          // commission total). In both cases we just skip the pill so
          // the tile still shows its total.
          const deltaValue = stat.deltaKey && deltaBucket
            ? deltaBucket[stat.deltaKey]
            : null;
          const showDelta = stat.deltaKey && Number.isFinite(Number(deltaValue));
          return (
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
                <span className="stat-value-row">
                  <span className={`stat-value ${refreshing ? 'stat-value-refreshing' : ''}`}>{stat.value}</span>
                  {showDelta && (
                    <DeltaBadge value={Number(deltaValue)} label={periodLabel} />
                  )}
                </span>
                <span className="stat-label">{stat.label}</span>
                <span className="stat-sub">{stat.sub}</span>
              </div>
            </Link>
          );
        })}
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
  const { t } = useTranslation('dashboard');
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
      title: t('today.hotSilent.title', { count: hotSilent.length }),
      sub: t('today.hotSilent.sub'),
      tone: 'danger',
    });
  }
  if (staleLeads.length > 0) {
    tiles.push({
      key: 'stale',
      to: '/customers?filter=inactive10',
      icon: Clock3,
      title: t('today.stale.title', { count: staleLeads.length }),
      sub: t('today.stale.sub'),
      tone: 'warn',
    });
  }
  if (unmarketed.length > 0) {
    tiles.push({
      key: 'promo',
      to: '/properties?filter=unmarketed',
      icon: Sparkles,
      title: t('today.unmarketed.title', { count: unmarketed.length }),
      sub: t('today.unmarketed.sub'),
      tone: 'gold',
    });
  }

  // UX review F-4.2 — on a quiet day, keep the strip visible with a
  // positive empty state. Collapsing silently breaks the agent's
  // morning scan rhythm — they think the widget broke.
  if (tiles.length === 0) {
    return (
      <section className="today-strip animate-in animate-in-delay-1" aria-label={t('today.aria')}>
        <header className="today-strip-head">
          <Sun size={14} aria-hidden="true" />
          <h3>{t('today.heading')}</h3>
        </header>
        <div className="today-strip-rail">
          <div className="today-tile today-tile-ok" aria-live="polite">
            <span className="today-tile-icon"><Sparkles size={16} /></span>
            <span className="today-tile-meta">
              <strong>{t('today.allClearTitle')}</strong>
              <small>{t('today.allClearSub')}</small>
            </span>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="today-strip animate-in animate-in-delay-1" aria-label={t('today.aria')}>
      <header className="today-strip-head">
        <Sun size={14} aria-hidden="true" />
        <h3>{t('today.heading')}</h3>
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
  const { t } = useTranslation('dashboard');
  const { user } = useAuth();
  const [shareOpen, setShareOpen] = useState(false);
  const isMobile = useViewportMobile();

  const displayName = user?.displayName || t('fallbacks.agent');
  const firstName = displayName.split(' ')[0];
  const catalogUrl = user?.slug
    ? `${window.location.origin}/agents/${encodeURI(user.slug)}`
    : (user?.id ? `${window.location.origin}/a/${user.id}` : null);

  const handleShare = async () => {
    haptics.tap();
    if (!catalogUrl) return;
    if (isMobile) {
      const text = [
        t('share.greetingLine', { name: displayName || t('fallbacks.yourAgent') }),
        t('share.introLine'),
      ].join('\n');
      const ok = await shareSheet({
        title: t('share.title'),
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
          <h2>{t('greeting', { firstName })}</h2>
          <p>{t('subtitle')}</p>
        </div>
        <div className="welcome-actions">
          <button
            className="btn btn-secondary btn-lg"
            onClick={handleShare}
            disabled={!catalogUrl}
            title={t('sharePreview')}
          >
            <MessageCircle size={18} />
            {t('ctas.share')}
          </button>
          <Link to="/properties/new" className="btn btn-ghost btn-lg">
            <Plus size={18} />
            {t('ctas.newProperty')}
          </Link>
          <Link to="/customers/new" className="btn btn-ghost btn-lg">
            <UserPlus size={18} />
            {t('ctas.newLead')}
          </Link>
          {/* Used constantly during pricing conversations — surface
              right next to the create-shortcuts so it's a one-tap
              reach from the dashboard. Yad2 import is a one-time
              setup tool, not on this row; reachable via more-sheet. */}
          <Link to="/calculator" className="btn btn-ghost btn-lg">
            <CalcIcon size={18} />
            {t('ctas.calculator')}
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

// ── Pipeline Health ──────────────────────────────────────────────
// Distribution of leads across HOT / WARM / COLD as a horizontal
// stacked bar. Each segment is a clickable Link that opens the
// customers list pre-filtered to that status. Below the bar: 3 mini
// stat tiles + the total pipeline value (sum of lead.budget).
function PipelineHealthCard({ leads = [] }) {
  const buckets = leads.reduce(
    (acc, l) => {
      const k = l.status === 'HOT' ? 'hot' : l.status === 'WARM' ? 'warm' : 'cold';
      acc[k] += 1;
      acc.budget += Number(l.budget) || 0;
      return acc;
    },
    { hot: 0, warm: 0, cold: 0, budget: 0 },
  );
  const total = buckets.hot + buckets.warm + buckets.cold;
  const pct = (n) => (total ? (n / total) * 100 : 0);
  const fmtBudget = (n) => {
    if (!n) return '—';
    if (n >= 1_000_000) return `₪${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `₪${Math.round(n / 1_000)}K`;
    return `₪${n.toLocaleString('he-IL')}`;
  };

  return (
    <div className="card dashboard-card dash-pipeline animate-in animate-in-delay-3">
      <div className="card-header">
        <h3>מצב הלידים</h3>
        <span className="badge badge-gold">{total} סה״כ</span>
      </div>
      <div className="dash-pipeline-bar" role="img" aria-label={`${buckets.hot} חמים, ${buckets.warm} פושרים, ${buckets.cold} קרים`}>
        {total === 0 && <div className="dash-pipeline-empty">—</div>}
        {buckets.hot > 0 && (
          <Link to="/customers?filter=hot" className="dpb-seg dpb-hot" style={{ width: `${pct(buckets.hot)}%` }} title={`${buckets.hot} לידים חמים`}>
            <span>{buckets.hot}</span>
          </Link>
        )}
        {buckets.warm > 0 && (
          <Link to="/customers?filter=warm" className="dpb-seg dpb-warm" style={{ width: `${pct(buckets.warm)}%` }} title={`${buckets.warm} פושרים`}>
            <span>{buckets.warm}</span>
          </Link>
        )}
        {buckets.cold > 0 && (
          <Link to="/customers?filter=cold" className="dpb-seg dpb-cold" style={{ width: `${pct(buckets.cold)}%` }} title={`${buckets.cold} קרים`}>
            <span>{buckets.cold}</span>
          </Link>
        )}
      </div>
      <div className="dash-pipeline-legend">
        <Link to="/customers?filter=hot" className="dpl-item">
          <span className="dpl-dot dpl-hot" /> חמים <strong>{buckets.hot}</strong>
        </Link>
        <Link to="/customers?filter=warm" className="dpl-item">
          <span className="dpl-dot dpl-warm" /> פושרים <strong>{buckets.warm}</strong>
        </Link>
        <Link to="/customers?filter=cold" className="dpl-item">
          <span className="dpl-dot dpl-cold" /> קרים <strong>{buckets.cold}</strong>
        </Link>
      </div>
      <div className="dash-pipeline-budget">
        <span>שווי צנרת לידים</span>
        <strong>{fmtBudget(buckets.budget)}</strong>
      </div>
    </div>
  );
}

// ── Action Queue ─────────────────────────────────────────────────
// Mixed list of properties and leads needing the agent's attention,
// sorted by urgency. Surfaces:
//   - Properties with marketing < 30%
//   - Leads with no contact in the last `staleThresholdDays` days
//   - Properties with no marketing actions completed at all
// Capped at 6 rows; click takes the agent straight to the detail page.
function ActionQueueCard({ leads = [], properties = [], staleThresholdDays = 30 }) {
  const now = Date.now();
  const items = [];

  // Stale leads — needs follow-up
  for (const l of leads) {
    if (l.status === 'COLD') continue;
    if (!l.lastContact) continue;
    const days = (now - new Date(l.lastContact).getTime()) / 86400000;
    if (days >= staleThresholdDays) {
      items.push({
        kind: 'stale-lead',
        id: l.id,
        score: days,
        title: l.name,
        hint: `ללא מגע כבר ${Math.floor(days)} ימים`,
        to: `/customers?selected=${l.id}`,
        Icon: Clock3,
        tone: 'warn',
      });
    }
  }

  // Properties with low marketing %
  for (const p of properties) {
    const acts = Object.values(p.marketingActions || {});
    if (acts.length === 0) continue;
    const done = acts.filter(Boolean).length;
    const pct = Math.round((done / acts.length) * 100);
    if (pct < 30) {
      items.push({
        kind: 'low-marketing',
        id: p.id,
        score: 100 - pct,
        title: `${p.street}, ${p.city}`,
        hint: `שיווק ${pct}% — נדרש דחיפה`,
        to: `/properties/${p.id}?panel=marketing`,
        Icon: Sparkles,
        tone: 'info',
      });
    }
  }

  items.sort((a, b) => b.score - a.score);
  const visible = items.slice(0, 6);

  return (
    <div className="card dashboard-card dash-action-queue animate-in animate-in-delay-4">
      <div className="card-header">
        <h3>תור פעולות</h3>
        <span className="badge badge-gold">{items.length}</span>
      </div>
      {visible.length === 0 ? (
        <div className="de-inline">
          הכל מסודר ✦ אין פעולות דחופות
        </div>
      ) : (
        <div className="dash-aq-list">
          {visible.map((it) => (
            <Link
              key={`${it.kind}-${it.id}`}
              to={it.to}
              className={`dash-aq-row dash-aq-${it.tone}`}
              onClick={() => haptics.tap()}
            >
              <span className="dash-aq-icon" aria-hidden="true"><it.Icon size={16} /></span>
              <div className="dash-aq-info">
                <strong>{it.title}</strong>
                <span>{it.hint}</span>
              </div>
              <ArrowUpLeft size={14} aria-hidden="true" />
            </Link>
          ))}
        </div>
      )}
      {items.length > visible.length && (
        <div className="dash-aq-more">+{items.length - visible.length} נוספות</div>
      )}
    </div>
  );
}

// D-1 — ConversionFunnelCard removed. Left this anchor for git-blame
// readers: the component used to live here and drew a four-step
// funnel (leads → hot → active → signed). The data duplicated the KPI
// scroller and the "signed deals" row was demotivating for agents
// still closing their first deal.
