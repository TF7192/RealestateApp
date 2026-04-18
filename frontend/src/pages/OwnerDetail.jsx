import { useEffect, useState, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Phone,
  Mail,
  Edit3,
  Trash2,
  Save,
  AlertCircle,
  Building2,
  UserCircle,
  X,
} from 'lucide-react';
import api from '../lib/api';
import WhatsAppIcon from '../components/WhatsAppIcon';
import ConfirmDialog from '../components/ConfirmDialog';
import { PhoneField, SelectField } from '../components/SmartFields';
import { useToast } from '../lib/toast';
import { telUrl, waUrl } from '../lib/waLink';
import './OwnerDetail.css';

const RELATIONSHIP_OPTIONS = [
  'בעל יחיד',
  'בעלים משותפים',
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
      <div className="owner-detail-page app-wide-cap">
        <div className="od-skel">טוען…</div>
      </div>
    );
  }

  if (error || !owner) {
    return (
      <div className="owner-detail-page app-wide-cap">
        <div className="od-error">
          <AlertCircle size={20} />
          <span>{error || 'בעל הנכס לא נמצא'}</span>
          <Link to="/owners" className="btn btn-secondary btn-sm">חזור לבעלי נכסים</Link>
        </div>
      </div>
    );
  }

  const properties = owner.properties || [];

  return (
    <div className="owner-detail-page app-wide-cap">
      <div className="od-toolbar">
        <div className="od-crumb">
          <Link to="/owners" className="od-crumb-link">
            <ArrowRight size={16} />
            בעלי נכסים
          </Link>
          <span className="od-crumb-sep">/</span>
          <strong className="od-crumb-name">{owner.name}</strong>
          <span className="od-status">
            <Building2 size={12} />
            {owner.propertyCount ?? properties.length} נכסים
          </span>
        </div>
        <div className="od-toolbar-actions">
          {owner.phone && (
            <>
              <a href={telUrl(owner.phone)} className="btn btn-secondary btn-sm" title={owner.phone}>
                <Phone size={14} />
                התקשר
              </a>
              <a
                href={waUrl(owner.phone, '')}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-secondary btn-sm"
                title="וואטסאפ"
              >
                <WhatsAppIcon size={14} className="wa-green" />
                וואטסאפ
              </a>
            </>
          )}
          {owner.email && (
            <a href={`mailto:${owner.email}`} className="btn btn-secondary btn-sm" title={owner.email}>
              <Mail size={14} />
              אימייל
            </a>
          )}
          <button className="btn btn-danger btn-sm" onClick={() => setConfirmDelete(true)}>
            <Trash2 size={14} />
            מחק
          </button>
        </div>
      </div>

      <div className="od-grid">
        <OwnerEditForm owner={owner} onSaved={onSaved} toast={toast} />
        <OwnerPropertiesPanel properties={properties} />
      </div>

      {confirmDelete && (
        <ConfirmDialog
          title="מחיקת בעל נכס"
          message={`למחוק את "${owner.name}"? הפעולה אינה הפיכה. הנכסים של בעלים זה לא ימחקו, אך הקישור ייעלם.`}
          confirmLabel="מחק בעל"
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
    <div className="od-form-col">
      <div className="od-section">
        <h3 className="od-section-title">
          <UserCircle size={16} />
          פרטי בעל הנכס
        </h3>
        {err && (
          <div className="od-form-error">
            <AlertCircle size={14} />
            {err}
          </div>
        )}

        <div className="od-form-grid">
          <div className="form-group">
            <label className="form-label">שם מלא</label>
            <input
              className="form-input"
              value={form.name}
              onChange={(e) => update('name', e.target.value)}
            />
          </div>
          <div className="form-group">
            <label className="form-label">טלפון</label>
            <PhoneField value={form.phone} onChange={(v) => update('phone', v)} />
          </div>
          <div className="form-group">
            <label className="form-label">אימייל</label>
            <input
              type="email"
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
              className="form-textarea"
              rows={4}
              value={form.notes}
              onChange={(e) => update('notes', e.target.value)}
              placeholder="פרטים נוספים על הבעלים…"
            />
          </div>
        </div>

        <div className="od-form-actions">
          <button className="btn btn-primary" onClick={save} disabled={busy}>
            <Save size={16} />
            {busy ? 'שומר…' : 'שמור שינויים'}
          </button>
        </div>
      </div>
    </div>
  );
}

function OwnerPropertiesPanel({ properties }) {
  return (
    <div className="od-properties-col">
      <div className="od-section od-properties-section">
        <h3 className="od-section-title">
          <Building2 size={16} />
          נכסים בבעלות ({properties.length})
        </h3>

        {properties.length === 0 ? (
          <div className="od-properties-empty">
            <p>עוד אין נכסים בבעלות זה — צרף נכס מתוך עמוד הקליטה.</p>
            <Link to="/properties/new" className="btn btn-secondary btn-sm">
              קליטת נכס
            </Link>
          </div>
        ) : (
          <ul className="od-properties-list">
            {properties.map((p) => (
              <li key={p.id} className="od-property-item">
                <Link to={`/properties/${p.id}`} className="od-property-link">
                  <span className="od-property-title">
                    {[p.street, p.city].filter(Boolean).join(', ') || 'נכס ללא כתובת'}
                  </span>
                  <span className="od-property-meta">
                    {[p.type, p.rooms ? `${p.rooms} חד׳` : null, p.sqm ? `${p.sqm} מ״ר` : null]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                  {p.marketingPrice ? (
                    <span className="od-property-price">{formatPrice(p.marketingPrice)}</span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
