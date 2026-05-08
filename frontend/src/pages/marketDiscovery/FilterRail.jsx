// FilterRail — sticky-left filter column on desktop, opened as a
// bottom sheet on mobile. Operates on the same `filters` shape that
// MarketDiscovery owns; emits granular updates via `onUpdate`.
//
// The rail is purely presentational; gating logic (active count, reset
// defaults) is in the parent so the page header and rail share state.

import { X } from 'lucide-react';
import {
  inputPropsForPrice, inputPropsForRooms, inputPropsForSqm, inputPropsForCity,
} from '../../lib/inputProps';
import Portal from '../../components/Portal';

const TIME_OPTIONS = [
  { value: '24h', label: 'היום' },
  { value: '3d',  label: '3 ימים' },
  { value: '7d',  label: 'שבוע' },
  { value: 'all', label: 'הכל' },
];
const POSTER_OPTIONS = [
  { value: 'private', label: 'פרטי' },
  { value: 'agency',  label: 'תיווך' },
  { value: '',        label: 'הכל' },
];

export default function FilterRail({ filters, onUpdate, onClear, mobileOpen, onCloseMobile }) {
  const body = <FilterRailBody filters={filters} onUpdate={onUpdate} onClear={onClear} />;

  return (
    <>
      <aside className="md-rail" aria-label="סינון">{body}</aside>

      {mobileOpen && (
        <Portal>
          <div className="md-mobile-rail-backdrop" onClick={onCloseMobile} />
          <div className="md-mobile-rail" role="dialog" aria-modal="true" aria-label="סינון">
            <div className="md-mobile-rail-head">
              <strong style={{ fontSize: 16 }}>סינון</strong>
              <button
                type="button"
                className="md-icon-button"
                onClick={onCloseMobile}
                aria-label="סגור"
              >
                <X size={18} />
              </button>
            </div>
            {body}
          </div>
        </Portal>
      )}
    </>
  );
}

function FilterRailBody({ filters, onUpdate, onClear }) {
  return (
    <>
      <div className="md-rail-group">
        <h4>חלון זמן</h4>
        <Segmented
          options={TIME_OPTIONS}
          value={filters.firstSeenAfter}
          onChange={(v) => onUpdate({ firstSeenAfter: v })}
        />
      </div>

      <div className="md-rail-group">
        <h4>מפרסם</h4>
        <Segmented
          options={POSTER_OPTIONS}
          value={filters.posterType}
          onChange={(v) => onUpdate({ posterType: v })}
        />
      </div>

      <div className="md-rail-group md-checkboxes">
        <h4>התאמות</h4>
        <label>
          <input
            type="checkbox"
            checked={!!filters.matchedOnly}
            onChange={(e) => onUpdate({ matchedOnly: e.target.checked })}
          />
          רק עם התאמה למתעניין שלי
        </label>
        <label>
          <input
            type="checkbox"
            checked={!!filters.hideViewed}
            onChange={(e) => onUpdate({ hideViewed: e.target.checked })}
          />
          הסתר מודעות שכבר ראיתי
        </label>
        <label>
          <input
            type="checkbox"
            checked={!!filters.hideDuplicated}
            onChange={(e) => onUpdate({ hideDuplicated: e.target.checked })}
          />
          הסתר מודעות שכבר שכפלתי
        </label>
      </div>

      <div className="md-rail-group">
        <h4>מיקום</h4>
        <input
          className="md-rail-input"
          placeholder="עיר"
          value={filters.city}
          onChange={(e) => onUpdate({ city: e.target.value })}
          {...inputPropsForCity()}
        />
        <input
          className="md-rail-input"
          placeholder="שכונה"
          value={filters.neighborhood}
          onChange={(e) => onUpdate({ neighborhood: e.target.value })}
        />
      </div>

      <details className="md-rail-collapser">
        <summary>סוג נכס</summary>
        <input
          className="md-rail-input"
          placeholder="דירה / בית / …"
          value={filters.propertyType}
          onChange={(e) => onUpdate({ propertyType: e.target.value })}
          style={{ marginTop: 6 }}
        />
      </details>

      <details className="md-rail-collapser">
        <summary>חדרים</summary>
        <div className="md-rail-row" style={{ marginTop: 6 }}>
          <input
            className="md-rail-input"
            placeholder="מינ׳"
            value={filters.minRooms}
            onChange={(e) => onUpdate({ minRooms: e.target.value })}
            {...inputPropsForRooms()}
          />
          <input
            className="md-rail-input"
            placeholder="מקס׳"
            value={filters.maxRooms}
            onChange={(e) => onUpdate({ maxRooms: e.target.value })}
            {...inputPropsForRooms()}
          />
        </div>
      </details>

      <details className="md-rail-collapser">
        <summary>שטח (מ״ר)</summary>
        <div className="md-rail-row" style={{ marginTop: 6 }}>
          <input
            className="md-rail-input"
            placeholder="מינ׳"
            value={filters.minSqm}
            onChange={(e) => onUpdate({ minSqm: e.target.value })}
            {...inputPropsForSqm()}
          />
          <input
            className="md-rail-input"
            placeholder="מקס׳"
            value={filters.maxSqm}
            onChange={(e) => onUpdate({ maxSqm: e.target.value })}
            {...inputPropsForSqm()}
          />
        </div>
      </details>

      <details className="md-rail-collapser">
        <summary>מחיר</summary>
        <div className="md-rail-row" style={{ marginTop: 6 }}>
          <input
            className="md-rail-input"
            placeholder="מינ׳"
            value={filters.minPrice}
            onChange={(e) => onUpdate({ minPrice: e.target.value })}
            {...inputPropsForPrice()}
          />
          <input
            className="md-rail-input"
            placeholder="מקס׳"
            value={filters.maxPrice}
            onChange={(e) => onUpdate({ maxPrice: e.target.value })}
            {...inputPropsForPrice()}
          />
        </div>
      </details>

      <details className="md-rail-collapser">
        <summary>סטטוס</summary>
        <select
          className="md-rail-select"
          value={filters.status}
          onChange={(e) => onUpdate({ status: e.target.value })}
          style={{ marginTop: 6 }}
        >
          <option value="active">פעיל בלבד</option>
          <option value="">הכל</option>
          <option value="removed">הוסר</option>
          <option value="unknown">לא ידוע</option>
        </select>
      </details>

      <button type="button" className="md-rail-clear" onClick={onClear}>
        נקה את כל הסינונים
      </button>
    </>
  );
}

function Segmented({ options, value, onChange }) {
  return (
    <div className="md-segmented compact" role="tablist">
      {options.map((opt) => (
        <button
          key={opt.value || '_all'}
          type="button"
          role="tab"
          aria-pressed={value === opt.value}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
