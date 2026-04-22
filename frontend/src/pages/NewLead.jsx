import { useState, useMemo, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Save, Clipboard, X, Check, Loader2 } from 'lucide-react';
import api from '../lib/api';
import { cityNames, streetNames } from '../data/mockData';
import { useToast } from '../lib/toast';
import useBeforeUnload from '../hooks/useBeforeUnload';
import StickyActionBar from '../components/StickyActionBar';
import { RoomsChips, SuggestPicker } from '../components/MobilePickers';
import { useDraftAutosave, readDraft, useClipboardPhone } from '../hooks/mobile';
import { relLabel } from '../lib/relativeDate';
import {
  inputPropsForName,
  inputPropsForCity,
  inputPropsForAddress,
} from '../lib/inputProps';
import { NumberField, PhoneField, PriceRange, Segmented, SelectField } from '../components/SmartFields';
// VoiceCaptureButton removed — feature hidden until voice-to-lead
// ships production-ready (see Layout.jsx note).
import {
  CUSTOMER_STATUS_LABELS,
  QUICK_LEAD_STATUS_LABELS,
  SERIOUSNESS_LABELS,
  CUSTOMER_PURPOSE_LABELS,
  labelsToOptions,
} from '../lib/mlsLabels';
import './Forms.css';

const DRAFT_KEY = 'estia-draft:new-lead';

// K2 — purposes is a multi-select. Order matches Nadlan One's UI.
const PURPOSE_OPTIONS = Object.keys(CUSTOMER_PURPOSE_LABELS);

const INITIAL_FORM = {
  // Legacy — kept so the existing save path still works.
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

  // K1 — contact / identity block (additive, all optional).
  firstName: '',
  lastName: '',
  companyName: '',
  address: '',
  cityText: '',
  zip: '',
  primaryPhone: '',
  phone1: '',
  phone2: '',
  fax: '',
  personalId: '',
  description: '',

  // K2 — admin block.
  customerStatus: 'ACTIVE',
  commissionPct: null,
  isPrivate: false,
  purposes: [],
  seriousnessOverride: 'NONE',

  // L1 — quick lead status.
  leadStatus: 'NEW',
};

