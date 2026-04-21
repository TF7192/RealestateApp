import { useEffect, useRef, useState } from 'react';
import { X, Save, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import { NumberField, SelectField } from './SmartFields';
import Portal from './Portal';
import haptics from '../lib/haptics';
import useFocusTrap from '../hooks/useFocusTrap';
import './QuickEditDrawer.css';

// 5.2 — Quick-edit drawer.
//
// Shown from the asset-card overflow menu. Exposes the handful of
// fields the agent actually tweaks day-to-day — price, status, notes,
// vacancy date — without a full page nav. Saves optimistically: the
// caller's onSaved callback gets the merged property so the list can
// patch its row in place. Errors roll back with a visible message.

const STATUSES = [
  { value: 'ACTIVE',      label: 'פעיל' },
  { value: 'PAUSED',      label: 'מושהה' },
  { value: 'SOLD',        label: 'נמכר' },
  { value: 'OFF_MARKET',  label: 'הורד מהשוק' },
];

export default function QuickEditDrawer({ property, onClose, onSaved }) {
  const [form, setForm] = useState({
    marketingPrice: property?.marketingPrice ?? null,
    status: property?.status || 'ACTIVE',
    notes: property?.notes || '',
    vacancyDate: property?.vacancyDate || '',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  const panelRef = useRef(null);
  // F-6.4 — Tab trap + Esc + focus-restore in one hook.
  useFocusTrap(panelRef, { onEscape: onClose });

  const update = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const save = async () => {
    setSaving(true);
    setErr(null);
    try {
      const body = {
        marketingPrice: Number(form.marketingPrice) || 0,
        status: form.status,
        notes: form.notes || null,
        vacancyDate: form.vacancyDate || null,
      };
      const { property: updated } = await api.updateProperty(property.id, body);
      haptics?.press?.();
      onSaved?.(updated);
      onClose?.();
    } catch (e) {
      setErr(e?.message || 'שמירה נכשלה');
    } finally {
      setSaving(false);
    }
  };

  if (!property) return null;

  return (
    <Portal>
      <div className="qed-backdrop" onClick={onClose}>
        <aside
          ref={panelRef}
          className="qed-panel"
          onClick={(e) => e.stopPropagation()}
          dir="rtl"
          role="dialog"
          aria-modal="true"
          aria-labelledby="qed-title"
        >
          <header className="qed-head">
            <div className="qed-head-text">
              <strong id="qed-title">עריכה מהירה</strong>
              <span>{property.street}, {property.city}</span>
            </div>
            <button
              type="button"
              className="qed-close"
              onClick={onClose}
              aria-label="סגור"
            >
              <X size={18} />
            </button>
          </header>

          <div className="qed-body">
            <div className="form-group">
              <label className="form-label">מחיר שיווק (₪)</label>
              <NumberField
                unit="₪"
                placeholder="1,800,000"
                showShort
                value={form.marketingPrice}
                onChange={(v) => update('marketingPrice', v)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">סטטוס</label>
              <SelectField
                value={form.status}
                onChange={(v) => update('status', v)}
                options={STATUSES}
              />
            </div>

            <div className="form-group">
              <label className="form-label">כניסה</label>
              <input
                type="date"
                className="form-input"
                value={form.vacancyDate}
                onChange={(e) => update('vacancyDate', e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">הערות</label>
              <textarea
                className="form-textarea"
                rows={4}
                dir="auto"
                autoCapitalize="sentences"
                enterKeyHint="enter"
                value={form.notes}
                onChange={(e) => update('notes', e.target.value)}
                placeholder="מחיר גמיש, שעות אפשריות, דגשים לשיחת טלפון…"
              />
            </div>

            {err && <div className="qed-err">{err}</div>}
          </div>

          <footer className="qed-foot">
            <Link
              to={`/properties/${property.id}/edit`}
              className="btn btn-secondary qed-full"
              onClick={onClose}
            >
              <ExternalLink size={14} />
              פתח עורך מלא
            </Link>
            <button
              type="button"
              className="btn btn-primary"
              onClick={save}
              disabled={saving}
            >
              <Save size={14} />
              {saving ? 'שומר…' : 'שמור'}
            </button>
          </footer>
        </aside>
      </div>
    </Portal>
  );
}
