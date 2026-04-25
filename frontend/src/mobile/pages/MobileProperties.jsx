import { useState, useMemo, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Search, SlidersHorizontal, Navigation, MapPin, X, Plus,
  Bed, Maximize, PhoneCall, MessageCircle, Share2, Map, List, Building2,
} from 'lucide-react';
import {
  properties, formatPrice, getAssetClassLabel,
  getDistanceKm, resolveLocation, allLocationNames, agentProfile,
} from '../../data/mockData';
import { formatFloor } from '../../lib/formatFloor';
import SwipeCard from '../components/SwipeCard';
import BottomSheet from '../components/BottomSheet';
import { haptics, openExternal, shareSheet, requestCurrentPosition } from '../../native';
import { telUrl, whatsappUrl, wazeUrl, publicPropertyUrl } from '../../native/actions';
import { useToast } from '../components/Toast';

function buildWaMessage(prop) {
  const lines = [
    `*${prop.type} — ${prop.street}, ${prop.city}*`, '',
    `מחיר: ${formatPrice(prop.marketingPrice)}`,
    `שטח: ${prop.sqm} מ״ר`,
  ];
  if (prop.rooms != null) lines.push(`חדרים: ${prop.rooms}`);
  if (prop.floor != null) lines.push(`קומה: ${formatFloor(prop.floor, prop.totalFloors)}`);
  if (prop.balconySize > 0) lines.push(`מרפסת: ${prop.balconySize} מ״ר`);
  lines.push(`חניה: ${prop.parking ? 'יש' : 'אין'}  ·  מחסן: ${prop.storage ? 'יש' : 'אין'}`);
  lines.push(`מזגנים: ${prop.ac ? 'יש' : 'אין'}  ·  ממ״ד: ${prop.safeRoom ? 'יש' : 'אין'}`);
  lines.push(`מעלית: ${prop.elevator ? 'יש' : 'אין'}  ·  מצב: ${prop.renovated}`);
  if (prop.notes) { lines.push(''); lines.push(prop.notes); }
  lines.push('', '📷 פרטים נוספים ותמונות:', publicPropertyUrl(prop.id), '',
    `${agentProfile.name} | ${agentProfile.agency} | ${agentProfile.phone}`);
  return lines.join('\n');
}

