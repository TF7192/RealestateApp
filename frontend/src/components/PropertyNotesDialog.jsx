import { useEffect, useRef, useState } from 'react';
import { X, Save, StickyNote, Loader2 } from 'lucide-react';
import api from '../lib/api';
import { useToast } from '../lib/toast';
import './PropertyNotesDialog.css';

// Floating notes editor for a property card. Opens over the list with
// a dimmed backdrop and nothing else — just a big textarea + save/
// cancel. Deliberately lighter than `QuickEditDrawer`, which exposes
// price/status/etc.; this one is a single-field focus mode so the
// agent can drop a line of context without scrolling past irrelevant
// fields.
//
// Props:
//   property  — the property being edited (read-only snapshot).
//   onClose() — fires on backdrop click, close button, Escape key,
//               and after a successful save.
//   onSaved(next) — optional, fires with the patched property so the
//               list can merge the update without a full refetch.

export default function PropertyNotesDialog({ property, onClose, onSaved }) {
  const toast = useToast();
  const [value, setValue] = useState(property?.notes || '');
  const [saving, setSaving] = useState(false);
  const textareaRef = useRef(null);

  // Autofocus the textarea on open. Use a tick so the modal's fade-in
  // animation doesn't fight the caret placement.
  useEffect(() => {
    const t = setTimeout(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      // Place the caret at the end of the existing notes so the agent
      // can keep typing rather than overwrite their prior note.
      const len = el.value.length;
      try { el.setSelectionRange(len, len); } catch { /* ignore */ }
    }, 40);
    return () => clearTimeout(t);
  }, []);

  // Escape closes. Cmd/Ctrl+Enter saves — matches the pattern agents
  // expect from macOS apps and most WYSIWYGs.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose?.(); }
      if ((e.key === 'Enter') && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        save();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, saving]);

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const next = await api.updateProperty(property.id, { notes: value });
      toast?.success?.('ההערות נשמרו');
      onSaved?.(next?.property || { ...property, notes: value });
      onClose?.();
    } catch (e) {
      toast?.error?.(e?.message || 'שמירת ההערות נכשלה');
    } finally {
      setSaving(false);
    }
  };

  const dirty = (value || '') !== (property?.notes || '');

  return (
    <div
      className="pnd-backdrop"
      role="presentation"
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
    >
      <div
        className="pnd-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pnd-title"
      >
        <header className="pnd-head">
          <div className="pnd-title-wrap">
            <StickyNote size={16} aria-hidden="true" />
            <h3 id="pnd-title">{property?.notes ? 'עריכת הערות' : 'הוספת הערות'}</h3>
          </div>
          <button
            type="button"
            className="pnd-close"
            onClick={onClose}
            aria-label="סגור"
          >
            <X size={18} />
          </button>
        </header>

        <p className="pnd-sub">
          {[property?.street, property?.city].filter(Boolean).join(', ') || 'נכס'}
        </p>

        <textarea
          ref={textareaRef}
          className="pnd-textarea"
          dir="rtl"
          lang="he"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="הוסף כאן הערות פנימיות, דברים חשובים לזכור, פרטים שלא מופיעים בכרטיס הנכס…"
          rows={10}
        />

        <footer className="pnd-actions">
          <span className="pnd-hint">Cmd/Ctrl + Enter לשמירה מהירה</span>
          <div className="pnd-buttons">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={onClose}
              disabled={saving}
            >
              ביטול
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={save}
              disabled={saving || !dirty}
            >
              {saving
                ? <><Loader2 size={14} className="pnd-spin" aria-hidden="true" /> שומר…</>
                : <><Save size={14} aria-hidden="true" /> שמור</>}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
