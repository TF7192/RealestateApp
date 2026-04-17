import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Plus,
  Search,
  Building2,
  MapPin,
  Bed,
  Maximize,
  MessageCircle,
  LinkIcon,
  Check,
  SlidersHorizontal,
  X,
  Navigation,
} from 'lucide-react';
import { properties, formatPrice, getAssetClassLabel, agentProfile, getDistanceKm, resolveLocation, allLocationNames } from '../data/mockData';
import './Properties.css';

function buildWhatsAppMessage(prop) {
  const lines = [];
  lines.push(`*${prop.type} — ${prop.street}, ${prop.city}*`);
  lines.push('');
  lines.push(`מחיר: ${formatPrice(prop.marketingPrice)}`);
  lines.push(`שטח: ${prop.sqm} מ״ר`);
  if (prop.rooms != null) lines.push(`חדרים: ${prop.rooms}`);
  lines.push(`קומה: ${prop.floor}/${prop.totalFloors}`);
  if (prop.balconySize > 0) lines.push(`מרפסת: ${prop.balconySize} מ״ר`);
  lines.push(`חניה: ${prop.parking ? 'יש' : 'אין'}`);
  lines.push(`מחסן: ${prop.storage ? 'יש' : 'אין'}`);
  lines.push(`מזגנים: ${prop.ac ? 'יש' : 'אין'}`);
  if (prop.assetClass === 'residential') {
    lines.push(`ממ״ד: ${prop.safeRoom ? 'יש' : 'אין'}`);
  }
  lines.push(`מעלית: ${prop.elevator ? 'יש' : 'אין'}`);
  if (prop.airDirections) lines.push(`כיווני אוויר: ${prop.airDirections}`);
  lines.push(`מצב: ${prop.renovated}`);
  lines.push(`בניין בן: ${prop.buildingAge === 0 ? 'חדש' : `${prop.buildingAge} שנים`}`);
  lines.push(`פינוי: ${prop.vacancyDate}`);
  if (prop.notes) {
    lines.push('');
    lines.push(prop.notes);
  }
  lines.push('');
  lines.push(`📷 תמונות ופרטים נוספים:`);
  lines.push(`${window.location.origin}/p/${prop.id}`);
  lines.push('');
  lines.push(`${agentProfile.name} | ${agentProfile.agency} | ${agentProfile.phone}`);
  return lines.join('\n');
}

function buildShareUrl(filters) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, val]) => {
    if (val && val !== 'all') params.set(key, val);
  });
  return `${window.location.origin}/share?${params.toString()}`;
}

