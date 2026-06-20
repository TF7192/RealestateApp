// FilterRail — horizontal filter bar above the results on desktop,
// opened as a bottom sheet on mobile. Operates on the same `filters`
// shape that MarketDiscovery owns; emits granular updates via `onUpdate`.
//
// Leads with a "quick filter" group (חלון זמן + מפרסם) visually separated
// from the detailed filters (location / rooms / sqm / price / status).
//
// The rail is purely presentational; gating logic (active count, reset
// defaults) is in the parent so the page header and rail share state.

import { X } from 'lucide-react';
import {
  inputPropsForPrice, inputPropsForRooms, inputPropsForSqm, inputPropsForCity,
} from '../../lib/inputProps';
import Portal from '../../components/Portal';

const POSTER_OPTIONS = [
  { value: 'private', label: 'פרטי' },
  { value: 'agency',  label: 'תיווך' },
  { value: '',        label: 'הכל' },
];

// Time window is stored as 'Nd' (N days) / '24h' / 'all'; the input shows
// the day count (empty = all). The backend accepts any 'Nd'.
function daysFromWindow(v) {
  if (!v || v === 'all') return '';
  if (v === '24h') return '1';
  const m = /^(\d+)d$/.exec(String(v));
  return m ? m[1] : '';
}

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
      <div className="md-rail-group md-rail-quick" aria-label="סינון מהיר">
        <label className="md-rail-qf">
          <span className="md-rail-qf-label">חלון זמן (ימים)</span>
          <input
            className="md-rail-input md-rail-days"
            type="text"
            inputMode="numeric"
            placeholder="הכל"
            value={daysFromWindow(filters.firstSeenAfter)}
            onChange={(e) => {
              const n = e.target.value.replace(/\D/g, '');
              onUpdate({ firstSeenAfter: n ? `${n}d` : 'all' });
            }}
            aria-label="חלון זמן בימים (ריק = הכל)"
          />
        </label>
        <div className="md-rail-qf">
          <span className="md-rail-qf-label">מפרסם</span>
          <Segmented
            options={POSTER_OPTIONS}
            value={filters.posterType}
            onChange={(v) => onUpdate({ posterType: v })}
          />
        </div>
      </div>

      <details className="md-rail-collapser md-checkboxes">
        <summary>התאמות</summary>
        <div className="md-rail-pop">
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
      </details>

      <details className="md-rail-collapser">
        <summary>מיקום</summary>
        <div className="md-rail-pop">
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
            style={{ marginTop: 6 }}
          />
        </div>
      </details>

      <details className="md-rail-collapser">
        <summary>סוג נכס</summary>
        <div className="md-rail-pop">
          <input
            className="md-rail-input"
            placeholder="דירה / בית / …"
            value={filters.propertyType}
            onChange={(e) => onUpdate({ propertyType: e.target.value })}
          />
        </div>
      </details>

      <details className="md-rail-collapser">
        <summary>חדרים</summary>
        <div className="md-rail-pop">
          <div className="md-rail-row">
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
        </div>
      </details>

      <details className="md-rail-collapser">
        <summary>שטח (מ״ר)</summary>
        <div className="md-rail-pop">
          <div className="md-rail-row">
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
        </div>
      </details>

      <details className="md-rail-collapser">
        <summary>מחיר</summary>
        <div className="md-rail-pop">
          <div className="md-rail-row">
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
        </div>
      </details>

      <details className="md-rail-collapser">
        <summary>סטטוס</summary>
        <div className="md-rail-pop">
          <select
            className="md-rail-select"
            value={filters.status}
            onChange={(e) => onUpdate({ status: e.target.value })}
          >
            <option value="active">פעיל בלבד</option>
            <option value="">הכל</option>
            <option value="removed">הוסר</option>
            <option value="unknown">לא ידוע</option>
          </select>
        </div>
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
