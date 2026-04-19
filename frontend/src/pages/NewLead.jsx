import { useState, useMemo, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Save, Clipboard, X } from 'lucide-react';
import { cityNames, streetNames } from '../data/mockData';
import { useToast } from '../lib/toast';
import StickyActionBar from '../components/StickyActionBar';
import { RoomsChips, SuggestPicker } from '../components/MobilePickers';
import { useDraftAutosave, readDraft, useClipboardPhone } from '../hooks/mobile';
import { relLabel } from '../lib/relativeDate';
import {
  inputPropsForName,
  inputPropsForCity,
  inputPropsForAddress,
} from '../lib/inputProps';
import { PhoneField, PriceRange, Segmented, SelectField } from '../components/SmartFields';
import './Forms.css';

const DRAFT_KEY = 'estia-draft:new-lead';

const INITIAL_FORM = {
  name: '',
  phone: '',
  interestType: 'פרטי',
  lookingFor: 'buy',
  city: '',
  street: '',
  roomsMin: '',
  roomsMax: '',
  priceMin: null,
  priceMax: null,
  preApproval: false,
  source: '',
  sector: 'כללי',
  balconyRequired: false,
  schoolProximity: '',
  parkingRequired: false,
  elevatorRequired: false,
  safeRoomRequired: false,
  acRequired: false,
  storageRequired: false,
  notes: '',
};