export default function Properties() {
  const [filter, setFilter] = useState('all');
  const [assetClassFilter, setAssetClassFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [locationQuery, setLocationQuery] = useState('');
  const [locationRadius, setLocationRadius] = useState(5);
  const [advFilters, setAdvFilters] = useState({
    city: '',
    minPrice: '',
    maxPrice: '',
    minRooms: '',
    maxRooms: '',
    minSqm: '',
    maxSqm: '',
  });

  const locationCenter = useMemo(() => resolveLocation(locationQuery), [locationQuery]);

  const filtered = useMemo(() => {
    return properties
      .map((p) => {
        let distance = null;
        if (locationCenter && p.lat && p.lng) {
          distance = getDistanceKm(locationCenter.lat, locationCenter.lng, p.lat, p.lng);
        }
        return { ...p, _distance: distance };
      })
      .filter((p) => {
        if (filter === 'sale' && p.category !== 'sale') return false;
        if (filter === 'rent' && p.category !== 'rent') return false;
        if (assetClassFilter === 'residential' && p.assetClass !== 'residential') return false;
        if (assetClassFilter === 'commercial' && p.assetClass !== 'commercial') return false;
        if (advFilters.city && p.city !== advFilters.city) return false;
        if (advFilters.minPrice && p.marketingPrice < Number(advFilters.minPrice)) return false;
        if (advFilters.maxPrice && p.marketingPrice > Number(advFilters.maxPrice)) return false;
        if (advFilters.minRooms && p.rooms != null && p.rooms < Number(advFilters.minRooms)) return false;
        if (advFilters.maxRooms && p.rooms != null && p.rooms > Number(advFilters.maxRooms)) return false;
        if (advFilters.minSqm && p.sqm < Number(advFilters.minSqm)) return false;
        if (advFilters.maxSqm && p.sqm > Number(advFilters.maxSqm)) return false;
        // Proximity filter
        if (locationCenter && p._distance != null && p._distance > locationRadius) return false;
        if (search) {
          const s = search.toLowerCase();
          return p.street.includes(s) || p.city.includes(s) || p.owner.includes(s) || p.type.includes(s);
        }
        return true;
      })
      .sort((a, b) => {
        if (a._distance != null && b._distance != null) return a._distance - b._distance;
        return 0;
      });
  }, [filter, assetClassFilter, advFilters, search, locationCenter, locationRadius]);

  const cities = [...new Set(properties.map((p) => p.city))];

  const handleWhatsApp = (e, prop) => {
    e.preventDefault();
    e.stopPropagation();
    const text = buildWhatsAppMessage(prop);
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };

  const handleGenerateLink = () => {
    const shareFilters = {
      assetClass: assetClassFilter,
      category: filter,
      city: advFilters.city,
      minPrice: advFilters.minPrice,
      maxPrice: advFilters.maxPrice,
      minRooms: advFilters.minRooms,
      maxRooms: advFilters.maxRooms,
      minSqm: advFilters.minSqm,
      maxSqm: advFilters.maxSqm,
    };
    const url = buildShareUrl(shareFilters);
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 3000);
  };

  const hasActiveFilters =
    advFilters.city ||
    advFilters.minPrice ||
    advFilters.maxPrice ||
    advFilters.minRooms ||
    advFilters.maxRooms ||
    advFilters.minSqm ||
    advFilters.maxSqm ||
    locationQuery;

  return (
    <div className="properties-page">
      <div className="page-header animate-in">
        <div className="page-header-info">
          <h2>הנכסים שלי</h2>
          <p>{filtered.length} מתוך {properties.length} נכסים</p>
        </div>
        <div className="page-header-actions">
          <button
            className={`btn btn-secondary ${copiedLink ? 'btn-copied' : ''}`}
            onClick={handleGenerateLink}
            title="יצירת קישור לשיתוף עם הלקוח — כולל כל הסינונים הפעילים"
          >
            {copiedLink ? <Check size={18} /> : <LinkIcon size={18} />}
            {copiedLink ? 'הקישור הועתק' : 'קישור ללקוח'}
          </button>
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
            { key: 'residential', label: 'מגורים' },
            { key: 'commercial', label: 'מסחרי' },
          ].map((f) => (
            <button
              key={f.key}
              className={`filter-tab ${assetClassFilter === f.key ? 'active' : ''}`}
              onClick={() => setAssetClassFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
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
        <button
          className={`btn btn-ghost btn-sm ${showAdvanced ? 'active' : ''} ${hasActiveFilters ? 'has-filters' : ''}`}
          onClick={() => setShowAdvanced(!showAdvanced)}
        >
          <SlidersHorizontal size={16} />
          סינון מתקדם
          {hasActiveFilters && <span className="filter-dot" />}
        </button>
      </div>

      {/* Advanced filters panel */}
      {showAdvanced && (
        <div className="agent-filters-panel animate-in">
          {/* Proximity search */}
          <div className="agent-proximity-section">
            <div className="agent-proximity-input">
              <Navigation size={18} />
              <input
                type="text"
                placeholder="הזן רחוב או עיר לחיפוש לפי קרבה..."
                value={locationQuery}
                onChange={(e) => setLocationQuery(e.target.value)}
                list="agent-location-list"
              />
              <datalist id="agent-location-list">
                {allLocationNames.map((n) => (
                  <option key={n} value={n} />
                ))}
              </datalist>
              {locationQuery && (
                <button className="proximity-clear" onClick={() => setLocationQuery('')}>
                  <X size={14} />
                </button>
              )}
            </div>
            {locationCenter && (
              <div className="agent-proximity-radius">
                <span className="proximity-match">
                  <MapPin size={13} />
                  {locationCenter.label}
                </span>
                <div className="proximity-slider-wrap">
                  <label className="form-label">רדיוס: {locationRadius} ק״מ</label>
                  <input
                    type="range"
                    min={1}
                    max={20}
                    value={locationRadius}
                    onChange={(e) => setLocationRadius(Number(e.target.value))}
                    className="proximity-slider"
                  />
                </div>
              </div>
            )}
            {locationQuery && !locationCenter && (
              <span className="proximity-no-match">לא נמצא מיקום תואם</span>
            )}
          </div>

          <div className="agent-filters-grid">
            <div className="form-group">
              <label className="form-label">עיר</label>
              <select
                className="form-select"
                value={advFilters.city}
                onChange={(e) => setAdvFilters({ ...advFilters, city: e.target.value })}
              >
                <option value="">כל הערים</option>
                {cities.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">מחיר מ-</label>
              <input type="number" className="form-input" placeholder="₪" value={advFilters.minPrice} onChange={(e) => setAdvFilters({ ...advFilters, minPrice: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">מחיר עד</label>
              <input type="number" className="form-input" placeholder="₪" value={advFilters.maxPrice} onChange={(e) => setAdvFilters({ ...advFilters, maxPrice: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">חדרים מ-</label>
              <input type="number" className="form-input" value={advFilters.minRooms} onChange={(e) => setAdvFilters({ ...advFilters, minRooms: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">חדרים עד</label>
              <input type="number" className="form-input" value={advFilters.maxRooms} onChange={(e) => setAdvFilters({ ...advFilters, maxRooms: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">שטח מ- (מ״ר)</label>
              <input type="number" className="form-input" value={advFilters.minSqm} onChange={(e) => setAdvFilters({ ...advFilters, minSqm: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">שטח עד (מ״ר)</label>
              <input type="number" className="form-input" value={advFilters.maxSqm} onChange={(e) => setAdvFilters({ ...advFilters, maxSqm: e.target.value })} />
            </div>
          </div>
          <div className="agent-filters-actions">
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => { setAdvFilters({ city: '', minPrice: '', maxPrice: '', minRooms: '', maxRooms: '', minSqm: '', maxSqm: '' }); setLocationQuery(''); }}
            >
              <X size={14} />
              נקה סינון
            </button>
          </div>
        </div>
      )}

      {/* Properties grid */}
      <div className="properties-grid">
        {filtered.map((prop, i) => {
          const done = Object.values(prop.marketingActions).filter(Boolean).length;
          const total = Object.values(prop.marketingActions).length;
          const pct = Math.round((done / total) * 100);

          return (
            <div
              key={prop.id}
              className={`property-card animate-in animate-in-delay-${Math.min(i + 1, 5)}`}
            >
              <Link to={`/properties/${prop.id}`} className="property-card-link">
                <div className="property-image">
                  <img src={prop.images[0]} alt={prop.street} loading="lazy" />
                  <div className="property-badges">
                    <span className={`badge ${prop.assetClass === 'commercial' ? 'badge-warning' : 'badge-success'}`}>
                      {getAssetClassLabel(prop.assetClass)}
                    </span>
                    <span className={`badge ${prop.category === 'sale' ? 'badge-gold' : 'badge-info'}`}>
                      {prop.category === 'sale' ? 'מכירה' : 'השכרה'}
                    </span>
                  </div>
                  <div className="property-price-overlay">
                    {formatPrice(prop.marketingPrice)}
                  </div>
                </div>
                <div className="property-card-body">
                  <div className="property-address">
                    <MapPin size={14} />
                    <span>{prop.street}, {prop.city}</span>
                  </div>
                  <div className="property-specs">
                    {prop.rooms != null && (
                      <span><Bed size={14} />{prop.rooms} חד׳</span>
                    )}
                    <span><Maximize size={14} />{prop.sqm} מ״ר</span>
                    <span><Building2 size={14} />{prop.type}</span>
                  </div>
                  {prop._distance != null && (
                    <div className="property-distance-badge">
                      <Navigation size={12} />
                      {prop._distance.toFixed(1)} ק״מ
                    </div>
                  )}
                  <div className="property-card-footer">
                    <div className="property-owner">
                      <div className="owner-avatar">{prop.owner.charAt(0)}</div>
                      <span>{prop.owner}</span>
                    </div>
                    <div className="marketing-mini-progress">
                      <div className="progress-bar small">
                        <div className="progress-fill" style={{ width: `${pct}%` }} />
                      </div>
                      <span>{pct}%</span>
                    </div>
                  </div>
                </div>
              </Link>
              {/* Quick WhatsApp send — sends ALL details + photos in one click */}
              <button
                className="property-wa-btn"
                onClick={(e) => handleWhatsApp(e, prop)}
                title="שלח את כל פרטי הנכס + תמונות בוואטסאפ"
              >
                <MessageCircle size={16} />
                <span>שלח ללקוח</span>
              </button>
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="empty-state">
          <Building2 size={48} />
          <h3>לא נמצאו נכסים</h3>
          <p>נסה לשנות את הסינון או לחפש ביטוי אחר</p>
        </div>
      )}
    </div>
  );
}
