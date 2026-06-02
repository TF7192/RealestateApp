// 2026-06-02 — Per-row tag picker popover for /market-discovery.
//
// Opens off an inline chip cluster on each ListingRow. Lets the agent
// add/remove tags on a single advert, with autocomplete over the
// agent's existing tag list and an inline "צור תגית חדשה" affordance.
//
// Owns NO global state of its own — the caller passes the full tag
// catalogue + the currently-assigned tag id set + onChange callbacks
// that hit the network. That keeps the popover dumb and lets the
// parent (MarketDiscovery) reconcile optimistic updates centrally.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, X as XIcon, Check } from 'lucide-react';

// Curated palette. Agents can also pick their own hex from the manager
// dialog; this set is just the "happy path" so a quick-create from the
// popover doesn't need a color picker.
const PALETTE = [
  '#b48b4c', '#7a5c2c', '#8c6d4a',
  '#3f6b46', '#2c5985', '#8e2f3b',
  '#a04a90', '#5b4dab', '#404040',
];

export default function MarketTagPicker({
  tags,
  assignedTagIds,
  onAttach,
  onDetach,
  onCreateAndAttach,
  onClose,
  anchorRef,
}) {
  const popRef = useRef(null);
  const inputRef = useRef(null);
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [draftColor, setDraftColor] = useState(PALETTE[0]);

  const assigned = useMemo(() => new Set(assignedTagIds || []), [assignedTagIds]);

  // Filter tags by query (case-insensitive substring on Hebrew works
  // — toLocaleLowerCase keeps i18n-correct collation though Hebrew has
  // no case distinction in practice).
  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('he');
    if (!q) return tags;
    return tags.filter((t) => t.name.toLocaleLowerCase('he').includes(q));
  }, [tags, query]);

  const exactExists = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('he');
    return q ? tags.some((t) => t.name.toLocaleLowerCase('he') === q) : false;
  }, [tags, query]);

  // Auto-focus the search input on open. Anchor positioning is handled
  // by the caller — we render at top-100%-of-anchor via the parent's
  // wrapping div (relative + this popover absolute).
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Click-outside to close. The anchor is excluded so clicking the
  // chip-cluster again doesn't immediately reopen.
  useEffect(() => {
    const onDown = (e) => {
      if (popRef.current?.contains(e.target)) return;
      if (anchorRef?.current?.contains(e.target)) return;
      onClose?.();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [anchorRef, onClose]);

  const togglePick = (tag) => {
    if (assigned.has(tag.id)) onDetach?.(tag);
    else onAttach?.(tag);
  };

  const submitCreate = async () => {
    const name = query.trim();
    if (!name) return;
    setCreating(true);
    try {
      await onCreateAndAttach?.({ name, color: draftColor });
      setQuery('');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div
      ref={popRef}
      role="dialog"
      aria-label="עריכת תגיות"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => { if (e.key === 'Escape') onClose?.(); }}
      className="mt-picker"
    >
      <div className="mt-picker-search">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="חפש או צור תגית…"
          aria-label="חיפוש תגית"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              if (filtered.length > 0 && !exactExists) {
                togglePick(filtered[0]);
              } else if (!exactExists && query.trim()) {
                submitCreate();
              }
            }
          }}
        />
      </div>

      <div className="mt-picker-list" role="listbox">
        {filtered.length === 0 && !query.trim() && (
          <div className="mt-picker-empty">אין תגיות עדיין — הקלד/י כדי ליצור אחת.</div>
        )}
        {filtered.map((t) => {
          const on = assigned.has(t.id);
          return (
            <button
              key={t.id}
              type="button"
              role="option"
              aria-selected={on}
              className="mt-picker-row"
              onClick={() => togglePick(t)}
            >
              <span className="mt-picker-dot" style={{ background: t.color }} aria-hidden />
              <span className="mt-picker-name">{t.name}</span>
              {on && <Check size={14} className="mt-picker-check" />}
            </button>
          );
        })}
      </div>

      {query.trim() && !exactExists && (
        <div className="mt-picker-create">
          <button
            type="button"
            className="mt-picker-create-btn"
            disabled={creating}
            onClick={submitCreate}
          >
            <Plus size={14} />
            צור תגית חדשה: <strong>{query.trim()}</strong>
          </button>
          <div className="mt-picker-palette" role="radiogroup" aria-label="צבע תגית">
            {PALETTE.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={draftColor === c}
                aria-label={`צבע ${c}`}
                className="mt-picker-swatch"
                onClick={() => setDraftColor(c)}
                style={{
                  background: c,
                  outline: draftColor === c ? `2px solid var(--text-primary)` : 'none',
                  outlineOffset: 1,
                }}
              />
            ))}
          </div>
        </div>
      )}

      <div className="mt-picker-foot">
        <button type="button" className="mt-picker-close" onClick={onClose}>
          <XIcon size={12} /> סגור
        </button>
      </div>
    </div>
  );
}
