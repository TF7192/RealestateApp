import { useEffect, useRef, useState } from 'react';
import { X, MapPin } from 'lucide-react';
import { useNeighborhoodSuggestions } from '../hooks/useNeighborhoodSuggestions';
import './NeighborhoodPicker.css';

// MLS G1 · Multi-select neighborhood typeahead.
//
// Renders a chip list of the currently-picked neighborhood names plus an
// input that suggests matches from /api/neighborhoods?city=…&search=….
// Unselected free-text is accepted on Enter so the picker never blocks
// an agent who's typing a neighborhood we don't have in our seed table.
//
// Props:
//   city         string   — required context for suggestions. When empty
//                           the input is disabled with a prompt.
//   value        string[] — currently-selected names
//   onChange(next: string[])
//   placeholder  string?  — override the default
//
// Accessibility: the input exposes role=combobox with aria-expanded /
// aria-controls, and each suggestion is role=option. Chip remove
// buttons are labelled "הסר X" so screen-readers announce the target.
export default function NeighborhoodPicker({
  city,
  value = [],
  onChange,
  placeholder,
  id,
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef(null);

  const cityTrim = (city || '').trim();
  const disabled = !cityTrim;

  const { items, loading, error } = useNeighborhoodSuggestions(
    cityTrim,
    query,
  );

  // Reset the open state + query when the city swaps so suggestions
  // don't linger across cities. The effect only runs on city change.
  useEffect(() => {
    setQuery('');
    setOpen(false);
    setActiveIndex(-1);
  }, [cityTrim]);

  const listId = id ? `${id}-list` : 'nbh-picker-list';
  const effectivePlaceholder =
    placeholder ?? (disabled ? 'בחר עיר תחילה' : 'התחל להקליד שכונה…');

  const addValue = (name) => {
    const trimmed = (name || '').trim();
    if (!trimmed) return;
    if (value.includes(trimmed)) {
      // Already picked — just clear the input so the agent can move on.
      setQuery('');
      setOpen(false);
      setActiveIndex(-1);
      return;
    }
    onChange?.([...value, trimmed]);
    setQuery('');
    setOpen(false);
    setActiveIndex(-1);
  };

  const removeAt = (i) => {
    const next = value.slice();
    next.splice(i, 1);
    onChange?.(next);
  };

  // Filter out already-selected items so the dropdown never offers the
  // same row twice. Cheap to do in-render; `items` is typically small.
  const suggestions = items.filter((x) => !value.includes(x.name));

  const onKeyDown = (e) => {
    if (e.key === 'Backspace' && !query && value.length) {
      // Match the common chip-input behavior — Backspace on empty input
      // pops the last chip.
      e.preventDefault();
      removeAt(value.length - 1);
      return;
    }
    if (!open && e.key === 'ArrowDown' && suggestions.length) {
      setOpen(true);
      setActiveIndex(0);
      e.preventDefault();
      return;
    }
    if (!open) {
      if (e.key === 'Enter' && query.trim()) {
        e.preventDefault();
        addValue(query);
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(suggestions.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIndex >= 0 && suggestions[activeIndex]) {
        addValue(suggestions[activeIndex].name);
      } else if (query.trim()) {
        addValue(query);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
      setActiveIndex(-1);
    }
  };

  return (
    <div
      className={`nbh-picker ${disabled ? 'nbh-picker-disabled' : ''}`}
      dir="rtl"
    >
      {value.length > 0 && (
        <ul className="nbh-picker-chips" aria-label="שכונות שנבחרו">
          {value.map((name, i) => (
            <li key={`${name}-${i}`} className="nbh-picker-chip">
              <MapPin size={12} aria-hidden="true" />
              <span>{name}</span>
              <button
                type="button"
                className="nbh-picker-chip-x"
                onClick={() => removeAt(i)}
                aria-label={`הסר ${name}`}
              >
                <X size={12} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="nbh-picker-input-wrap">
        <input
          ref={inputRef}
          id={id}
          type="text"
          role="combobox"
          className="form-input nbh-picker-input"
          value={query}
          disabled={disabled}
          placeholder={effectivePlaceholder}
          onChange={(e) => {
            setQuery(e.target.value);
            // Open as soon as the user types — the list may still be
            // loading; it'll fill in once the hook resolves.
            if (!disabled) setOpen(true);
          }}
          onFocus={() => { if (!disabled && suggestions.length) setOpen(true); }}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={onKeyDown}
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listId}
          aria-label="שכונות"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
        />
        {loading && <span className="nbh-picker-loader" aria-hidden="true" />}
      </div>

      {open && !disabled && (suggestions.length > 0 || error) && (
        <ul
          id={listId}
          className="nbh-picker-list"
          role="listbox"
          aria-label="הצעות שכונות"
        >
          {error && (
            <li className="nbh-picker-err" role="alert">{error}</li>
          )}
          {suggestions.map((item, i) => (
            <li
              key={item.id || `${item.name}-${i}`}
              role="option"
              aria-selected={i === activeIndex}
              className={`nbh-picker-item ${i === activeIndex ? 'is-active' : ''}`}
              // onMouseDown instead of onClick — prevents the input's
              // onBlur from closing the list before the click resolves.
              onMouseDown={(e) => { e.preventDefault(); addValue(item.name); }}
              onMouseEnter={() => setActiveIndex(i)}
            >
              <MapPin size={12} aria-hidden="true" />
              <span>{item.name}</span>
              {item.aliases?.length > 0 && (
                <small className="nbh-picker-alias">
                  {item.aliases.slice(0, 2).join(' · ')}
                </small>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
