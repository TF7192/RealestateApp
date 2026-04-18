import { useState } from 'react';
import { X, AlertCircle } from 'lucide-react';
import api from '../lib/api';
import Portal from './Portal';
import { NumberField, PhoneField, SelectField, Segmented } from './SmartFields';

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
    budget: lead.budget ?? null,
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
        budget: form.budget != null && form.budget !== '' ? Number(form.budget) : null,
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
    <Portal>
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
              <div className="form-group">
                <label className="form-label">טלפון</label>
                <PhoneField value={form.phone} onChange={(v) => update('phone', v)} />
              </div>
              <div className="form-group"><label className="form-label">אימייל</label><input className="form-input" value={form.email} onChange={(e) => update('email', e.target.value)} /></div>
              <div className="form-group">
                <label className="form-label">סטטוס</label>
                <Segmented
                  value={form.status}
                  onChange={(v) => update('status', v)}
                  options={[
                    { value: 'HOT', label: 'חם' },
                    { value: 'WARM', label: 'חמים' },
                    { value: 'COLD', label: 'קר' },
                  ]}
                  ariaLabel="סטטוס"
                />
              </div>
              <div className="form-group">
                <label className="form-label">סוג התעניינות</label>
                <Segmented
                  value={form.interestType}
                  onChange={(v) => update('interestType', v)}
                  options={[
                    { value: 'PRIVATE', label: 'פרטי' },
                    { value: 'COMMERCIAL', label: 'מסחרי' },
                  ]}
                  ariaLabel="סוג התעניינות"
                />
              </div>
              <div className="form-group">
                <label className="form-label">קנייה / שכירות</label>
                <Segmented
                  value={form.lookingFor}
                  onChange={(v) => update('lookingFor', v)}
                  options={[
                    { value: 'BUY', label: 'קנייה' },
                    { value: 'RENT', label: 'שכירות' },
                  ]}
                  ariaLabel="קנייה או שכירות"
                />
              </div>
              <div className="form-group"><label className="form-label">עיר</label><input className="form-input" value={form.city} onChange={(e) => update('city', e.target.value)} /></div>
              <div className="form-group"><label className="form-label">רחוב</label><input className="form-input" value={form.street} onChange={(e) => update('street', e.target.value)} /></div>
              <div className="form-group"><label className="form-label">חדרים</label><input className="form-input" value={form.rooms} onChange={(e) => update('rooms', e.target.value)} /></div>
              <div className="form-group"><label className="form-label">טווח מחיר (טקסט)</label><input className="form-input" value={form.priceRangeLabel} onChange={(e) => update('priceRangeLabel', e.target.value)} /></div>
              <div className="form-group">
                <label className="form-label">תקציב</label>
                <NumberField
                  unit="₪"
                  placeholder="2,500,000"
                  showShort
                  value={form.budget}
                  onChange={(v) => update('budget', v)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">מגזר</label>
                <SelectField
                  value={form.sector}
                  onChange={(v) => update('sector', v)}
                  options={['כללי', 'דתי', 'חרדי', 'ערבי']}
                />
              </div>
              <div className="form-group">
                <label className="form-label">קירבה לבית ספר</label>
                <SelectField
                  value={form.schoolProximity}
                  onChange={(v) => update('schoolProximity', v)}
                  placeholder="לא חשוב"
                  options={['עד 200 מטר', 'עד 500 מטר', 'הליכה', 'עד ק״מ']}
                />
              </div>
              <div className="form-group"><label className="form-label">מקור</label><input className="form-input" value={form.source} onChange={(e) => update('source', e.target.value)} /></div>
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
    </Portal>
  );
}
