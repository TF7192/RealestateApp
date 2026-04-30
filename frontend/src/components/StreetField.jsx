import { useEffect, useRef, useState } from 'react';
import { MapPin, Check, X } from 'lucide-react';
import api from '../lib/api';
import './AddressField.css';

// StreetField — street-only autocomplete backed by the population-
// authority registry (`/api/lookups/streets`). Same look + behaviour
// as the street side of `StreetHouseField` (used on /properties/new),
// without the house-number input. Use it on lead forms where the
// agent describes a street the lead is interested in but no house
// number is meaningful.
//
// Props:
//   value          string  — controlled street name
//   onChange(v)            — fires on every keystroke + on pick
//   city           string  — required to scope the registry; without
//                            a city the field is disabled and the
//                            placeholder explains why
//   neighborhood   string  — optional; passed through to the API so
//                            the registry can narrow to the picked
//                            neighborhood once that join exists
//                            (today the backend ignores it; future-
//                            proofing the call site)
//   invalid        bool    — parent-driven error state
//   placeholder    string
export default function StreetField({
  value = '',
  onChange,
  city = '',
  neighborhood = '',
  invalid = false,
  autoFocus = false,
  id,
  placeholder = 'התחל/י להקליד שם רחוב…',
  inputProps = {},
}) {
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [picked, setPicked] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [err, setErr] = useState(null);

  const inputRef = useRef(null);
  const debounceRef = useRef(null);
  const reqIdRef = useRef(0);
  const pickedLabelRef = useRef('');
  // Only auto-open the dropdown when our own input is the active
  // element. Without this, every prop change (including the parent's
  // `neighborhood` prop while the user types in a *different* field)
  // re-fires the fetch and pops our dropdown into view — which is
  // why typing in the שכונה field above used to surface a list of
  // streets here.
  const focusedRef = useRef(false);

  // Debounced street lookup. Re-fires when city or neighborhood
  // changes — different city/neighborhood means a different namespace.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = (value || '').trim();
    if (!city) {
      setResults([]);
      setLoading(false);
      return () => { /* nothing */ };
    }
    if (picked && q === pickedLabelRef.current) return () => { /* nothing */ };
    debounceRef.current = setTimeout(async () => {
      const id2 = ++reqIdRef.current;
      setLoading(true);
      setErr(null);
      try {
        const res = await api.lookupStreets({ city, q, neighborhood, limit: 20 });
        if (id2 !== reqIdRef.current) return;
        setResults(Array.isArray(res?.items) ? res.items : []);
        if (focusedRef.current) setOpen(true);
      } catch (e) {
        if (id2 !== reqIdRef.current) return;
        setErr(e?.message || 'חיפוש רחובות נכשל');
        setResults([]);
      } finally {
        if (id2 === reqIdRef.current) setLoading(false);
      }
    }, 200);
    return () => clearTimeout(debounceRef.current);
  }, [value, city, neighborhood, picked]);

  const handlePick = (item) => {
    const name = item?.name || '';
    setPicked(true);
    pickedLabelRef.current = name;
    setActiveIndex(-1);
    setOpen(false);
    onChange?.(name);
  };

  const handleChange = (next) => {
    const prev = pickedLabelRef.current;
    const stillExtends =
      picked && prev && next.trim().startsWith(prev.trim());
    if (!stillExtends && picked) {
      setPicked(false);
      pickedLabelRef.current = '';
    }
    onChange?.(next);
  };

  const handleKey = (e) => {
    if (!open || !results.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(results.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      if (activeIndex >= 0 && results[activeIndex]) {
        e.preventDefault();
        handlePick(results[activeIndex]);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
      setActiveIndex(-1);
    }
  };

  const clear = () => {
    setPicked(false);
    pickedLabelRef.current = '';
    setResults([]);
    setOpen(false);
    onChange?.('');
    inputRef.current?.focus();
  };

  return (
    <div className={`addr-field ${invalid ? 'addr-invalid' : ''} ${picked ? 'addr-picked' : ''}`}>
      <span className="addr-field-icon" aria-hidden="true">
        {picked ? <Check size={14} /> : <MapPin size={14} />}
      </span>
      <input
        ref={inputRef}
        id={id}
        type="text"
        className="addr-field-input form-input"
        value={value || ''}
        onChange={(e) => handleChange(e.target.value)}
        onFocus={() => {
          focusedRef.current = true;
          if (results.length) setOpen(true);
        }}
        onBlur={() => {
          focusedRef.current = false;
          setTimeout(() => setOpen(false), 150);
        }}
        onKeyDown={handleKey}
        placeholder={!city ? 'בחר/י עיר תחילה' : placeholder}
        autoComplete="address-line1"
        inputMode="search"
        enterKeyHint="search"
        autoCorrect="off"
        autoCapitalize="words"
        spellCheck={false}
        autoFocus={autoFocus}
        aria-label="רחוב"
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
          aria-label="נקה רחוב"
          tabIndex={-1}
        >
          <X size={13} />
        </button>
      )}
      {loading && <span className="addr-field-loader" aria-hidden="true" />}
      {open && (results.length > 0 || err) && (
        <ul className="addr-field-list" role="listbox">
          {err && <li className="addr-field-err">{err}</li>}
          {results.map((item, i) => (
            <li
              key={`${item.code}-${item.name}`}
              role="option"
              aria-selected={i === activeIndex}
              className={`addr-field-item ${i === activeIndex ? 'is-active' : ''}`}
              onMouseDown={(e) => { e.preventDefault(); handlePick(item); }}
              onMouseEnter={() => setActiveIndex(i)}
            >
              <span className="addr-field-item-icon" aria-hidden="true">
                <MapPin size={12} />
              </span>
              <span className="addr-field-item-text">
                <strong>{item.name}</strong>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
