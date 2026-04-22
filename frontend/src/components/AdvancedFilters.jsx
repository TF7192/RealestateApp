import { MapPin, Navigation, X } from 'lucide-react';
import { NumberField, PriceRange, SelectField } from './SmartFields';
import './AdvancedFilters.css';

// N-11 — Shared advanced-filter panel. Properties.jsx hosted the canonical
// shape (proximity + city + price range + rooms + sqm). This component
// accepts a `config` prop so leads (Sub-5 lane) can reuse the same layout
// with lead-specific fields (rooms desired, category desired, seriousness)
// without duplicating the structural CSS/ARIA.
//
// Design choices:
// - Parent owns the values + setters. This stays a dumb presentational
//   panel so the saving/URL-sync logic lives with the page that invokes it.
// - Fields are driven by `config.fields = ['proximity','city','price',
//   'rooms','sqm','custom']`. Order is preserved; unknown keys are
//   ignored so old configs don't crash the panel.
// - `onClear()` is called by the "נקה סינון" button inside the panel.
//   The host is expected to ALSO collapse the panel (N-12) — this
//   component doesn't own open/closed state.
//
// Props:
//   values:    { city, minPrice, maxPrice, minRooms, maxRooms, minSqm,
//                maxSqm, locationQuery, locationRadius, locationCenter }
//   onChange:  (key, value) => void  — single-key update
//   onClear:   () => void            — "נקה סינון" handler
//   config:    { fields: string[], cities?: string[], extra?: ReactNode }
//              `extra` renders after the grid so lead-specific selects
//              slot in without fork.
//   locations: string[] of known location names (for the datalist)
//   className: passed through to the outer <div> (host controls animation)
export default function AdvancedFilters({
  values,
  onChange,
  onClear,
  config,
  locations = [],
  className = '',
}) {
  const fields = Array.isArray(config?.fields) && config.fields.length
    ? config.fields
    : ['proximity', 'city', 'price', 'rooms', 'sqm'];

  const has = (k) => fields.includes(k);

  return (
    <div className={`agent-filters-panel advanced-filters ${className}`.trim()}>
      {has('proximity') && (
        <div className="agent-proximity-section">
          <div className="agent-proximity-input">
            <Navigation size={18} />
            <input
              type="search"
              inputMode="search"
              enterKeyHint="search"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              placeholder="הזן רחוב או עיר לחיפוש לפי קרבה..."
              value={values.locationQuery || ''}
              onChange={(e) => onChange('locationQuery', e.target.value)}
              list="adv-location-list"
              className="form-input adv-proximity-input"
            />
            <datalist id="adv-location-list">
              {locations.map((n) => (<option key={n} value={n} />))}
            </datalist>
            {values.locationQuery && (
              <button
                type="button"
                className="proximity-clear"
                onClick={() => onChange('locationQuery', '')}
                aria-label="נקה חיפוש קרבה"
              >
                <X size={14} />
              </button>
            )}
          </div>
          {values.locationCenter && (
            <div className="agent-proximity-radius">
              <span className="proximity-match">
                <MapPin size={13} />
                {values.locationCenter.label}
              </span>
              <div className="proximity-slider-wrap">
                <label className="form-label">רדיוס: {values.locationRadius} ק״מ</label>
                <input
                  type="range"
                  min={1}
                  max={20}
                  value={values.locationRadius || 5}
                  onChange={(e) => onChange('locationRadius', Number(e.target.value))}
                  className="proximity-slider"
                  aria-label="רדיוס חיפוש בק״מ"
                />
              </div>
            </div>
          )}
          {values.locationQuery && !values.locationCenter && (
            <span className="proximity-no-match">לא נמצא מיקום תואם</span>
          )}
        </div>
      )}

      <div className="agent-filters-grid">
        {has('city') && (
          <div className="form-group">
            <label className="form-label">עיר</label>
            <SelectField
              value={values.city || ''}
              onChange={(v) => onChange('city', v)}
              placeholder="כל הערים"
              options={(config?.cities || []).map((c) => ({ value: c, label: c }))}
            />
          </div>
        )}
        {has('price') && (
          <div className="form-group" style={{ gridColumn: 'span 2' }}>
            <label className="form-label">טווח מחיר</label>
            <PriceRange
              minVal={values.minPrice}
              maxVal={values.maxPrice}
              onChangeMin={(n) => onChange('minPrice', n)}
              onChangeMax={(n) => onChange('maxPrice', n)}
            />
          </div>
        )}
        {has('rooms') && (
          <>
            <div className="form-group">
              <label className="form-label">חדרים מ-</label>
              <NumberField
                placeholder="3"
                value={values.minRooms === '' || values.minRooms == null ? null : Number(values.minRooms)}
                onChange={(v) => onChange('minRooms', v == null ? '' : String(v))}
              />
            </div>
            <div className="form-group">
              <label className="form-label">חדרים עד</label>
              <NumberField
                placeholder="5"
                value={values.maxRooms === '' || values.maxRooms == null ? null : Number(values.maxRooms)}
                onChange={(v) => onChange('maxRooms', v == null ? '' : String(v))}
              />
            </div>
          </>
        )}
        {has('sqm') && (
          <>
            <div className="form-group">
              <label className="form-label">שטח מ- (מ״ר)</label>
              <NumberField
                unit="מ״ר"
                value={values.minSqm}
                onChange={(v) => onChange('minSqm', v)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">שטח עד (מ״ר)</label>
              <NumberField
                unit="מ״ר"
                value={values.maxSqm}
                onChange={(v) => onChange('maxSqm', v)}
              />
            </div>
          </>
        )}
        {config?.extra}
      </div>
      <div className="agent-filters-actions">
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={onClear}
        >
          <X size={14} /> נקה סינון
        </button>
      </div>
    </div>
  );
}
