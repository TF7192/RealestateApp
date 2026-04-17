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

  if (editing) {
    return multiline ? (
      <textarea
        ref={ref}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={onKeyDown}
        className={`inline-text-input ${className}`}
        rows={3}
      />
    ) : (
      <input
        ref={ref}
        type={type}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={onKeyDown}
        className={`inline-text-input ${className}`}
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
