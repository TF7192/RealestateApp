import { useState } from 'react';
import { X, AlertCircle, Save, UserCircle } from 'lucide-react';
import api from '../lib/api';
import Portal from './Portal';
import { PhoneField, SelectField } from './SmartFields';
import { inputPropsForName, inputPropsForEmail, inputPropsForNotes } from '../lib/inputProps';
import './OwnerEditDialog.css';

const RELATIONSHIP_OPTIONS = [
  'בעל יחיד',
  'שותפות בעלים',
  'ירושה',
  'נאמנות',
  'בא כוח',
  'חברה',
  'אחר',
];

/**
 * OwnerEditDialog — create or edit a property Owner.
 * Used inline from the Owners list, OwnerDetail, and the OwnerPicker.
 */
export default function OwnerEditDialog({ owner, onClose, onSaved }) {
  const isEdit = !!owner?.id;
  const [form, setForm] = useState({
    name: owner?.name || '',
    phone: owner?.phone || '',
    email: owner?.email || '',
    notes: owner?.notes || '',
    relationship: owner?.relationship || '',
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const update = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const save = async () => {
    setErr(null);
    if (!form.name.trim()) { setErr('שם הוא שדה חובה'); return; }
    if (!form.phone.trim()) { setErr('טלפון הוא שדה חובה'); return; }
    setBusy(true);
    try {
      const body = {
        name: form.name.trim(),
        phone: form.phone.trim(),
        email: form.email?.trim() || null,
        notes: form.notes?.trim() || null,
        relationship: form.relationship || null,
      };
      const res = isEdit
        ? await api.updateOwner(owner.id, body)
        : await api.createOwner(body);
      const next = res?.owner || res || { ...body, id: owner?.id };
      onSaved?.(next);
    } catch (e) {
      setErr(e?.message || 'שמירה נכשלה');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Portal>
      <div className="owner-dialog-backdrop" onClick={onClose}>
        <div className="owner-dialog" onClick={(e) => e.stopPropagation()}>
          <header className="owner-dialog-head">
            <div className="owner-dialog-head-text">
              <h3>
                <UserCircle size={18} />
                {isEdit ? 'עריכת בעל נכס' : 'בעל נכס חדש'}
              </h3>
              {isEdit && owner?.name && <p>{owner.name}</p>}
            </div>
            <button className="btn-ghost owner-dialog-close" onClick={onClose} aria-label="סגור">
              <X size={18} />
            </button>
          </header>

          <div className="owner-dialog-body">
            {err && (
              <div className="owner-dialog-error">
                <AlertCircle size={14} />
                {err}
              </div>
            )}

            <div className="owner-dialog-grid">
              <div className="form-group">
                <label className="form-label">שם מלא</label>
                <input
                  {...inputPropsForName()}
                  className="form-input"
                  value={form.name}
                  onChange={(e) => update('name', e.target.value)}
                  placeholder="ישראל ישראלי"
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label className="form-label">טלפון</label>
                <PhoneField
                  value={form.phone}
                  onChange={(v) => update('phone', v)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">אימייל</label>
                <input
                  {...inputPropsForEmail()}
                  className="form-input"
                  value={form.email}
                  onChange={(e) => update('email', e.target.value)}
                  placeholder="name@example.com"
                />
              </div>
              <div className="form-group">
                <label className="form-label">סוג בעלות</label>
                <SelectField
                  value={form.relationship}
                  onChange={(v) => update('relationship', v)}
                  placeholder="בחר…"
                  options={RELATIONSHIP_OPTIONS}
                />
              </div>
              <div className="form-group form-group-wide">
                <label className="form-label">הערות</label>
                <textarea
                  {...inputPropsForNotes()}
                  className="form-textarea"
                  rows={3}
                  value={form.notes}
                  onChange={(e) => update('notes', e.target.value)}
                  placeholder="פרטים נוספים על בעל הנכס…"
                />
              </div>
            </div>
          </div>

          <footer className="owner-dialog-actions">
            <button className="btn btn-primary" onClick={save} disabled={busy}>
              <Save size={14} />
              {busy ? 'שומר…' : isEdit ? 'שמור שינויים' : 'צור בעל נכס'}
            </button>
            <button className="btn btn-secondary" onClick={onClose} disabled={busy}>
              ביטול
            </button>
          </footer>
        </div>
      </div>
    </Portal>
  );
}
