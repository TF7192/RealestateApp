import { useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Save,
  Upload,
  X,
  AlertCircle,
  CheckCircle2,
  Building2,
  Home,
  Briefcase,
  User as UserIcon,
} from 'lucide-react';
import api from '../lib/api';
import { useToast } from '../lib/toast';
import { cityNames, streetNames } from '../data/mockData';
import './Forms.css';
import './NewProperty.css';

/**
 * Two-step new-property wizard:
 *  Step 1 — 7 essentials, saves and creates the property.
 *  Step 2 — full marketing package (type, floor, features, photos).
 *
 * The property exists after Step 1 so an agent can capture a new listing
 * mid-call in 30 seconds and keep going later from the detail page.
 */
export default function NewProperty() {
  const navigate = useNavigate();
  const toast = useToast();
  const fileInput = useRef(null);

  const [step, setStep] = useState(1);
  const [propertyId, setPropertyId] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [photoFiles, setPhotoFiles] = useState([]);

  const [form, setForm] = useState({
    // Step 1 essentials
    assetClass: 'RESIDENTIAL',
    category: 'SALE',
    street: '',
    city: '',
    owner: '',
    ownerPhone: '',
    marketingPrice: '',
    sqm: '',

    // Step 2 fields
    type: 'דירה',
    rooms: '',
    floor: '',
    totalFloors: '',
    balconySize: '',
    buildingAge: '',
    renovated: '',
    vacancyDate: '',
    sector: 'כללי',
    airDirections: '',
    notes: '',
    closingPrice: '',
    sqmArnona: '',
    exclusiveStart: '',
    exclusiveEnd: '',
    elevator: false,
    parking: false,
    storage: false,
    ac: false,
    safeRoom: false,
  });

  const isCommercial = form.assetClass === 'COMMERCIAL';
  const update = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const setAssetClass = (cls) => {
    setForm((p) => ({
      ...p,
      assetClass: cls,
      type: cls === 'COMMERCIAL' ? 'משרד' : 'דירה',
    }));
  };

  // ── Photo helpers ──────────────────────────────────────────────────
  const addFiles = (fileList) => {
    const imgs = Array.from(fileList || [])
      .filter((f) => f.type.startsWith('image/'))
      .map((file) => ({ file, url: URL.createObjectURL(file) }));
    setPhotoFiles((prev) => [...prev, ...imgs]);
  };
  const removePhoto = (idx) => {
    setPhotoFiles((prev) => {
      const next = [...prev];
      const [removed] = next.splice(idx, 1);
      if (removed) URL.revokeObjectURL(removed.url);
      return next;
    });
  };

  // ── Step 1 save: creates the property ──────────────────────────────
  const saveStep1 = async (e) => {
    e?.preventDefault?.();
    setError(null);
    try {
      if (!form.street || !form.city) throw new Error('חסר רחוב ועיר');
      if (!form.owner || !form.ownerPhone) throw new Error('חסרים פרטי בעל הנכס');
      if (!form.marketingPrice) throw new Error('חסר מחיר שיווק');
      if (!form.sqm) throw new Error('חסר שטח במ״ר');
      setSubmitting(true);
      const body = {
        assetClass: form.assetClass,
        category: form.category,
        type: form.type,
        street: form.street,
        city: form.city,
        owner: form.owner,
        ownerPhone: form.ownerPhone,
        marketingPrice: Number(form.marketingPrice) || 0,
        sqm: Number(form.sqm) || 0,
      };
      const res = await api.createProperty(body);
      const id = res.property?.id;
      setPropertyId(id);
      toast.success('הנכס נשמר · המשך להשלמת הפרטים');
      setStep(2);
    } catch (e2) {
      setError(e2.message || 'שמירה נכשלה');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Step 2 save: patches + uploads photos ──────────────────────────
  const saveStep2 = async (e) => {
    e?.preventDefault?.();
    if (!propertyId) return;
    setError(null);
    setSubmitting(true);
    try {
      const patch = {
        type: form.type,
        rooms: form.rooms !== '' ? Number(form.rooms) : null,
        floor: form.floor !== '' ? Number(form.floor) : null,
        totalFloors: form.totalFloors !== '' ? Number(form.totalFloors) : null,
        balconySize: Number(form.balconySize) || 0,
        buildingAge: form.buildingAge !== '' ? Number(form.buildingAge) : null,
        renovated: form.renovated || null,
        vacancyDate: form.vacancyDate || null,
        sector: form.sector || null,
        airDirections: form.airDirections || null,
        notes: form.notes || null,
        closingPrice: form.closingPrice !== '' ? Number(form.closingPrice) : null,
        sqmArnona: form.sqmArnona !== '' ? Number(form.sqmArnona) : null,
        exclusiveStart: form.exclusiveStart ? new Date(form.exclusiveStart).toISOString() : null,
        exclusiveEnd: form.exclusiveEnd ? new Date(form.exclusiveEnd).toISOString() : null,
        elevator: form.elevator,
        parking: form.parking,
        storage: form.storage,
        ac: form.ac,
        safeRoom: form.safeRoom,
      };
      await api.updateProperty(propertyId, patch);

      // Upload photos sequentially
      for (const p of photoFiles) {
        try {
          // eslint-disable-next-line no-await-in-loop
          await api.uploadPropertyImage(propertyId, p.file);
        } catch (_) { /* continue on per-file failure */ }
      }
      photoFiles.forEach((p) => URL.revokeObjectURL(p.url));
      toast.success('הנכס נשמר במלואו');
      navigate(`/properties/${propertyId}`);
    } catch (e2) {
      setError(e2.message || 'שמירה נכשלה');
      setSubmitting(false);
    }
  };

  const skipStep2 = () => {
    toast.info('דילגת על ההשלמה — ניתן להשלים מעמוד הנכס');
    navigate(propertyId ? `/properties/${propertyId}` : '/properties');
  };

  return (
    <div className="form-page np-wizard">
      <Link to="/properties" className="back-link animate-in">
        <ArrowRight size={16} />
        חזרה לנכסים
      </Link>

      <div className="page-header animate-in">
        <div className="page-header-info">
          <h2>{step === 1 ? 'נכס חדש' : 'השלמת פרטי הנכס'}</h2>
          <p>
            {step === 1
              ? 'מינימום לקליטה מהירה — אפשר להמשיך מאוחר יותר'
              : `המשך לעבוד על ${form.street}, ${form.city}`}
          </p>
        </div>
      </div>

      <div className="np-steps animate-in animate-in-delay-1">
        <div className={`np-step ${step === 1 ? 'active' : step > 1 ? 'done' : ''}`}>
          <span className="np-step-no">{step > 1 ? <CheckCircle2 size={14} /> : '1'}</span>
          <div>
            <strong>יסודות</strong>
            <span>7 שדות · שמירה יוצרת את הנכס</span>
          </div>
        </div>
        <div className="np-step-line" />
        <div className={`np-step ${step === 2 ? 'active' : ''}`}>
          <span className="np-step-no">2</span>
          <div>
            <strong>חבילת שיווק</strong>
            <span>מאפיינים, תמונות, בלעדיות · לא חובה עכשיו</span>
          </div>
        </div>
      </div>

      {error && (
        <div className="np-error animate-in">
          <AlertCircle size={14} />
          {error}
        </div>
      )}

      {step === 1 ? (
        <form onSubmit={saveStep1} className="intake-form animate-in animate-in-delay-2">
          <div className="form-section">
            <h3 className="form-section-title">סיווג ומחיר</h3>
            <div className="form-row form-row-3">
              <div className="form-group">
                <label className="form-label">סוג נכס</label>
                <div className="toggle-group">
                  <button
                    type="button"
                    className={`toggle-btn ${!isCommercial ? 'active' : ''}`}
                    onClick={() => setAssetClass('RESIDENTIAL')}
                  >
                    <Home size={14} /> מגורים
                  </button>
                  <button
                    type="button"
                    className={`toggle-btn ${isCommercial ? 'active' : ''}`}
                    onClick={() => setAssetClass('COMMERCIAL')}
                  >
                    <Briefcase size={14} /> מסחרי
                  </button>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">מכירה / השכרה</label>
                <div className="toggle-group">
                  <button
                    type="button"
                    className={`toggle-btn ${form.category === 'SALE' ? 'active' : ''}`}
                    onClick={() => update('category', 'SALE')}
                  >
                    מכירה
                  </button>
                  <button
                    type="button"
                    className={`toggle-btn ${form.category === 'RENT' ? 'active' : ''}`}
                    onClick={() => update('category', 'RENT')}
                  >
                    השכרה
                  </button>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">מחיר שיווק</label>
                <input
                  type="number"
                  className="form-input"
                  placeholder="₪"
                  value={form.marketingPrice}
                  onChange={(e) => update('marketingPrice', e.target.value)}
                  required
                />
              </div>
            </div>
          </div>

          <div className="form-section">
            <h3 className="form-section-title">מיקום ושטח</h3>
            <div className="form-row form-row-3">
              <div className="form-group">
                <label className="form-label">רחוב ומספר</label>
                <input
                  className="form-input"
                  placeholder="לדוגמה: הרצל 15"
                  value={form.street}
                  onChange={(e) => update('street', e.target.value)}
                  list="np-street-list"
                  required
                />
                <datalist id="np-street-list">
                  {streetNames.map((s) => (<option key={s} value={s} />))}
                </datalist>
              </div>
              <div className="form-group">
                <label className="form-label">עיר</label>
                <input
                  className="form-input"
                  placeholder="רמלה"
                  value={form.city}
                  onChange={(e) => update('city', e.target.value)}
                  list="np-city-list"
                  required
                />
                <datalist id="np-city-list">
                  {cityNames.map((c) => (<option key={c} value={c} />))}
                </datalist>
              </div>
              <div className="form-group">
                <label className="form-label">שטח (מ״ר)</label>
                <input
                  type="number"
                  className="form-input"
                  value={form.sqm}
                  onChange={(e) => update('sqm', e.target.value)}
                  required
                />
              </div>
            </div>
          </div>

          <div className="form-section">
            <h3 className="form-section-title">
              <UserIcon size={14} style={{ verticalAlign: 'middle', marginLeft: 6 }} />
              בעל הנכס
            </h3>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">שם מלא</label>
                <input
                  className="form-input"
                  value={form.owner}
                  onChange={(e) => update('owner', e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">טלפון</label>
                <input
                  className="form-input"
                  placeholder="050-1234567"
                  value={form.ownerPhone}
                  onChange={(e) => update('ownerPhone', e.target.value)}
                  required
                />
              </div>
            </div>
          </div>

          <div className="form-actions">
            <button type="submit" className="btn btn-primary btn-lg" disabled={submitting}>
              <Save size={18} />
              {submitting ? 'שומר…' : 'שמור והמשך'}
            </button>
            <Link to="/properties" className="btn btn-secondary btn-lg">ביטול</Link>
          </div>
        </form>
      ) : (
        <form onSubmit={saveStep2} className="intake-form animate-in animate-in-delay-2">
          <div className="form-section">
            <h3 className="form-section-title">מאפיינים</h3>
            <div className="form-row form-row-4">
              <div className="form-group">
                <label className="form-label">סוג</label>
                <select className="form-select" value={form.type} onChange={(e) => update('type', e.target.value)}>
                  {isCommercial
                    ? ['משרד', 'חנות', 'מחסן', 'מבנה תעשייתי', 'קליניקה', 'אולם'].map((t) => <option key={t}>{t}</option>)
                    : ['דירה', 'פנטהאוז', 'קוטג׳', 'דו-משפחתי', 'מגרש', 'דירת גן'].map((t) => <option key={t}>{t}</option>)}
                </select>
              </div>
              {!isCommercial && (
                <div className="form-group">
                  <label className="form-label">חדרים</label>
                  <input type="number" step="0.5" className="form-input" value={form.rooms} onChange={(e) => update('rooms', e.target.value)} />
                </div>
              )}
              <div className="form-group">
                <label className="form-label">קומה</label>
                <input type="number" className="form-input" value={form.floor} onChange={(e) => update('floor', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">מתוך</label>
                <input type="number" className="form-input" value={form.totalFloors} onChange={(e) => update('totalFloors', e.target.value)} />
              </div>
            </div>
            <div className="form-row form-row-4">
              {!isCommercial && (
                <div className="form-group">
                  <label className="form-label">מרפסת (מ״ר)</label>
                  <input type="number" className="form-input" value={form.balconySize} onChange={(e) => update('balconySize', e.target.value)} />
                </div>
              )}
              <div className="form-group">
                <label className="form-label">בניין בן</label>
                <input type="number" className="form-input" value={form.buildingAge} onChange={(e) => update('buildingAge', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">מצב</label>
                <select className="form-select" value={form.renovated} onChange={(e) => update('renovated', e.target.value)}>
                  <option value="">בחר…</option>
                  <option>חדש מקבלן</option>
                  <option>משופצת</option>
                  <option>משופצת חלקית</option>
                  <option>שמורה</option>
                  <option>דרוש שיפוץ</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">פינוי</label>
                <input className="form-input" placeholder="מיידי / 3 חודשים" value={form.vacancyDate} onChange={(e) => update('vacancyDate', e.target.value)} />
              </div>
            </div>
            {isCommercial && (
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">מ״ר ארנונה</label>
                  <input type="number" className="form-input" value={form.sqmArnona} onChange={(e) => update('sqmArnona', e.target.value)} />
                </div>
              </div>
            )}
            <div className="checkbox-grid">
              {[
                { key: 'elevator', label: 'מעלית' },
                { key: 'parking', label: 'חניה' },
                { key: 'storage', label: 'מחסן' },
                { key: 'ac', label: 'מזגנים' },
                ...(!isCommercial ? [{ key: 'safeRoom', label: 'ממ״ד' }] : []),
              ].map(({ key, label }) => (
                <label key={key} className="checkbox-item">
                  <input type="checkbox" checked={form[key]} onChange={(e) => update(key, e.target.checked)} />
                  <span className="checkbox-custom" />
                  {label}
                </label>
              ))}
            </div>
          </div>

          <div className="form-section">
            <h3 className="form-section-title">בלעדיות והערות</h3>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">תחילת בלעדיות</label>
                <input type="date" className="form-input" value={form.exclusiveStart} onChange={(e) => update('exclusiveStart', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">סיום בלעדיות</label>
                <input type="date" className="form-input" value={form.exclusiveEnd} onChange={(e) => update('exclusiveEnd', e.target.value)} />
              </div>
            </div>
            <div className="form-group">
              <textarea className="form-textarea" rows={3} placeholder="הערות נוספות על הנכס..." value={form.notes} onChange={(e) => update('notes', e.target.value)} />
            </div>
          </div>

          <div className="form-section">
            <h3 className="form-section-title">תמונות</h3>
            <div
              className={`upload-area ${dragOver ? 'is-over' : ''}`}
              onClick={() => fileInput.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files); }}
            >
              <Upload size={28} />
              <p>גרור תמונות או לחץ להעלאה</p>
              <span>אפשר להעלות מספר קבצים</span>
              <input
                ref={fileInput}
                type="file"
                accept="image/*"
                multiple
                style={{ display: 'none' }}
                onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }}
              />
            </div>
            {photoFiles.length > 0 && (
              <div className="np-photo-strip">
                {photoFiles.map((p, i) => (
                  <div key={p.url} className={`np-photo ${i === 0 ? 'is-cover' : ''}`}>
                    <img src={p.url} alt={`תמונה ${i + 1}`} />
                    <button type="button" className="np-photo-remove" onClick={() => removePhoto(i)}>
                      <X size={12} />
                    </button>
                    {i === 0 && <span className="np-photo-cover">שער</span>}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="form-actions">
            <button type="submit" className="btn btn-primary btn-lg" disabled={submitting}>
              <Save size={18} />
              {submitting ? 'שומר…' : 'שמור וסיים'}
            </button>
            <button type="button" className="btn btn-ghost btn-lg" onClick={skipStep2}>
              דלג להמשך מאוחר יותר
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
