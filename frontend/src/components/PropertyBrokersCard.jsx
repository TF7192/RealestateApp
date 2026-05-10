// Per-property external broker contacts ("קולגות"). A card on the
// PropertyDetail page that lists outside brokers the agent is coordinating
// with on this listing — name, phone, email, agency, area of expertise.
// Each entry has a quick call/WhatsApp action; "+ הוסף" opens a popup
// form to add a new broker.
import { useEffect, useState } from 'react';
import { Plus, Phone, MessageCircle, Mail, Trash2, X, Briefcase } from 'lucide-react';
import api from '../lib/api';
import { waUrl, telUrl } from '../lib/waLink';
import { formatPhone } from '../lib/phone';
import { useToast } from '../lib/toast';
import WhatsAppIcon from './WhatsAppIcon';
// 2026-05-10 — reuse the PropertyInterestsPanel CSS so this card
// matches the activity-log panels visually (cream card, gold border,
// pi-title / pi-add-btn / pi-empty classes).
import './PropertyInterestsPanel.css';

const _DT = {
  ink: '#1e1a14',
  muted: 'rgba(30,26,20,0.55)',
  white: '#ffffff',
  gold: '#b48b4c', goldLight: '#d9b774', goldSoft: 'rgba(180,139,76,0.10)',
  border: 'rgba(30,26,20,0.08)',
  danger: '#b91c1c',
};
const FONT = { fontFamily: 'Assistant, Heebo, -apple-system, sans-serif' };

