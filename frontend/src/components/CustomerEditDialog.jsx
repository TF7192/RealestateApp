import { useState } from 'react';
import { X, AlertCircle } from 'lucide-react';
import api from '../lib/api';

function toDateInput(val) {
  if (!val) return '';
  try { return new Date(val).toISOString().slice(0, 10); }
  catch { return ''; }
}

export default function CustomerEditDialog({ lead, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: lead.name || '',
    phone: lead.phone || '',
    email: lead.email || '',
    interestType: lead.interestType || 'PRIVATE',
    lookingFor: lead.lookingFor || 'BUY',
    city: lead.city || '',
    street: lead.street || '',
    rooms: lead.rooms || '',
    priceRangeLabel: lead.priceRangeLabel || '',
    budget: lead.budget ?? '',
    sector: lead.sector || 'כללי',
    schoolProximity: lead.schoolProximity || '',
    balconyRequired: !!lead.balconyRequired,
    parkingRequired: !!lead.parkingRequired,
    elevatorRequired: !!lead.elevatorRequired,
    safeRoomRequired: !!lead.safeRoomRequired,
    acRequired: !!lead.acRequired,
    storageRequired: !!lead.storageRequired,
    preApproval: !!lead.preApproval,
    status: lead.status || 'WARM',
    source: lead.source || '',
    brokerageSignedAt: toDateInput(lead.brokerageSignedAt),
    brokerageExpiresAt: toDateInput(lead.brokerageExpiresAt),
    notes: lead.notes || '',
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const update = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      const body = {
        name: form.name,
        phone: form.phone,
        email: form.email || null,
        interestType: form.interestType,
        lookingFor: form.lookingFor,
        city: form.city || null,
        street: form.street || null,
        rooms: form.rooms || null,
        priceRangeLabel: form.priceRangeLabel || null,
        budget: form.budget !== '' ? Number(form.budget) : null,
        sector: form.sector || null,
        schoolProximity: form.schoolProximity || null,
        balconyRequired: form.balconyRequired,
        parkingRequired: form.parkingRequired,
        elevatorRequired: form.elevatorRequired,
        safeRoomRequired: form.safeRoomRequired,
        acRequired: form.acRequired,
        storageRequired: form.storageRequired,
        preApproval: form.preApproval,
        status: form.status,
        source: form.source || null,
        brokerageSignedAt: form.brokerageSignedAt ? new Date(form.brokerageSignedAt).toISOString() : null,
        brokerageExpiresAt: form.brokerageExpiresAt ? new Date(form.brokerageExpiresAt).toISOString() : null,
        notes: form.notes || null,
      };
      await api.updateLead(lead.id, body);
      onSaved();
    } catch (e) {
      setErr(e.message || 'שמירה נכשלה');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="agreement-backdrop" onClick={onClose}>
      <div className="agreement-modal" onClick={(e) => e.stopPropagation()}>
        <header className="agreement-header">
          <div>
            <h3>עריכת לקוח</h3>
            <p>{lead.name}</p>
          </div>
          <button className="btn-ghost" onClick={onClose}><X size={18} /></button>
        </header>

        <div className="agreement-body">
          {err && <div className="agreement-error"><AlertCircle size={14} />{err}</div>}

          <div className="deal-form-grid">
            <div className="form-group"><label className="form-label">שם</label><input className="form-input" value={form.name} onChange={(e) => update('name', e.target.value)} /></div>
            <div className="form-group"><label className="form-label">טלפון</label><input className="form-input" value={form.phone} onChange={(e) => update('phone', e.target.value)} /></div>
            <div className="form-group"><label className="form-label">אימייל</label><input className="form-input" value={form.email} onChange={(e) => update('email', e.target.value)} /></div>
            <div className="form-group">
              <label className="form-label">סטטוס</label>
              <select className="form-select" value={form.status} onChange={(e) => update('status', e.target.value)}>
                <option value="HOT">חם</option>
                <option value="WARM">חמים</option>
                <option value="COLD">קר</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">סוג התעניינות</label>
              <select className="form-select" value={form.interestType} onChange={(e) => update('interestType', e.target.value)}>
                <option value="PRIVATE">פרטי</option>
                <option value="COMMERCIAL">מסחרי</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">קנייה / שכירות</label>
              <select className="form-select" value={form.lookingFor} onChange={(e) => update('lookingFor', e.target.value)}>
                <option value="BUY">קנייה</option>
                <option value="RENT">שכירות</option>
              </select>
            </div>
            <div className="form-group"><label className="form-label">עיר</label><input className="form-input" value={form.city} onChange={(e) => update('city', e.target.value)} /></div>
            <div className="form-group"><label className="form-label">רחוב</label><input className="form-input" value={form.street} onChange={(e) => update('street', e.target.value)} /></div>
            <div className="form-group"><label className="form-label">חדרים</label><input className="form-input" value={form.rooms} onChange={(e) => update('rooms', e.target.value)} /></div>
            <div className="form-group"><label className="form-label">טווח מחיר (טקסט)</label><input className="form-input" value={form.priceRangeLabel} onChange={(e) => update('priceRangeLabel', e.target.value)} /></div>
            <div className="form-group"><label className="form-label">תקציב</label><input type="number" className="form-input" value={form.budget} onChange={(e) => update('budget', e.target.value)} /></div>
            <div className="form-group">
              <label className="form-label">מגזר</label>
              <select className="form-select" value={form.sector} onChange={(e) => update('sector', e.target.value)}>
                <option>כללי</option><option>דתי</option><option>חרדי</option><option>ערבי</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">קירבה לבית ספר</label>
              <select className="form-select" value={form.schoolProximity} onChange={(e) => update('schoolProximity', e.target.value)}>
                <option value="">לא חשוב</option>
                <option>עד 200 מטר</option>
                <option>עד 500 מטר</option>
                <option>הליכה</option>
                <option>עד ק״מ</option>
              </select>
            </div>
            <div className="form-group"><label className="form-label">מקור</label><input className="form-input" value={form.source} onChange={(e) => update('source', e.target.value)} /></div>
            <div className="form-group"><label className="form-label">חתימת הסכם תיווך</label><input type="date" className="form-input" value={form.brokerageSignedAt} onChange={(e) => update('brokerageSignedAt', e.target.value)} /></div>
            <div className="form-group"><label className="form-label">סיום הסכם תיווך</label><input type="date" className="form-input" value={form.brokerageExpiresAt} onChange={(e) => update('brokerageExpiresAt', e.target.value)} /></div>
            <div className="form-group form-group-wide">
              <label className="form-label">הערות</label>
              <textarea className="form-textarea" rows={3} value={form.notes} onChange={(e) => update('notes', e.target.value)} />
            </div>
          </div>

          <div className="checkbox-grid">
            {[
              { key: 'preApproval', label: 'אישור עקרוני' },
              { key: 'balconyRequired', label: 'מרפסת' },
              { key: 'parkingRequired', label: 'חניה' },
              { key: 'elevatorRequired', label: 'מעלית' },
              { key: 'safeRoomRequired', label: 'ממ״ד' },
              { key: 'acRequired', label: 'מזגנים' },
              { key: 'storageRequired', label: 'מחסן' },
            ].map(({ key, label }) => (
              <label key={key} className="checkbox-item">
                <input type="checkbox" checked={form[key]} onChange={(e) => update(key, e.target.checked)} />
                <span className="checkbox-custom" />
                {label}
              </label>
            ))}
          </div>

          <div className="deal-form-actions">
            <button className="btn btn-primary" onClick={save} disabled={busy}>
              {busy ? 'שומר…' : 'שמור שינויים'}
            </button>
            <button className="btn btn-secondary" onClick={onClose}>ביטול</button>
          </div>
        </div>
      </div>
    </div>
  );
}
