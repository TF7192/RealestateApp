import { useEffect, useRef, useState } from 'react';
import { MapPin, Check, X } from 'lucide-react';
import api from '../lib/api';
import './AddressField.css';
import './StreetHouseField.css';

/**
 * StreetHouseField — split address input that pairs a canonical street
 * autocomplete with a short house-number input. Replaces the combined
 * "street + number" AddressField on /properties/new because agents
 * complained that typing both into one box was awkward (and made the
 * Photon-backed match bail every time they appended the number).
 *
 * The street side hits /api/lookups/streets — backed by the in-memory
 * population-authority registry — so suggestions are the *canonical*
 * municipal spelling (השם הרשמי) instead of OSM's free-form labels.
 * Picking a row stamps the canonical name onto the parent form and
 * marks the address validated; typing past the pick re-opens the
 * dropdown.
 *
 * Props:
 *   street               string  — controlled street name
 *   houseNumber          string  — controlled house number ("15", "15א")
 *   city                 string  — required for autocomplete; without
 *                                  a city the dropdown explains why
 *                                  it's idle
 *   onStreetChange(v)            — fires on every keystroke
 *   onHouseNumberChange(v)       — fires on every keystroke
 *   onPick({ street, code })     — fires when the agent picks a
 *                                  canonical street row
 *   onClear()                    — fires when the agent diverges from
 *                                  the picked street; parent should
 *                                  drop the validated metadata
 *   invalid              bool    — parent-driven error state
 *   id                   string  — optional id for the street input
 */
