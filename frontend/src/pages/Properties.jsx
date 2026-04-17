import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Plus,
  Search,
  Filter,
  Building2,
  MapPin,
  Bed,
  Maximize,
  Eye,
  Share2,
  ChevronDown,
} from 'lucide-react';
import { properties, formatPrice } from '../data/mockData';
import './Properties.css';

export default function Properties() {
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [view, setView] = useState('grid');

  const filtered = properties.filter((p) => {
    if (filter === 'sale' && p.category !== 'sale') return false;
    if (filter === 'rent' && p.category !== 'rent') return false;
    if (search) {
      const s = search.toLowerCase();
      return (
        p.street.includes(s) ||
        p.city.includes(s) ||
        p.owner.includes(s) ||
        p.type.includes(s)
      );
    }
    return true;
  });

  return (
    <div className="properties-page">
      <div className="page-header animate-in">
        <div className="page-header-info">
          <h2>הנכסים שלי</h2>
          <p>{properties.length} נכסים בבלעדיות</p>
        </div>
        <div className="page-header-actions">
          <Link to="/properties/new" className="btn btn-primary">
            <Plus size={18} />
            קליטת נכס חדש
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="filters-bar animate-in animate-in-delay-1">
        <div className="search-box">
          <Search size={18} />
          <input
            type="text"
            placeholder="חיפוש לפי כתובת, עיר, בעלים..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="filter-tabs">
          {[
            { key: 'all', label: 'הכל' },
            { key: 'sale', label: 'מכירה' },
            { key: 'rent', label: 'השכרה' },
          ].map((f) => (
            <button
              key={f.key}
              className={`filter-tab ${filter === f.key ? 'active' : ''}`}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Properties grid */}
      <div className="properties-grid">
        {filtered.map((prop, i) => {
          const done = Object.values(prop.marketingActions).filter(Boolean).length;
          const total = Object.values(prop.marketingActions).length;
          const pct = Math.round((done / total) * 100);

          return (
            <Link
              key={prop.id}
              to={`/properties/${prop.id}`}
              className={`property-card animate-in animate-in-delay-${Math.min(i + 1, 5)}`}
            >
              <div className="property-image">
                <img src={prop.images[0]} alt={prop.street} loading="lazy" />
                <div className="property-badges">
                  <span className={`badge ${prop.category === 'sale' ? 'badge-gold' : 'badge-info'}`}>
                    {prop.category === 'sale' ? 'מכירה' : 'השכרה'}
                  </span>
                  <span className="badge badge-success">{prop.type}</span>
                </div>
                <div className="property-price-overlay">
                  {formatPrice(prop.marketingPrice)}
                </div>
              </div>
              <div className="property-card-body">
                <div className="property-address">
                  <MapPin size={14} />
                  <span>
                    {prop.street}, {prop.city}
                  </span>
                </div>
                <div className="property-specs">
                  <span>
                    <Bed size={14} />
                    {prop.rooms} חד׳
                  </span>
                  <span>
                    <Maximize size={14} />
                    {prop.sqm} מ״ר
                  </span>
                  <span>
                    <Building2 size={14} />
                    קומה {prop.floor}
                  </span>
                </div>
                <div className="property-card-footer">
                  <div className="property-owner">
                    <div className="owner-avatar">{prop.owner.charAt(0)}</div>
                    <span>{prop.owner}</span>
                  </div>
                  <div className="marketing-mini-progress">
                    <div className="progress-bar small">
                      <div
                        className="progress-fill"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span>{pct}%</span>
                  </div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
