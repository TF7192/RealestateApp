// Map — Sprint 7 of the claude-design port. Full-viewport Leaflet map
// with gold price-chip pins plotting the agent's properties on an
// OpenStreetMap tile layer. Open-source only: no Google Maps / Mapbox,
// no API key required, attribution kept on the tile layer per OSM
// licensing (ODbL).
//
// Properties without lat/lng are filtered out of the map itself and
// surfaced in a small "אין מיקום" footer tally so the agent knows
// where their catalog is incomplete. Per sprint scope, geocoding is
// intentionally deferred to v2 (Nominatim rate-limits hard, and
// NewProperty.jsx already captures coordinates via AddressField on
// new rows — this is a visualization page, not a backfill tool).
//
// DT cream/gold inline styles match the rest of the claude-design
// ported pages (Documents.jsx, Layout.jsx). Route: /map.

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Search, MapPin, Building2 } from 'lucide-react';
import api from '../lib/api';
import { displayPriceShort, displayText } from '../lib/display';

// ─── DT palette (verbatim from Documents.jsx / Layout.jsx) ─────────
const DT = {
  cream: '#f7f3ec', cream2: '#efe9df', cream3: '#e8dfcf', cream4: '#fbf7f0',
  white: '#ffffff',
  ink: '#1e1a14', ink2: '#3a3226',
  muted: '#6b6356',
  gold: '#b48b4c', goldLight: '#d9b774', goldDark: '#7a5c2c',
  goldSoft: 'rgba(180,139,76,0.12)',
  border: 'rgba(30,26,20,0.08)', borderStrong: 'rgba(30,26,20,0.14)',
};
const FONT = { fontFamily: 'Assistant, Heebo, -apple-system, sans-serif' };

// Tel Aviv center (Rothschild area) — used as the default view
// center when the agent has no properties with coordinates yet.
const TEL_AVIV = { lat: 32.0779, lng: 34.7713 };
const DEFAULT_ZOOM = 12;

// ─── Pin renderer ──────────────────────────────────────────────────
// `divIcon` lets us bypass Leaflet's default PNG sprite (which has
// a known webpack+Vite broken-path issue) and render the gold price
// chip as pure HTML. The anchor is the bottom-center "tail" tip so
// the chip points AT the address.
function priceChipIcon(label, highlighted = false) {
  const bg = highlighted ? DT.goldDark : DT.gold;
  const fg = DT.ink;
  // The inline HTML is fine here — `label` comes from displayPriceShort
  // which strips to "₪2.5M" style; no user-controlled free text.
  const html = `
    <div style="
      display:inline-flex;align-items:center;gap:4px;
      background:linear-gradient(180deg, ${DT.goldLight}, ${bg});
      color:${fg};
      border:1.5px solid ${DT.goldDark};
      padding:4px 9px;border-radius:14px;
      font-family:Assistant, Heebo, -apple-system, sans-serif;
      font-weight:800;font-size:12px;line-height:1;
      white-space:nowrap;
      box-shadow:0 2px 8px rgba(30,26,20,0.25);
      transform:translateY(-4px);
    ">${label}</div>
    <div style="
      width:0;height:0;margin:0 auto;
      border-left:5px solid transparent;
      border-right:5px solid transparent;
      border-top:6px solid ${DT.goldDark};
      transform:translateY(-5px);
    "></div>
  `;
  return L.divIcon({
    html,
    className: 'estia-price-chip',
    iconSize: [0, 0], // let the inner HTML size itself
    iconAnchor: [0, 0], // tail tip anchors at the property
  });
}

