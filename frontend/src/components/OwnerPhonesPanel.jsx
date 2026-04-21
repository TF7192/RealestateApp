import { useCallback, useEffect, useId, useState } from 'react';
import { Phone, Trash2, Plus } from 'lucide-react';
import api from '../lib/api';
import { PhoneField, SelectField } from './SmartFields';
import ConfirmDialog from './ConfirmDialog';
import EmptyState from './EmptyState';
import { useToast } from '../lib/toast.jsx';
import './OwnerPhonesPanel.css';

// J8 — multi-phone editor for an Owner.
//
// One row per OwnerPhone record (primary / secondary / spouse / work /
// fax / other). Inline edit: changing kind or label patches on blur /
// change; changing the phone digits patches on blur so we don't flood
// the backend while the agent is typing. The legacy Owner.phone
// column is kept denormalized up at the contact-section level and is
// rendered above this panel by OwnerDetail — we don't duplicate it.

const KIND_OPTIONS = [
  { value: 'primary',   label: 'ראשי' },
  { value: 'secondary', label: 'משני' },
  { value: 'spouse',    label: 'בן/בת זוג' },
  { value: 'work',      label: 'עבודה' },
  { value: 'fax',       label: 'פקס' },
  { value: 'other',     label: 'אחר' },
];

export default function OwnerPhonesPanel({ ownerId }) {
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addPhone, setAddPhone] = useState('');
  const [addKind, setAddKind] = useState('secondary');
  const [addLabel, setAddLabel] = useState('');
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState(null);
  // Gate destructive deletes through a ConfirmDialog (shared component) so
  // the UX matches the rest of the app instead of the browser's native
  // `window.confirm` prompt.
  const [pendingDelete, setPendingDelete] = useState(null);
  const addPhoneId = useId();
  const addKindId = useId();
  const addLabelId = useId();

  const load = useCallback(async () => {
    if (!ownerId) return;
    setLoading(true);
    try {
      const res = await api.listOwnerPhones(ownerId);
      setItems(res?.items || []);
    } catch (e) {
      toast?.error?.(e?.message || 'טעינת מספרי הטלפון נכשלה');
    } finally {
      setLoading(false);
    }
  }, [ownerId, toast]);

  useEffect(() => { load(); }, [load]);

  const submitAdd = async (e) => {
    e?.preventDefault?.();
    const digits = (addPhone || '').replace(/[^\d]/g, '');
    if (digits.length < 3) {
      toast?.error?.('נא להזין מספר טלפון תקין');
      return;
    }
    setAdding(true);
    try {
      await api.addOwnerPhone(ownerId, {
        phone: addPhone.trim(),
        kind: addKind,
        label: addLabel.trim() || undefined,
      });
      toast?.success?.('מספר הטלפון נוסף');
      setAddPhone('');
      setAddKind('secondary');
      setAddLabel('');
      await load();
    } catch (e2) {
      toast?.error?.(e2?.message || 'הוספת מספר טלפון נכשלה');
    } finally {
      setAdding(false);
    }
  };

  // Optimistic-ish inline edit: update local state, then PATCH.
  // If the server rejects, restore by reloading the canonical list.
  const patchRow = async (id, patch) => {
    const prev = items;
    setItems(prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
    setBusyId(id);
    try {
      await api.updateOwnerPhone(id, patch);
    } catch (e) {
      toast?.error?.(e?.message || 'עדכון מספר הטלפון נכשל');
      setItems(prev); // rollback to previous snapshot
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const remove = (id, phone) => {
    setPendingDelete({ id, phone });
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    const { id } = pendingDelete;
    setPendingDelete(null);
    setBusyId(id);
    try {
      await api.deleteOwnerPhone(id);
      toast?.info?.('המספר נמחק');
      await load();
    } catch (e) {
      toast?.error?.(e?.message || 'מחיקת המספר נכשלה');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="opp-root" aria-label="מספרי טלפון נוספים">
      <h3 className="opp-title">מספרי טלפון נוספים</h3>

      {loading ? (
        <p className="opp-hint">טוען…</p>
      ) : items.length === 0 ? (
        <EmptyState
          title="אין מספרים נוספים"
          description="הוסף מספר שני, בן/בת זוג, מספר עבודה או פקס"
          variant="first"
        />
      ) : (
        <ul className="opp-list">
          {items.map((p) => (
            <li key={p.id} className="opp-item">
              <Phone size={14} className="opp-item-icon" aria-hidden="true" />
              <PhoneField
                value={p.phone}
                onChange={(v) => setItems((rows) => rows.map((r) => (r.id === p.id ? { ...r, phone: v } : r)))}
                onBlur={() => {
                  // Only PATCH if digits changed beyond min length.
                  const digits = (p.phone || '').replace(/[^\d]/g, '');
                  if (digits.length >= 3) patchRow(p.id, { phone: p.phone });
                }}
                aria-label="מספר טלפון"
              />
              <SelectField
                value={p.kind}
                onChange={(v) => patchRow(p.id, { kind: v })}
                options={KIND_OPTIONS}
                aria-label="סוג הטלפון"
              />
              <input
                type="text"
                className="form-input opp-item-label"
                placeholder="תווית (לדוגמה: בבוקר)"
                value={p.label || ''}
                onChange={(e) => setItems((rows) => rows.map((r) => (r.id === p.id ? { ...r, label: e.target.value } : r)))}
                onBlur={(e) => patchRow(p.id, { label: e.target.value })}
                aria-label="תווית"
              />
              <button
                type="button"
                className="btn btn-ghost btn-sm opp-item-remove"
                onClick={() => remove(p.id, p.phone)}
                disabled={busyId === p.id}
                aria-label={`מחק את המספר ${p.phone}`}
              >
                <Trash2 size={14} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <form className="opp-add" onSubmit={submitAdd}>
        <div className="opp-add-row">
          <div className="form-group">
            <label className="form-label" htmlFor={addPhoneId}>מספר</label>
            <PhoneField
              id={addPhoneId}
              value={addPhone}
              onChange={setAddPhone}
              aria-label="מספר טלפון חדש"
            />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor={addKindId}>סוג</label>
            <SelectField
              id={addKindId}
              value={addKind}
              onChange={setAddKind}
              options={KIND_OPTIONS}
              aria-label="סוג הטלפון"
            />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor={addLabelId}>תווית</label>
            <input
              id={addLabelId}
              type="text"
              className="form-input"
              placeholder="אופציונלי"
              value={addLabel}
              onChange={(e) => setAddLabel(e.target.value)}
            />
          </div>
          <button
            type="submit"
            className="btn btn-primary opp-add-submit"
            disabled={adding || !addPhone.trim()}
          >
            <Plus size={14} aria-hidden="true" />
            {adding ? 'מוסיף…' : 'הוסף מספר'}
          </button>
        </div>
      </form>

      {pendingDelete && (
        <ConfirmDialog
          title="מחיקת מספר טלפון"
          message={`למחוק את המספר ${pendingDelete.phone}? הפעולה אינה הפיכה.`}
          confirmLabel="מחק"
          onConfirm={confirmDelete}
          onClose={() => setPendingDelete(null)}
          busy={busyId === pendingDelete.id}
        />
      )}
    </section>
  );
}
