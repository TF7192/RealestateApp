import { useEffect, useState, useRef } from 'react';
import { X, Search, Check, Calendar, Pencil } from 'lucide-react';
import Portal from './Portal';
import './MobilePickers.css';

// ────────────────────────────────────────────────────────────────
// RoomsChips — replaces free-text rooms input with tap chips
// Values: 1, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6+
// ────────────────────────────────────────────────────────────────
const ROOM_OPTIONS = [1, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6];

export function RoomsChips({ value, onChange, allowPlus = true, label }) {
  const cur = value == null || value === '' ? null : Number(value);
  return (
    <div className="mpk-chips-wrap">
      {label && <span className="mpk-chips-label">{label}</span>}
      <div className="mpk-chips" role="radiogroup" aria-label={label || 'חדרים'}>
        {ROOM_OPTIONS.map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={cur === n}
            className={`mpk-chip ${cur === n ? 'sel' : ''}`}
            onClick={() => onChange?.(n)}
          >
            {n}
          </button>
        ))}
        {allowPlus && (
          <button
            type="button"
            role="radio"
            aria-checked={cur != null && cur > 6}
            className={`mpk-chip ${cur != null && cur > 6 ? 'sel' : ''}`}
            onClick={() => onChange?.(7)}
            title="6 ומעלה"
          >
            6+
          </button>
        )}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// DateQuickChips — "היום", "+6 חודשים" next to a date input
// ────────────────────────────────────────────────────────────────
export function DateQuickChips({ value, onChange, chips = ['today', '+6m'] }) {
  const set = (chip) => {
    const d = new Date();
    if (chip === 'today')   { /* no-op */ }
    if (chip === '+3m')     d.setMonth(d.getMonth() + 3);
    if (chip === '+6m')     d.setMonth(d.getMonth() + 6);
    if (chip === '+12m')    d.setFullYear(d.getFullYear() + 1);
    onChange?.(d.toISOString().slice(0, 10));
  };
  return (
    <div className="mpk-datechips">
      {chips.includes('today') && (
        <button type="button" className="mpk-datechip" onClick={() => set('today')}>
          <Calendar size={12} /> היום
        </button>
      )}
      {chips.includes('+3m') && (
        <button type="button" className="mpk-datechip" onClick={() => set('+3m')}>
          +3 חודשים
        </button>
      )}
      {chips.includes('+6m') && (
        <button type="button" className="mpk-datechip" onClick={() => set('+6m')}>
          +6 חודשים
        </button>
      )}
      {chips.includes('+12m') && (
        <button type="button" className="mpk-datechip" onClick={() => set('+12m')}>
          +שנה
        </button>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// SuggestPicker — bottom sheet autocomplete. Tap the field → sheet of
// top matches from a list (city, street). Touch-friendly replacement for
// buggy <datalist>.
// ────────────────────────────────────────────────────────────────
export function SuggestPicker({
  value,
  onChange,
  options = [],
  placeholder,
  label,
  inputProps = {},
  maxVisible = 60,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = prev; };
    }
    return undefined;
  }, [open]);

  const q = (query || value || '').trim();
  const filtered = q
    ? options.filter((o) => o.includes(q)).slice(0, maxVisible)
    : options.slice(0, maxVisible);

  return (
    <>
      <div className="mpk-suggest">
        <input
          ref={inputRef}
          className="form-input"
          value={value || ''}
          onChange={(e) => onChange?.(e.target.value)}
          onFocus={(e) => {
            // On touch, open the sheet; on desktop, allow inline editing
            if (window.matchMedia('(pointer: coarse)').matches) {
              e.target.blur();
              setQuery(value || '');
              setOpen(true);
            }
          }}
          placeholder={placeholder}
          {...inputProps}
        />
      </div>
      {open && (
        <Portal>
          <div className="mpk-back" onClick={() => setOpen(false)} role="dialog">
            <div className="mpk-sheet" onClick={(e) => e.stopPropagation()}>
              <div className="mpk-handle" />
              <header className="mpk-head">
                <h3>{label || placeholder || 'בחר'}</h3>
                <button className="mpk-close" onClick={() => setOpen(false)} aria-label="סגור">
                  <X size={18} />
                </button>
              </header>
              <div className="mpk-search">
                <Search size={14} />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="חפש…"
                  autoFocus
                />
              </div>
              <div className="mpk-body">
                {q && !filtered.some((o) => o === q) && (
                  <button
                    className="mpk-row mpk-row-custom"
                    onClick={() => {
                      onChange?.(q);
                      setOpen(false);
                    }}
                  >
                    <Pencil size={14} />
                    <span>השתמש ב"<strong>{q}</strong>"</span>
                  </button>
                )}
                {filtered.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    className={`mpk-row ${opt === value ? 'sel' : ''}`}
                    onClick={() => {
                      onChange?.(opt);
                      setOpen(false);
                    }}
                  >
                    <span>{opt}</span>
                    {opt === value && <Check size={14} />}
                  </button>
                ))}
                {filtered.length === 0 && (
                  <div className="mpk-empty">לא נמצאו תוצאות.</div>
                )}
              </div>
            </div>
          </div>
        </Portal>
      )}
    </>
  );
}

// ────────────────────────────────────────────────────────────────
// OverflowSheet — a generic bottom sheet for ⋯ actions
// Usage: <OverflowSheet open onClose actions={[{label, icon, color, onClick}]} />
// ────────────────────────────────────────────────────────────────
export function OverflowSheet({ open, onClose, title, actions = [] }) {
  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  if (!open) return null;
  return (
    <Portal>
      <div className="mpk-back mpk-overflow-back" onClick={onClose}>
        <div className="mpk-sheet mpk-overflow" onClick={(e) => e.stopPropagation()}>
          <div className="mpk-handle" />
          {title && (
            <header className="mpk-head mpk-head-centered">
              <h3>{title}</h3>
            </header>
          )}
          <div className="mpk-overflow-list">
            {actions.map((a, i) => {
              const Icon = a.icon;
              return (
                <button
                  key={i}
                  type="button"
                  className={`mpk-overflow-row ${a.color ? `mpk-overflow-row-${a.color}` : ''}`}
                  onClick={() => {
                    onClose?.();
                    a.onClick?.();
                  }}
                  disabled={a.disabled}
                >
                  {Icon && <Icon size={18} />}
                  <div className="mpk-overflow-meta">
                    <strong>{a.label}</strong>
                    {a.description && <small>{a.description}</small>}
                  </div>
                </button>
              );
            })}
          </div>
          <button className="mpk-cancel" onClick={onClose}>ביטול</button>
        </div>
      </div>
    </Portal>
  );
}
