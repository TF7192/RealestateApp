import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Save,
  Upload,
  X,
  AlertCircle,
  CheckCircle2,
  Home,
  Briefcase,
  User as UserIcon,
  MapPin,
  UserCheck,
  RefreshCcw,
  Building2,
} from 'lucide-react';
import api from '../lib/api';
import { useToast } from '../lib/toast';
import { cityNames, streetNames } from '../data/mockData';
import StickyActionBar from '../components/StickyActionBar';
import OwnerPicker from '../components/OwnerPicker';
import { RoomsChips, DateQuickChips, SuggestPicker } from '../components/MobilePickers';
import { useDraftAutosave, readDraft } from '../hooks/mobile';
import {
  inputPropsForName,
  inputPropsForAddress,
  inputPropsForCity,
} from '../lib/inputProps';
import { NumberField, PhoneField, SelectField } from '../components/SmartFields';
import { getPositionDetailed } from '../native/geolocation';
import './Forms.css';
import './NewProperty.css';

const DRAFT_KEY = 'estia-draft:new-property';

const INITIAL_FORM = {
  // Step 1 essentials
  assetClass: 'RESIDENTIAL',
  category: 'SALE',
  street: '',
  city: '',
  owner: '',
  ownerPhone: '',
  ownerEmail: '',
  propertyOwnerId: null,
  pickedOwner: null,
  marketingPrice: null,
  sqm: null,

  // Step 2 fields
  type: 'דירה',
  rooms: '',
  floor: null,
  totalFloors: null,
  balconySize: null,
  buildingAge: null,
  renovated: '',
  vacancyDate: '',
  sector: 'כללי',
  airDirections: '',
  notes: '',
  closingPrice: null,
  sqmArnona: null,
  exclusiveStart: '',
  exclusiveEnd: '',
  elevator: false,
  parking: false,
  storage: false,
  ac: false,
  safeRoom: false,
};

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
  const [geoLoading, setGeoLoading] = useState(false);
  const [draftBanner, setDraftBanner] = useState(null); // {form, step}
  const [ownerPickerOpen, setOwnerPickerOpen] = useState(false);

  const [form, setForm] = useState(INITIAL_FORM);

  // ── Draft autosave + restore banner ────────────────────────────────
  const { clear: clearDraft } = useDraftAutosave(DRAFT_KEY, { form, step });

  useEffect(() => {
    const draft = readDraft(DRAFT_KEY);
    if (draft && draft.form && (draft.form.street || draft.form.city || draft.form.owner)) {
      setDraftBanner(draft);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const restoreDraft = () => {
    if (draftBanner?.form) {
      setForm({ ...INITIAL_FORM, ...draftBanner.form });
      // Don't jump to step 2 without a saved propertyId — keep user on step 1.
      setDraftBanner(null);
      toast.info('הטיוטה שוחזרה');
    }
  };
  const discardDraft = () => {
    clearDraft();
    setDraftBanner(null);
    toast.info('הטיוטה נמחקה');
  };

  const isCommercial = form.assetClass === 'COMMERCIAL';
  const update = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const setAssetClass = (cls) => {
    setForm((p) => ({
      ...p,
      assetClass: cls,
      type: cls === 'COMMERCIAL' ? 'משרד' : 'דירה',
    }));
  };

  // ── Geolocation prefill ────────────────────────────────────────────
  // Uses our backend's /api/geo/reverse proxy so Nominatim accepts the
  // request (it requires a User-Agent header browsers can't set) and so
  // we can normalize the locality field for Israeli addresses.
  const useCurrentLocation = async () => {
    if (geoLoading) return;
    setGeoLoading(true);
    try {
      const r = await getPositionDetailed({ timeoutMs: 12000 });
      if (!r.ok) {
        const reasons = {
          denied:      'אין הרשאה למיקום — אפשר/י את ההרשאה בהגדרות הדפדפן',
          unavailable: 'המכשיר לא הצליח לקבוע מיקום — נסה שוב בחוץ או ליד חלון',
          timeout:     'איתור המיקום נמשך זמן רב מדי — נסה שוב',
          unsupported: 'המכשיר לא תומך באיתור מיקום',
          unknown:     'איתור המיקום נכשל',
        };
        toast.error(reasons[r.reason] || 'איתור המיקום נכשל');
        return;
      }

      const { latitude, longitude } = r.position;
      let geo;
      try {
        geo = await api.reverseGeocode(latitude, longitude);
      } catch (e) {
        toast.error('שירות המיקום אינו זמין כרגע — נסה שוב מאוחר יותר');
        return;
      }

      const city = geo?.city || '';
      const street = geo?.street || '';
      if (!city && !street) {
        toast.error('לא נמצאה כתובת בנקודה זו — מלא ידנית');
        return;
      }
      if (city)   update('city', city);
      if (street) update('street', street);
      toast.success(`המיקום הוזן: ${[street, city].filter(Boolean).join(', ')}`);
    } catch (e) {
      toast.error('איתור המיקום נכשל');
    } finally {
      setGeoLoading(false);
    }
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
      const hasOwnerLink = !!form.propertyOwnerId;
      if (!hasOwnerLink && (!form.owner || !form.ownerPhone)) {
        throw new Error('חסרים פרטי בעל הנכס');
      }
      if (!form.marketingPrice) throw new Error('חסר מחיר שיווק');
      if (!form.sqm) throw new Error('חסר שטח במ״ר');
      setSubmitting(true);
      const body = {
        assetClass: form.assetClass,
        category: form.category,
        type: form.type,
        street: form.street,
        city: form.city,
        marketingPrice: Number(form.marketingPrice) || 0,
        sqm: Number(form.sqm) || 0,
      };
      if (hasOwnerLink) {
        body.propertyOwnerId = form.propertyOwnerId;
      } else {
        body.owner = form.owner;
        body.ownerPhone = form.ownerPhone;
        if (form.ownerEmail) body.ownerEmail = form.ownerEmail;
      }
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
        rooms: form.rooms !== '' && form.rooms != null ? Number(form.rooms) : null,
        floor: form.floor != null && form.floor !== '' ? Number(form.floor) : null,
        totalFloors: form.totalFloors != null && form.totalFloors !== '' ? Number(form.totalFloors) : null,
        balconySize: Number(form.balconySize) || 0,
        buildingAge: form.buildingAge != null && form.buildingAge !== '' ? Number(form.buildingAge) : null,
        renovated: form.renovated || null,
        vacancyDate: form.vacancyDate || null,
        sector: form.sector || null,
        airDirections: form.airDirections || null,
        notes: form.notes || null,
        closingPrice: form.closingPrice != null && form.closingPrice !== '' ? Number(form.closingPrice) : null,
        sqmArnona: form.sqmArnona != null && form.sqmArnona !== '' ? Number(form.sqmArnona) : null,
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
      clearDraft();
      toast.success('הנכס נשמר במלואו');
      navigate(`/properties/${propertyId}`);
    } catch (e2) {
      setError(e2.message || 'שמירה נכשלה');
      setSubmitting(false);
    }
  };

  const skipStep2 = () => {
    clearDraft();
    toast.info('דילגת על ההשלמה — ניתן להשלים מעמוד הנכס');
    navigate(propertyId ? `/properties/${propertyId}` : '/properties');
  };

  return (
    <div className="form-page np-wizard has-sticky-bar">
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

      {draftBanner && (
        <div className="draft-banner animate-in" role="status">
          <span>נמצאה טיוטה שנשמרה</span>
          <div className="draft-banner-actions">
            <button type="button" className="btn btn-secondary btn-sm" onClick={restoreDraft}>שחזר</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={discardDraft}>מחק</button>
          </div>
        </div>
      )}

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
        <form id="np-form-step1" onSubmit={saveStep1} className="intake-form animate-in animate-in-delay-2">
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
                <NumberField
                  unit="₪"
                  placeholder="2,500,000"
                  showShort
                  value={form.marketingPrice}
                  onChange={(v) => update('marketingPrice', v)}
                  required
                />
              </div>
            </div>
          </div>

          <div className="form-section">
            <h3 className="form-section-title">מיקום ושטח</h3>
            <div className="form-group np-geo-group">
              <button
                type="button"
                className="np-geo-btn"
                onClick={useCurrentLocation}
                disabled={geoLoading}
              >
                <MapPin size={14} />
                {geoLoading ? 'מאתר מיקום…' : 'השתמש במיקום הנוכחי'}
              </button>
            </div>
            <div className="form-row form-row-3">
              <div className="form-group">
                <label className="form-label">רחוב ומספר</label>
                <SuggestPicker
                  options={streetNames}
                  value={form.street}
                  onChange={(v) => update('street', v)}
                  placeholder="לדוגמה: הרצל 15"
                  label="רחוב"
                  inputProps={{ ...inputPropsForAddress(), required: true }}
                />
              </div>
              <div className="form-group">
                <label className="form-label">עיר</label>
                <SuggestPicker
                  options={cityNames}
                  value={form.city}
                  onChange={(v) => update('city', v)}
                  placeholder="רמלה"
                  label="עיר"
                  inputProps={{ ...inputPropsForCity(), required: true }}
                />
              </div>
              <div className="form-group">
                <label className="form-label">שטח (מ״ר)</label>
                <NumberField
                  unit="מ״ר"
                  placeholder="120"
                  value={form.sqm}
                  onChange={(v) => update('sqm', v)}
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

            {form.pickedOwner ? (
              <div className="np-owner-card">
                <div className="np-owner-card-avatar" aria-hidden="true">
                  {(form.pickedOwner.name || '?').charAt(0)}
                </div>
                <div className="np-owner-card-meta">
                  <strong>{form.pickedOwner.name}</strong>
                  <span>{form.pickedOwner.phone || '—'}</span>
                  {form.pickedOwner.email && <small>{form.pickedOwner.email}</small>}
                </div>
                <div className="np-owner-card-actions">
                  {(form.pickedOwner.propertyCount ?? 0) > 0 && (
                    <span className="np-owner-pill">
                      <Building2 size={11} />
                      <strong>{form.pickedOwner.propertyCount}</strong>
                      <span>נכסים</span>
                    </span>
                  )}
                  <button
                    type="button"
                    className="np-owner-swap"
                    onClick={() => setOwnerPickerOpen(true)}
                  >
                    <RefreshCcw size={12} />
                    החלף בעל
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="np-owner-pick-row">
                  <button
                    type="button"
                    className="btn btn-primary np-owner-pick-btn"
                    onClick={() => setOwnerPickerOpen(true)}
                  >
                    <UserCheck size={14} />
                    בחר בעל קיים
                  </button>
                  <span className="np-owner-pick-or">או הזן ידנית למטה</span>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">שם מלא</label>
                    <input
                      {...inputPropsForName()}
                      className="form-input"
                      value={form.owner}
                      onChange={(e) => update('owner', e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">טלפון</label>
                    <PhoneField
                      value={form.ownerPhone}
                      onChange={(v) => update('ownerPhone', v)}
                    />
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="form-actions form-actions-desktop">
            <button type="submit" className="btn btn-primary btn-lg" disabled={submitting}>
              <Save size={18} />
              {submitting ? 'שומר…' : 'שמור והמשך'}
            </button>
            <Link to="/properties" className="btn btn-secondary btn-lg">ביטול</Link>
          </div>
        </form>
      ) : (
        <form id="np-form-step2" onSubmit={saveStep2} className="intake-form animate-in animate-in-delay-2">
          <div className="form-section">
            <h3 className="form-section-title">מאפיינים</h3>
            <div className="form-row form-row-4">
              <div className="form-group">
                <label className="form-label">סוג</label>
                <SelectField
                  value={form.type}
                  onChange={(v) => update('type', v)}
                  options={isCommercial
                    ? ['משרד', 'חנות', 'מחסן', 'מבנה תעשייתי', 'קליניקה', 'אולם']
                    : ['דירה', 'פנטהאוז', 'קוטג׳', 'דו-משפחתי', 'מגרש', 'דירת גן']}
                />
              </div>
              <div className="form-group">
                <label className="form-label">קומה</label>
                <NumberField
                  placeholder="3"
                  min={-3}
                  max={100}
                  value={form.floor}
                  onChange={(v) => update('floor', v)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">מתוך</label>
                <NumberField
                  placeholder="8"
                  min={1}
                  max={120}
                  value={form.totalFloors}
                  onChange={(v) => update('totalFloors', v)}
                />
              </div>
            </div>
            {!isCommercial && (
              <div className="form-group">
                <RoomsChips
                  value={form.rooms}
                  onChange={(v) => update('rooms', v)}
                  label="מספר חדרים"
                />
              </div>
            )}
            <div className="form-row form-row-4">
              {!isCommercial && (
                <div className="form-group">
                  <label className="form-label">מרפסת (מ״ר)</label>
                  <NumberField
                    unit="מ״ר"
                    placeholder="12"
                    min={0}
                    max={200}
                    value={form.balconySize}
                    onChange={(v) => update('balconySize', v)}
                  />
                </div>
              )}
              <div className="form-group">
                <label className="form-label">בניין בן</label>
                <NumberField
                  placeholder="15"
                  min={0}
                  max={200}
                  value={form.buildingAge}
                  onChange={(v) => update('buildingAge', v)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">מצב</label>
                <SelectField
                  value={form.renovated}
                  onChange={(v) => update('renovated', v)}
                  placeholder="בחר…"
                  options={['חדש מקבלן', 'משופצת', 'משופצת חלקית', 'שמורה', 'דרוש שיפוץ']}
                />
              </div>
              <div className="form-group">
                <label className="form-label">פינוי</label>
                <input type="date" className="form-input" value={form.vacancyDate} onChange={(e) => update('vacancyDate', e.target.value)} />
                <DateQuickChips
                  value={form.vacancyDate}
                  onChange={(v) => update('vacancyDate', v)}
                  chips={['today', '+3m', '+6m']}
                />
              </div>
            </div>
            {isCommercial && (
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">מ״ר ארנונה</label>
                  <NumberField
                    unit="מ״ר"
                    placeholder="115"
                    value={form.sqmArnona}
                    onChange={(v) => update('sqmArnona', v)}
                  />
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
                <DateQuickChips
                  value={form.exclusiveStart}
                  onChange={(v) => update('exclusiveStart', v)}
                  chips={['today']}
                />
              </div>
              <div className="form-group">
                <label className="form-label">סיום בלעדיות</label>
                <input type="date" className="form-input" value={form.exclusiveEnd} onChange={(e) => update('exclusiveEnd', e.target.value)} />
                <DateQuickChips
                  value={form.exclusiveEnd}
                  onChange={(v) => update('exclusiveEnd', v)}
                  chips={['+3m', '+6m', '+12m']}
                />
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
                capture="environment"
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

          <div className="form-actions form-actions-desktop">
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

      {/* Sticky save bar on mobile — mirrors the in-form primary actions */}
      <StickyActionBar visible>
        {step === 1 ? (
          <>
            <button
              type="submit"
              form="np-form-step1"
              className="btn btn-primary btn-lg"
              disabled={submitting}
            >
              <Save size={18} />
              {submitting ? 'שומר…' : 'שמור והמשך'}
            </button>
            <Link to="/properties" className="btn btn-secondary btn-lg">ביטול</Link>
          </>
        ) : (
          <>
            <button
              type="submit"
              form="np-form-step2"
              className="btn btn-primary btn-lg"
              disabled={submitting}
            >
              <Save size={18} />
              {submitting ? 'שומר…' : 'שמור וסיים'}
            </button>
            <button type="button" className="btn btn-ghost btn-lg" onClick={skipStep2}>
              דלג
            </button>
          </>
        )}
      </StickyActionBar>

      <OwnerPicker
        open={ownerPickerOpen}
        onClose={() => setOwnerPickerOpen(false)}
        onPick={(o) => {
          setForm((p) => ({
            ...p,
            propertyOwnerId: o.id,
            pickedOwner: o,
            // Clear inline fields so they don't conflict with the picked owner
            owner: '',
            ownerPhone: '',
            ownerEmail: '',
          }));
        }}
      />
    </div>
  );
}