export default function MobileProperties() {
  const [params] = useSearchParams();
  const [search, setSearch] = useState('');
  const [assetClass, setAssetClass] = useState(params.get('assetClass') || 'all');
  const [category, setCategory] = useState(params.get('category') || 'all');
  const [filterOpen, setFilterOpen] = useState(false);
  const [locationQuery, setLocationQuery] = useState('');
  const [radius, setRadius] = useState(5);
  const [view, setView] = useState('list'); // 'list' | 'map'
  const [nearMe, setNearMe] = useState(null);
  const [adv, setAdv] = useState({ city: '', minPrice: '', maxPrice: '', minRooms: '', minSqm: '' });
  const toast = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    if (params.get('near') === 'me') findMe();
  }, []);

  const locCenter = useMemo(() => resolveLocation(locationQuery), [locationQuery]);
  const center = nearMe || locCenter;

  const list = useMemo(() => {
    return properties
      .map((p) => {
        const distance = center && p.lat && p.lng
          ? getDistanceKm(center.lat, center.lng, p.lat, p.lng)
          : null;
        return { ...p, _distance: distance };
      })
      .filter((p) => {
        if (assetClass !== 'all' && p.assetClass !== assetClass) return false;
        if (category !== 'all' && p.category !== category) return false;
        if (adv.city && p.city !== adv.city) return false;
        if (adv.minPrice && p.marketingPrice < Number(adv.minPrice)) return false;
        if (adv.maxPrice && p.marketingPrice > Number(adv.maxPrice)) return false;
        if (adv.minRooms && p.rooms != null && p.rooms < Number(adv.minRooms)) return false;
        if (adv.minSqm && p.sqm < Number(adv.minSqm)) return false;
        if (center && p._distance != null && p._distance > radius) return false;
        if (search) {
          const s = search.toLowerCase();
          return p.street.toLowerCase().includes(s)
            || p.city.toLowerCase().includes(s)
            || (p.owner || '').toLowerCase().includes(s)
            || p.type.toLowerCase().includes(s);
        }
        return true;
      })
      .sort((a, b) => {
        if (a._distance != null && b._distance != null) return a._distance - b._distance;
        return 0;
      });
  }, [assetClass, category, adv, search, center, radius]);

  const activeFilterCount =
    (assetClass !== 'all' ? 1 : 0)
    + (category !== 'all' ? 1 : 0)
    + (adv.city ? 1 : 0)
    + (adv.minPrice ? 1 : 0)
    + (adv.maxPrice ? 1 : 0)
    + (adv.minRooms ? 1 : 0)
    + (adv.minSqm ? 1 : 0)
    + (center ? 1 : 0);

  const cities = [...new Set(properties.map((p) => p.city))];

  const findMe = async () => {
    haptics.press();
    const pos = await requestCurrentPosition();
    if (pos) {
      setNearMe(pos);
      setLocationQuery('');
      toast({ message: 'מיקום נוכחי זוהה' });
    } else {
      toast({ message: 'לא ניתן לקבל מיקום', tone: 'error' });
    }
  };

  const onShareFiltered = async () => {
    haptics.press();
    const p = new URLSearchParams();
    if (assetClass !== 'all') p.set('assetClass', assetClass);
    if (category !== 'all') p.set('category', category);
    if (adv.city) p.set('city', adv.city);
    if (adv.minPrice) p.set('minPrice', adv.minPrice);
    if (adv.maxPrice) p.set('maxPrice', adv.maxPrice);
    if (adv.minRooms) p.set('minRooms', adv.minRooms);
    if (adv.minSqm) p.set('minSqm', adv.minSqm);
    const url = `${window.location.origin}/share?${p.toString()}`;
    const result = await shareSheet({
      title: 'נכסים מסוננים ללקוח',
      text: `${list.length} נכסים תואמים לסינון שלך`,
      url,
    });
    if (result === 'copied') toast({ message: 'הקישור הועתק' });
  };

  return (
    <div className="m-page">
      {/* Search + view toggle */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <div className="m-search" style={{ flex: 1 }}>
          <Search size={18} />
          <input
            type="search"
            placeholder="רחוב, עיר, בעלים..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button className="m-icon-btn" style={{ width: 30, height: 30 }} onClick={() => setSearch('')}>
              <X size={14} />
            </button>
          )}
        </div>
        <button
          className="m-icon-btn"
          onClick={() => { haptics.tap(); setView((v) => v === 'list' ? 'map' : 'list'); }}
          aria-label="החלף תצוגה"
        >
          {view === 'list' ? <Map size={18} /> : <List size={18} />}
        </button>
      </div>

      <div className="m-chip-row" style={{ marginTop: 12 }}>
        <button
          className={`m-chip ${assetClass === 'all' && category === 'all' && !center && !adv.city ? 'active' : ''}`}
          onClick={() => { haptics.select(); setAssetClass('all'); setCategory('all'); setAdv({ city: '', minPrice: '', maxPrice: '', minRooms: '', minSqm: '' }); setLocationQuery(''); setNearMe(null); }}
        >הכל</button>
        <button className={`m-chip ${assetClass === 'residential' ? 'active' : ''}`}
          onClick={() => { haptics.select(); setAssetClass(assetClass === 'residential' ? 'all' : 'residential'); }}>
          מגורים
        </button>
        <button className={`m-chip ${assetClass === 'commercial' ? 'active' : ''}`}
          onClick={() => { haptics.select(); setAssetClass(assetClass === 'commercial' ? 'all' : 'commercial'); }}>
          מסחרי
        </button>
        <button className={`m-chip ${category === 'sale' ? 'active' : ''}`}
          onClick={() => { haptics.select(); setCategory(category === 'sale' ? 'all' : 'sale'); }}>
          מכירה
        </button>
        <button className={`m-chip ${category === 'rent' ? 'active' : ''}`}
          onClick={() => { haptics.select(); setCategory(category === 'rent' ? 'all' : 'rent'); }}>
          השכרה
        </button>
        <button className={`m-chip ${nearMe ? 'active' : ''}`} onClick={findMe}>
          <Navigation size={12} />
          לידי
        </button>
        <button className={`m-chip ${activeFilterCount > 0 ? 'active' : ''}`} onClick={() => { haptics.tap(); setFilterOpen(true); }}>
          <SlidersHorizontal size={12} />
          סינון {activeFilterCount > 0 && `· ${activeFilterCount}`}
        </button>
      </div>

      {/* Active location chip */}
      {center && (
        <div className="m-active-location">
          <MapPin size={14} />
          <span>{nearMe ? 'מיקום נוכחי' : (locCenter?.label || '')} · רדיוס {radius} ק״מ</span>
          <button
            onClick={() => { haptics.tap(); setNearMe(null); setLocationQuery(''); }}
            aria-label="נקה מיקום"
          >
            <X size={12} />
          </button>
        </div>
      )}

      {/* Count + share */}
      <div className="m-result-bar">
        <span>{list.length} נכסים</span>
        <button className="m-result-share" onClick={onShareFiltered}>
          <Share2 size={13} />
          שתף ללקוח
        </button>
      </div>

      {/* Results */}
      {view === 'list' ? (
        <div className="m-stagger" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {list.map((p) => (
            <PropertyRow key={p.id} prop={p} toast={toast} navigate={navigate} />
          ))}
          {list.length === 0 && (
            <div className="m-empty">
              <div className="m-empty-ring"><Building2 size={30} /></div>
              <h3>לא נמצאו נכסים</h3>
              <p>נסה לשנות את הסינון או להרחיב את טווח החיפוש</p>
            </div>
          )}
        </div>
      ) : (
        <MapView list={list} />
      )}

      {/* Filter sheet */}
      <BottomSheet open={filterOpen} onClose={() => setFilterOpen(false)} title="סינון מתקדם">
        <div className="m-field">
          <label className="m-label">חיפוש לפי מיקום</label>
          <div className="m-search">
            <Navigation size={18} />
            <input
              type="text"
              placeholder="הקלד רחוב או עיר..."
              value={locationQuery}
              onChange={(e) => { setNearMe(null); setLocationQuery(e.target.value); }}
              list="mob-loc-list"
            />
            <datalist id="mob-loc-list">
              {allLocationNames.map((n) => <option key={n} value={n} />)}
            </datalist>
          </div>
        </div>

        {locCenter && (
          <div className="m-field" style={{ marginTop: 14 }}>
            <label className="m-label">רדיוס: {radius} ק״מ</label>
            <input
              type="range" min="1" max="20" step="1" value={radius}
              onChange={(e) => setRadius(Number(e.target.value))}
              className="m-range"
            />
          </div>
        )}

        <div className="m-field" style={{ marginTop: 14 }}>
          <label className="m-label">עיר</label>
          <select className="m-select" value={adv.city} onChange={(e) => setAdv({ ...adv, city: e.target.value })}>
            <option value="">כל הערים</option>
            {cities.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 14 }}>
          <div className="m-field">
            <label className="m-label">מחיר מ-</label>
            <input type="text" inputMode="numeric" pattern="[0-9]*" enterKeyHint="next" dir="ltr" style={{ textAlign: 'right' }} className="m-input" placeholder="₪" value={adv.minPrice} onChange={(e) => setAdv({ ...adv, minPrice: e.target.value })} />
          </div>
          <div className="m-field">
            <label className="m-label">מחיר עד</label>
            <input type="text" inputMode="numeric" pattern="[0-9]*" enterKeyHint="next" dir="ltr" style={{ textAlign: 'right' }} className="m-input" placeholder="₪" value={adv.maxPrice} onChange={(e) => setAdv({ ...adv, maxPrice: e.target.value })} />
          </div>
          <div className="m-field">
            <label className="m-label">חדרים מ-</label>
            <input type="text" inputMode="decimal" pattern="[0-9.]*" enterKeyHint="next" dir="ltr" style={{ textAlign: 'right' }} className="m-input" value={adv.minRooms} onChange={(e) => setAdv({ ...adv, minRooms: e.target.value })} />
          </div>
          <div className="m-field">
            <label className="m-label">שטח מ- (מ״ר)</label>
            <input type="text" inputMode="numeric" pattern="[0-9]*" enterKeyHint="search" dir="ltr" style={{ textAlign: 'right' }} className="m-input" value={adv.minSqm} onChange={(e) => setAdv({ ...adv, minSqm: e.target.value })} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
          <button
            className="m-action-bar-btn"
            onClick={() => { setAdv({ city: '', minPrice: '', maxPrice: '', minRooms: '', minSqm: '' }); setLocationQuery(''); setNearMe(null); haptics.tap(); }}
          >
            נקה סינון
          </button>
          <button className="m-action-bar-btn primary" onClick={() => { haptics.success(); setFilterOpen(false); }}>
            הצג {list.length} נכסים
          </button>
        </div>
      </BottomSheet>

      <style>{`
        .m-active-location {
          display: inline-flex; align-items: center; gap: 8px;
          padding: 8px 14px; border-radius: var(--m-radius-pill);
          background: var(--gold-glow); border: 1px solid var(--m-ring);
          color: var(--gold-light); font-size: 12px; margin-top: 10px;
        }
        .m-active-location button {
          border: none; background: rgba(240,236,228,0.08);
          color: var(--text-primary); width: 18px; height: 18px;
          border-radius: 50%; display: grid; place-items: center; cursor: pointer;
        }
        .m-result-bar {
          display: flex; justify-content: space-between; align-items: center;
          margin: 18px 0 12px; font-size: 13px; color: var(--text-muted);
        }
        .m-result-share {
          display: inline-flex; gap: 6px; align-items: center;
          padding: 8px 14px; border-radius: var(--m-radius-pill);
          background: transparent; border: 1px solid var(--m-hairline);
          color: var(--gold); font-size: 12px; cursor: pointer;
          font-family: var(--font-body);
        }
        .m-range {
          -webkit-appearance: none; width: 100%; height: 4px;
          background: rgba(240,236,228,0.1); border-radius: 2px; outline: none;
        }
        .m-range::-webkit-slider-thumb {
          -webkit-appearance: none; width: 22px; height: 22px;
          border-radius: 50%; background: var(--gold);
          border: 3px solid var(--bg-primary);
          box-shadow: 0 2px 8px rgba(201,169,110,0.4);
          cursor: pointer;
        }
      `}</style>
    </div>
  );
}

