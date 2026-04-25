import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  TrendingUp, Flame, Handshake, Building2, Home, Briefcase,
  PhoneCall, MessageCircle, ChevronLeft, ArrowUpRight, Sparkles, MapPin,
} from 'lucide-react';
import { properties, leads, deals, formatPrice } from '../../data/mockData';
import { haptics, openExternal } from '../../native';
import { telUrl, whatsappUrl } from '../../native/actions';

export default function MobileDashboard() {
  const navigate = useNavigate();
  const stats = useMemo(() => computeStats(), []);
  const hotLeads = leads.filter((l) => l.status === 'hot').slice(0, 3);
  const openDeals = deals.filter((d) => d.status !== 'נחתם').slice(0, 3);
  const featured = properties.slice(0, 6);

  return (
    <div className="m-page m-stagger">
      <div className="m-greeting-hero">
        <span className="m-eyebrow"><Sparkles size={11} /> היום</span>
        <h1 className="m-page-title">לחזור ללקוחות שלך.</h1>
        <p className="m-page-sub">
          {hotLeads.length} לידים חמים ממתינים לשיחה · {openDeals.length} עסקאות פעילות
        </p>
      </div>

      <section className="m-kpi-scroller" style={{ marginTop: 22 }}>
        <KpiCard
          label="מגורים"
          value={stats.residential}
          icon={<Home size={14} />}
          meta={`${stats.residentialRent} להשכרה`}
          onClick={() => navigate('/properties?assetClass=residential')}
          highlight
        />
        <KpiCard
          label="מסחרי"
          value={stats.commercial}
          icon={<Briefcase size={14} />}
          meta={`${stats.commercialRent} להשכרה`}
          onClick={() => navigate('/properties?assetClass=commercial')}
        />
        <KpiCard
          label="לידים חמים"
          value={stats.hotLeads}
          icon={<Flame size={14} />}
          meta={`מתוך ${leads.length}`}
          onClick={() => navigate('/leads?filter=hot')}
        />
        <KpiCard
          label="עסקאות פעילות"
          value={stats.openDeals}
          icon={<Handshake size={14} />}
          meta={formatPrice(stats.openDealsValue)}
          onClick={() => navigate('/deals')}
        />
        <KpiCard
          label="עמלות נסגרו"
          value={`₪${(stats.closedCommission / 1000).toFixed(0)}K`}
          icon={<TrendingUp size={14} />}
          meta={`${stats.closedDeals} עסקאות`}
          onClick={() => navigate('/deals')}
        />
      </section>

      {hotLeads.length > 0 && (
        <>
          <div className="m-section-header" style={{ padding: 0, marginInline: 0 }}>
            <h2 className="m-section-title">שיחות פתוחות</h2>
            <Link className="m-section-link" to="/customers?filter=hot">
              הצג הכל <ChevronLeft size={14} style={{ verticalAlign: 'middle' }} />
            </Link>
          </div>
          <div className="m-stagger" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {hotLeads.map((lead) => (
              <HotLeadCard key={lead.id} lead={lead} onOpen={() => navigate(`/leads`)} />
            ))}
          </div>
        </>
      )}

      <div className="m-section-header" style={{ padding: 0, marginInline: 0 }}>
        <h2 className="m-section-title">נכסים מומלצים</h2>
        <Link className="m-section-link" to="/properties">
          הצג הכל <ChevronLeft size={14} style={{ verticalAlign: 'middle' }} />
        </Link>
      </div>
      <div className="m-featured-scroller">
        {featured.map((p) => (
          <Link key={p.id} to={`/properties/${p.id}`} className="m-featured-card" onClick={() => haptics.tap()}>
            <div className="m-featured-img">
              {/* PERF-005 — featured cards are ~280 px wide so the 768 px
                  card variant is the right one when present. */}
              <img src={p.imageList?.[0]?.urlCard || p.imageThumbs?.[0] || p.images?.[0]} alt={p.street} loading="lazy" />
              <div className="m-featured-price">{formatPrice(p.marketingPrice)}</div>
            </div>
            <div className="m-featured-body">
              <div className="m-featured-addr">{p.street}</div>
              <div className="m-featured-meta">
                <MapPin size={11} />
                {p.city} · {p.sqm} מ״ר
              </div>
            </div>
          </Link>
        ))}
      </div>

      {openDeals.length > 0 && (
        <>
          <div className="m-section-header" style={{ padding: 0, marginInline: 0 }}>
            <h2 className="m-section-title">עסקאות פתוחות</h2>
            <Link className="m-section-link" to="/deals">
              הצג הכל <ChevronLeft size={14} style={{ verticalAlign: 'middle' }} />
            </Link>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {openDeals.map((d) => (
              <div key={d.id} className="m-deal-stage" onClick={() => { haptics.tap(); navigate('/deals'); }}>
                <div className="m-deal-stage-header">
                  <span className="m-deal-stage-title">{d.propertyStreet}, {d.city}</span>
                  <span className="m-deal-stage-count">{d.status[0]}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{d.status}</span>
                  <span style={{ fontFamily: 'var(--font-display)', color: 'var(--gold-light)', fontSize: 15 }}>
                    {formatPrice(d.offer || d.marketingPrice)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <style>{`
        .m-greeting-hero { padding-top: 8px; padding-bottom: 6px; }
        .m-featured-scroller {
          display: flex; gap: 12px; overflow-x: auto;
          padding: 0 20px; margin: 12px -20px 0; scrollbar-width: none;
          scroll-snap-type: x mandatory;
        }
        .m-featured-scroller::-webkit-scrollbar { display: none; }
        .m-featured-card {
          min-width: 210px; flex-shrink: 0; scroll-snap-align: start;
          background: var(--bg-card); border: 1px solid var(--m-hairline);
          border-radius: var(--m-radius-md); overflow: hidden; cursor: pointer;
          transition: transform 0.15s;
        }
        .m-featured-card:active { transform: scale(0.98); }
        .m-featured-img { position: relative; width: 100%; aspect-ratio: 4/3; background: var(--bg-elevated); }
        .m-featured-img img { width: 100%; height: 100%; object-fit: cover; }
        .m-featured-price {
          position: absolute; bottom: 10px; right: 10px;
          padding: 5px 10px; border-radius: var(--m-radius-xs);
          background: rgba(13, 15, 20, 0.85);
          color: var(--gold-light); font-family: var(--font-display);
          font-size: 14px; backdrop-filter: blur(6px);
        }
        .m-featured-body { padding: 12px 14px 14px; }
        .m-featured-addr {
          font-family: var(--font-display); font-size: 15px; font-weight: 500;
          color: var(--text-primary); letter-spacing: -0.2px;
        }
        .m-featured-meta {
          margin-top: 4px; font-size: 11.5px; color: var(--text-muted);
          display: inline-flex; gap: 4px; align-items: center;
        }
      `}</style>
    </div>
  );
}

function KpiCard({ label, value, meta, icon, onClick, highlight }) {
  return (
    <button
      className={`m-kpi ${highlight ? 'highlight' : ''}`}
      onClick={() => { haptics.tap(); onClick?.(); }}
    >
      <div className="m-kpi-label">{label}</div>
      <div className="m-kpi-value">{value}</div>
      <div className="m-kpi-meta">{icon}{meta}</div>
      <ArrowUpRight
        size={14}
        style={{
          position: 'absolute', top: 14, left: 14,
          color: 'var(--text-muted)', transform: 'rotate(45deg)'
        }}
      />
    </button>
  );
}

function HotLeadCard({ lead, onOpen }) {
  const call = (e) => {
    e.stopPropagation();
    haptics.press();
    openExternal(telUrl(lead.phone));
  };
  const wa = (e) => {
    e.stopPropagation();
    haptics.press();
    openExternal(whatsappUrl(lead.phone, `שלום ${lead.name.split(' ')[0]}, מה שלומך?`));
  };
  return (
    <div className="m-lead-card" onClick={() => { haptics.tap(); onOpen(); }}>
      <div className="m-lead-avatar hot">
        {lead.name.charAt(0)}
      </div>
      <div style={{ minWidth: 0 }}>
        <div className="m-lead-name">{lead.name}</div>
        <div className="m-lead-meta">
          <span className="m-pulse hot" />
          <span>{lead.city} · {lead.rooms} חד׳</span>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <button className="m-icon-btn" onClick={call} aria-label="התקשר" style={{ background: 'rgba(74, 222, 128, 0.12)', color: 'var(--success)', borderColor: 'rgba(74, 222, 128, 0.3)' }}>
          <PhoneCall size={16} />
        </button>
        <button className="m-icon-btn" onClick={wa} aria-label="וואטסאפ" style={{ background: 'rgba(37, 211, 102, 0.12)', color: '#25d366', borderColor: 'rgba(37, 211, 102, 0.3)' }}>
          <MessageCircle size={16} />
        </button>
      </div>
    </div>
  );
}

function computeStats() {
  const residential = properties.filter((p) => p.assetClass === 'residential').length;
  const residentialRent = properties.filter((p) => p.assetClass === 'residential' && p.category === 'rent').length;
  const commercial = properties.filter((p) => p.assetClass === 'commercial').length;
  const commercialRent = properties.filter((p) => p.assetClass === 'commercial' && p.category === 'rent').length;
  const hotLeads = leads.filter((l) => l.status === 'hot').length;
  const open = deals.filter((d) => d.status !== 'נחתם');
  const openDeals = open.length;
  const openDealsValue = open.reduce((s, d) => s + (d.offer || d.marketingPrice || 0), 0);
  const closed = deals.filter((d) => d.status === 'נחתם');
  const closedDeals = closed.length;
  const closedCommission = closed.reduce((s, d) => s + (d.commission || 0), 0);
  return { residential, residentialRent, commercial, commercialRent, hotLeads, openDeals, openDealsValue, closedDeals, closedCommission };
}
