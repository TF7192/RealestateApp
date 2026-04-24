// Owner detail — port of the claude.ai/design bundle with inline
// Cream & Gold styles. Split-panel: left = identity + edit form,
// right = properties list. Multi-phone editor stays on its own
// component (OwnerPhonesPanel) because the UX is rich enough to
// warrant its own file.
//
// No fixtures — GET /api/owners/:id is the only source.

import { useEffect, useState, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight, Phone, Mail, MessageCircle, MessageSquare, Trash2,
  Save, AlertCircle, Building2, UserCircle, Printer, Maximize2,
} from 'lucide-react';
import { popoutCurrentRoute } from '../lib/popout';
import { printPage } from '../lib/print';
import api from '../lib/api';
import ConfirmDialog from '../components/ConfirmDialog';
import { PhoneField, SelectField } from '../components/SmartFields';
import OwnerPhonesPanel from '../components/OwnerPhonesPanel';
import { inputPropsForName, inputPropsForEmail, inputPropsForNotes } from '../lib/inputProps';
import { useToast } from '../lib/toast';
import { formatPhone } from '../lib/phone';
import { relativeDate } from '../lib/relativeDate';

const DT = {
  cream: '#f7f3ec', cream2: '#efe9df', cream3: '#e8dfcf', cream4: '#fbf7f0',
  white: '#ffffff',
  ink: '#1e1a14', ink2: '#3a3226',
  muted: '#6b6356',
  gold: '#b48b4c', goldLight: '#d9b774', goldDark: '#7a5c2c',
  goldSoft: 'rgba(180,139,76,0.12)',
  border: 'rgba(30,26,20,0.08)', borderStrong: 'rgba(30,26,20,0.14)',
  success: '#15803d', danger: '#b91c1c',
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

function formatPrice(price) {
  if (price == null) return '—';
  if (price < 10000) return `₪${price.toLocaleString('he-IL')}/חודש`;
  return `₪${price.toLocaleString('he-IL')}`;
}

export default function OwnerDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [owner, setOwner] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getOwner(id);
      const o = res?.owner || res;
      if (!o) throw new Error('בעל הנכס לא נמצא');
      setOwner(o);
    } catch (e) {
      setError(e?.message || 'שגיאה בטעינה');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const onSaved = (next) => {
    setOwner((cur) => ({ ...cur, ...next }));
    toast?.success?.('הפרטים נשמרו');
  };

  const onDelete = async () => {
    setDeleting(true);
    try {
      await api.deleteOwner(id);
      toast?.success?.('בעל הנכס נמחק');
      navigate('/owners');
    } catch (e) {
      toast?.error?.(e?.message || 'מחיקה נכשלה');
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  if (loading) {
    return (
      <div dir="rtl" style={{ ...FONT, padding: 28, color: DT.muted, fontSize: 14 }}>
        טוען…
      </div>
    );
  }
  if (error || !owner) {
    return (
      <div dir="rtl" style={{
        ...FONT, padding: 28,
        display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 12,
        color: DT.ink,
      }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          background: 'rgba(185,28,28,0.08)', color: DT.danger,
          padding: '10px 14px', borderRadius: 10, fontSize: 13,
        }}>
          <AlertCircle size={16} /> {error || 'בעל הנכס לא נמצא'}
        </div>
        <Link to="/owners" style={ghostBtn()}>
          <ArrowRight size={14} /> חזור לבעלי נכסים
        </Link>
      </div>
    );
  }

  const properties = owner.properties || [];
  const createdRel = owner.createdAt ? relativeDate(owner.createdAt) : null;

  return (
    <div dir="rtl" style={{ ...FONT, padding: 28, color: DT.ink, minHeight: '100%' }}>
      {/* Top toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 12, flexWrap: 'wrap', marginBottom: 18,
      }}>
        <Link to="/owners" style={{
          ...FONT,
          display: 'inline-flex', alignItems: 'center', gap: 6,
          color: DT.muted, textDecoration: 'none', fontSize: 13, fontWeight: 700,
        }}>
          <ArrowRight size={16} />
          בעלי נכסים
        </Link>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {owner.phone && (
            <>
              <a href={`tel:${owner.phone}`} style={secondaryBtn()} title={formatPhone(owner.phone)}>
                <Phone size={14} /> התקשר
              </a>
              <a href={`sms:${owner.phone}`} style={secondaryBtn()} title="SMS">
                <MessageSquare size={14} /> SMS
              </a>
              <a
                href={`https://wa.me/${owner.phone.replace(/\D/g, '')}?text=${encodeURIComponent(`שלום ${owner.name}`)}`}
                target="_blank" rel="noopener noreferrer"
                style={secondaryBtn()} title="שלח בוואטסאפ"
              >
                <MessageCircle size={14} /> וואטסאפ
              </a>
            </>
          )}
          {owner.email && (
            <a href={`mailto:${owner.email}`} style={secondaryBtn()} title={owner.email}>
              <Mail size={14} /> אימייל
            </a>
          )}
          <button type="button" style={ghostBtn()} onClick={() => printPage()} title="הדפס">
            <Printer size={14} />
          </button>
          <button type="button" style={ghostBtn()} onClick={() => popoutCurrentRoute()} title="פתח בחלון">
            <Maximize2 size={14} />
          </button>
          <button type="button" style={dangerBtn()} onClick={() => setConfirmDelete(true)}>
            <Trash2 size={14} /> מחק
          </button>
        </div>
      </div>

      {/* Header card */}
      <div style={{
        background: DT.white, border: `1px solid ${DT.border}`,
        borderRadius: 14, padding: 20, marginBottom: 16,
        display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
      }}>
        <div style={{
          width: 64, height: 64, borderRadius: 99,
          background: `linear-gradient(160deg, ${DT.goldLight}, ${DT.gold})`,
          color: DT.ink, display: 'grid', placeItems: 'center',
          fontWeight: 800, fontSize: 26, flexShrink: 0,
        }}>
          {(owner.name || '?').charAt(0)}
        </div>
        <div style={{ flex: 1, minWidth: 220 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.5, margin: 0 }}>
            {owner.name}
          </h1>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 10,
            fontSize: 13, color: DT.muted, marginTop: 6, flexWrap: 'wrap',
          }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              background: DT.goldSoft, color: DT.goldDark,
              padding: '3px 10px', borderRadius: 99, fontWeight: 700, fontSize: 11,
            }}>
              <Building2 size={12} />
              {owner.propertyCount ?? properties.length} נכסים
            </span>
            {owner.phone && <span>· {formatPhone(owner.phone)}</span>}
            {owner.email && <span>· {owner.email}</span>}
            {createdRel && <span>· נוסף {createdRel.label}</span>}
          </div>
        </div>
      </div>

      {/* Grid: edit form + properties panel */}
      <div style={{
        display: 'grid', gap: 16,
        gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
      }}>
        <OwnerEditForm owner={owner} onSaved={onSaved} toast={toast} />
        <OwnerPropertiesPanel properties={properties} />
      </div>

      {/* Multi-phone editor */}
      <div style={{
        background: DT.white, border: `1px solid ${DT.border}`,
        borderRadius: 14, padding: 20, marginTop: 16,
      }}>
        <OwnerPhonesPanel ownerId={owner.id} />
      </div>

      {confirmDelete && (
        <ConfirmDialog
          title="מחיקת בעל נכס"
          message={`למחוק את "${owner.name}"? הפעולה אינה הפיכה. הנכסים של בעל נכס זה לא ימחקו, אך הקישור ייעלם.`}
          confirmLabel="מחק בעל נכס"
          onConfirm={onDelete}
          onClose={() => setConfirmDelete(false)}
          busy={deleting}
        />
      )}
    </div>
  );
}