function PropertyRow({ prop, toast, navigate }) {
  const call = () => {
    if (!prop.ownerPhone) { toast({ message: 'אין מספר טלפון לבעלים', tone: 'error' }); return; }
    openExternal(telUrl(prop.ownerPhone));
  };
  const wa = () => openExternal(whatsappUrl('', buildWaMessage(prop)));
  const nav = () => openExternal(wazeUrl({ lat: prop.lat, lng: prop.lng, address: `${prop.street} ${prop.city}` }));

  return (
    <SwipeCard
      onTap={() => { haptics.tap(); navigate(`/properties/${prop.id}`); }}
      actions={[
        { key: 'call', label: 'התקשר', className: 'call', onClick: call, icon: <PhoneCall size={18} /> },
        { key: 'wa', label: 'וואטסאפ', className: 'whatsapp', onClick: wa, icon: <MessageCircle size={18} /> },
        { key: 'nav', label: 'ניווט', className: 'navigate', onClick: nav, icon: <Navigation size={18} /> },
      ]}
    >
      <div className="m-prop-card">
        <div className="m-prop-img">
          {/* PERF-005 — prefer the 256 px thumb on mobile lists. */}
          <img src={prop.imageThumbs?.[0] || prop.images?.[0]} alt={prop.street} loading="lazy" />
          <div className="m-prop-img-badge">
            <span className="m-tiny-badge live">{getAssetClassLabel(prop.assetClass)}</span>
            {prop._distance != null && (
              <span className="m-tiny-badge dist">{prop._distance.toFixed(1)} ק״מ</span>
            )}
          </div>
        </div>
        <div className="m-prop-body">
          <div>
            <div className="m-prop-addr">{prop.street}</div>
            <div className="m-prop-city"><MapPin size={11} />{prop.city} · {prop.type}</div>
            <div className="m-prop-price">{formatPrice(prop.marketingPrice)}</div>
          </div>
          <div className="m-prop-specs">
            {prop.rooms != null && <span><Bed size={11} />{prop.rooms} חד׳</span>}
            <span><Maximize size={11} />{prop.sqm} מ״ר</span>
            {prop.floor != null && <span>קומה {formatFloor(prop.floor)}</span>}
          </div>
        </div>
      </div>
    </SwipeCard>
  );
}