export default function NewLead() {
  const { t } = useTranslation('customers');
  const navigate = useNavigate();
  const toast = useToast();
  const [form, setForm] = useState(INITIAL_FORM);
  const [draftBanner, setDraftBanner] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  // F-14 — once we successfully save, disarm the beforeunload prompt so
  // closing the tab after a save doesn't pop "יש שינויים שלא נשמרו".
  const savedRef = useRef(false);

  const hasContent = !!(form.name || form.phone || form.email || form.city || form.notes);
  const isDirty = hasContent && !savedRef.current;
  useBeforeUnload(isDirty, t('new.unsavedWarning'));
  const [clipboardSuggestion, setClipboardSuggestion] = useState(null);
  const [clipboardDismissed, setClipboardDismissed] = useState(false);
  const peekedRef = useRef(false);

  const { peek } = useClipboardPhone();
  const { clear: clearDraft, savedAt: draftSavedAt, pending: draftPending } = useDraftAutosave(DRAFT_KEY, form);

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
      toast.info(t('new.toasts.draftRestored'));
    }
  };
  const discardDraft = () => {
    clearDraft();
    setDraftBanner(null);
    toast.info(t('new.toasts.draftDiscarded'));
  };

  // ── Clipboard phone auto-paste ─────────────────────────────────────
  // F-8 — dismiss is now 60-second TTL in sessionStorage, not permanent.
  // Agent who mis-tapped X gets the chip back on their next visit or
  // after 60s.
  const CLIP_DISMISS_KEY = 'estia-clip-dismiss:new-lead';
  const CLIP_DISMISS_TTL_MS = 60_000;
  const isClipDismissed = () => {
    try {
      const raw = sessionStorage.getItem(CLIP_DISMISS_KEY);
      if (!raw) return false;
      const ts = Number(raw);
      return Number.isFinite(ts) && Date.now() - ts < CLIP_DISMISS_TTL_MS;
    } catch { return false; }
  };

  const tryPeekClipboard = async () => {
    if (peekedRef.current) return;
    peekedRef.current = true;
    if (clipboardDismissed || isClipDismissed()) return;
    if (form.phone) return;
    const phone = await peek();
    if (phone) setClipboardSuggestion(phone);
  };

  const acceptClipboard = () => {
    if (clipboardSuggestion) {
      update('phone', clipboardSuggestion);
      setClipboardSuggestion(null);
      toast.success(t('new.toasts.phonePasted'));
    }
  };
  const dismissClipboard = () => {
    setClipboardSuggestion(null);
    setClipboardDismissed(true);
    try { sessionStorage.setItem(CLIP_DISMISS_KEY, String(Date.now())); } catch { /* ignore */ }
  };

  const update = (field, value) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  // Voice-to-lead hydrator removed with the VoiceCaptureButton. The
  // function was the only consumer; when we re-enable the feature we
  // can restore it (git blame this line for the prior implementation).

  // F-1 (P0) — the previous handler navigated without persisting the
  // lead. Wire up api.createLead and surface success/failure properly.
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    if (!form.name?.trim()) {
      toast.error(t('new.nameRequired'));
      return;
    }
    setSubmitting(true);
    try {
      // Map checkbox flags to the API's expected requirement fields.
      const body = {
        name: form.name.trim(),
        phone: form.phone || null,
        interestType: form.interestType === 'מסחרי' ? 'COMMERCIAL' : 'PRIVATE',
        lookingFor: form.lookingFor === 'rent' ? 'RENT' : 'BUY',
        city: form.city || null,
        street: form.street || null,
        roomsMin: form.roomsMin ? Number(form.roomsMin) : null,
        roomsMax: form.roomsMax ? Number(form.roomsMax) : null,
        priceMin: form.priceMin ? Number(form.priceMin) : null,
        priceMax: form.priceMax ? Number(form.priceMax) : null,
        preApproval: !!form.preApproval,
        source: form.source || null,
        sector: form.sector || 'כללי',
        schoolProximity: form.schoolProximity || null,
        balconyRequired: !!form.balconyRequired,
        parkingRequired: !!form.parkingRequired,
        elevatorRequired: !!form.elevatorRequired,
        safeRoomRequired: !!form.safeRoomRequired,
        acRequired: !!form.acRequired,
        storageRequired: !!form.storageRequired,
        notes: form.notes || null,

        // K1 — contact / identity (only send non-empty so the server
        // doesn't overwrite existing rows with "" on edit paths).
        firstName:   form.firstName?.trim()   || null,
        lastName:    form.lastName?.trim()    || null,
        companyName: form.companyName?.trim() || null,
        address:     form.address?.trim()     || null,
        cityText:    form.cityText?.trim()    || null,
        zip:         form.zip?.trim()         || null,
        primaryPhone: form.primaryPhone?.trim() || null,
        phone1:      form.phone1?.trim()      || null,
        phone2:      form.phone2?.trim()      || null,
        fax:         form.fax?.trim()         || null,
        personalId:  form.personalId?.trim()  || null,
        description: form.description?.trim() || null,

        // K2 — admin block.
        customerStatus: form.customerStatus || 'ACTIVE',
        commissionPct: form.commissionPct != null && form.commissionPct !== ''
          ? Number(form.commissionPct)
          : null,
        isPrivate: !!form.isPrivate,
        purposes: Array.isArray(form.purposes) ? form.purposes : [],
        seriousnessOverride: form.seriousnessOverride || 'NONE',

        // L1 — quick lead status.
        leadStatus: form.leadStatus || 'NEW',
      };
      const res = await api.createLead(body);
      savedRef.current = true;
      clearDraft();
      toast.success(t('new.toasts.saved'));
      const newId = res?.id || res?.lead?.id;
      if (newId) navigate(`/customers/${newId}`);
      else navigate('/customers');
    } catch (err) {
      toast.error(err?.message || t('new.errors.saveFailed'));
      setSubmitting(false);
    }
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
        {t('new.back')}
      </Link>

      <div className="page-header animate-in">
        <div className="page-header-info">
          <h2>{t('new.title')}</h2>
          <p>{t('new.subtitle')}</p>
        </div>
        {/* Voice shortcut removed with VoiceCaptureButton (see imports). */}
      </div>

      {draftBanner && (
        <div className="draft-banner animate-in" role="status">
          <span>
            {t('new.draft.found')}
            {draftBanner.__savedAt && (
              <span className="draft-banner-age"> · {relLabel(draftBanner.__savedAt)}</span>
            )}
          </span>
          <div className="draft-banner-actions">
            <button type="button" className="btn btn-secondary btn-sm" onClick={restoreDraft}>{t('new.draft.restore')}</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={discardDraft}>{t('new.draft.discard')}</button>
          </div>
        </div>
      )}

      {clipboardSuggestion && (
        <div
          className="clipboard-chip animate-in"
          role="status"
          aria-describedby="clip-chip-desc"
        >
          <button
            type="button"
            className="clipboard-chip-main clipboard-chip-main-xl"
            onClick={acceptClipboard}
          >
            <Clipboard size={14} />
            <span>{t('new.clipboard.suggestion', { phone: clipboardSuggestion })}</span>
          </button>
          <span id="clip-chip-desc" className="sr-only">
            {t('new.clipboard.srDetected')}
          </span>
          <button
            type="button"
            className="clipboard-chip-dismiss clipboard-chip-dismiss-sm"
            aria-label={t('new.clipboard.close')}
            onClick={dismissClipboard}
          >
            <X size={14} />
          </button>
        </div>
      )}

      <form id="lead-form" onSubmit={handleSubmit} className="intake-form animate-in animate-in-delay-1">
        <div className="form-section">
          <h3 className="form-section-title">{t('new.sections.personal')}</h3>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">{t('new.fields.customerName')}</label>
              <input
                {...inputPropsForName()}
                className="form-input"
                placeholder={t('new.fields.customerNamePlaceholder')}
                value={form.name}
                onChange={(e) => update('name', e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">{t('new.fields.phone')}</label>
              <PhoneField
                value={form.phone}
                onChange={(v) => update('phone', v)}
              />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">{t('new.fields.source')}</label>
              {/* F-5 — grouped sources. Flat 9-option dropdown hurt
                  scanning; "הפניה" vs "הפניה מלקוח" adjacency cost real
                  agent seconds and polluted the funnel report. */}
              <SelectField
                value={form.source}
                onChange={(v) => update('source', v)}
                placeholder={t('new.fields.sourcePlaceholder')}
                groups={[
                  { label: t('new.options.sourceGroups.online'), options: [t('new.options.sources.facebook'), t('new.options.sources.yad2'), t('new.options.sources.website')] },
                  { label: t('new.options.sourceGroups.referrals'),   options: [t('new.options.sources.referral'), t('new.options.sources.customerReferral')] },
                  { label: t('new.options.sourceGroups.physical'),    options: [t('new.options.sources.openHouse'), t('new.options.sources.sign'), t('new.options.sources.agentTour')] },
                  { label: t('new.options.sourceGroups.other'),     options: [t('new.options.sources.other')] },
                ]}
              />
            </div>
            <div className="form-group">
              <label className="form-label">{t('new.fields.interestType')}</label>
              <Segmented
                value={form.interestType}
                onChange={(v) => update('interestType', v)}
                options={[
                  { value: 'פרטי', label: t('new.options.interestType.private') },
                  { value: 'מסחרי', label: t('new.options.interestType.commercial') },
                ]}
                ariaLabel={t('new.fields.interestTypeAria')}
              />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">{t('new.fields.lookingFor')}</label>
              <Segmented
                value={form.lookingFor}
                onChange={(v) => update('lookingFor', v)}
                options={[
                  { value: 'buy', label: t('new.options.lookingFor.buy') },
                  { value: 'rent', label: t('new.options.lookingFor.rent') },
                ]}
                ariaLabel={t('new.fields.lookingForAria')}
              />
            </div>
            <div className="form-group">
              <label className="form-label">{t('new.fields.sector')}</label>
              <SelectField
                value={form.sector}
                onChange={(v) => update('sector', v)}
                options={[t('new.options.sectors.general'), t('new.options.sectors.religious'), t('new.options.sectors.haredi'), t('new.options.sectors.arab')]}
              />
            </div>
          </div>
        </div>

        <div className="form-section">
          <h3 className="form-section-title">{t('new.sections.searchPreferences')}</h3>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">{t('new.fields.city')}</label>
              <SuggestPicker
                options={cityNames}
                value={form.city}
                onChange={(v) => update('city', v)}
                placeholder={t('new.fields.cityPlaceholder')}
                label={t('new.fields.cityLabel')}
                inputProps={{ ...inputPropsForCity(), autoComplete: 'off' }}
                asyncFetch={async (q) => {
                  const res = await api.geoSearch({ q, limit: 20 });
                  return (res?.items || [])
                    .map((r) => r.city || r.label)
                    .filter(Boolean);
                }}
              />
            </div>
            <div className="form-group">
              <label className="form-label">{t('new.fields.street')}</label>
              <SuggestPicker
                options={streetOptions}
                value={form.street}
                onChange={(v) => update('street', v)}
                placeholder={t('new.fields.streetPlaceholder')}
                label={t('new.fields.streetLabel')}
                inputProps={{ ...inputPropsForAddress(), autoComplete: 'off' }}
                asyncFetch={async (q) => {
                  const res = await api.geoSearch({ q, city: form.city, limit: 20 });
                  return (res?.items || [])
                    .map((r) => r.street || r.label)
                    .filter(Boolean);
                }}
              />
            </div>
          </div>
          {/* UX review F-5.3 — one labeled "טווח חדרים" group instead
              of two stacked selectors with literal-translation labels
              ("חדרים: מ" / "חדרים: עד"). Mirrors the PriceRange pattern
              right below this. */}
          <div className="form-group" style={{ marginBottom: 16 }}>
            <label className="form-label">{t('new.fields.roomsRange')}</label>
            <div className="form-row">
              <div className="form-group">
                <RoomsChips
                  value={form.roomsMin}
                  onChange={(v) => update('roomsMin', v)}
                  label={t('new.fields.roomsFrom')}
                />
              </div>
              <div className="form-group">
                <RoomsChips
                  value={form.roomsMax}
                  onChange={(v) => update('roomsMax', v)}
                  label={t('new.fields.roomsTo')}
                />
              </div>
            </div>
          </div>
          <div className="form-group" style={{ marginBottom: 16 }}>
            <label className="form-label">{t('new.fields.priceRange')}</label>
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
              <label className="form-label">{t('new.fields.schoolProximity')}</label>
              <SelectField
                value={form.schoolProximity}
                onChange={(v) => update('schoolProximity', v)}
                placeholder={t('new.fields.schoolProximityNotImportant')}
                options={[t('new.options.school.m200'), t('new.options.school.m500'), t('new.options.school.walk'), t('new.options.school.km')]}
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
              {t('new.amenities.preApproval')}
            </label>
            <label className="checkbox-item">
              <input
                type="checkbox"
                checked={form.balconyRequired}
                onChange={(e) => update('balconyRequired', e.target.checked)}
              />
              <span className="checkbox-custom" />
              {t('new.amenities.balcony')}
            </label>
            <label className="checkbox-item">
              <input
                type="checkbox"
                checked={form.parkingRequired}
                onChange={(e) => update('parkingRequired', e.target.checked)}
              />
              <span className="checkbox-custom" />
              {t('new.amenities.parking')}
            </label>
            <label className="checkbox-item">
              <input
                type="checkbox"
                checked={form.elevatorRequired}
                onChange={(e) => update('elevatorRequired', e.target.checked)}
              />
              <span className="checkbox-custom" />
              {t('new.amenities.elevator')}
            </label>
            <label className="checkbox-item">
              <input
                type="checkbox"
                checked={form.safeRoomRequired}
                onChange={(e) => update('safeRoomRequired', e.target.checked)}
              />
              <span className="checkbox-custom" />
              {t('new.amenities.safeRoom')}
            </label>
            <label className="checkbox-item">
              <input
                type="checkbox"
                checked={form.acRequired}
                onChange={(e) => update('acRequired', e.target.checked)}
              />
              <span className="checkbox-custom" />
              {t('new.amenities.ac')}
            </label>
            <label className="checkbox-item">
              <input
                type="checkbox"
                checked={form.storageRequired}
                onChange={(e) => update('storageRequired', e.target.checked)}
              />
              <span className="checkbox-custom" />
              {t('new.amenities.storage')}
            </label>
          </div>
        </div>

        <div className="form-section">
          {/* K1 — contact / identity block. Optional: agents who only
              have a phone number can leave the whole section blank.
              L-4 — firstName / lastName removed here; the single "שם
              מלא" at the top of the form is the canonical name and the
              duplicate pair was causing confusion + split saves. */}
          <h3 className="form-section-title">{t('new.sections.extended')}</h3>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label" htmlFor="k1-company">{t('new.fields.companyName')}</label>
              <input
                id="k1-company"
                className="form-input"
                dir="auto"
                enterKeyHint="next"
                value={form.companyName}
                onChange={(e) => update('companyName', e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="k1-pid">{t('new.fields.personalId')}</label>
              <input
                id="k1-pid"
                className="form-input"
                dir="ltr"
                inputMode="numeric"
                value={form.personalId}
                onChange={(e) => update('personalId', e.target.value)}
              />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label" htmlFor="k1-address">{t('new.fields.address')}</label>
              <input
                id="k1-address"
                className="form-input"
                dir="auto"
                enterKeyHint="next"
                value={form.address}
                onChange={(e) => update('address', e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="k1-city">{t('new.fields.cityFree')}</label>
              <input
                id="k1-city"
                className="form-input"
                dir="auto"
                enterKeyHint="next"
                value={form.cityText}
                onChange={(e) => update('cityText', e.target.value)}
              />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label" htmlFor="k1-zip">{t('new.fields.zip')}</label>
              <input
                id="k1-zip"
                className="form-input"
                dir="ltr"
                inputMode="numeric"
                value={form.zip}
                onChange={(e) => update('zip', e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">{t('new.fields.primaryPhone')}</label>
              <PhoneField
                value={form.primaryPhone}
                onChange={(v) => update('primaryPhone', v)}
              />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">{t('new.fields.phone1')}</label>
              <PhoneField value={form.phone1} onChange={(v) => update('phone1', v)} />
            </div>
            <div className="form-group">
              <label className="form-label">{t('new.fields.phone2')}</label>
              <PhoneField value={form.phone2} onChange={(v) => update('phone2', v)} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label" htmlFor="k1-fax">{t('new.fields.fax')}</label>
              <input
                id="k1-fax"
                className="form-input"
                dir="ltr"
                inputMode="tel"
                value={form.fax}
                onChange={(e) => update('fax', e.target.value)}
              />
            </div>
            {/* L-8 — "הוסף תיאור קצר" removed. Free-form copy belongs to
                the single "הערות" textarea at the bottom of the form so
                agents don't split the same content across two fields. */}
          </div>
        </div>

        <div className="form-section">
          {/* K2 + L1 — admin block. Lives in its own section so agents
              can skip it entirely on quick-capture. */}
          <h3 className="form-section-title">{t('new.sections.admin')}</h3>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label" htmlFor="k2-cs">{t('new.fields.customerStatus')}</label>
              <SelectField
                value={form.customerStatus}
                onChange={(v) => update('customerStatus', v)}
                options={labelsToOptions(CUSTOMER_STATUS_LABELS)}
                aria-label={t('new.fields.customerStatus')}
                id="k2-cs"
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="k2-ls">{t('new.fields.leadStatus')}</label>
              <SelectField
                value={form.leadStatus}
                onChange={(v) => update('leadStatus', v)}
                options={labelsToOptions(QUICK_LEAD_STATUS_LABELS)}
                aria-label={t('new.fields.leadStatus')}
                id="k2-ls"
              />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">{t('new.fields.commissionPct')}</label>
              <NumberField
                value={form.commissionPct}
                onChange={(n) => update('commissionPct', n)}
                unit="%"
                min={0}
                max={100}
                placeholder="2"
                aria-label={t('new.fields.commissionPct')}
              />
            </div>
            <div className="form-group">
              <label className="form-label">{t('new.fields.seriousness')}</label>
              <Segmented
                value={form.seriousnessOverride}
                onChange={(v) => update('seriousnessOverride', v)}
                options={labelsToOptions(SERIOUSNESS_LABELS)}
                ariaLabel={t('new.fields.seriousness')}
              />
            </div>
          </div>
          <div className="form-group" style={{ marginBottom: 12 }}>
            <span className="form-label">{t('new.fields.purposes')}</span>
            <div className="checkbox-grid" role="group" aria-label={t('new.fields.purposes')}>
              {PURPOSE_OPTIONS.map((val) => {
                const checked = form.purposes?.includes(val);
                return (
                  <label key={val} className="checkbox-item">
                    <input
                      type="checkbox"
                      checked={!!checked}
                      onChange={(e) => {
                        const set = new Set(form.purposes || []);
                        if (e.target.checked) set.add(val);
                        else set.delete(val);
                        update('purposes', Array.from(set));
                      }}
                    />
                    <span className="checkbox-custom" />
                    {CUSTOMER_PURPOSE_LABELS[val]}
                  </label>
                );
              })}
            </div>
          </div>
          <label className="checkbox-item" style={{ marginTop: 4 }}>
            <input
              type="checkbox"
              checked={!!form.isPrivate}
              onChange={(e) => update('isPrivate', e.target.checked)}
            />
            <span className="checkbox-custom" />
            {t('new.fields.privateCustomer')}
          </label>
        </div>

        <div className="form-section">
          <h3 className="form-section-title">{t('new.sections.notes')}</h3>
          <div className="form-group">
            <textarea
              className="form-textarea"
              placeholder={t('new.fields.notesPlaceholder')}
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
          <button type="submit" className="btn btn-primary btn-lg" disabled={submitting}>
            {submitting ? <Loader2 size={18} className="y2-spin" /> : <Save size={18} />}
            {submitting ? t('new.actions.saving') : t('new.actions.save')}
          </button>
          <Link to="/customers" className="btn btn-secondary btn-lg">
            {t('new.actions.cancel')}
          </Link>
          {/* F-15 — honest autosave chip. During the debounce window
              (draftPending) we say "pending"; after the flush we show the
              actual savedAt time. No more lying about "saved" before the
              bytes actually hit sessionStorage. */}
          {hasContent && !savedRef.current && (
            <span
              className={`form-autosave-chip ${draftPending ? 'is-pending' : ''}`}
              aria-live="polite"
            >
              {draftPending
                ? (<><Loader2 size={12} className="y2-spin" /> {t('new.autosave.saving')}</>)
                : (<><Check size={12} /> {draftSavedAt ? t('new.autosave.savedAt', { time: relLabel(draftSavedAt) }) : t('new.autosave.saved')}</>)
              }
            </span>
          )}
        </div>
      </form>

      <StickyActionBar visible>
        <button type="submit" form="lead-form" className="btn btn-primary btn-lg" disabled={submitting}>
          {submitting ? <Loader2 size={18} className="y2-spin" /> : <Save size={18} />}
          {submitting ? t('new.actions.saving') : t('new.actions.save')}
        </button>
        <Link to="/customers" className="btn btn-secondary btn-lg">{t('new.actions.cancel')}</Link>
      </StickyActionBar>
    </div>
  );
}
