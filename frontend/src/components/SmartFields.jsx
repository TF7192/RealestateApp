import { useEffect, useRef, useState, forwardRef } from 'react';
import { Check, AlertCircle, ChevronDown } from 'lucide-react';
import './SmartFields.css';

// ──────────────────────────────────────────────────────────────────
// NumberField — comma-formatted numeric input.
//
// Keeps a raw integer as the canonical value; the visible string is the
// number formatted with thousands separators ("2,500,000"). Strips any
// non-digit characters on input. Best for prices, areas, sizes.
//
// On iOS, opens the numeric keyboard (inputMode="numeric"). On desktop the
// caret is preserved across formatting by recomputing position after the
// browser's default cursor placement (so typing in the middle works too).
//
// Props:
//   value        number | null
//   onChange(n)  fires with the new integer (or null if cleared)
//   unit         optional suffix like "₪", "מ״ר", "חד׳"
//   placeholder  string
//   min, max     soft clamp
//   showShort    when true, also show "≈ 2.5M" style hint below
// ──────────────────────────────────────────────────────────────────
export const NumberField = forwardRef(function NumberField(
  {
    value,
    onChange,
    unit,
    placeholder = '',
    min,
    max,
    showShort = false,
    invalid = false,
    autoFocus,
    inputClassName = '',
    'aria-label': ariaLabel,
    onBlur,
    onFocus,
    id,
    ...rest
  },
  ref
) {
  const inputRef = useRef(null);
  const setRef = (el) => {
    inputRef.current = el;
    if (typeof ref === 'function') ref(el);
    else if (ref) ref.current = el;
  };
  const displayed = value == null || value === ''
    ? ''
    : Number(value).toLocaleString('he-IL');

  const [focused, setFocused] = useState(false);

  const handleChange = (e) => {
    const el = e.target;
    const beforeStr = el.value;
    const beforeCaret = el.selectionStart ?? beforeStr.length;
    const digitsBeforeCaret = beforeStr.slice(0, beforeCaret).replace(/[^\d]/g, '').length;

    // 6.4 — Shorthand expansion: "1.5m" → 1500000, "850k" → 850000.
    // Triggered only on a trailing m/M/k/K because typing a digit in
    // the middle of an existing value shouldn't accidentally expand.
    const shorthand = (() => {
      const trimmed = beforeStr.trim();
      const m = trimmed.match(/^(\d+(?:[.,]\d+)?)\s*([mMkK])$/);
      if (!m) return null;
      const num = Number(m[1].replace(',', '.'));
      if (!Number.isFinite(num)) return null;
      return m[2].toLowerCase() === 'm'
        ? Math.round(num * 1_000_000)
        : Math.round(num * 1_000);
    })();
    if (shorthand != null) {
      let n = shorthand;
      if (typeof max === 'number' && n > max) n = max;
      if (typeof min === 'number' && n < min) n = min;
      onChange?.(n);
      return;
    }

    const raw = beforeStr.replace(/[^\d]/g, '');
    if (!raw) {
      onChange?.(null);
      return;
    }
    let n = parseInt(raw, 10);
    if (typeof max === 'number' && n > max) n = max;
    if (typeof min === 'number' && n < min) n = min;
    onChange?.(n);

    // Restore caret to the same digit position post-format
    requestAnimationFrame(() => {
      const node = inputRef.current;
      if (!node) return;
      const formatted = Number(n).toLocaleString('he-IL');
      let count = 0;
      let pos = 0;
      while (pos < formatted.length && count < digitsBeforeCaret) {
        if (/\d/.test(formatted[pos])) count += 1;
        pos += 1;
      }
      try { node.setSelectionRange(pos, pos); } catch { /* ignore */ }
    });
  };

  return (
    <div className={`sf-num ${focused ? 'sf-focused' : ''} ${invalid ? 'sf-invalid' : ''}`}>
      {unit && <span className="sf-num-unit" aria-hidden="true">{unit}</span>}
      <input
        id={id}
        ref={setRef}
        type="text"
        inputMode="numeric"
        pattern="[0-9,]*"
        autoComplete="off"
        dir="ltr"
        className={`sf-num-input ${inputClassName}`}
        value={displayed}
        placeholder={placeholder}
        autoFocus={autoFocus}
        aria-label={ariaLabel}
        onChange={handleChange}
        onFocus={(e) => { setFocused(true); onFocus?.(e); }}
        onBlur={(e) => { setFocused(false); onBlur?.(e); }}
        {...rest}
      />
      {showShort && value > 0 && (
        <span className="sf-num-hint">{shortenIL(Number(value))}</span>
      )}
    </div>
  );
});

function shortenIL(n) {
  if (n >= 1_000_000) {
    const v = (n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1);
    return `≈ ${v}M`;
  }
  if (n >= 1_000) {
    const v = (n / 1_000).toFixed(0);
    return `≈ ${v}K`;
  }
  return null;
}

