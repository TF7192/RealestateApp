import { useRef, useState } from 'react';
import { MapPin, Check, X } from 'lucide-react';
import './AddressField.css';

export default function CityField({
  value = '',
  onChange,
  options = [],
  invalid = false,
  autoFocus = false,
  id,
  placeholder = 'התחל/י להקליד שם עיר…',
  inputProps = {},
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef(null);

  const q = (value || '').trim();
  const filtered = q
    ? options.filter((o) => o.includes(q)).slice(0, 20)
    : options.slice(0, 20);
  const exactMatch = q && options.includes(q);

  const handleChange = (next) => {
    onChange?.(next);
    setOpen(true);
    setActiveIndex(-1);
  };

  const pick = (name) => {
    onChange?.(name);
    setOpen(false);
    setActiveIndex(-1);
  };

  const handleKey = (e) => {
    if (!open || !filtered.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(filtered.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      if (activeIndex >= 0 && filtered[activeIndex]) {
        e.preventDefault();
        pick(filtered[activeIndex]);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
      setActiveIndex(-1);
    }
  };

  const clear = () => {
    onChange?.('');
    setOpen(false);
    setActiveIndex(-1);
    inputRef.current?.focus();
  };

  return (
    <div className={`addr-field ${invalid ? 'addr-invalid' : ''} ${exactMatch ? 'addr-picked' : ''}`}>
      <span className="addr-field-icon" aria-hidden="true">
        {exactMatch ? <Check size={14} /> : <MapPin size={14} />}
      </span>
      <input
        ref={inputRef}
        id={id}
        type="text"
        className="addr-field-input form-input"
        value={value || ''}
        onChange={(e) => handleChange(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={handleKey}
        placeholder={placeholder}
        autoComplete="address-level2"
        inputMode="search"
        enterKeyHint="search"
        autoCorrect="off"
        autoCapitalize="words"
        spellCheck={false}
        autoFocus={autoFocus}
        aria-label="עיר"
        aria-autocomplete="list"
        aria-expanded={open}
        {...inputProps}
      />
      {value && (
        <button
          type="button"
          className="addr-field-clear"
          onClick={clear}
          aria-label="נקה עיר"
          tabIndex={-1}
        >
          <X size={13} />
        </button>
      )}
      {open && filtered.length > 0 && (
        <ul className="addr-field-list" role="listbox">
          {filtered.map((name, i) => (
            <li
              key={name}
              role="option"
              aria-selected={i === activeIndex}
              className={`addr-field-item ${i === activeIndex ? 'is-active' : ''}`}
              onMouseDown={(e) => { e.preventDefault(); pick(name); }}
              onMouseEnter={() => setActiveIndex(i)}
            >
              <span className="addr-field-item-icon" aria-hidden="true">
                <MapPin size={12} />
              </span>
              <span className="addr-field-item-text">
                <strong>{name}</strong>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
