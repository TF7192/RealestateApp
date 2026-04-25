// OwnerEditDialog — create / edit a property Owner. Ported to inline
// Cream & Gold DT styles as part of Sprint 3 (CRM write surfaces).
// Backdrop-cover + centered cream card matches OwnerDetail / the rest
// of the port. Keeps all existing field wiring + validation + calls to
// api.createOwner / api.updateOwner (body shape unchanged).

import { useId, useState } from 'react';
import { X, AlertCircle, Save, UserCircle } from 'lucide-react';
import api from '../lib/api';
import Portal from './Portal';
import { PhoneField, SelectField } from './SmartFields';
import { inputPropsForName, inputPropsForEmail, inputPropsForNotes } from '../lib/inputProps';

const DT = {
  cream: '#f7f3ec', cream2: '#efe9df', cream3: '#e8dfcf', cream4: '#fbf7f0',
  white: '#ffffff',
  ink: '#1e1a14', ink2: '#3a3226',
  muted: '#6b6356',
  gold: '#b48b4c', goldLight: '#d9b774', goldDark: '#7a5c2c',
  goldSoft: 'rgba(180,139,76,0.12)',
  border: 'rgba(30,26,20,0.08)', borderStrong: 'rgba(30,26,20,0.14)',
  danger: '#b91c1c',
};
const FONT = { fontFamily: 'Assistant, Heebo, -apple-system, sans-serif' };

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

  const titleId = useId();

  return (
    <Portal>
      <div
        dir="rtl"
        onClick={onClose}
        style={{
          ...FONT,
          position: 'fixed', inset: 0,
          background: 'rgba(30,26,20,0.55)',
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 16,
          // Sub-dialogs spawned from the OwnerPicker must stack above it
          // (picker sits at 1100).
          zIndex: 1200,
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          onClick={(e) => e.stopPropagation()}
          style={{
            width: '100%', maxWidth: 520,
            maxHeight: 'calc(100dvh - 32px)',
            overflow: 'auto',
            background: DT.cream4,
            color: DT.ink,
            border: `1px solid ${DT.border}`,
            borderRadius: 14,
            boxShadow: '0 20px 60px rgba(30,26,20,0.15)',
            padding: 24,
            display: 'flex', flexDirection: 'column', gap: 16,
          }}
        >
          {/* Header */}
          <header style={{
            display: 'flex', alignItems: 'flex-start',
            justifyContent: 'space-between', gap: 12,
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h3
                id={titleId}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  margin: 0, fontSize: 18, fontWeight: 800,
                  color: DT.ink, letterSpacing: -0.3,
                }}
              >
                <UserCircle size={18} aria-hidden="true" style={{ color: DT.gold }} />
                {isEdit ? 'עריכת בעל נכס' : 'בעל נכס חדש'}
              </h3>
              {isEdit && owner?.name && (
                <p style={{
                  margin: '4px 0 0', color: DT.muted, fontSize: 13,
                }}>
                  {owner.name}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="סגור"
              style={{
                ...FONT,
                width: 32, height: 32, borderRadius: 8,
                background: 'transparent',
                border: `1px solid ${DT.border}`,
                color: DT.ink,
                cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <X size={18} />
            </button>
          </header>

          {/* Error banner */}
          {err && (
            <div
              role="alert"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                background: 'rgba(185,28,28,0.08)',
                color: DT.danger,
                border: `1px solid rgba(185,28,28,0.2)`,
                padding: '10px 12px', borderRadius: 10,
                fontSize: 13,
              }}
            >
              <AlertCircle size={14} />
              {err}
            </div>
          )}

          {/* Fields */}
          <div style={{
            display: 'grid', gap: 14,
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          }}>
            <Field label="שם מלא">
              <input
                {...inputPropsForName()}
                className="form-input"
                value={form.name}
                onChange={(e) => update('name', e.target.value)}
                placeholder="ישראל ישראלי"
                autoFocus
              />
            </Field>
            <Field label="טלפון">
              <PhoneField
                value={form.phone}
                onChange={(v) => update('phone', v)}
              />
            </Field>
            <Field label="אימייל">
              <input
                {...inputPropsForEmail()}
                className="form-input"
                value={form.email}
                onChange={(e) => update('email', e.target.value)}
                placeholder="name@example.com"
              />
            </Field>
            <Field label="סוג בעלות">
              <SelectField
                value={form.relationship}
                onChange={(v) => update('relationship', v)}
                placeholder="בחר…"
                options={RELATIONSHIP_OPTIONS}
                aria-label="סוג בעלות"
              />
            </Field>
            <Field label="הערות" wide>
              <textarea
                {...inputPropsForNotes()}
                className="form-textarea"
                rows={3}
                value={form.notes}
                onChange={(e) => update('notes', e.target.value)}
                placeholder="פרטים נוספים על בעל הנכס…"
              />
            </Field>
          </div>

          {/* Actions */}
          <footer style={{
            display: 'flex', gap: 10, justifyContent: 'flex-end',
            paddingTop: 8, flexWrap: 'wrap',
          }}>
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              style={ghostBtn(busy)}
            >
              ביטול
            </button>
            <button
              type="button"
              onClick={save}
              disabled={busy}
              style={primaryBtn(busy)}
            >
              <Save size={14} />
              {busy ? 'שומר…' : isEdit ? 'שמור שינויים' : 'צור בעל נכס'}
            </button>
          </footer>
        </div>
      </div>
    </Portal>
  );
}

function Field({ label, wide, children }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 4,
      gridColumn: wide ? '1 / -1' : 'auto',
    }}>
      <label style={{
        fontSize: 11, fontWeight: 700, color: DT.muted,
        textTransform: 'uppercase', letterSpacing: 0.3,
      }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function primaryBtn(busy) {
  return {
    ...FONT,
    background: busy ? '#d8cfbf' : `linear-gradient(180deg, ${DT.goldLight}, ${DT.gold})`,
    border: 'none', color: DT.ink,
    padding: '10px 18px', borderRadius: 10,
    cursor: busy ? 'wait' : 'pointer',
    fontSize: 13, fontWeight: 800,
    display: 'inline-flex', gap: 6, alignItems: 'center',
    boxShadow: busy ? 'none' : '0 4px 10px rgba(180,139,76,0.3)',
  };
}

function ghostBtn(busy) {
  return {
    ...FONT,
    background: 'transparent',
    border: `1px solid ${DT.border}`,
    padding: '10px 16px', borderRadius: 10,
    cursor: busy ? 'not-allowed' : 'pointer',
    fontSize: 13, fontWeight: 700,
    color: DT.ink,
    display: 'inline-flex', gap: 6, alignItems: 'center',
    opacity: busy ? 0.6 : 1,
  };
}
