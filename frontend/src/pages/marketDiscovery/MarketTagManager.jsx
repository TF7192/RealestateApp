// 2026-06-02 — "ניהול תגיות" dialog for /market-discovery.
//
// Right-side drawer: list of the agent's MarketTag rows with inline
// rename / recolor / delete + a create form at the top. State is
// lifted to the caller (MarketDiscovery) so the popover + filter bar
// see updates immediately without their own fetches.

import { useEffect, useRef, useState } from 'react';
import { Plus, Trash2, X as XIcon, Check, Edit2 } from 'lucide-react';
import Portal from '../../components/Portal';

const PALETTE = [
  '#b48b4c', '#7a5c2c', '#8c6d4a',
  '#3f6b46', '#2c5985', '#8e2f3b',
  '#a04a90', '#5b4dab', '#404040',
];

export default function MarketTagManager({
  open,
  tags,
  onCreate,
  onUpdate,
  onDelete,
  onClose,
}) {
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(PALETTE[0]);
  const [creating, setCreating] = useState(false);
  const dialogRef = useRef(null);

  // Focus-trap-ish: focus the dialog body on open so ESC works without
  // tabbing first. Not a full trap — this is a side drawer overlaying
  // the page, not a modal, and the underlying page stays usable.
  useEffect(() => {
    if (!open) return undefined;
    dialogRef.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const submitCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    try {
      await onCreate?.({ name, color: newColor });
      setNewName('');
      setNewColor(PALETTE[0]);
    } finally {
      setCreating(false);
    }
  };

  return (
    <Portal>
    <div
      className="mt-manager-backdrop"
      role="presentation"
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
    >
      <aside
        className="mt-manager"
        role="dialog"
        aria-modal="true"
        aria-label="ניהול תגיות"
        tabIndex={-1}
        ref={dialogRef}
      >
        <header className="mt-manager-head">
          <h2>ניהול תגיות</h2>
          <button type="button" className="mt-manager-x" onClick={onClose} aria-label="סגור">
            <XIcon size={16} />
          </button>
        </header>

        <section className="mt-manager-create" aria-label="יצירת תגית חדשה">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="שם תגית חדשה…"
            maxLength={40}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submitCreate(); } }}
          />
          <div className="mt-manager-palette" role="radiogroup" aria-label="צבע תגית">
            {PALETTE.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={newColor === c}
                aria-label={`צבע ${c}`}
                className="mt-manager-swatch"
                onClick={() => setNewColor(c)}
                style={{
                  background: c,
                  outline: newColor === c ? `2px solid var(--text-primary)` : 'none',
                  outlineOffset: 1,
                }}
              />
            ))}
          </div>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={!newName.trim() || creating}
            onClick={submitCreate}
          >
            <Plus size={14} />
            הוסף תגית
          </button>
        </section>

        <ul className="mt-manager-list">
          {tags.length === 0 && (
            <li className="mt-manager-empty">אין עדיין תגיות. צור/י את הראשונה למעלה.</li>
          )}
          {tags.map((t) => (
            <ManagerRow
              key={t.id}
              tag={t}
              onUpdate={onUpdate}
              onDelete={onDelete}
            />
          ))}
        </ul>

        <footer className="mt-manager-foot">
          <span className="mt-manager-count">{tags.length}/50</span>
        </footer>
      </aside>
    </div>
    </Portal>
  );
}

function ManagerRow({ tag, onUpdate, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(tag.name);
  const [color, setColor] = useState(tag.color);
  const [saving, setSaving] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);

  // When the parent's tag list mutates (e.g. another tab) re-sync local
  // draft state. The rename/recolor flow always uses parent state as the
  // source of truth on save success.
  useEffect(() => { setName(tag.name); setColor(tag.color); }, [tag.name, tag.color]);

  const save = async () => {
    if (saving) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      await onUpdate?.(tag.id, { name: trimmed, color });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <li className="mt-manager-row editing">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={40}
          autoFocus
        />
        <div className="mt-manager-palette small" role="radiogroup" aria-label="צבע תגית">
          {PALETTE.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={color === c}
              aria-label={`צבע ${c}`}
              className="mt-manager-swatch sm"
              onClick={() => setColor(c)}
              style={{
                background: c,
                outline: color === c ? `2px solid var(--text-primary)` : 'none',
                outlineOffset: 1,
              }}
            />
          ))}
        </div>
        <div className="mt-manager-row-actions">
          <button type="button" className="btn btn-primary btn-sm" disabled={saving} onClick={save}>
            <Check size={14} /> שמור
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => { setEditing(false); setName(tag.name); setColor(tag.color); }}
          >
            ביטול
          </button>
        </div>
      </li>
    );
  }

  return (
    <li className="mt-manager-row">
      <span className="mt-manager-dot" style={{ background: tag.color }} aria-hidden />
      <span className="mt-manager-name">{tag.name}</span>
      {typeof tag.assignmentCount === 'number' && (
        <span className="mt-manager-count-small">{tag.assignmentCount} מודעות</span>
      )}
      <div className="mt-manager-row-actions">
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => setEditing(true)}
          aria-label="ערוך"
        >
          <Edit2 size={14} />
        </button>
        {confirmDel ? (
          <>
            <button
              type="button"
              className="btn btn-danger btn-sm"
              onClick={async () => { await onDelete?.(tag.id); }}
            >
              מחק לצמיתות
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setConfirmDel(false)}
            >
              ביטול
            </button>
          </>
        ) : (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setConfirmDel(true)}
            aria-label="מחק"
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>
    </li>
  );
}
