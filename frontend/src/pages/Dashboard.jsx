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
  Clock,
  Flame,
  Eye,
} from 'lucide-react';
import { properties, leads, deals, formatPrice } from '../data/mockData';
import './Dashboard.css';

export default function Dashboard() {
  const activeProperties = properties.filter((p) => p.status === 'active');
  const residential = activeProperties.filter((p) => p.assetClass === 'residential');
  const commercial = activeProperties.filter((p) => p.assetClass === 'commercial');
  const resSale = residential.filter((p) => p.category === 'sale').length;
  const resRent = residential.filter((p) => p.category === 'rent').length;
  const comSale = commercial.filter((p) => p.category === 'sale').length;
  const comRent = commercial.filter((p) => p.category === 'rent').length;
  const hotLeads = leads.filter((l) => l.status === 'hot');
  const activeDeals = deals.filter((d) => d.status !== 'נחתם');
  const closedDeals = deals.filter((d) => d.status === 'נחתם');
  const totalCommission = closedDeals.reduce((s, d) => s + (d.commission || 0), 0);

  const completedActions = properties.reduce((total, p) => {
    return total + Object.values(p.marketingActions).filter(Boolean).length;
  }, 0);
  const totalActions = properties.reduce((total, p) => {
    return total + Object.values(p.marketingActions).length;
  }, 0);

  // Each stat card now links to a relevant page — full-row clickable.
  const stats = [
    {
      icon: Building2,
      label: 'נכסי מגורים פעילים',
      value: residential.length,
      sub: `${resSale} מכירה · ${resRent} השכרה`,
      color: 'var(--gold)',
      bg: 'var(--gold-glow)',
      to: '/properties?assetClass=residential',
    },
    {
      icon: Store,
      label: 'נכסים מסחריים פעילים',
      value: commercial.length,
      sub: `${comSale} מכירה · ${comRent} השכרה`,
      color: 'var(--warning)',
      bg: 'var(--warning-bg)',
      to: '/properties?assetClass=commercial',
    },
    {
      icon: Target,
      label: 'לידים חמים',
      value: hotLeads.length,
      sub: `מתוך ${leads.length} לידים`,
      color: 'var(--danger)',
      bg: 'var(--danger-bg)',
      to: '/leads?filter=hot',
    },
    {
      icon: Handshake,
      label: 'עסקאות פעילות',
      value: activeDeals.length,
      sub: `${closedDeals.length} נסגרו`,
      color: 'var(--success)',
      bg: 'var(--success-bg)',
      to: '/deals',
    },
    {
      icon: TrendingUp,
      label: 'עמלות',
      value: formatPrice(totalCommission),
      sub: 'סה״כ עמלות שנגבו',
      color: 'var(--info)',
      bg: 'var(--info-bg)',
      to: '/deals?tab=signed',
    },
  ];

  const recentActivity = [
    {
      icon: Eye,
      text: 'רינה שמעון ביקרה בנכס בהשקד 22',
      time: 'לפני שעתיים',
      type: 'visit',
    },
    {
      icon: Flame,
      text: 'ליד חם חדש: נועה אלון מבאר יעקב',
      time: 'לפני 5 שעות',
      type: 'lead',
    },
    {
      icon: Handshake,
      text: 'עסקת העצמאות 44 נחתמה בהצלחה',
      time: 'אתמול',
      type: 'deal',
    },
    {
      icon: Clock,
      text: 'תזכורת: ליצור קשר עם חיים ורדי',
      time: 'אתמול',
      type: 'reminder',
    },
  ];

  return (
    <div className="dashboard">
      {/* Welcome section */}
      <div className="welcome-section animate-in">
        <div className="welcome-content">
          <h2>שלום, יוסי</h2>
          <p>סיכום פעילות יומי</p>
        </div>
        <div className="welcome-actions">
          <Link to="/properties/new" className="btn btn-primary btn-lg">
            <Plus size={18} />
            קליטת נכס
          </Link>
          <Link to="/leads/new" className="btn btn-secondary btn-lg">
            <UserPlus size={18} />
            ליד חדש
          </Link>
        </div>
      </div>

      {/* Stats grid — whole card is clickable */}
      <div className="stats-grid">
        {stats.map((stat, i) => (
          <Link
            key={stat.label}
            to={stat.to}
            className={`stat-card animate-in animate-in-delay-${Math.min(i + 1, 5)}`}
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

      {/* Content grid */}
      <div className="dashboard-grid">
        {/* Marketing progress */}
        <div className="card dashboard-card animate-in animate-in-delay-3">
          <div className="card-header">
            <h3>התקדמות שיווק</h3>
            <span className="badge badge-gold">
              {Math.round((completedActions / totalActions) * 100)}%
            </span>
          </div>
          <div className="marketing-progress">
            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{
                  width: `${(completedActions / totalActions) * 100}%`,
                }}
              />
            </div>
            <span className="progress-text">
              {completedActions} מתוך {totalActions} פעולות הושלמו
            </span>
          </div>

          <div className="property-progress-list">
            {properties.slice(0, 4).map((prop) => {
              const done = Object.values(prop.marketingActions).filter(Boolean).length;
              const total = Object.values(prop.marketingActions).length;
              const pct = Math.round((done / total) * 100);
              return (
                <Link
                  key={prop.id}
                  to={`/properties/${prop.id}`}
                  className="property-progress-item"
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
                </Link>
              );
            })}
          </div>
        </div>

        {/* Recent activity */}
        <div className="card dashboard-card animate-in animate-in-delay-4">
          <div className="card-header">
            <h3>פעילות אחרונה</h3>
          </div>
          <div className="activity-list">
            {recentActivity.map((item, i) => (
              <div key={i} className="activity-item">
                <div className={`activity-icon ${item.type}`}>
                  <item.icon size={16} />
                </div>
                <div className="activity-content">
                  <span className="activity-text">{item.text}</span>
                  <span className="activity-time">{item.time}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Hot leads — each item links to that specific lead, not the full list */}
        <div className="card dashboard-card animate-in animate-in-delay-5">
          <div className="card-header">
            <h3>לידים חמים</h3>
            <Link to="/leads" className="btn btn-ghost btn-sm">
              הכל
              <ArrowUpLeft size={14} />
            </Link>
          </div>
          <div className="hot-leads-list">
            {hotLeads.map((lead) => (
              <Link
                key={lead.id}
                to={`/leads?selected=${lead.id}`}
                className="hot-lead-item"
              >
                <div className="lead-avatar hot">
                  {lead.name.charAt(0)}
                </div>
                <div className="lead-info">
                  <span className="lead-name">{lead.name}</span>
                  <span className="lead-details">
                    {lead.city} · {lead.rooms} חד׳ · {lead.priceRange}
                  </span>
                </div>
                <Flame size={16} className="lead-flame" />
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
