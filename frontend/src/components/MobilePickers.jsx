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
// DateQuickChips — "היום", "+6 חודשים" next to a date input.
//
// S18: supports backdating chips (-1d, -7d) too, because agents often record
// events retroactively: "we signed the contract yesterday / last week" is
// more common than "we signed today" by the time they sit down to update
// the CRM. Picking from a chip is two taps vs. ~seven taps through the
// native date picker.
// ────────────────────────────────────────────────────────────────
const CHIP_LABELS = {
  today: 'היום',
  '-1d':  'אתמול',
  '-7d':  'לפני שבוע',
  '+3m':  '+3 חודשים',
  '+6m':  '+6 חודשים',
  '+12m': '+שנה',
};

// 1.6 Exclusivity calculator — the relative chips (+3m, +6m, +12m) are
// computed from a baseDate, not from "today". For the exclusivity END
// input we pass baseDate = exclusiveStart so "+6 חודשים" actually means
// "6 months from the start", which is how Israeli brokerage agreements
// are written. Defaults to today when no baseDate is given so the
// existing callers (vacancyDate, signedAt, etc.) behave unchanged.
function chipToDate(chip, baseIso) {
  const base = (() => {
    if (typeof baseIso === 'string' && /^\d{4}-\d{2}-\d{2}/.test(baseIso)) {
      return new Date(`${baseIso.slice(0, 10)}T12:00:00`);
    }
    return new Date();
  })();
  const d = new Date(base.getTime());
  switch (chip) {
    case 'today': return new Date().toISOString().slice(0, 10);
    case '-1d':   d.setDate(d.getDate() - 1); break;
    case '-7d':   d.setDate(d.getDate() - 7); break;
    case '+3m':   d.setMonth(d.getMonth() + 3); break;
    case '+6m':   d.setMonth(d.getMonth() + 6); break;
    case '+12m':  d.setFullYear(d.getFullYear() + 1); break;
    default: break;
  }
  // Noon anchor avoids DST edge cases that could push the ISO date by
  // one day across certain boundaries (Israel observes DST).
  return d.toISOString().slice(0, 10);
}

export function DateQuickChips({ value, onChange, chips = ['today', '+6m'], baseDate }) {
  // Mark the chip that matches today's value so the agent can see what
  // they've picked at a glance. Comparing ISO yyyy-mm-dd strings is safe.
  const set = (chip) => onChange?.(chipToDate(chip, baseDate));
  // P-13 — guards against "clicking היום scrolls the page to the top".
  // Even with type="button", any ancestor form / anchor / delegated
  // handler that doesn't preventDefault can cause a scroll-restore jump.
  // Explicit preventDefault + stopPropagation kills those failure modes
  // and is harmless in the happy path.
  const onClick = (chip) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    set(chip);
  };
  return (
    <div className="mpk-datechips">
      {chips.map((chip) => {
        const label = CHIP_LABELS[chip];
        if (!label) return null;
        const isSel = value && value === chipToDate(chip, baseDate);
        return (
          <button
            key={chip}
            type="button"
            className={`mpk-datechip ${isSel ? 'sel' : ''}`}
            onClick={onClick(chip)}
          >
            {chip === 'today' && <Calendar size={12} />}
            {label}
          </button>
        );
      })}
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
  // L-1 / O-5 — optional async fetcher. When provided, the sheet search
  // queries the server (backed by the N-17 LRU+TTL cache on
  // /api/geo/search) instead of filtering the `options` list client-side.
  // Debounced 200ms so keystrokes don't thrash the backend.
  asyncFetch,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [remote, setRemote] = useState([]);
  const [remoteLoading, setRemoteLoading] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = prev; };
    }
    return undefined;
  }, [open]);

  // Debounced server lookup — on touch the sheet opens and drives
  // `query`; on desktop the user types into the inline input and
  // `value` is what changes. Either source kicks the fetch so L-1
  // autocomplete works in both surfaces.
  const probe = (open ? query : value) || '';
  useEffect(() => {
    if (!asyncFetch) return undefined;
    const q = probe.trim();
    if (!q) { setRemote([]); return undefined; }
    setRemoteLoading(true);
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const res = await asyncFetch(q);
        if (!cancelled) setRemote(Array.isArray(res) ? res : []);
      } catch { if (!cancelled) setRemote([]); }
      finally { if (!cancelled) setRemoteLoading(false); }
    }, 200);
    return () => { cancelled = true; clearTimeout(t); };
  }, [asyncFetch, probe]);

  const q = (query || value || '').trim();
  const localFiltered = q
    ? options.filter((o) => o.includes(q)).slice(0, maxVisible)
    : options.slice(0, maxVisible);
  const filtered = asyncFetch ? remote.slice(0, maxVisible) : localFiltered;

  return (
    <>
      <div className="mpk-suggest">
        <input
          ref={inputRef}
          className="form-input"
          value={value || ''}
          onChange={(e) => onChange?.(e.target.value)}
          onFocus={(e) => {
            // Touch: always open the sheet (keyboard gets out of the
            // way). Desktop: only open the sheet when we're server-
            // driven (asyncFetch), since that's where the dropdown
            // rendering lives. Static-options desktop keeps inline
            // editing.
            const isTouch = window.matchMedia('(pointer: coarse)').matches;
            if (isTouch || asyncFetch) {
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
          <div className="mpk-back" onClick={() => setOpen(false)} role="dialog" aria-modal="true">
            <div className="mpk-sheet" onClick={(e) => e.stopPropagation()}>
              <div className="mpk-handle" />
              <header className="mpk-head">
                <h3>{label || placeholder || 'בחר'}</h3>
                <button type="button" className="mpk-close" onClick={() => setOpen(false)} aria-label="סגור">
                  <X size={18} />
                </button>
              </header>
              <div className="mpk-search">
                <Search size={14} />
                <input
                  type="search"
                  inputMode="search"
                  enterKeyHint="search"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="חפש…"
                  autoFocus
                />
              </div>
              <div className="mpk-body">
                {q && !filtered.some((o) => o === q) && (
                  <button
                    type="button"
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
                {filtered.length === 0 && !remoteLoading && (
                  <div className="mpk-empty">לא נמצאו תוצאות.</div>
                )}
                {asyncFetch && remoteLoading && (
                  <div className="mpk-empty">טוען…</div>
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
          <button type="button" className="mpk-cancel" onClick={onClose}>ביטול</button>
        </div>
      </div>
    </Portal>
  );
}