export default function NewLead() {
  const navigate = useNavigate();
  const toast = useToast();
  const [form, setForm] = useState(INITIAL_FORM);
  const [draftBanner, setDraftBanner] = useState(null);
  const [clipboardSuggestion, setClipboardSuggestion] = useState(null);
  const [clipboardDismissed, setClipboardDismissed] = useState(false);
  const peekedRef = useRef(false);

  const { peek } = useClipboardPhone();
  const { clear: clearDraft } = useDraftAutosave(DRAFT_KEY, form);

  // ── Draft restore banner on mount ──────────────────────────────────
  // S16: readDraft now returns { value, savedAt }. `value` is the old
  // flat form object; savedAt is a timestamp the banner shows as
  // "נשמר לפני X".
  useEffect(() => {
    const draft = readDraft(DRAFT_KEY);
    const inner = draft?.value;
    if (inner && (inner.name || inner.phone || inner.city)) {
      setDraftBanner({ ...inner, __savedAt: draft.savedAt });
    }
  }, []);

  const restoreDraft = () => {
    if (draftBanner) {
      const { __savedAt, ...formData } = draftBanner;
      setForm({ ...INITIAL_FORM, ...formData });
      setDraftBanner(null);
      toast.info('הטיוטה שוחזרה');
    }
  };
  const discardDraft = () => {
    clearDraft();
    setDraftBanner(null);
    toast.info('הטיוטה נמחקה');
  };

  // ── Clipboard phone auto-paste ─────────────────────────────────────
  const tryPeekClipboard = async () => {
    if (peekedRef.current) return;
    peekedRef.current = true;
    if (clipboardDismissed) return;
    if (form.phone) return;
    const phone = await peek();
    if (phone) setClipboardSuggestion(phone);
  };

  const acceptClipboard = () => {
    if (clipboardSuggestion) {
      update('phone', clipboardSuggestion);
      setClipboardSuggestion(null);
      toast.success('טלפון הודבק');
    }
  };
  const dismissClipboard = () => {
    setClipboardSuggestion(null);
    setClipboardDismissed(true);
  };

  const update = (field, value) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = (e) => {
    e.preventDefault();
    clearDraft();
    navigate('/leads');
  };

  // Street autocomplete is narrowed by the selected city when there's a match
  const streetOptions = useMemo(() => {
    if (!form.city) return streetNames;
    return streetNames;
  }, [form.city]);

  return (
    <div className="form-page has-sticky-bar" onFocusCapture={tryPeekClipboard} onTouchStartCapture={tryPeekClipboard}>
      <Link to="/customers" className="back-link animate-in">
        <ArrowRight size={16} />
        חזרה ללידים
      </Link>

      <div className="page-header animate-in">
        <div className="page-header-info">
          <h2>ליד חדש</h2>
          <p>הזן פרטי לקוח מתעניין</p>
        </div>
      </div>

      {draftBanner && (
        <div className="draft-banner animate-in" role="status">
          <span>
            נמצאה טיוטה שנשמרה
            {draftBanner.__savedAt && (
              <span className="draft-banner-age"> · {relLabel(draftBanner.__savedAt)}</span>
            )}
          </span>
          <div className="draft-banner-actions">
            <button type="button" className="btn btn-secondary btn-sm" onClick={restoreDraft}>שחזר</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={discardDraft}>מחק</button>
          </div>
        </div>
      )}

      {clipboardSuggestion && (
        <div className="clipboard-chip animate-in" role="status">
          <button type="button" className="clipboard-chip-main" onClick={acceptClipboard}>
            <Clipboard size={14} />
            <span>{clipboardSuggestion} מהלוח — הוסף</span>
          </button>
          <button type="button" className="clipboard-chip-dismiss" aria-label="סגור" onClick={dismissClipboard}>
            <X size={14} />
          </button>
        </div>
      )}

      <form id="lead-form" onSubmit={handleSubmit} className="intake-form animate-in animate-in-delay-1">
        <div className="form-section">
          <h3 className="form-section-title">פרטים אישיים</h3>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">שם הלקוח</label>
              <input
                {...inputPropsForName()}
                className="form-input"
                placeholder="שם מלא"
                value={form.name}
                onChange={(e) => update('name', e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">טלפון</label>
              <PhoneField
                value={form.phone}
                onChange={(v) => update('phone', v)}
              />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">מקור הליד</label>
              <SelectField
                value={form.source}
                onChange={(v) => update('source', v)}
                placeholder="בחר מקור..."
                options={['פייסבוק', 'יד 2', 'אתר', 'הפניה', 'הפניה מלקוח', 'סיור סוכנים', 'בית פתוח', 'שלט', 'אחר']}
              />
            </div>
            <div className="form-group">
              <label className="form-label">סוג התעניינות</label>
              <Segmented
                value={form.interestType}
                onChange={(v) => update('interestType', v)}
                options={[
                  { value: 'פרטי', label: 'פרטי' },
                  { value: 'מסחרי', label: 'מסחרי' },
                ]}
                ariaLabel="סוג התעניינות"
              />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">קנייה / שכירות</label>
              <Segmented
                value={form.lookingFor}
                onChange={(v) => update('lookingFor', v)}
                options={[
                  { value: 'buy', label: 'קנייה' },
                  { value: 'rent', label: 'שכירות' },
                ]}
                ariaLabel="קנייה או שכירות"
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
          </div>
        </div>

        <div className="form-section">
          <h3 className="form-section-title">העדפות חיפוש</h3>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">עיר מבוקשת</label>
              <SuggestPicker
                options={cityNames}
                value={form.city}
                onChange={(v) => update('city', v)}
                placeholder="תל אביב, ירושלים, חיפה…"
                label="עיר"
                inputProps={{ ...inputPropsForCity(), autoComplete: 'off' }}
              />
            </div>
            <div className="form-group">
              <label className="form-label">רחוב (אופציונלי)</label>
              <SuggestPicker
                options={streetOptions}
                value={form.street}
                onChange={(v) => update('street', v)}
                placeholder="רוטשילד, אלנבי…"
                label="רחוב"
                inputProps={{ ...inputPropsForAddress(), autoComplete: 'off' }}
              />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <RoomsChips
                value={form.roomsMin}
                onChange={(v) => update('roomsMin', v)}
                label="חדרים: מ"
              />
            </div>
            <div className="form-group">
              <RoomsChips
                value={form.roomsMax}
                onChange={(v) => update('roomsMax', v)}
                label="חדרים: עד"
              />
            </div>
          </div>
          <div className="form-group" style={{ marginBottom: 16 }}>
            <label className="form-label">טווח מחיר</label>
            <PriceRange
              minVal={form.priceMin}
              maxVal={form.priceMax}
              onChangeMin={(n) => update('priceMin', n)}
              onChangeMax={(n) => update('priceMax', n)}
              perMonth={form.lookingFor === 'rent'}
            />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">קירבה לבית ספר</label>
              <SelectField
                value={form.schoolProximity}
                onChange={(v) => update('schoolProximity', v)}
                placeholder="לא חשוב"
                options={['עד 200 מטר', 'עד 500 מטר', 'הליכה', 'עד ק״מ']}
              />
            </div>
          </div>
          <div className="checkbox-grid">
            <label className="checkbox-item">
              <input
                type="checkbox"
                checked={form.preApproval}
                onChange={(e) => update('preApproval', e.target.checked)}
              />
              <span className="checkbox-custom" />
              אישור עקרוני למשכנתא
            </label>
            <label className="checkbox-item">
              <input
                type="checkbox"
                checked={form.balconyRequired}
                onChange={(e) => update('balconyRequired', e.target.checked)}
              />
              <span className="checkbox-custom" />
              מרפסת
            </label>
            <label className="checkbox-item">
              <input
                type="checkbox"
                checked={form.parkingRequired}
                onChange={(e) => update('parkingRequired', e.target.checked)}
              />
              <span className="checkbox-custom" />
              חניה
            </label>
            <label className="checkbox-item">
              <input
                type="checkbox"
                checked={form.elevatorRequired}
                onChange={(e) => update('elevatorRequired', e.target.checked)}
              />
              <span className="checkbox-custom" />
              מעלית
            </label>
            <label className="checkbox-item">
              <input
                type="checkbox"
                checked={form.safeRoomRequired}
                onChange={(e) => update('safeRoomRequired', e.target.checked)}
              />
              <span className="checkbox-custom" />
              ממ״ד
            </label>
            <label className="checkbox-item">
              <input
                type="checkbox"
                checked={form.acRequired}
                onChange={(e) => update('acRequired', e.target.checked)}
              />
              <span className="checkbox-custom" />
              מזגנים
            </label>
            <label className="checkbox-item">
              <input
                type="checkbox"
                checked={form.storageRequired}
                onChange={(e) => update('storageRequired', e.target.checked)}
              />
              <span className="checkbox-custom" />
              מחסן
            </label>
          </div>
        </div>

        <div className="form-section">
          <h3 className="form-section-title">הערות</h3>
          <div className="form-group">
            <textarea
              className="form-textarea"
              placeholder="הערות נוספות על הלקוח..."
              rows={4}
              dir="auto"
              autoCapitalize="sentences"
              enterKeyHint="enter"
              value={form.notes}
              onChange={(e) => update('notes', e.target.value)}
            />
          </div>
        </div>

        <div className="form-actions form-actions-desktop">
          <button type="submit" className="btn btn-primary btn-lg">
            <Save size={18} />
            שמור ליד
          </button>
          <Link to="/customers" className="btn btn-secondary btn-lg">
            ביטול
          </Link>
        </div>
      </form>

      <StickyActionBar visible>
        <button type="submit" form="lead-form" className="btn btn-primary btn-lg">
          <Save size={18} />
          שמור ליד
        </button>
        <Link to="/customers" className="btn btn-secondary btn-lg">ביטול</Link>
      </StickyActionBar>
    </div>
  );
}
