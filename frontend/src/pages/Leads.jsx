import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  UserPlus,
  Search,
  Phone,
  MessageCircle,
  Flame,
  Thermometer,
  Snowflake,
  Eye,
  Calendar,
} from 'lucide-react';
import {
  leads,
  properties,
  getStatusColor,
  getStatusLabel,
} from '../data/mockData';
import './Leads.css';

export default function Leads() {
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');

  const filtered = leads.filter((l) => {
    if (filter !== 'all' && l.status !== filter) return false;
    if (search) {
      const s = search.toLowerCase();
      return l.name.includes(s) || l.city.includes(s) || l.phone.includes(s);
    }
    return true;
  });

  const statusIcon = (status) => {
    switch (status) {
      case 'hot': return <Flame size={14} />;
      case 'warm': return <Thermometer size={14} />;
      case 'cold': return <Snowflake size={14} />;
      default: return null;
    }
  };

  const handleWhatsApp = (lead) => {
    const matchingProps = properties.filter((p) => {
      if (lead.city && p.city !== lead.city) return false;
      return true;
    });
    let text = `שלום ${lead.name}! `;
    if (matchingProps.length > 0) {
      text += `מצאתי עבורך נכסים שעשויים לעניין אותך ב${lead.city}. `;
      text += `אשמח לתאם ביקור. צור/צרי קשר בכל עת.`;
    }
    window.open(
      `https://wa.me/${lead.phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(text)}`,
      '_blank'
    );
  };

  return (
    <div className="leads-page">
      <div className="page-header animate-in">
        <div className="page-header-info">
          <h2>ניהול לידים</h2>
          <p>{leads.length} לידים פעילים</p>
        </div>
        <div className="page-header-actions">
          <Link to="/leads/new" className="btn btn-primary">
            <UserPlus size={18} />
            ליד חדש
          </Link>
        </div>
      </div>

      <div className="filters-bar animate-in animate-in-delay-1">
        <div className="search-box">
          <Search size={18} />
          <input
            type="text"
            placeholder="חיפוש לפי שם, עיר, טלפון..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="filter-tabs">
          {[
            { key: 'all', label: 'הכל', count: leads.length },
            { key: 'hot', label: 'חם', count: leads.filter((l) => l.status === 'hot').length },
            { key: 'warm', label: 'חמים', count: leads.filter((l) => l.status === 'warm').length },
            { key: 'cold', label: 'קר', count: leads.filter((l) => l.status === 'cold').length },
          ].map((f) => (
            <button
              key={f.key}
              className={`filter-tab ${filter === f.key ? 'active' : ''}`}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
              <span className="filter-count">{f.count}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="leads-grid animate-in animate-in-delay-2">
        {filtered.map((lead) => (
          <div key={lead.id} className="lead-card">
            <div className="lead-card-header">
              <div className="lead-card-avatar">
                {lead.name.charAt(0)}
              </div>
              <div className="lead-card-info">
                <h4>{lead.name}</h4>
                <span className="lead-card-source">{lead.source}</span>
              </div>
              <span className={`badge badge-${getStatusColor(lead.status)}`}>
                {statusIcon(lead.status)}
                {getStatusLabel(lead.status)}
              </span>
            </div>

            <div className="lead-card-details">
              <div className="lcd-row">
                <span className="lcd-label">עיר</span>
                <span className="lcd-value">{lead.city}</span>
              </div>
              <div className="lcd-row">
                <span className="lcd-label">חדרים</span>
                <span className="lcd-value">{lead.rooms || '—'}</span>
              </div>
              <div className="lcd-row">
                <span className="lcd-label">טווח מחירים</span>
                <span className="lcd-value">{lead.priceRange}</span>
              </div>
              <div className="lcd-row">
                <span className="lcd-label">סוג</span>
                <span className="lcd-value">{lead.interestType}</span>
              </div>
              <div className="lcd-row">
                <span className="lcd-label">אישור עקרוני</span>
                <span className="lcd-value">
                  {lead.preApproval ? (
                    <span style={{ color: 'var(--success)' }}>יש</span>
                  ) : (
                    <span style={{ color: 'var(--text-muted)' }}>אין</span>
                  )}
                </span>
              </div>
              {lead.propertiesViewed.length > 0 && (
                <div className="lcd-row">
                  <span className="lcd-label">נכסים שנצפו</span>
                  <span className="lcd-value lcd-properties">
                    {lead.propertiesViewed.map((pid) => {
                      const p = properties.find((pr) => pr.id === pid);
                      return p ? (
                        <Link
                          key={pid}
                          to={`/properties/${pid}`}
                          className="lcd-property-link"
                        >
                          {p.street}
                        </Link>
                      ) : null;
                    })}
                  </span>
                </div>
              )}
            </div>

            {lead.notes && (
              <div className="lead-card-notes">
                <p>{lead.notes}</p>
              </div>
            )}

            <div className="lead-card-footer">
              <div className="lead-card-dates">
                <span>
                  <Calendar size={12} />
                  {lead.lastContact}
                </span>
              </div>
              <div className="lead-card-actions">
                <a
                  href={`tel:${lead.phone}`}
                  className="btn btn-ghost btn-sm"
                >
                  <Phone size={14} />
                  {lead.phone}
                </a>
                <button
                  className="btn btn-sm btn-primary"
                  onClick={() => handleWhatsApp(lead)}
                >
                  <MessageCircle size={14} />
                  וואטסאפ
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
