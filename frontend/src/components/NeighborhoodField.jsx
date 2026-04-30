import { useEffect, useRef, useState } from 'react';
import { MapPin, Check, X } from 'lucide-react';
import api from '../lib/api';
import './AddressField.css';

// NeighborhoodField — autocomplete for the chosen city's neighborhoods.
// Fetches /api/neighborhoods?city=<city> on city change (debounced via
// the city prop being stable) and filters client-side as the agent
// types. Pattern mirrors CityField (and StreetHouseField inside the
// property flow) so the new-lead form has the same UX/logic as
// /properties/new. Free-text fallback — typing past the suggestions
// keeps the value, the list just narrows.
export default function NeighborhoodField({
  city = '',
  value = '',
  onChange,
  invalid = false,
  autoFocus = false,
  id,
  placeholder = 'התחל/י להקליד שם שכונה…',
  inputProps = {},
}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef(null);

  // Refresh the per-city neighborhood list whenever `city` flips. We
  // never block typing on the request — empty/loading just means no
  // suggestions, and the input still accepts free-form values.
  useEffect(() => {
    let cancelled = false;
    if (!city) {
      setItems([]);
      return () => { /* nothing */ };
    }
    setLoading(true);
    api.listNeighborhoods({ city }).then((res) => {
      if (cancelled) return;
      const names = (res?.items || [])
        .map((n) => n?.name)
        .filter(Boolean);
      setItems(names);
    }).catch(() => { if (!cancelled) setItems([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [city]);

  const q = (value || '').trim();
  const filtered = q
    ? items.filter((n) => n.includes(q)).slice(0, 20)
    : items.slice(0, 20);
  const exactMatch = q && items.includes(q);

  const handleChange = (next) => {
    onChange?.(next);
    setOpen(true);
    setActiveIndex(-1);
  };

  const pick = (name) => {
    onChange?.(name);
    setOpen(false);
    setActiveIndex(-1);
  };

  const handleKey = (e) => {
    if (!open || !filtered.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(filtered.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      if (activeIndex >= 0 && filtered[activeIndex]) {
        e.preventDefault();
        pick(filtered[activeIndex]);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
      setActiveIndex(-1);
    }
  };

  const clear = () => {
    onChange?.('');
    setOpen(false);
    setActiveIndex(-1);
    inputRef.current?.focus();
  };

  return (
    <div className={`addr-field ${invalid ? 'addr-invalid' : ''} ${exactMatch ? 'addr-picked' : ''}`}>
      <span className="addr-field-icon" aria-hidden="true">
        {exactMatch ? <Check size={14} /> : <MapPin size={14} />}
      </span>
      <input
        ref={inputRef}
        id={id}
        type="text"
        className="addr-field-input form-input"
        value={value || ''}
        onChange={(e) => handleChange(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={handleKey}
        placeholder={!city ? 'בחר/י עיר תחילה' : placeholder}
        autoComplete="address-level3"
        inputMode="search"
        enterKeyHint="search"
        autoCorrect="off"
        autoCapitalize="words"
        spellCheck={false}
        autoFocus={autoFocus}
        aria-label="שכונה"
        aria-autocomplete="list"
        aria-expanded={open}
        disabled={!city}
        {...inputProps}
      />
      {value && (
        <button
          type="button"
          className="addr-field-clear"
          onClick={clear}
          aria-label="נקה שכונה"
          tabIndex={-1}
        >
          <X size={13} />
        </button>
      )}
      {loading && <span className="addr-field-loader" aria-hidden="true" />}
      {open && filtered.length > 0 && (
        <ul className="addr-field-list" role="listbox">
          {filtered.map((name, i) => (
            <li
              key={name}
              role="option"
              aria-selected={i === activeIndex}
              className={`addr-field-item ${i === activeIndex ? 'is-active' : ''}`}
              onMouseDown={(e) => { e.preventDefault(); pick(name); }}
              onMouseEnter={() => setActiveIndex(i)}
            >
              <span className="addr-field-item-icon" aria-hidden="true">
                <MapPin size={12} />
              </span>
              <span className="addr-field-item-text">
                <strong>{name}</strong>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
