// MultiChipsInput — comma/Enter-separated multi-value input with optional
// typeahead from a fixed `options` list. Used by the lead form for
// cities, neighborhoods, and property types where the agent commonly
// wants to capture more than one value at intake time.
//
// Behaviour:
//   • Type → suggestions filtered from `options` (case- and Hebrew-aware).
//   • Enter / comma / Tab → commits the current text as a chip.
//   • Click a suggestion → commits it as a chip.
//   • Backspace on empty input → removes the last chip.
//   • Click the × on a chip → removes that chip.
//   • Duplicates are dropped silently.
import { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';

const PALETTE = {
  ink:    '#1e1a14',
  muted:  '#6b6356',
  border: 'rgba(30,26,20,0.14)',
  cream:  '#fbf7f0',
  gold:   '#b48b4c',
  goldSoft: 'rgba(180,139,76,0.10)',
};

export default function MultiChipsInput({
  values = [],
  onChange,
  options,
  placeholder,
  ariaLabel,
  maxSuggestions = 8,
  disabled = false,
  // Allow free-form values (not in `options`)? Defaults true so the
  // user can add custom names that aren't on file. Set false to
  // restrict to the dropdown.
  freeForm = true,
}) {
  const [input, setInput] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const wrapperRef = useRef(null);
  const inputRef = useRef(null);

  // Close suggestions on outside click.
  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const lower = input.trim().toLowerCase();
  const suggestions = useMemo(() => {
    if (!Array.isArray(options) || options.length === 0) return [];
    const taken = new Set(values || []);
    const matches = options
      .filter((o) => !taken.has(o))
      .filter((o) => (lower ? String(o).toLowerCase().includes(lower) : true));
    return matches.slice(0, maxSuggestions);
  }, [options, values, lower, maxSuggestions]);

  const commit = (raw) => {
    const cleaned = String(raw || '').trim();
    if (!cleaned) return;
    if ((values || []).includes(cleaned)) {
      setInput('');
      return;
    }
    if (!freeForm && Array.isArray(options) && !options.includes(cleaned)) {
      // Strict mode — only allow values from the option list.
      return;
    }
    onChange?.([...(values || []), cleaned]);
    setInput('');
    setActiveIdx(-1);
    setOpen(false);
  };

  const removeAt = (i) => {
    const next = (values || []).slice();
    next.splice(i, 1);
    onChange?.(next);
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === 'Tab' || e.key === ',') {
      if (activeIdx >= 0 && suggestions[activeIdx]) {
        e.preventDefault();
        commit(suggestions[activeIdx]);
        return;
      }
      if (input.trim()) {
        e.preventDefault();
        commit(input);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => Math.min(suggestions.length - 1, i + 1));
      setOpen(true);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => Math.max(0, i - 1));
    } else if (e.key === 'Escape') {
      setOpen(false);
      setActiveIdx(-1);
    } else if (e.key === 'Backspace' && input === '' && (values || []).length > 0) {
      e.preventDefault();
      removeAt(values.length - 1);
    }
  };

  return (
    <div ref={wrapperRef} style={{ position: 'relative' }}>
      <div
        role="group"
        aria-label={ariaLabel}
        dir="rtl"
        onClick={() => inputRef.current?.focus()}
        style={{
          display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6,
          padding: '6px 10px', minHeight: 46,
          borderRadius: 10,
          border: `1px solid ${PALETTE.border}`,
          background: disabled ? PALETTE.cream : '#fff',
          cursor: disabled ? 'not-allowed' : 'text',
          boxSizing: 'border-box',
          direction: 'rtl',
        }}
      >
        {(values || []).map((v, i) => (
          <span
            key={`${v}-${i}`}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              background: PALETTE.goldSoft, color: PALETTE.ink,
              padding: '2px 10px 2px 6px', borderRadius: 999,
              fontSize: 13, fontWeight: 700, lineHeight: 1.4,
              border: `1px solid ${PALETTE.border}`,
              maxHeight: 28,
            }}
          >
            <button
              type="button"
              aria-label={`הסר ${v}`}
              onClick={(e) => { e.stopPropagation(); removeAt(i); }}
              style={{
                width: 18, height: 18, display: 'inline-flex', alignItems: 'center',
                justifyContent: 'center', borderRadius: '50%', border: 'none',
                background: 'transparent', cursor: 'pointer', color: PALETTE.muted,
              }}
            >
              <X size={11} />
            </button>
            {v}
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          dir="rtl"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          enterKeyHint="enter"
          disabled={disabled}
          value={input}
          onChange={(e) => { setInput(e.target.value); setOpen(true); setActiveIdx(-1); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={(values || []).length === 0 ? placeholder : ''}
          aria-autocomplete="list"
          style={{
            flex: 1, minWidth: 120, border: 'none', outline: 'none',
            padding: '4px 2px', fontSize: 14, background: 'transparent',
            color: PALETTE.ink,
            direction: 'rtl', textAlign: 'right',
          }}
        />
      </div>
      {open && suggestions.length > 0 && (
        <ul
          role="listbox"
          style={{
            position: 'absolute', insetInlineStart: 0, insetInlineEnd: 0, top: '100%',
            margin: 0, padding: 4, listStyle: 'none', zIndex: 10,
            background: '#fff',
            border: `1px solid ${PALETTE.border}`,
            borderRadius: 10,
            boxShadow: '0 8px 24px rgba(30,26,20,0.10)',
            maxHeight: 240, overflowY: 'auto',
          }}
        >
          {suggestions.map((s, i) => (
            <li
              key={s}
              role="option"
              aria-selected={activeIdx === i}
              onMouseDown={(e) => { e.preventDefault(); commit(s); }}
              onMouseEnter={() => setActiveIdx(i)}
              style={{
                padding: '8px 10px', cursor: 'pointer', borderRadius: 8,
                fontSize: 13, color: PALETTE.ink,
                background: activeIdx === i ? PALETTE.goldSoft : 'transparent',
              }}
            >
              {s}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