// ──────────────────────────────────────────────────────────────────
// PhoneField — Israeli mobile-number input with auto-format + validation.
// Stores normalized "0XX-XXXXXXX". Tel keyboard on iOS.
// ──────────────────────────────────────────────────────────────────
export function PhoneField({
  value,
  onChange,
  placeholder = '050-1234567',
  inputClassName = '',
  invalid: invalidProp,
  ...rest
}) {
  const display = formatIL(value || '');
  const digits = (value || '').replace(/[^\d]/g, '');
  const valid = digits.length === 10 && /^0(5\d|7\d|2|3|4|8|9)/.test(digits);
  const showState = digits.length > 0;
  const invalid = invalidProp || (showState && !valid && digits.length >= 7);

  const handleChange = (e) => {
    const raw = e.target.value.replace(/[^\d]/g, '').slice(0, 10);
    onChange?.(formatIL(raw));
  };

  return (
    <div className={`sf-phone ${invalid ? 'sf-invalid' : ''} ${valid ? 'sf-valid' : ''}`}>
      <span className="sf-phone-flag" aria-hidden>🇮🇱</span>
      <input
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        dir="ltr"
        className={`sf-phone-input ${inputClassName}`}
        value={display}
        onChange={handleChange}
        placeholder={placeholder}
        {...rest}
      />
      {showState && (
        <span className="sf-phone-state" aria-hidden>
          {valid ? <Check size={14} /> : invalid ? <AlertCircle size={14} /> : null}
        </span>
      )}
    </div>
  );
}

function formatIL(input) {
  const d = String(input || '').replace(/[^\d]/g, '');
  if (!d) return '';
  if (d.length <= 3) return d;
  return `${d.slice(0, 3)}-${d.slice(3, 10)}`;
}

// ──────────────────────────────────────────────────────────────────
// SelectField — wraps a native <select> with prettier styling and a
// trailing chevron. Native means iOS gets its excellent wheel picker
// for free, and desktop gets the standard dropdown.
//
// Pass <option>s as children OR `options=[{value, label}]`.
// ──────────────────────────────────────────────────────────────────
export function SelectField({
  value,
  onChange,
  options,
  placeholder,
  children,
  className = '',
  invalid = false,
  ...rest
}) {
  return (
    <div className={`sf-select ${invalid ? 'sf-invalid' : ''} ${className}`}>
      <select
        value={value ?? ''}
        onChange={(e) => onChange?.(e.target.value)}
        {...rest}
      >
        {placeholder && (
          <option value="" disabled>{placeholder}</option>
        )}
        {options
          ? options.map((o) =>
              typeof o === 'string'
                ? <option key={o} value={o}>{o}</option>
                : <option key={o.value} value={o.value}>{o.label}</option>
            )
          : children}
      </select>
      <ChevronDown size={14} className="sf-select-chev" aria-hidden />
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// PriceRange — pair of NumberField inputs with a human-readable summary
// underneath: "₪1.5M – ₪2.2M". Saves space on mobile.
// ──────────────────────────────────────────────────────────────────
export function PriceRange({ minVal, maxVal, onChangeMin, onChangeMax, perMonth }) {
  const summary = (() => {
    if (!minVal && !maxVal) return null;
    const fmt = (n) => {
      if (!n) return '∞';
      if (n >= 1_000_000) return `₪${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
      if (n >= 1_000)     return `₪${Math.round(n / 1_000)}K`;
      return `₪${n.toLocaleString('he-IL')}`;
    };
    return `${minVal ? fmt(minVal) : '0'} — ${maxVal ? fmt(maxVal) : '∞'}${perMonth ? '/חודש' : ''}`;
  })();

  return (
    <div className="sf-range">
      <div className="sf-range-pair">
        <div className="sf-range-cell">
          <span className="sf-range-cap">מ</span>
          <NumberField value={minVal} onChange={onChangeMin} unit="₪" placeholder="0" />
        </div>
        <div className="sf-range-cell">
          <span className="sf-range-cap">עד</span>
          <NumberField value={maxVal} onChange={onChangeMax} unit="₪" placeholder="ללא הגבלה" />
        </div>
      </div>
      {summary && <div className="sf-range-summary">{summary}</div>}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// SegmentedControl — touch-friendly segmented buttons. Mobile-first
// alternative to a select for short option lists (BUY/RENT, status).
// ──────────────────────────────────────────────────────────────────
export function Segmented({ value, onChange, options, ariaLabel }) {
  return (
    <div className="sf-seg" role="radiogroup" aria-label={ariaLabel}>
      {options.map((o) => {
        const v = typeof o === 'string' ? o : o.value;
        const l = typeof o === 'string' ? o : o.label;
        return (
          <button
            type="button"
            key={v}
            role="radio"
            aria-checked={value === v}
            className={`sf-seg-opt ${value === v ? 'sel' : ''}`}
            onClick={() => onChange?.(v)}
          >
            {l}
          </button>
        );
      })}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// useDebouncedNumber — small helper for filter inputs that should
// throttle requests as the user types.
// ──────────────────────────────────────────────────────────────────
export function useDebouncedNumber(initial, delay = 350) {
  const [val, setVal] = useState(initial);
  const [debounced, setDebounced] = useState(initial);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(val), delay);
    return () => clearTimeout(t);
  }, [val, delay]);
  return [val, debounced, setVal];
}