function MapView({ list }) {
  // Simple stylized map: a canvas with pins positioned by relative lat/lng.
  // Real map tiles would need a Google/Mapbox key — out of scope.
  if (!list.length) {
    return (
      <div className="m-empty">
        <div className="m-empty-ring"><Map size={30} /></div>
        <h3>אין נכסים להצגה</h3>
      </div>
    );
  }
  const minLat = Math.min(...list.map((p) => p.lat));
  const maxLat = Math.max(...list.map((p) => p.lat));
  const minLng = Math.min(...list.map((p) => p.lng));
  const maxLng = Math.max(...list.map((p) => p.lng));
  const dLat = Math.max(0.01, maxLat - minLat);
  const dLng = Math.max(0.01, maxLng - minLng);

  return (
    <div className="m-map-canvas">
      {list.map((p) => {
        const y = 100 - (((p.lat - minLat) / dLat) * 86 + 7);
        const x = 100 - (((p.lng - minLng) / dLng) * 86 + 7);  // invert for RTL feel
        return (
          <Link
            key={p.id}
            to={`/properties/${p.id}`}
            className="m-map-pin"
            style={{ left: `${x}%`, top: `${y}%` }}
            onClick={() => haptics.press()}
          >
            <div className="m-map-pin-dot" />
            <div className="m-map-pin-label">{formatPrice(p.marketingPrice)}</div>
          </Link>
        );
      })}
      <div className="m-map-info">
        {list.length} נכסים מוצגים על המפה · לחץ לפרטים
      </div>
      <style>{`
        .m-map-canvas {
          margin: 14px -20px 0; height: calc(100vh - 350px);
          min-height: 420px; position: relative;
          border-radius: var(--m-radius-md);
          background:
            radial-gradient(at 30% 20%, rgba(201,169,110,0.08), transparent 50%),
            radial-gradient(at 70% 80%, rgba(96,165,250,0.05), transparent 50%),
            linear-gradient(180deg, var(--bg-elevated), var(--bg-card));
          border: 1px solid var(--m-hairline);
          overflow: hidden;
        }
        .m-map-canvas::before {
          content: ''; position: absolute; inset: 0;
          background-image:
            linear-gradient(rgba(240,236,228,0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(240,236,228,0.03) 1px, transparent 1px);
          background-size: 40px 40px;
        }
        .m-map-pin {
          position: absolute; transform: translate(50%, -100%);
          display: flex; flex-direction: column; align-items: center;
          text-decoration: none;
        }
        .m-map-pin-dot {
          width: 16px; height: 16px; border-radius: 50%;
          background: var(--gold); border: 3px solid var(--bg-primary);
          box-shadow: 0 4px 14px rgba(201,169,110,0.4);
          animation: pulse-gold 2.6s infinite;
        }
        .m-map-pin-label {
          margin-top: 4px;
          font-family: var(--font-display); font-size: 11px;
          color: var(--gold-light);
          background: rgba(13,15,20,0.85); padding: 3px 8px;
          border-radius: var(--m-radius-xs);
          border: 1px solid var(--m-hairline);
          backdrop-filter: blur(4px);
          white-space: nowrap;
        }
        .m-map-info {
          position: absolute; bottom: 12px; left: 0; right: 0;
          text-align: center; font-size: 11px; color: var(--text-muted);
        }
      `}</style>
    </div>
  );
}
