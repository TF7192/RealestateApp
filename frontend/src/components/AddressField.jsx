import { useEffect, useRef, useState } from 'react';
import { MapPin, Search as SearchIcon, Check, X } from 'lucide-react';
import api from '../lib/api';
import { useNeighborhoodSuggestions } from '../hooks/useNeighborhoodSuggestions';
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
  onClear,
  city,
  placeholder = 'התחל להקליד כתובת…',
  invalid = false,
  autoFocus = false,
  id,
  'aria-label': ariaLabel,
  // MLS G1 — optional secondary field for neighborhoods. Pass
  // `showNeighborhood` + controlled `neighborhood` / `onNeighborhoodChange`
  // to opt into the new subfield. Existing callers leave these blank
  // and see no change.
  showNeighborhood = false,
  neighborhood = '',
  onNeighborhoodChange,
  neighborhoodPlaceholder = 'שכונה (רשות)',
}) {
  const [local, setLocal] = useState(value ?? '');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [picked, setPicked] = useState(false); // has the current text come from a real pick?
  const [activeIndex, setActiveIndex] = useState(-1);
  const [err, setErr] = useState(null);

  // Track the last `value` we've reconciled with `local`, so we can
  // reset when the parent swaps it out externally (e.g., loading an
  // existing record into an edit form). Render-phase diff keeps the
  // sync in one pass, avoiding the cascading render the
  // react-hooks/set-state-in-effect lint rule warns about. See
  // https://react.dev/reference/react/useState#storing-information-from-previous-renders
  const [lastExternalValue, setLastExternalValue] = useState(value ?? '');
  if ((value ?? '') !== lastExternalValue) {
    setLastExternalValue(value ?? '');
    setLocal(value ?? '');
    if ((value ?? '') === '') {
      setPicked(false);
      pickedLabelRef.current = '';
    }
  }

  const inputRef = useRef(null);
  const debounceRef = useRef(null);
  const reqIdRef = useRef(0);
  // Snapshot of the street label the agent picked, so we can tell later
  // whether they're EXTENDING it (e.g., "הרצל" → "הרצל 15", which is still
  // the same validated address with a manually-typed house number) or
  // DIVERGING (e.g., "הרצל" → "ז'בוטינסקי", a different street that
  // invalidates the previous lat/lng).
  const pickedLabelRef = useRef('');

  // Debounced Photon query. Aborts stale responses by bumping reqId.
  // The two setState calls in the early-return clear the fetch-derived
  // view state (results + loading) when the query becomes invalid
  // (< 2 chars). This is the "cancelling a subscription to an async
  // source" case the docs bless; the lint rule flags it defensively.
  /* eslint-disable react-hooks/set-state-in-effect */
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
  /* eslint-enable react-hooks/set-state-in-effect */

  const handlePick = (item) => {
    const isStreetOnly = item.kind === 'street' && !item.houseNumber;
    // For street-only picks, append a space so the cursor lands ready for
    // the agent to type the house number. OSM coverage in Israel is sparse
    // for residential housenumbers — many streets only have a couple of
    // mapped buildings, so most picks naturally land on the "street" row
    // and the agent has to add the number manually. Appending the space
    // makes that the obvious next action instead of a hidden affordance.
    const baseLabel = item.street || item.label || '';
    const label = isStreetOnly ? `${baseLabel} ` : baseLabel;
    setLocal(label);
    setPicked(true);
    // The picked-label snapshot stores the trimmed street so trailing
    // edits (typing a number, then editing it) all stay "extending the
    // pick" rather than diverging.
    pickedLabelRef.current = baseLabel;
    setActiveIndex(-1);
    if (isStreetOnly) {
      // Keep dropdown context — the agent might type a number that
      // matches a numbered house entry in OSM, in which case we want
      // those new suggestions to appear.
      setOpen(true);
      // Re-focus the input and put the cursor at the end so the next
      // keypress lands after the space we just appended.
      requestAnimationFrame(() => {
        const el = inputRef.current;
        if (el) {
          el.focus();
          try { el.setSelectionRange(label.length, label.length); } catch { /* ignore */ }
        }
      });
    } else {
      setOpen(false);
    }
    onPick?.({
      street: baseLabel,
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
    pickedLabelRef.current = '';
    setResults([]);
    setOpen(false);
    onChange?.('');
    onClear?.();
    inputRef.current?.focus();
  };

  const streetBox = (
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
          const next = e.target.value;
          setLocal(next);
          // Decide whether the new text still represents the picked
          // address. If it's an extension of the picked street label
          // (e.g. typing "15" after "הרצל" → "הרצל 15"), the lat/lng/
          // placeId from the pick are still correct — many Israeli
          // streets don't have per-house OSM entries, so forcing the
          // agent to re-pick after typing the number was the bug they
          // reported. If they wiped the picked text or replaced it with
          // a different street, the prior validation no longer holds:
          // fire onClear so the parent drops placeId + lat + lng and
          // hasValidatedAddress goes back to false until they re-pick.
          const prev = pickedLabelRef.current;
          const stillExtends =
            picked && prev && next.trim().startsWith(prev.trim());
          if (!stillExtends && picked) {
            setPicked(false);
            pickedLabelRef.current = '';
            onClear?.();
          }
          onChange?.(next);
        }}
        onFocus={() => { if (results.length) setOpen(true); }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={handleKey}
        placeholder={placeholder}
        autoComplete="street-address"
        inputMode="search"
        enterKeyHint="search"
        autoCorrect="off"
        autoCapitalize="words"
        spellCheck={false}
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
          {results.map((item, i) => {
            // Tell the agent at a glance whether this row is a numbered
            // address (immediate save) or a street row (will need a house
            // number typed after picking). OSM in Israel is street-row-
            // heavy, so this badge is the difference between "I picked
            // and it didn't add the number" → "oh I need to type it".
            const badge =
              item.kind === 'house' ? null :
              item.kind === 'street' ? 'הוסף מספר' :
              item.kind === 'place' ? 'יישוב' :
              null;
            return (
              <li
                key={item.id || `${item.street}-${i}`}
                role="option"
                aria-selected={i === activeIndex}
                className={`addr-field-item addr-field-item-${item.kind || 'poi'} ${i === activeIndex ? 'is-active' : ''}`}
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
                {badge && <span className="addr-field-item-badge">{badge}</span>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );

  if (!showNeighborhood) return streetBox;
  return (
    <div className="addr-field-wrap">
      {streetBox}
      <NeighborhoodSubField
        city={city}
        value={neighborhood}
        onChange={onNeighborhoodChange}
        placeholder={neighborhoodPlaceholder}
      />
    </div>
  );
}

// MLS G1 — optional secondary input sitting below the street row. When
// a city is set, typing here suggests matches from the Neighborhood
// table; picking one or leaving free text both propagate through
// onNeighborhoodChange. Disabled (with a visual hint) when no city is
// known yet, so the agent understands they need to pick a place first.
function NeighborhoodSubField({ city, value = '', onChange, placeholder }) {
  const [query, setQuery] = useState(value || '');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  // Keep the local input in sync when the parent swaps the value
  // externally (e.g. loading an existing record into an edit form).
  const [lastExternal, setLastExternal] = useState(value || '');
  if ((value || '') !== lastExternal) {
    setLastExternal(value || '');
    setQuery(value || '');
  }
  const disabled = !((city || '').trim());
  const { items, loading, error } = useNeighborhoodSuggestions(city, query);

  const pick = (name) => {
    setQuery(name);
    setOpen(false);
    setActiveIndex(-1);
    onChange?.(name);
  };

  const onKeyDown = (e) => {
    if (!open) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(items.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      if (activeIndex >= 0 && items[activeIndex]) {
        e.preventDefault();
        pick(items[activeIndex].name);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
      setActiveIndex(-1);
    }
  };

  return (
    <div className={`addr-field addr-field-nbh ${disabled ? 'addr-field-disabled' : ''}`}>
      <span className="addr-field-icon" aria-hidden="true">
        <MapPin size={14} />
      </span>
      <input
        type="text"
        className="addr-field-input form-input"
        value={query}
        disabled={disabled}
        placeholder={disabled ? 'בחר עיר תחילה' : placeholder}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          // Free text flows through immediately; the parent persists
          // whatever the agent has typed whether or not they pick a
          // suggestion row.
          onChange?.(e.target.value);
        }}
        onFocus={() => { if (items.length) setOpen(true); }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={onKeyDown}
        aria-label="שכונה"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls="addr-field-nbh-list"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
      />
      {loading && <span className="addr-field-loader" aria-hidden="true" />}
      {open && !disabled && (items.length > 0 || error) && (
        <ul id="addr-field-nbh-list" className="addr-field-list" role="listbox">
          {error && (
            <li className="addr-field-err">
              <SearchIcon size={12} /> {error}
            </li>
          )}
          {items.map((item, i) => (
            <li
              key={item.id || `${item.name}-${i}`}
              role="option"
              aria-selected={i === activeIndex}
              className={`addr-field-item ${i === activeIndex ? 'is-active' : ''}`}
              onMouseDown={(e) => { e.preventDefault(); pick(item.name); }}
              onMouseEnter={() => setActiveIndex(i)}
            >
              <span className="addr-field-item-icon" aria-hidden="true">
                <MapPin size={12} />
              </span>
              <span className="addr-field-item-text">
                <strong>{item.name}</strong>
                {item.aliases?.length > 0 && (
                  <small>{item.aliases.slice(0, 2).join(' · ')}</small>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