function OwnerEditForm({ owner, onSaved, toast }) {
  const [form, setForm] = useState({
    name: owner.name || '',
    phone: owner.phone || '',
    email: owner.email || '',
    notes: owner.notes || '',
    relationship: owner.relationship || '',
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
      const res = await api.updateOwner(owner.id, body);
      const next = res?.owner || res || body;
      onSaved(next);
    } catch (e) {
      const msg = e?.message || 'שמירה נכשלה';
      setErr(msg);
      toast?.error?.(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section style={sectionCard()} aria-label="פרטי בעל הנכס">
      <h3 style={sectionTitle()}>
        <UserCircle size={16} /> פרטי בעל הנכס
      </h3>
      {err && (
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          background: 'rgba(185,28,28,0.08)', color: DT.danger,
          padding: '6px 10px', borderRadius: 8, fontSize: 12, marginBottom: 10,
        }}>
          <AlertCircle size={12} /> {err}
        </div>
      )}
      <div style={{
        display: 'grid', gap: 12,
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
      }}>
        <Field label="שם מלא">
          <input
            {...inputPropsForName()}
            className="form-input"
            value={form.name}
            onChange={(e) => update('name', e.target.value)}
          />
        </Field>
        <Field label="טלפון">
          <PhoneField value={form.phone} onChange={(v) => update('phone', v)} />
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
          />
        </Field>
        <Field label="הערות" wide>
          <textarea
            {...inputPropsForNotes()}
            className="form-textarea"
            rows={4}
            value={form.notes}
            onChange={(e) => update('notes', e.target.value)}
            placeholder="פרטים נוספים על בעל הנכס…"
          />
        </Field>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
        <button type="button" onClick={save} disabled={busy} style={primaryBtn()}>
          <Save size={14} />
          {busy ? 'שומר…' : 'שמור שינויים'}
        </button>
      </div>
    </section>
  );
}

