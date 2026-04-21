import { useEffect, useState } from 'react';
import { Tag, Plus, Trash2, Pencil, Check, X as XIcon } from 'lucide-react';
import api from '../lib/api';
import { useToast, optimisticUpdate } from '../lib/toast';
import { displayText } from '../lib/display';
import EmptyState from '../components/EmptyState';
import ConfirmDialog from '../components/ConfirmDialog';
import './TagSettings.css';

// A2 — Tag library CRUD.
//
// Lists every tag in the owner-scope, inline create-new form, and
// edit-in-place rows with a confirm-dialog on delete so an accidental
// click doesn't nuke an entity-wide label.

const SCOPE_OPTIONS = [
  { value: 'ALL',      label: 'הכל' },
  { value: 'PROPERTY', label: 'נכס' },
  { value: 'LEAD',     label: 'ליד' },
  { value: 'CUSTOMER', label: 'לקוח' },
];

const DEFAULT_COLOR = '#c9a14a';

const EMPTY_FORM = { name: '', color: DEFAULT_COLOR, scope: 'ALL' };

export default function TagSettings() {
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(null); // {id, name, color, scope}
  const [pendingDelete, setPendingDelete] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.listTags();
      setItems(res?.items || []);
    } catch {
      toast.error('שגיאה בטעינת התגיות');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const updateForm = (key, value) => setForm((p) => ({ ...p, [key]: value }));

  const handleCreate = async (e) => {
    e?.preventDefault?.();
    const name = form.name.trim();
    if (!name) return;
    setSaving(true);
    try {
      await api.createTag({ name, color: form.color || null, scope: form.scope });
      toast.success('התגית נוספה');
      setForm(EMPTY_FORM);
      await load();
    } catch {
      toast.error('יצירת התגית נכשלה');
    } finally {
      setSaving(false);
    }
  };

  const handleStartEdit = (tag) => {
    setEditing({
      id: tag.id,
      name: tag.name,
      color: tag.color || DEFAULT_COLOR,
      scope: tag.scope || 'ALL',
    });
  };

  const handleCancelEdit = () => setEditing(null);

  const handleSaveEdit = async () => {
    if (!editing?.id) return;
    try {
      await optimisticUpdate(toast, {
        label: 'שומר…',
        success: 'התגית עודכנה',
        onSave: () => api.updateTag(editing.id, {
          name: editing.name.trim(),
          color: editing.color || null,
          scope: editing.scope,
        }),
      });
      setEditing(null);
      await load();
    } catch { /* toast handled */ }
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    const id = pendingDelete.id;
    setPendingDelete(null);
    try {
      await optimisticUpdate(toast, {
        label: 'מוחק…',
        success: 'התגית נמחקה',
        onSave: () => api.deleteTag(id),
      });
      await load();
    } catch { /* toast handled */ }
  };

  return (
    <div className="tags-page" dir="rtl">
      <header className="tags-header">
        <div className="tags-title">
          <Tag size={22} aria-hidden="true" />
          <h1>תגיות</h1>
        </div>
        <p className="tags-subtitle">
          ניהול ספריית התגיות לשיוך נכסים, לקוחות ולידים.
        </p>
      </header>

      <section className="tags-card" aria-label="תגית חדשה">
        <form className="tags-form" onSubmit={handleCreate}>
          <label className="tags-field tags-field-grow">
            <span>שם התגית</span>
            <input
              type="text"
              value={form.name}
              onChange={(e) => updateForm('name', e.target.value)}
              placeholder="למשל: VIP"
              aria-label="שם התגית"
              required
            />
          </label>
          <label className="tags-field">
            <span>צבע</span>
            <input
              type="color"
              value={form.color}
              onChange={(e) => updateForm('color', e.target.value)}
              aria-label="צבע התגית"
              className="tags-color"
            />
          </label>
          <label className="tags-field">
            <span>תחום</span>
            <select
              value={form.scope}
              onChange={(e) => updateForm('scope', e.target.value)}
              aria-label="תחום תגית"
            >
              {SCOPE_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={saving || !form.name.trim()}
          >
            <Plus size={16} aria-hidden="true" />
            <span>{saving ? 'שומר…' : 'הוסף תגית'}</span>
          </button>
        </form>
      </section>

      <section
        className="tags-list"
        aria-label="רשימת תגיות"
        aria-busy={loading ? 'true' : 'false'}
      >
        {loading && items.length === 0 ? (
          <div className="tags-skel" aria-hidden />
        ) : items.length === 0 ? (
          <EmptyState
            icon={<Tag size={40} />}
            title="עדיין אין תגיות"
            description="הוסף/י תגית ראשונה בטופס שלמעלה כדי לסווג נכסים ולקוחות."
          />
        ) : (
          <ul className="tags-rows">
            {items.map((t) => {
              const isEditing = editing?.id === t.id;
              return (
                <li key={t.id} className="tags-row">
                  {isEditing ? (
                    <div className="tags-edit">
                      <input
                        className="tags-edit-name"
                        type="text"
                        value={editing.name}
                        onChange={(e) =>
                          setEditing((p) => ({ ...p, name: e.target.value }))
                        }
                        aria-label="שם תגית"
                      />
                      <input
                        type="color"
                        value={editing.color}
                        onChange={(e) =>
                          setEditing((p) => ({ ...p, color: e.target.value }))
                        }
                        aria-label="צבע תגית"
                        className="tags-color"
                      />
                      <select
                        value={editing.scope}
                        onChange={(e) =>
                          setEditing((p) => ({ ...p, scope: e.target.value }))
                        }
                        aria-label="תחום תגית"
                      >
                        {SCOPE_OPTIONS.map((s) => (
                          <option key={s.value} value={s.value}>{s.label}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={handleSaveEdit}
                        aria-label="שמור"
                      >
                        <Check size={14} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={handleCancelEdit}
                        aria-label="בטל עריכה"
                      >
                        <XIcon size={14} aria-hidden="true" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <span
                        className="tags-chip"
                        style={{ background: t.color || DEFAULT_COLOR }}
                      >
                        {displayText(t.name)}
                      </span>
                      <span className="tags-scope">
                        {SCOPE_OPTIONS.find((s) => s.value === t.scope)?.label || t.scope}
                      </span>
                      <div className="tags-actions">
                        <button
                          type="button"
                          className="btn btn-ghost"
                          onClick={() => handleStartEdit(t)}
                          aria-label={`ערוך: ${t.name}`}
                        >
                          <Pencil size={14} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost tags-delete"
                          onClick={() => setPendingDelete(t)}
                          aria-label={`מחק: ${t.name}`}
                        >
                          <Trash2 size={14} aria-hidden="true" />
                        </button>
                      </div>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {pendingDelete && (
        <ConfirmDialog
          title="מחיקת תגית"
          message={`האם למחוק את התגית "${pendingDelete.name}"? השיוכים הקיימים יוסרו.`}
          confirmLabel="מחק"
          onConfirm={handleDelete}
          onClose={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}
