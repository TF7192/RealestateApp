// 2026-06-02 — Inline city/area selector at the top of /market-discovery.
//
// Replaces the dedicated "ערים שמעניינות אותי" card previously buried in
// /profile. The picker is the source of truth for `specialtyCities`:
//   - Default value is loaded from GET /me/specialty-cities
//   - Tweaks immediately persist via PATCH /me/specialty-cities so a
//     subsequent visit (or another tab) sees the same scoping.
//
// The picker is multi-select chip-based. There's no separate "area"
// concept on the backend (specialtyCities is a flat string[]); the
// task asks for cities AND areas, but the existing data only models
// cities. We surface neighborhoods as a free-text filter via the
// existing FilterRail, so this bar stays strictly city-scoped.

import { useEffect, useMemo, useRef, useState } from 'react';
import { MapPin, X as XIcon, Plus, Search } from 'lucide-react';
import api from './../../lib/api';

const MAX_CITIES = 20;

export default function CityFilterBar({ value, onChange }) {
  const [allCities, setAllCities] = useState([]);
  const [query, setQuery] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const inputRef = useRef(null);
  const wrapRef = useRef(null);

  // Load the dictionary once. Same source as Profile/Onboarding so the
  // canonical names line up with MarketListing.city.
  useEffect(() => {
    let cancelled = false;
    api.cities()
      .then((res) => {
        if (cancelled) return;
        const names = (res?.cities || [])
          .map((c) => c?.name)
          .filter(Boolean)
          .sort((a, b) => a.localeCompare(b, 'he'));
        setAllCities(names);
      })
      .catch(() => { /* freeform fallback */ });
    return () => { cancelled = true; };
  }, []);

  // Click-outside closes the suggestions popover. Doesn't blur the chip
  // strip itself — only the floating list.
  useEffect(() => {
    if (!pickerOpen) return undefined;
    const onDown = (e) => {
      if (!wrapRef.current?.contains(e.target)) setPickerOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [pickerOpen]);

  const selected = useMemo(() => new Set(value || []), [value]);

  const filteredOptions = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('he');
    let pool = allCities.filter((c) => !selected.has(c));
    if (q) pool = pool.filter((c) => c.toLocaleLowerCase('he').includes(q));
    return pool.slice(0, 12);
  }, [allCities, selected, query]);

  const addCity = (name) => {
    const v = (name || '').trim();
    if (!v) return;
    if (selected.has(v)) return;
    if ((value || []).length >= MAX_CITIES) return;
    onChange?.([...(value || []), v]);
    setQuery('');
    inputRef.current?.focus();
  };

  const removeCity = (name) => {
    onChange?.((value || []).filter((c) => c !== name));
  };

  const clearAll = () => onChange?.([]);

  return (
    <div className="md-city-bar" ref={wrapRef}>
      <div className="md-city-bar-head">
        <MapPin size={14} aria-hidden />
        <span className="md-city-bar-label">ערים שבהן אני עובד/ת</span>
        {(value?.length || 0) === 0 ? (
          <span className="md-city-bar-hint">
            (ריק = כל הארץ)
          </span>
        ) : (
          <button
            type="button"
            className="md-city-bar-clear"
            onClick={clearAll}
            aria-label="נקה את כל הערים"
          >
            נקה הכל
          </button>
        )}
      </div>

      <div className="md-city-bar-row">
        {(value || []).map((name) => (
          <span key={name} className="md-city-chip">
            <MapPin size={11} aria-hidden />
            {name}
            <button
              type="button"
              className="md-city-chip-x"
              onClick={() => removeCity(name)}
              aria-label={`הסר ${name}`}
            >
              <XIcon size={12} />
            </button>
          </span>
        ))}

        <div className="md-city-bar-input-wrap">
          <Search size={12} aria-hidden className="md-city-bar-search-icon" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setPickerOpen(true); }}
            onFocus={() => setPickerOpen(true)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                if (filteredOptions[0]) addCity(filteredOptions[0]);
                else if (query.trim()) addCity(query.trim());
              } else if (e.key === 'Backspace' && !query && (value?.length || 0) > 0) {
                // Quick-remove last chip when the input is empty
                removeCity(value[value.length - 1]);
              }
            }}
            placeholder="הוסף עיר…"
            disabled={(value?.length || 0) >= MAX_CITIES}
            aria-label="הוסף עיר לפילטר"
            className="md-city-bar-input"
          />
        </div>
      </div>

      {pickerOpen && (filteredOptions.length > 0 || query.trim()) && (
        <div className="md-city-bar-pop" role="listbox">
          {filteredOptions.map((c) => (
            <button
              key={c}
              type="button"
              role="option"
              aria-selected={false}
              className="md-city-bar-pop-row"
              onClick={() => { addCity(c); setPickerOpen(false); }}
            >
              <MapPin size={12} aria-hidden /> {c}
            </button>
          ))}
          {query.trim() && !filteredOptions.includes(query.trim()) && !selected.has(query.trim()) && (
            <button
              type="button"
              className="md-city-bar-pop-row create"
              onClick={() => { addCity(query.trim()); setPickerOpen(false); }}
            >
              <Plus size={12} aria-hidden /> הוסף &quot;{query.trim()}&quot;
            </button>
          )}
        </div>
      )}
    </div>
  );
}