function OwnerPropertiesPanel({ properties }) {
  return (
    <section style={sectionCard()} aria-label="נכסים בבעלות">
      <h3 style={sectionTitle()}>
        <Building2 size={16} /> נכסים בבעלות ({properties.length})
      </h3>
      {properties.length === 0 ? (
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-start',
          color: DT.muted, fontSize: 13, padding: '14px 0',
        }}>
          <p style={{ margin: 0 }}>עוד אין נכסים בבעלות זה — צרף נכס מתוך עמוד הקליטה.</p>
          <Link to="/properties/new" style={ghostBtn()}>
            קליטת נכס
          </Link>
        </div>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {properties.map((p) => (
            <li key={p.id}>
              <Link
                to={`/properties/${p.id}`}
                style={{
                  display: 'flex', flexDirection: 'column', gap: 4,
                  padding: '10px 12px', borderRadius: 10,
                  border: `1px solid ${DT.border}`,
                  background: DT.cream4, textDecoration: 'none', color: DT.ink,
                  transition: 'background 0.15s',
                }}
              >
                <span style={{ fontWeight: 800, fontSize: 13 }}>
                  {[p.street, p.city].filter(Boolean).join(', ') || 'נכס ללא כתובת'}
                </span>
                <span style={{ fontSize: 12, color: DT.muted }}>
                  {[p.type, p.rooms ? `${p.rooms} חד׳` : null, p.sqm ? `${p.sqm} מ״ר` : null]
                    .filter(Boolean).join(' · ')}
                </span>
                {p.marketingPrice ? (
                  <span style={{ fontSize: 13, fontWeight: 800, color: DT.goldDark }}>
                    {formatPrice(p.marketingPrice)}
                  </span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Field({ label, wide, children }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 4,
      gridColumn: wide ? '1 / -1' : 'auto',
    }}>
      <label style={{ fontSize: 11, fontWeight: 700, color: DT.muted, textTransform: 'uppercase', letterSpacing: 0.3 }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function sectionCard() {
  return {
    background: DT.white, border: `1px solid ${DT.border}`,
    borderRadius: 14, padding: 20,
  };
}
function sectionTitle() {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    fontSize: 14, fontWeight: 800, margin: '0 0 14px', color: DT.ink,
    letterSpacing: -0.2,
  };
}
function primaryBtn() {
  return {
    ...FONT,
    background: `linear-gradient(180deg, ${DT.goldLight}, ${DT.gold})`,
    border: 'none', color: DT.ink,
    padding: '9px 16px', borderRadius: 10, cursor: 'pointer',
    fontSize: 13, fontWeight: 800,
    display: 'inline-flex', gap: 6, alignItems: 'center',
    boxShadow: '0 4px 10px rgba(180,139,76,0.3)',
    textDecoration: 'none',
  };
}
function secondaryBtn() {
  return {
    ...FONT, background: DT.white, border: `1px solid ${DT.border}`,
    padding: '7px 12px', borderRadius: 10, cursor: 'pointer',
    fontSize: 12, fontWeight: 700,
    display: 'inline-flex', gap: 5, alignItems: 'center', color: DT.ink,
    textDecoration: 'none',
  };
}
function ghostBtn() {
  return {
    ...FONT, background: 'transparent', border: `1px solid ${DT.border}`,
    padding: '7px 12px', borderRadius: 10, cursor: 'pointer',
    fontSize: 12, fontWeight: 700,
    display: 'inline-flex', gap: 5, alignItems: 'center', color: DT.ink,
    textDecoration: 'none',
  };
}
function dangerBtn() {
  return {
    ...FONT, background: 'rgba(185,28,28,0.08)', border: `1px solid rgba(185,28,28,0.2)`,
    padding: '7px 12px', borderRadius: 10, cursor: 'pointer',
    fontSize: 12, fontWeight: 700,
    display: 'inline-flex', gap: 5, alignItems: 'center', color: DT.danger,
  };
}
