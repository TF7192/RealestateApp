import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Search,
  MapPin,
  Bed,
  Maximize,
  Building2,
  Phone,
  MessageCircle,
  SlidersHorizontal,
  X,
  LogOut,
  ChevronDown,
  Heart,
} from 'lucide-react';
import { properties, formatPrice, agentProfile } from '../data/mockData';
import './CustomerPortal.css';

export default function CustomerPortal({ onLogout }) {
  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [favorites, setFavorites] = useState([]);
  const [filters, setFilters] = useState({
    city: '',
    category: 'all',
    minPrice: '',
    maxPrice: '',
    minRooms: '',
    maxRooms: '',
  });

  const filtered = useMemo(() => {
    return properties.filter((p) => {
      if (filters.category === 'sale' && p.category !== 'sale') return false;
      if (filters.category === 'rent' && p.category !== 'rent') return false;
      if (filters.city && p.city !== filters.city) return false;
      if (filters.minPrice && p.marketingPrice < Number(filters.minPrice)) return false;
      if (filters.maxPrice && p.marketingPrice > Number(filters.maxPrice)) return false;
      if (filters.minRooms && p.rooms < Number(filters.minRooms)) return false;
      if (filters.maxRooms && p.rooms > Number(filters.maxRooms)) return false;
      if (search) {
        const s = search.toLowerCase();
        return p.street.includes(s) || p.city.includes(s) || p.type.includes(s);
      }
      return true;
    });
  }, [search, filters]);

  const cities = [...new Set(properties.map((p) => p.city))];

  const toggleFav = (id) => {
    setFavorites((prev) =>
      prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id]
    );
  };

  const handleContactWhatsApp = () => {
    const text = 'שלום, אני מעוניין/ת לקבל מידע נוסף על נכסים.';
    window.open(
      `https://wa.me/${agentProfile.phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(text)}`,
      '_blank'
    );
  };

  return (
    <div className="customer-portal">
      <div className="noise-overlay" />

      {/* Header */}
      <header className="cp-header">
        <div className="cp-header-inner">
          <div className="cp-logo">
            <span className="logo-icon-sm">◆</span>
            <span>נדל״ן Pro</span>
          </div>
          <nav className="cp-nav">
            <a href="#properties" className="cp-nav-link active">
              נכסים
            </a>
            <a href="#contact" className="cp-nav-link">
              צור קשר
            </a>
          </nav>
          <div className="cp-header-actions">
            <button className="btn btn-ghost btn-sm" onClick={onLogout}>
              <LogOut size={16} />
              יציאה
            </button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="cp-hero">
        <div className="cp-hero-bg" />
        <div className="cp-hero-content">
          <h1>מצא את הנכס המושלם שלך</h1>
          <p>
            {agentProfile.name} מ{agentProfile.agency} — נכסים נבחרים במיוחד עבורך
          </p>

          <div className="cp-search-bar">
            <Search size={20} />
            <input
              type="text"
              placeholder="חפש לפי כתובת, עיר או סוג נכס..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button
              className="btn btn-ghost"
              onClick={() => setShowFilters(!showFilters)}
            >
              <SlidersHorizontal size={18} />
              סינון
            </button>
          </div>
        </div>
      </section>

      {/* Filters panel */}
      {showFilters && (
        <div className="cp-filters animate-in">
          <div className="cp-filters-inner">
            <div className="cp-filters-header">
              <h3>סינון נכסים</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowFilters(false)}>
                <X size={16} />
              </button>
            </div>
            <div className="cp-filters-grid">
              <div className="form-group">
                <label className="form-label">עיר</label>
                <select
                  className="form-select"
                  value={filters.city}
                  onChange={(e) => setFilters({ ...filters, city: e.target.value })}
                >
                  <option value="">כל הערים</option>
                  {cities.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">סוג</label>
                <select
                  className="form-select"
                  value={filters.category}
                  onChange={(e) => setFilters({ ...filters, category: e.target.value })}
                >
                  <option value="all">הכל</option>
                  <option value="sale">מכירה</option>
                  <option value="rent">השכרה</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">מחיר מינימום</label>
                <input
                  type="number"
                  className="form-input"
                  placeholder="₪"
                  value={filters.minPrice}
                  onChange={(e) => setFilters({ ...filters, minPrice: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">מחיר מקסימום</label>
                <input
                  type="number"
                  className="form-input"
                  placeholder="₪"
                  value={filters.maxPrice}
                  onChange={(e) => setFilters({ ...filters, maxPrice: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">חדרים מ-</label>
                <input
                  type="number"
                  className="form-input"
                  value={filters.minRooms}
                  onChange={(e) => setFilters({ ...filters, minRooms: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">חדרים עד</label>
                <input
                  type="number"
                  className="form-input"
                  value={filters.maxRooms}
                  onChange={(e) => setFilters({ ...filters, maxRooms: e.target.value })}
                />
              </div>
            </div>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() =>
                setFilters({
                  city: '',
                  category: 'all',
                  minPrice: '',
                  maxPrice: '',
                  minRooms: '',
                  maxRooms: '',
                })
              }
            >
              נקה סינון
            </button>
          </div>
        </div>
      )}

      {/* Properties */}
      <section className="cp-properties" id="properties">
        <div className="cp-section-header">
          <h2>{filtered.length} נכסים זמינים</h2>
        </div>
        <div className="cp-properties-grid">
          {filtered.map((prop, i) => (
            <Link
              key={prop.id}
              to={`/p/${prop.id}`}
              className={`cp-property-card animate-in animate-in-delay-${Math.min(i + 1, 5)}`}
            >
              <div className="cp-card-image">
                <img src={prop.images[0]} alt={prop.street} loading="lazy" />
                <div className="cp-card-badges">
                  <span className={`badge ${prop.category === 'sale' ? 'badge-gold' : 'badge-info'}`}>
                    {prop.category === 'sale' ? 'מכירה' : 'השכרה'}
                  </span>
                </div>
                <button
                  className={`cp-fav-btn ${favorites.includes(prop.id) ? 'active' : ''}`}
                  onClick={(e) => {
                    e.preventDefault();
                    toggleFav(prop.id);
                  }}
                >
                  <Heart size={18} />
                </button>
                <div className="cp-card-price">
                  {formatPrice(prop.marketingPrice)}
                </div>
              </div>
              <div className="cp-card-body">
                <h3>
                  <MapPin size={15} />
                  {prop.street}, {prop.city}
                </h3>
                <p className="cp-card-type">{prop.type}</p>
                <div className="cp-card-specs">
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
              </div>
            </Link>
          ))}
        </div>

        {filtered.length === 0 && (
          <div className="empty-state">
            <Building2 size={48} />
            <h3>לא נמצאו נכסים</h3>
            <p>נסה לשנות את הסינון או לחפש ביטוי אחר</p>
          </div>
        )}
      </section>

      {/* Contact section */}
      <section className="cp-contact" id="contact">
        <div className="cp-contact-inner">
          <div className="cp-contact-info">
            <h2>מעוניין/ת לשמוע עוד?</h2>
            <p>צור/י קשר ואשמח לסייע במציאת הנכס המושלם</p>
            <div className="cp-agent-card">
              <div className="cp-agent-avatar">
                {agentProfile.name.charAt(0)}
              </div>
              <div>
                <h4>{agentProfile.name}</h4>
                <span>{agentProfile.title}</span>
                <span>{agentProfile.agency}</span>
              </div>
            </div>
          </div>
          <div className="cp-contact-actions">
            <a
              href={`tel:${agentProfile.phone}`}
              className="btn btn-secondary btn-lg cp-contact-btn"
            >
              <Phone size={20} />
              {agentProfile.phone}
            </a>
            <button
              className="btn btn-primary btn-lg cp-contact-btn"
              onClick={handleContactWhatsApp}
            >
              <MessageCircle size={20} />
              שלח הודעה בוואטסאפ
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="cp-footer">
        <p>© 2025 נדל״ן Pro — כל הזכויות שמורות</p>
      </footer>

      {/* Floating WhatsApp */}
      <button className="cp-whatsapp-fab" onClick={handleContactWhatsApp}>
        <MessageCircle size={24} />
      </button>
    </div>
  );
}
