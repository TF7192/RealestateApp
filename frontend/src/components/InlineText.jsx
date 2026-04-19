import { useEffect, useRef, useState } from 'react';
import './InlineText.css';

/**
 * Click-to-edit text. Enter commits, Esc cancels. Optimistic UI is the
 * caller's responsibility — just implement `onCommit(newValue)` to resolve a
 * Promise. The component never locks on failure.
 */
export default function InlineText({
  value,
  onCommit,
  placeholder = '—',
  multiline = false,
  type = 'text',
  className = '',
  display,
  suffix,
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');
  const ref = useRef(null);

  useEffect(() => {
    if (editing) {
      setTimeout(() => {
        ref.current?.focus();
        if (ref.current?.select) ref.current.select();
      }, 10);
    }
  }, [editing]);

  useEffect(() => {
    if (!editing) setDraft(value ?? '');
  }, [value, editing]);

  const commit = async () => {
    if (String(draft ?? '') === String(value ?? '')) {
      setEditing(false);
      return;
    }
    try {
      await onCommit(draft);
    } catch {
      // Revert to original value on failure
      setDraft(value ?? '');
    } finally {
      setEditing(false);
    }
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !multiline) { e.preventDefault(); commit(); }
    if (e.key === 'Enter' && multiline && (e.metaKey || e.ctrlKey)) { e.preventDefault(); commit(); }
    if (e.key === 'Escape') { e.preventDefault(); setDraft(value ?? ''); setEditing(false); }
  };

  // S17: blur no longer silently commits. If the user taps outside the
  // field accidentally, their in-flight edit is REVERTED — an accidental
  // blur can't corrupt the underlying value. To actually save, press
  // Enter (single-line) or Cmd/Ctrl+Enter (multiline). Esc still cancels.
  const revertOnBlur = () => {
    setDraft(value ?? '');
    setEditing(false);
  };

  // For numeric fields the caller passes type="number". Keep iOS-friendly:
  // emit type="text" + inputMode="numeric" instead so the page doesn't
  // auto-zoom and the spinner doesn't fight the comma-formatting.
  const isNumeric = type === 'number';
  const inputType = isNumeric ? 'text' : type;
  const inputMode = isNumeric ? 'numeric' : (type === 'tel' ? 'tel' : type === 'email' ? 'email' : 'text');
  const enterKeyHint = multiline ? 'enter' : 'done';
  const dirAttr = type === 'email' || type === 'tel' || isNumeric ? 'ltr' : 'auto';

  if (editing) {
    return multiline ? (
      <textarea
        ref={ref}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={revertOnBlur}
        onKeyDown={onKeyDown}
        className={`inline-text-input ${className}`}
        rows={3}
        dir={dirAttr}
        autoCapitalize="sentences"
        enterKeyHint={enterKeyHint}
      />
    ) : (
      <input
        ref={ref}
        type={inputType}
        inputMode={inputMode}
        pattern={isNumeric ? '[0-9]*' : undefined}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={revertOnBlur}
        onKeyDown={onKeyDown}
        className={`inline-text-input ${className}`}
        dir={dirAttr}
        enterKeyHint={enterKeyHint}
        autoCapitalize={type === 'email' ? 'off' : 'sentences'}
        autoCorrect={type === 'email' ? 'off' : undefined}
        spellCheck={type === 'email' ? false : undefined}
      />
    );
  }

  const shown = display != null ? display : (value || placeholder);
  return (
    <span
      className={`inline-text ${className} ${!value ? 'is-empty' : ''}`}
      onClick={() => setEditing(true)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') setEditing(true); }}
      title="לחץ לעריכה"
    >
      {shown}
      {suffix}
    </span>
  );
}