export default function PropertyBrokersCard({ propertyId }) {
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.listPropertyBrokers(propertyId);
      setItems(res?.items || []);
    } catch (e) {
      toast.error(e?.message || 'טעינת המתווכים נכשלה');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    if (!propertyId) return undefined;
    let live = true;
    (async () => {
      setLoading(true);
      try {
        const res = await api.listPropertyBrokers(propertyId);
        if (live) setItems(res?.items || []);
      } catch (e) {
        if (live) toast.error(e?.message || 'טעינת המתווכים נכשלה');
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => { live = false; };
  }, [propertyId, toast]);

  const onDelete = async (brokerId, name) => {
    if (!confirm(`להסיר את ${name} מהרשימה?`)) return;
    try {
      await api.deletePropertyBroker(propertyId, brokerId);
      setItems((arr) => arr.filter((b) => b.id !== brokerId));
      toast.success('הוסר');
    } catch (e) {
      toast.error(e?.message || 'מחיקה נכשלה');
    }
  };

  return (
    <section
      className="pi-panel animate-in animate-in-delay-2"
      aria-label="קולגות בנכס"
      dir="rtl"
      style={{ ...FONT, marginBottom: 16 }}
    >
      <header className="pi-header">
        <h3 className="pi-title">
          <Briefcase size={16} />
          קולגות בנכס · {items.length} {items.length === 1 ? 'מתווך' : 'מתווכים'}
        </h3>
        <button
          type="button"
          onClick={() => { setEditing(null); setDialogOpen(true); }}
          className="pi-add-btn"
          aria-label="הוסף קולגה"
        >
          <Plus size={14} /> הוסף קולגה
        </button>
      </header>

      {loading ? (
        <div className="pi-empty">טוען…</div>
      ) : items.length === 0 ? (
        <div className="pi-empty">
          טרם הוספת קולגות. לחץ "הוסף קולגה" כדי להוסיף את המתווך הראשון.
        </div>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map((b) => (
            <li key={b.id} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 12px', borderRadius: 10,
              border: `1px solid ${_DT.border}`,
              background: 'rgba(180,139,76,0.04)',
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: '50%',
                background: `linear-gradient(160deg, ${_DT.goldLight}, ${_DT.gold})`,
                color: _DT.ink, display: 'grid', placeItems: 'center',
                fontWeight: 800, fontSize: 14, flexShrink: 0,
              }}>
                {(b.name || '?').slice(0, 1)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap',
                }}>
                  <strong style={{ fontSize: 14, color: _DT.ink }}>{b.name}</strong>
                  {b.agency && (
                    <span style={{ fontSize: 12, color: _DT.muted }}>· {b.agency}</span>
                  )}
                  {b.expertise && (
                    <span style={{
                      fontSize: 11, fontWeight: 700,
                      color: _DT.gold, background: _DT.goldSoft,
                      padding: '2px 8px', borderRadius: 99,
                    }}>{b.expertise}</span>
                  )}
                </div>
                <div style={{
                  fontSize: 12, color: _DT.muted, marginTop: 2,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  direction: 'ltr', textAlign: 'right',
                }}>
                  {[b.phone ? formatPhone(b.phone) : null, b.email]
                    .filter(Boolean).join(' · ') || '—'}
                </div>
                {b.notes && (
                  <div style={{ fontSize: 12, color: _DT.muted, marginTop: 4, lineHeight: 1.4 }}>
                    {b.notes}
                  </div>
                )}
              </div>
              <div style={{ display: 'inline-flex', gap: 4, flexShrink: 0 }}>
                {b.phone && (
                  <>
                    <a
                      href={telUrl(b.phone)}
                      title="התקשר"
                      style={iconBtn(_DT.ink)}
                    ><Phone size={14} /></a>
                    <a
                      href={waUrl(b.phone, `שלום ${b.name?.split(' ')[0] || ''}`)}
                      target="_blank" rel="noopener noreferrer"
                      title="וואטסאפ"
                      style={iconBtn('#fff', '#25d366')}
                    ><WhatsAppIcon size={14} /></a>
                  </>
                )}
                {b.email && (
                  <a
                    href={`mailto:${b.email}`}
                    title="מייל"
                    style={iconBtn(_DT.ink)}
                  ><Mail size={14} /></a>
                )}
                <button
                  type="button"
                  onClick={() => { setEditing(b); setDialogOpen(true); }}
                  title="ערוך"
                  style={iconBtn(_DT.ink)}
                >
                  ✎
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(b.id, b.name)}
                  title="הסר"
                  style={iconBtn(_DT.danger)}
                ><Trash2 size={14} /></button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {dialogOpen && (
        <BrokerDialog
          propertyId={propertyId}
          editing={editing}
          onClose={() => { setDialogOpen(false); setEditing(null); }}
          onSaved={() => { setDialogOpen(false); setEditing(null); load(); }}
        />
      )}
    </section>
  );
}

function iconBtn(fg, bg) {
  return {
    ...FONT,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: 32, height: 32, borderRadius: 8,
    border: bg ? 'none' : `1px solid ${_DT.border}`,
    background: bg || _DT.white,
    color: fg, cursor: 'pointer',
    textDecoration: 'none', fontSize: 13, fontWeight: 700,
  };
}

function BrokerDialog({ propertyId, editing, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState(() => ({
    name:      editing?.name      || '',
    phone:     editing?.phone     || '',
    email:     editing?.email     || '',
    agency:    editing?.agency    || '',
    expertise: editing?.expertise || '',
    notes:     editing?.notes     || '',
  }));
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error('יש להזין שם');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        agency: form.agency.trim() || null,
        expertise: form.expertise.trim() || null,
        notes: form.notes.trim() || null,
      };
      if (editing?.id) {
        await api.updatePropertyBroker(propertyId, editing.id, payload);
        toast.success('הקולגה עודכן');
      } else {
        await api.createPropertyBroker(propertyId, payload);
        toast.success('הקולגה נוסף');
      }
      onSaved();
    } catch (err) {
      toast.error(err?.message || 'השמירה נכשלה');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="brk-title"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 90,
        background: 'rgba(13,15,20,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
    >
      <form
        dir="rtl"
        onSubmit={submit}
        autoComplete="off"
        style={{
          ...FONT,
          width: 'min(520px, 100%)',
          background: _DT.white, borderRadius: 14,
          boxShadow: '0 30px 80px rgba(0,0,0,0.35)',
          display: 'flex', flexDirection: 'column',
          maxHeight: '90vh', overflow: 'hidden',
        }}
      >
        <header style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 18px', borderBottom: `1px solid ${_DT.border}`,
        }}>
          <h3 id="brk-title" style={{ margin: 0, fontSize: 16, fontWeight: 800, color: _DT.ink }}>
            {editing ? 'עריכת קולגה' : 'הוסף קולגה'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="סגור"
            style={{
              background: 'transparent', border: 'none', padding: 6,
              borderRadius: 8, cursor: 'pointer', color: _DT.muted,
            }}
          ><X size={18} /></button>
        </header>

        <div style={{ padding: 18, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Field label="שם מלא*">
            <input
              type="text" required name="estia-broker-name"
              autoComplete="off" autoCapitalize="words"
              value={form.name} onChange={(e) => set('name', e.target.value)}
              className="form-input" placeholder="ישראל ישראלי"
            />
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="טלפון">
              <input
                type="tel" inputMode="tel" name="estia-broker-phone"
                autoComplete="off" dir="ltr" style={{ textAlign: 'right' }}
                value={form.phone} onChange={(e) => set('phone', e.target.value)}
                className="form-input" placeholder="050-1234567"
              />
            </Field>
            <Field label="מייל">
              <input
                type="email" name="estia-broker-email"
                autoComplete="off" dir="ltr" style={{ textAlign: 'right' }}
                value={form.email} onChange={(e) => set('email', e.target.value)}
                className="form-input" placeholder="name@example.com"
              />
            </Field>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="משרד תיווך">
              <input
                type="text" name="estia-broker-agency"
                autoComplete="off"
                value={form.agency} onChange={(e) => set('agency', e.target.value)}
                className="form-input" placeholder="לדוגמה: Re/Max"
              />
            </Field>
            <Field label="אזור התמחות">
              <input
                type="text" name="estia-broker-expertise"
                autoComplete="off"
                value={form.expertise} onChange={(e) => set('expertise', e.target.value)}
                className="form-input" placeholder="צפון תל אביב, מסחרי…"
              />
            </Field>
          </div>
          <Field label="הערות">
            <textarea
              rows={3} dir="auto" autoCapitalize="sentences"
              value={form.notes} onChange={(e) => set('notes', e.target.value)}
              className="form-textarea" placeholder="פרטים שעוזרים בעבודה המשותפת"
            />
          </Field>
        </div>

        <footer style={{
          display: 'flex', gap: 8, justifyContent: 'flex-end',
          padding: '12px 18px', borderTop: `1px solid ${_DT.border}`,
        }}>
          <button type="button" onClick={onClose} className="btn btn-secondary btn-sm" disabled={saving}>
            ביטול
          </button>
          <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
            {saving ? 'שומר…' : editing ? 'שמור' : 'הוסף'}
          </button>
        </footer>
      </form>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: _DT.ink }}>{label}</span>
      {children}
    </label>
  );
}
