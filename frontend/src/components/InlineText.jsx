import { useEffect, useRef, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import './InlineText.css';

/**
 * Click-to-edit text. Enter commits, Esc cancels. Optimistic UI is the
 * caller's responsibility — just implement `onCommit(newValue)` to resolve a
 * Promise. The component never locks on failure.
 *
 * F-6 — shows a spinner while onCommit is in-flight and a checkmark flash
 *       for 600ms on success so the agent has honest feedback.
 * F-12 — `dir` prop lets callers force RTL/LTR/auto; defaults to auto for
 *       prose fields, ltr for numeric/email/tel.
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
  dir: dirProp,
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
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
    setSaving(true);
    setEditing(false);
    try {
      await onCommit(draft);
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 600);
    } catch {
      setDraft(value ?? '');
    } finally {
      setSaving(false);
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
  // F-12 — honor `dir` prop if given; otherwise auto for prose, ltr for
  // numeric/email/tel. Prose fields (notes, city) that mix Hebrew and
  // English stay correctly aligned.
  const dirAttr = dirProp ?? (type === 'email' || type === 'tel' || isNumeric ? 'ltr' : 'auto');

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
      className={`inline-text ${className} ${!value ? 'is-empty' : ''} ${saving ? 'is-saving' : ''} ${justSaved ? 'is-saved' : ''}`}
      onClick={() => setEditing(true)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') setEditing(true); }}
      title="לחץ לעריכה"
      dir={dirAttr}
    >
      {shown}
      {suffix}
      {/* F-6 — honest visual feedback: spinner while committing, flash
          checkmark for 600ms after success. No more "optimistic silence". */}
      {saving && <Loader2 size={11} className="inline-text-saving" aria-hidden="true" />}
      {justSaved && !saving && <Check size={11} className="inline-text-saved" aria-hidden="true" />}
    </span>
  );
}