export default function MapPage() {
  const [items, setItems]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [assetClass, setAssetClass] = useState('ALL'); // ALL | RESIDENTIAL | COMMERCIAL
  const [category, setCategory]     = useState('ALL'); // ALL | SALE | RENT
  const [citySearch, setCitySearch] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.listProperties({ mine: '1' });
        if (!cancelled) setItems(res?.items || []);
      } catch {
        if (!cancelled) setItems([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ─── Filtering ────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = citySearch.trim().toLowerCase();
    return items.filter((p) => {
      if (assetClass !== 'ALL' && p.assetClass !== assetClass) return false;
      if (category !== 'ALL' && p.category !== category) return false;
      if (q && !(p.city || '').toLowerCase().includes(q)) return false;
      return true;
    });
  }, [items, assetClass, category, citySearch]);

  // Properties with coordinates go on the map; those without are tallied
  // in the footer so the agent sees where the catalog is incomplete.
  const mapped = useMemo(
    () => filtered.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng)),
    [filtered],
  );
  const missingLoc = filtered.length - mapped.length;

  // Center + zoom: bias toward the filtered set if any have coords,
  // else fall back to Tel Aviv. useMemo guards against recentering on
  // every pin hover (MapContainer treats `center` as initial, but the
  // key-based remount below ensures a real reset on filter changes).
  const center = useMemo(() => {
    if (!mapped.length) return TEL_AVIV;
    const avgLat = mapped.reduce((s, p) => s + p.lat, 0) / mapped.length;
    const avgLng = mapped.reduce((s, p) => s + p.lng, 0) / mapped.length;
    return { lat: avgLat, lng: avgLng };
  }, [mapped]);

  // Key forces the map to re-mount (and thus re-center) when the
  // filtered set meaningfully changes. Cheaper than the imperative
  // useMap().setView() dance for a first-pass implementation.
  const mapKey = `${assetClass}-${category}-${citySearch}-${mapped.length}`;

  return (
    <div dir="rtl" style={{
      ...FONT, display: 'flex', flexDirection: 'column',
      height: 'calc(100vh - 61px)', // below the sticky topbar
      background: DT.cream, color: DT.ink,
    }}>
      {/* ─── Filter bar ─────────────────────────────────────────── */}
      <div style={{
        flexShrink: 0, background: DT.cream4,
        borderBottom: `1px solid ${DT.border}`,
        padding: '14px 20px',
        display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginInlineEnd: 6 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: DT.goldSoft, color: DT.gold,
            display: 'grid', placeItems: 'center',
          }}>
            <MapPin size={16} aria-hidden="true" />
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800 }}>מפה</div>
            <div style={{ fontSize: 11, color: DT.muted }}>
              {loading ? 'טוען נכסים…' : `${mapped.length} נכסים על המפה`}
              {!loading && missingLoc > 0 && (
                <span style={{ color: DT.goldDark, marginInlineStart: 6 }}>
                  · {missingLoc} ללא מיקום
                </span>
              )}
            </div>
          </div>
        </div>

        <Segmented
          value={assetClass}
          onChange={setAssetClass}
          options={[
            { k: 'ALL',         label: 'הכול' },
            { k: 'RESIDENTIAL', label: 'מגורים' },
            { k: 'COMMERCIAL',  label: 'מסחרי' },
          ]}
        />
        <Segmented
          value={category}
          onChange={setCategory}
          options={[
            { k: 'ALL',  label: 'הכול' },
            { k: 'SALE', label: 'מכירה' },
            { k: 'RENT', label: 'השכרה' },
          ]}
        />

        <label style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          background: DT.white, border: `1px solid ${DT.border}`,
          borderRadius: 9, padding: '8px 12px',
          marginInlineStart: 'auto',
        }}>
          <Search size={14} color={DT.muted} aria-hidden="true" />
          <input
            type="search"
            value={citySearch}
            onChange={(e) => setCitySearch(e.target.value)}
            placeholder="חיפוש עיר…"
            aria-label="חיפוש עיר"
            style={{
              ...FONT, border: 'none', outline: 'none',
              background: 'transparent', fontSize: 13,
              width: 180, color: DT.ink, textAlign: 'right',
            }}
          />
        </label>
      </div>

      {/* ─── Map ────────────────────────────────────────────────── */}
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        {loading ? (
          <div style={{
            position: 'absolute', inset: 0, display: 'grid', placeItems: 'center',
            color: DT.muted, fontSize: 13,
          }}>
            טוען מפה…
          </div>
        ) : (
          <MapContainer
            key={mapKey}
            center={[center.lat, center.lng]}
            zoom={DEFAULT_ZOOM}
            scrollWheelZoom
            style={{ width: '100%', height: '100%' }}
          >
            <TileLayer
              // Standard OSM tile server. Attribution kept per OSM
              // ODbL licensing; clicking it opens openstreetmap.org.
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              maxZoom={19}
            />
            {mapped.map((p) => (
              <Marker
                key={p.id}
                position={[p.lat, p.lng]}
                icon={priceChipIcon(displayPriceShort(p.marketingPrice))}
              >
                <Popup minWidth={240} maxWidth={280}>
                  <PropertyPopupCard property={p} />
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        )}
      </div>

      {/* Leaflet attribution overrides — Leaflet's default color bar
          clashes with our cream surface. Keep small + readable. */}
      <style>{`
        .leaflet-container {
          font-family: Assistant, Heebo, -apple-system, sans-serif;
        }
        .leaflet-control-attribution {
          background: rgba(255,255,255,0.85) !important;
          color: ${DT.muted} !important;
          font-size: 10px !important;
        }
        .leaflet-control-attribution a { color: ${DT.goldDark} !important; }
        .leaflet-popup-content-wrapper {
          border-radius: 12px !important;
          box-shadow: 0 14px 34px rgba(30,26,20,0.14) !important;
        }
        .leaflet-popup-content {
          margin: 0 !important;
          direction: rtl;
        }
        .estia-price-chip { background: transparent !important; border: none !important; }
      `}</style>
    </div>
  );
}

// ─── Small helpers ─────────────────────────────────────────────────

function Segmented({ value, onChange, options }) {
  return (
    <div role="group" style={{
      display: 'inline-flex', background: DT.white,
      border: `1px solid ${DT.border}`, borderRadius: 9, padding: 3, gap: 2,
    }}>
      {options.map((o) => {
        const active = value === o.k;
        return (
          <button
            key={o.k}
            type="button"
            onClick={() => onChange(o.k)}
            aria-pressed={active}
            style={{
              ...FONT, border: 'none', cursor: 'pointer',
              padding: '7px 12px', borderRadius: 7,
              fontSize: 12, fontWeight: active ? 800 : 600,
              background: active ? DT.goldSoft : 'transparent',
              color: active ? DT.goldDark : DT.ink2,
            }}
          >{o.label}</button>
        );
      })}
    </div>
  );
}

function PropertyPopupCard({ property }) {
  const p = property;
  const street = [p.street, p.number].filter(Boolean).join(' ').trim();
  const addressLine = [street || p.address, p.city].filter(Boolean).join(', ');
  return (
    <div style={{
      ...FONT, padding: 12, background: DT.white, color: DT.ink,
      borderRadius: 12, minWidth: 220,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{
          width: 28, height: 28, borderRadius: 8,
          background: DT.goldSoft, color: DT.gold,
          display: 'grid', placeItems: 'center', flexShrink: 0,
        }}>
          <Building2 size={14} aria-hidden="true" />
        </span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{
            fontSize: 13, fontWeight: 800,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{displayText(addressLine) || 'נכס'}</div>
          <div style={{ fontSize: 10, color: DT.muted }}>
            {p.category === 'RENT' ? 'השכרה' : 'מכירה'} · {p.assetClass === 'COMMERCIAL' ? 'מסחרי' : 'מגורים'}
          </div>
        </div>
      </div>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '6px 0', borderTop: `1px solid ${DT.border}`,
        borderBottom: `1px solid ${DT.border}`, margin: '6px 0',
      }}>
        <span style={{ fontSize: 11, color: DT.muted }}>מחיר</span>
        <span style={{ fontSize: 14, fontWeight: 800, color: DT.goldDark }}>
          {displayPriceShort(p.marketingPrice)}
        </span>
      </div>
      <div style={{ display: 'flex', gap: 10, fontSize: 11, color: DT.muted, marginBottom: 10 }}>
        {p.rooms != null && <span>{p.rooms} חד׳</span>}
        {p.sqm != null && <span>{p.sqm} מ״ר</span>}
        {p.floor != null && <span>קומה {p.floor}</span>}
      </div>
      <Link
        to={`/properties/${p.id}`}
        style={{
          ...FONT, display: 'block', textAlign: 'center',
          background: `linear-gradient(180deg, ${DT.goldLight}, ${DT.gold})`,
          color: DT.ink, padding: '8px 10px', borderRadius: 8,
          fontSize: 12, fontWeight: 800, textDecoration: 'none',
        }}
      >לפרטי הנכס ←</Link>
    </div>
  );
}
