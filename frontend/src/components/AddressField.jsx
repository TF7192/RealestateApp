import { useEffect, useRef, useState } from 'react';
import { MapPin, Search as SearchIcon, Check, X } from 'lucide-react';
import api from '../lib/api';
import './AddressField.css';

/**
 * Task 3 · Address typeahead input backed by the OSM / Photon proxy at
 * /api/geo/search. Agents only save a form once they've selected a row from
 * the returned suggestions — the `validated` state below is what the parent
 * form checks on submit. Until they pick, we keep whatever they've typed as
 * a transient `value` but never hand that back to the parent as a trusted
 * address.
 *
 * Props:
 *   value           string  — the current street text (controlled)
 *   onChange(v)             — fires on every keystroke; parent may render
 *                             the text, but MUST NOT persist until onPick
 *                             fires
 *   onPick(result)          — fires when the agent picks a suggestion:
 *                               {
 *                                 street, houseNumber, city,
 *                                 lat, lng, placeId, formattedAddress
 *                               }
 *   city            string? — optional bias; Photon ranks matches here first
 *   placeholder     string
 *   invalid         bool    — parent-driven error state (e.g. "address
 *                             not validated" on submit)
 */
export default function AddressField({
  value = '',
  onChange,
  onPick,
  city,
  placeholder = 'התחל להקליד כתובת…',
  invalid = false,
  autoFocus = false,
  id,
  'aria-label': ariaLabel,
}) {
  const [local, setLocal] = useState(value ?? '');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [picked, setPicked] = useState(false); // has the current text come from a real pick?
  const [activeIndex, setActiveIndex] = useState(-1);
  const [err, setErr] = useState(null);

  const inputRef = useRef(null);
  const debounceRef = useRef(null);
  const reqIdRef = useRef(0);

  // Keep local in sync when the parent replaces the value externally
  // (e.g., legacy edit loading an existing record). An external change
  // always invalidates the "picked from list" marker.
  useEffect(() => {
    setLocal(value ?? '');
    if ((value ?? '') === '') setPicked(false);
  }, [value]);

  // Debounced Photon query. Aborts stale responses by bumping reqId.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = (local || '').trim();
    if (q.length < 2) {
      setResults([]);
      setLoading(false);
      return () => { /* nothing to tear down */ };
    }
    // If the agent already picked a suggestion and the text matches, we
    // don't need to re-fetch on mount / re-render.
    if (picked) return () => { /* nothing */ };

    debounceRef.current = setTimeout(async () => {
      const id = ++reqIdRef.current;
      setLoading(true);
      setErr(null);
      try {
        const res = await api.geoSearch({ q, city });
        if (id !== reqIdRef.current) return; // a newer request is in flight
        setResults(res?.items || []);
        setOpen(true);
      } catch (e) {
        if (id !== reqIdRef.current) return;
        setErr(e?.message || 'חיפוש כתובות נכשל');
        setResults([]);
      } finally {
        if (id === reqIdRef.current) setLoading(false);
      }
    }, 200);

    return () => clearTimeout(debounceRef.current);
  }, [local, city, picked]);

  const handlePick = (item) => {
    const label = item.street || item.label || '';
    setLocal(label);
    setPicked(true);
    setOpen(false);
    setActiveIndex(-1);
    onChange?.(label);
    onPick?.({
      street: item.street || item.label || '',
      houseNumber: item.houseNumber || null,
      city: item.city || '',
      lat: item.lat ?? null,
      lng: item.lng ?? null,
      placeId: item.id || null,
      formattedAddress: item.label || null,
    });
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
    setLocal('');
    setPicked(false);
    setResults([]);
    setOpen(false);
    onChange?.('');
    onPick?.({
      street: '', houseNumber: null, city: '',
      lat: null, lng: null, placeId: null, formattedAddress: null,
    });
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
        value={local}
        onChange={(e) => {
          setLocal(e.target.value);
          setPicked(false);
          onChange?.(e.target.value);
        }}
        onFocus={() => { if (results.length) setOpen(true); }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={handleKey}
        placeholder={placeholder}
        autoComplete="street-address"
        inputMode="search"
        enterKeyHint="search"
        autoFocus={autoFocus}
        aria-label={ariaLabel || 'כתובת'}
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls="addr-field-list"
      />
      {local && (
        <button
          type="button"
          className="addr-field-clear"
          onClick={clear}
          aria-label="נקה כתובת"
        >
          <X size={13} />
        </button>
      )}
      {loading && <span className="addr-field-loader" aria-hidden="true" />}

      {open && (results.length > 0 || err) && (
        <ul id="addr-field-list" className="addr-field-list" role="listbox">
          {err && (
            <li className="addr-field-err">
              <SearchIcon size={12} /> {err}
            </li>
          )}
          {results.map((item, i) => (
            <li
              key={item.id || `${item.street}-${i}`}
              role="option"
              aria-selected={i === activeIndex}
              className={`addr-field-item ${i === activeIndex ? 'is-active' : ''}`}
              // Use onMouseDown instead of onClick so the input's onBlur
              // doesn't close the list before the click registers.
              onMouseDown={(e) => { e.preventDefault(); handlePick(item); }}
              onMouseEnter={() => setActiveIndex(i)}
            >
              <span className="addr-field-item-icon" aria-hidden="true">
                <MapPin size={12} />
              </span>
              <span className="addr-field-item-text">
                <strong>{item.street || item.label}</strong>
                {item.city && <small>{item.city}</small>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