export default function StreetHouseField({
  street = '',
  houseNumber = '',
  city = '',
  onStreetChange,
  onHouseNumberChange,
  onPick,
  onClear,
  invalid = false,
  autoFocus = false,
  id,
  streetPlaceholder = 'התחל/י להקליד שם רחוב…',
  housePlaceholder = 'מספר',
}) {
  // Local mirror of the controlled value so we can debounce the lookup
  // without thrashing the parent on every keystroke.
  const [localStreet, setLocalStreet] = useState(street ?? '');
  const [localHouse, setLocalHouse] = useState(houseNumber ?? '');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [picked, setPicked] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [err, setErr] = useState(null);

  const streetInputRef = useRef(null);
  const debounceRef = useRef(null);
  const reqIdRef = useRef(0);
  const pickedLabelRef = useRef('');

  // Reconcile when the parent swaps the value externally (e.g. editing
  // an existing property). Render-phase diff matches the AddressField
  // pattern and avoids an effect-cascade.
  const [lastExternalStreet, setLastExternalStreet] = useState(street ?? '');
  if ((street ?? '') !== lastExternalStreet) {
    setLastExternalStreet(street ?? '');
    setLocalStreet(street ?? '');
    if ((street ?? '') === '') {
      setPicked(false);
      pickedLabelRef.current = '';
    }
  }
  const [lastExternalHouse, setLastExternalHouse] = useState(houseNumber ?? '');
  if ((houseNumber ?? '') !== lastExternalHouse) {
    setLastExternalHouse(houseNumber ?? '');
    setLocalHouse(houseNumber ?? '');
  }

  // Debounced street autocomplete. Re-fetches when the city changes —
  // a different city means a different street namespace.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = (localStreet || '').trim();
    // Skip the request when there's no city to scope by — the API
    // returns empty for missing city, but better to short-circuit and
    // surface a clearer hint in the dropdown.
    if (!city) {
      setResults([]);
      setLoading(false);
      return () => { /* nothing to tear down */ };
    }
    if (picked && q === pickedLabelRef.current) return () => { /* nothing */ };

    debounceRef.current = setTimeout(async () => {
      const id2 = ++reqIdRef.current;
      setLoading(true);
      setErr(null);
      try {
        const res = await api.lookupStreets({ city, q, limit: 20 });
        if (id2 !== reqIdRef.current) return;
        setResults(Array.isArray(res?.items) ? res.items : []);
        setOpen(true);
      } catch (e) {
        if (id2 !== reqIdRef.current) return;
        setErr(e?.message || 'חיפוש רחובות נכשל');
        setResults([]);
      } finally {
        if (id2 === reqIdRef.current) setLoading(false);
      }
    }, 200);
    return () => clearTimeout(debounceRef.current);
  }, [localStreet, city, picked]);

  const handlePick = (item) => {
    const name = item?.name || '';
    setLocalStreet(name);
    setPicked(true);
    pickedLabelRef.current = name;
    setActiveIndex(-1);
    setOpen(false);
    onStreetChange?.(name);
    onPick?.({ street: name, code: item?.code ?? null });
    // Move focus into the house number input — picking the street is
    // almost always followed by typing the number.
    requestAnimationFrame(() => {
      const el = document.getElementById(houseInputId);
      if (el) el.focus();
    });
  };

  const handleStreetChange = (next) => {
    setLocalStreet(next);
    const prev = pickedLabelRef.current;
    const stillExtends =
      picked && prev && next.trim().startsWith(prev.trim());
    if (!stillExtends && picked) {
      setPicked(false);
      pickedLabelRef.current = '';
      onClear?.();
    }
    onStreetChange?.(next);
  };

  const handleStreetKey = (e) => {
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

  const clearStreet = () => {
    setLocalStreet('');
    setPicked(false);
    pickedLabelRef.current = '';
    setResults([]);
    setOpen(false);
    onStreetChange?.('');
    onClear?.();
    streetInputRef.current?.focus();
  };

  const handleHouseChange = (raw) => {
    // Allow trailing Hebrew letter for דירות ("15א", "12ב"). Strip
    // anything else to keep the field tight; cap at 8 chars.
    const cleaned = String(raw).replace(/[^0-9א-ת/-]/g, '').slice(0, 8);
    setLocalHouse(cleaned);
    onHouseNumberChange?.(cleaned);
  };

  const houseInputId = id ? `${id}-house` : 'shf-house';

  return (
    <div className={`shf-wrap ${invalid ? 'shf-invalid' : ''}`}>
      <div className={`shf-row`}>
        <div className={`addr-field shf-street ${invalid ? 'addr-invalid' : ''} ${picked ? 'addr-picked' : ''}`}>
          <span className="addr-field-icon" aria-hidden="true">
            {picked ? <Check size={14} /> : <MapPin size={14} />}
          </span>
          <input
            ref={streetInputRef}
            id={id}
            type="text"
            className="addr-field-input form-input"
            value={localStreet}
            onChange={(e) => handleStreetChange(e.target.value)}
            onFocus={() => { if (results.length) setOpen(true); }}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            onKeyDown={handleStreetKey}
            // When no city is picked the street autocomplete has no
            // namespace to query against, so the field is disabled.
            // Surface that state in the placeholder explicitly — silent
            // `disabled` reads as "the input is broken" on a mobile
            // touch device since you can't tap into it to discover the
            // dropdown's "בחר/י עיר תחילה" message.
            placeholder={!city ? 'בחר/י עיר תחילה' : streetPlaceholder}
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
            aria-controls="shf-street-list"
            disabled={!city}
          />
          {localStreet && (
            <button
              type="button"
              className="addr-field-clear"
              onClick={clearStreet}
              aria-label="נקה רחוב"
              tabIndex={-1}
            >
              <X size={13} />
            </button>
          )}
          {loading && <span className="addr-field-loader" aria-hidden="true" />}

          {open && (results.length > 0 || err || (!city && localStreet)) && (
            <ul id="shf-street-list" className="addr-field-list" role="listbox">
              {!city && (
                <li className="addr-field-err">בחר/י עיר תחילה</li>
              )}
              {err && (
                <li className="addr-field-err">{err}</li>
              )}
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

        <div className="shf-house">
          <input
            id={houseInputId}
            type="text"
            className="form-input shf-house-input"
            value={localHouse}
            onChange={(e) => handleHouseChange(e.target.value)}
            placeholder={housePlaceholder}
            inputMode="numeric"
            // The number itself is LTR even in an RTL layout — Hebrew
            // streets read RTL but the building number is a Latin
            // numeral, so force LTR here and let `dir="auto"` on the
            // surrounding form do the rest.
            dir="ltr"
            aria-label="מספר בית"
            maxLength={8}
            autoComplete="address-line2"
          />
        </div>
      </div>
    </div>
  );
}
