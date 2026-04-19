import { useState, useMemo, useEffect, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
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
  Heart,
  Navigation,
  Briefcase,
  Home,
} from 'lucide-react';
import {
  properties,
  formatPrice,
  agentProfile,
  cityCoords,
  getDistanceKm,
  getAssetClassLabel,
} from '../data/mockData';
import { formatFloor } from '../lib/formatFloor';
import './CustomerPortal.css';

export default function CustomerPortal({ onLogout, isPublic }) {
  const [searchParams] = useSearchParams();

  // Read all possible filter params from URL
  const urlFilters = {
    city: searchParams.get('city') || '',
    category: searchParams.get('category') || 'all',
    assetClass: searchParams.get('assetClass') || 'all',
    minPrice: searchParams.get('minPrice') || '',
    maxPrice: searchParams.get('maxPrice') || '',
    minSqm: searchParams.get('minSqm') || '',
    maxSqm: searchParams.get('maxSqm') || '',
    minFloor: searchParams.get('minFloor') || '',
    maxFloor: searchParams.get('maxFloor') || '',
    minRooms: searchParams.get('minRooms') || '',
    maxRooms: searchParams.get('maxRooms') || '',
    minBalcony: searchParams.get('minBalcony') || '',
    sector: searchParams.get('sector') || '',
    safeRoom: searchParams.get('safeRoom') || '',
    elevator: searchParams.get('elevator') || '',
    minSqmArnona: searchParams.get('minSqmArnona') || '',
  };

  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [favorites, setFavorites] = useState([]);
  const [locationQuery, setLocationQuery] = useState('');
  const [locationRadius, setLocationRadius] = useState(10);
  const [filters, setFilters] = useState(urlFilters);

  const filtered = useMemo(() => {
    // Resolve location coordinates
    let locationCenter = null;
    if (locationQuery.trim()) {
      const match = Object.entries(cityCoords).find(([name]) =>
        name.includes(locationQuery.trim())
      );
      if (match) locationCenter = match[1];
    }

    return properties
      .map((p) => {
        let distance = null;
        if (locationCenter && p.lat && p.lng) {
          distance = getDistanceKm(
            locationCenter.lat,
            locationCenter.lng,
            p.lat,
            p.lng
          );
        }
        return { ...p, _distance: distance };
      })
      .filter((p) => {
        if (filters.assetClass !== 'all' && p.assetClass !== filters.assetClass) return false;
        if (filters.category === 'sale' && p.category !== 'sale') return false;
        if (filters.category === 'rent' && p.category !== 'rent') return false;
        if (filters.city && p.city !== filters.city) return false;
        // Shared fields
        if (filters.minPrice && p.marketingPrice < Number(filters.minPrice)) return false;
        if (filters.maxPrice && p.marketingPrice > Number(filters.maxPrice)) return false;
        if (filters.minSqm && p.sqm < Number(filters.minSqm)) return false;
        if (filters.maxSqm && p.sqm > Number(filters.maxSqm)) return false;
        if (filters.minFloor && p.floor < Number(filters.minFloor)) return false;
        if (filters.maxFloor && p.floor > Number(filters.maxFloor)) return false;
        if (filters.elevator === 'yes' && !p.elevator) return false;
        if (filters.elevator === 'no' && p.elevator) return false;
        // Residential-only
        if (filters.minRooms && p.rooms != null && p.rooms < Number(filters.minRooms)) return false;
        if (filters.maxRooms && p.rooms != null && p.rooms > Number(filters.maxRooms)) return false;
        if (filters.minBalcony && (p.balconySize || 0) < Number(filters.minBalcony)) return false;
        if (filters.sector && p.sector !== filters.sector) return false;
        if (filters.safeRoom === 'yes' && !p.safeRoom) return false;
        if (filters.safeRoom === 'no' && p.safeRoom) return false;
        // Commercial-only
        if (filters.minSqmArnona && (p.sqmArnona || 0) < Number(filters.minSqmArnona)) return false;
        // Proximity filter
        if (locationCenter && p._distance != null && p._distance > locationRadius) return false;
        if (search) {
          const s = search.toLowerCase();
          return p.street.includes(s) || p.city.includes(s) || p.type.includes(s);
        }
        return true;
      })
      .sort((a, b) => {
        // Sort by distance if location search is active
        if (a._distance != null && b._distance != null) return a._distance - b._distance;
        return 0;
      });
  }, [search, filters, locationQuery, locationRadius]);

  const cities = [...new Set(properties.map((p) => p.city))];

  const toggleFav = (id) => {
    setFavorites((prev) =>
      prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id]
    );
  };

  const handleContactWhatsApp = () => {
    const text = 'שלום, אני מתעניין/ת בנכסים. אשמח לפרטים.';
    window.open(
      `https://wa.me/${agentProfile.phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(text)}`,
      '_blank'
    );
  };

  const [activeSection, setActiveSection] = useState('properties');

  const scrollTo = useCallback((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setActiveSection(id);
    }
  }, []);

  useEffect(() => {
    const sections = ['properties', 'contact'];
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        }
      },
      { rootMargin: '-40% 0px -40% 0px', threshold: 0 }
    );
    sections.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  const clearFilters = () => {
    setFilters({
      city: '',
      category: 'all',
      assetClass: 'all',
      minPrice: '',
      maxPrice: '',
      minSqm: '',
      maxSqm: '',
      minFloor: '',
      maxFloor: '',
      minRooms: '',
      maxRooms: '',
      minBalcony: '',
      sector: '',
      safeRoom: '',
      elevator: '',
      minSqmArnona: '',
    });
    setLocationQuery('');
    setLocationRadius(10);
  };

  return (
    <div className="customer-portal">
      <div className="noise-overlay" />

      {/* Header */}
      <header className="cp-header">
        <div className="cp-header-inner">
          <Link to="/customer" className="cp-logo">
            <span className="logo-icon-sm">◆</span>
            <span>Estia</span>
          </Link>
          <nav className="cp-nav">
            <button
              className={`cp-nav-link ${activeSection === 'properties' ? 'active' : ''}`}
              onClick={() => scrollTo('properties')}
            >
              נכסים
            </button>
            <button
              className={`cp-nav-link ${activeSection === 'contact' ? 'active' : ''}`}
              onClick={() => scrollTo('contact')}
            >
              צור קשר
            </button>
          </nav>
          <div className="cp-header-actions">
            {!isPublic && (
              <button className="btn btn-ghost btn-sm" onClick={onLogout}>
                <LogOut size={16} />
                יציאה
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="cp-hero">
        <div className="cp-hero-bg" />
        <div className="cp-hero-content">
          <h1>נכסים זמינים</h1>
          <p>
            {agentProfile.name} | {agentProfile.agency}
          </p>

          <div className="cp-search-bar">
            <Search size={20} />
            <input
              type="search"
              inputMode="search"
              enterKeyHint="search"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
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

          {/* Asset class quick toggle */}
          <div className="cp-asset-class-toggle">
            {[
              { key: 'all', label: 'הכל', icon: null },
              { key: 'residential', label: 'מגורים', icon: Home },
              { key: 'commercial', label: 'מסחרי', icon: Briefcase },
            ].map((item) => (
              <button
                key={item.key}
                className={`cp-ac-btn ${filters.assetClass === item.key ? 'active' : ''}`}
                onClick={() => setFilters({ ...filters, assetClass: item.key })}
              >
                {item.icon && <item.icon size={16} />}
                {item.label}
              </button>
            ))}
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

            {/* Location proximity */}
            <div className="cp-location-search">
              <div className="cp-location-input">
                <Navigation size={18} />
                <input
                  type="search"
                  inputMode="search"
                  enterKeyHint="search"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  placeholder="הזן מיקום (עיר) לחיפוש לפי קרבה..."
                  value={locationQuery}
                  onChange={(e) => setLocationQuery(e.target.value)}
                  list="city-suggestions"
                />
                <datalist id="city-suggestions">
                  {Object.keys(cityCoords).map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </div>
              {locationQuery.trim() && (
                <div className="cp-radius-control">
                  <label className="form-label">רדיוס: {locationRadius} ק״מ</label>
                  <input
                    type="range"
                    min={1}
                    max={30}
                    value={locationRadius}
                    onChange={(e) => setLocationRadius(Number(e.target.value))}
                    className="cp-radius-slider"
                  />
                </div>
              )}
            </div>

            {/* Shared fields — always visible */}
            <div className="cp-filters-section-label">שדות כלליים</div>
            <div className="cp-filters-grid">
              <div className="form-group">
                <label className="form-label">עיר</label>
                <select className="form-select" value={filters.city} onChange={(e) => setFilters({ ...filters, city: e.target.value })}>
                  <option value="">כל הערים</option>
                  {cities.map((c) => (<option key={c} value={c}>{c}</option>))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">מכירה / השכרה</label>
                <select className="form-select" value={filters.category} onChange={(e) => setFilters({ ...filters, category: e.target.value })}>
                  <option value="all">הכל</option>
                  <option value="sale">מכירה</option>
                  <option value="rent">השכרה</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">מחיר מ-</label>
                <input type="text" inputMode="numeric" pattern="[0-9]*" className="form-input" placeholder="₪" value={filters.minPrice} onChange={(e) => setFilters({ ...filters, minPrice: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">מחיר עד</label>
                <input type="text" inputMode="numeric" pattern="[0-9]*" className="form-input" placeholder="₪" value={filters.maxPrice} onChange={(e) => setFilters({ ...filters, maxPrice: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">שטח מ- (מ״ר)</label>
                <input type="text" inputMode="numeric" pattern="[0-9]*" className="form-input" value={filters.minSqm} onChange={(e) => setFilters({ ...filters, minSqm: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">שטח עד (מ״ר)</label>
                <input type="text" inputMode="numeric" pattern="[0-9]*" className="form-input" value={filters.maxSqm} onChange={(e) => setFilters({ ...filters, maxSqm: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">קומה מ-</label>
                <input type="text" inputMode="numeric" pattern="[0-9]*" className="form-input" value={filters.minFloor} onChange={(e) => setFilters({ ...filters, minFloor: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">קומה עד</label>
                <input type="text" inputMode="numeric" pattern="[0-9]*" className="form-input" value={filters.maxFloor} onChange={(e) => setFilters({ ...filters, maxFloor: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">מעלית</label>
                <select className="form-select" value={filters.elevator} onChange={(e) => setFilters({ ...filters, elevator: e.target.value })}>
                  <option value="">לא משנה</option>
                  <option value="yes">יש</option>
                  <option value="no">אין</option>
                </select>
              </div>
            </div>

            {/* Residential-only fields — only when explicitly selecting מגורים */}
            {filters.assetClass === 'residential' && (
              <>
                <div className="cp-filters-section-label">מגורים</div>
                <div className="cp-filters-grid">
                  <div className="form-group">
                    <label className="form-label">חדרים מ-</label>
                    <input type="text" inputMode="numeric" pattern="[0-9]*" className="form-input" value={filters.minRooms} onChange={(e) => setFilters({ ...filters, minRooms: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">חדרים עד</label>
                    <input type="text" inputMode="numeric" pattern="[0-9]*" className="form-input" value={filters.maxRooms} onChange={(e) => setFilters({ ...filters, maxRooms: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">מרפסת מ- (מ״ר)</label>
                    <input type="text" inputMode="numeric" pattern="[0-9]*" className="form-input" value={filters.minBalcony} onChange={(e) => setFilters({ ...filters, minBalcony: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">מגזר</label>
                    <select className="form-select" value={filters.sector} onChange={(e) => setFilters({ ...filters, sector: e.target.value })}>
                      <option value="">הכל</option>
                      <option>כללי</option>
                      <option>דתי</option>
                      <option>חרדי</option>
                      <option>ערבי</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">ממ״ד</label>
                    <select className="form-select" value={filters.safeRoom} onChange={(e) => setFilters({ ...filters, safeRoom: e.target.value })}>
                      <option value="">לא משנה</option>
                      <option value="yes">יש</option>
                      <option value="no">אין</option>
                    </select>
                  </div>
                </div>
              </>
            )}

            {/* Commercial-only fields */}
            {filters.assetClass === 'commercial' && (
              <>
                <div className="cp-filters-section-label">מסחרי</div>
                <div className="cp-filters-grid">
                  <div className="form-group">
                    <label className="form-label">מ״ר ארנונה מ-</label>
                    <input type="text" inputMode="numeric" pattern="[0-9]*" className="form-input" value={filters.minSqmArnona} onChange={(e) => setFilters({ ...filters, minSqmArnona: e.target.value })} />
                  </div>
                </div>
              </>
            )}
            <button className="btn btn-secondary btn-sm" onClick={clearFilters}>
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
                  <span className={`badge ${prop.assetClass === 'commercial' ? 'badge-warning' : 'badge-success'}`}>
                    {getAssetClassLabel(prop.assetClass)}
                  </span>
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
                  {prop.rooms != null && (
                    <span>
                      <Bed size={14} />
                      {prop.rooms} חד׳
                    </span>
                  )}
                  <span>
                    <Maximize size={14} />
                    {prop.sqm} מ״ר
                  </span>
                  {prop.floor != null && (
                    <span>
                      <Building2 size={14} />
                      קומה {formatFloor(prop.floor)}
                    </span>
                  )}
                </div>
                {prop._distance != null && (
                  <div className="cp-card-distance">
                    <Navigation size={12} />
                    {prop._distance.toFixed(1)} ק״מ מהמיקום שנבחר
                  </div>
                )}
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
            <h2>יצירת קשר</h2>
            <p>לתיאום ביקור או לפרטים נוספים</p>
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
            <a href={`tel:${agentProfile.phone}`} className="btn btn-secondary btn-lg cp-contact-btn">
              <Phone size={20} />
              {agentProfile.phone}
            </a>
            <button className="btn btn-primary btn-lg cp-contact-btn" onClick={handleContactWhatsApp}>
              <MessageCircle size={20} />
              שלח הודעה בוואטסאפ
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="cp-footer">
        <p>© 2025 Estia — כל הזכויות שמורות</p>
      </footer>

      {/* Floating WhatsApp */}
      <button className="cp-whatsapp-fab" onClick={handleContactWhatsApp}>
        <MessageCircle size={24} />
      </button>
    </div>
  );
}
