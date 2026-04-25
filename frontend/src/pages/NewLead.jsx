// Add Lead — port of the claude.ai/design bundle with inline Cream &
// Gold styles. Section-carded form for CRM write surfaces (Sprint 3).
// Preserves every existing field, handler, draft autosave, clipboard
// phone peek, and the full POST body shape consumed by api.createLead.

import { useState, useMemo, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight, Save, Clipboard, X, Check, Loader2,
  UserCircle, Search, Home, SlidersHorizontal, StickyNote, Shield,
  AlertCircle, Building2, Mic, Sparkles,
} from 'lucide-react';
import VoiceCaptureDialog from '../components/VoiceCaptureDialog';
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
import {
  CUSTOMER_STATUS_LABELS,
  QUICK_LEAD_STATUS_LABELS,
  SERIOUSNESS_LABELS,
  CUSTOMER_PURPOSE_LABELS,
  labelsToOptions,
} from '../lib/mlsLabels';

// Cream & Gold design tokens — matches OwnerDetail / ForgotPassword.
const DT = {
  cream: '#f7f3ec', cream2: '#efe9df', cream3: '#e8dfcf', cream4: '#fbf7f0',
  white: '#ffffff',
  ink: '#1e1a14', ink2: '#3a3226',
  muted: '#6b6356',
  gold: '#b48b4c', goldLight: '#d9b774', goldDark: '#7a5c2c',
  goldSoft: 'rgba(180,139,76,0.12)',
  border: 'rgba(30,26,20,0.08)', borderStrong: 'rgba(30,26,20,0.14)',
  danger: '#b91c1c',
};
const FONT = { fontFamily: 'Assistant, Heebo, -apple-system, sans-serif' };

const DRAFT_KEY = 'estia-draft:new-lead';
const VOICE_PREFILL_KEY = 'estia-voice-prefill';

// Translate the shape Haiku returns into the NewLead form shape. The
// extractor emits flat keys (`rooms`, `budget`, `lookingFor`) — we fan
// them out to the form's richer schema (roomsMin/roomsMax, priceMin/
// priceMax, interestType etc.) without clobbering existing values.
function applyVoicePrefillLead(setForm, fields) {
  if (!fields || typeof fields !== 'object') return;
  setForm((prev) => {
    const next = { ...prev };
    if (fields.name) next.name = fields.name;
    if (fields.phone) next.phone = fields.phone;
    if (fields.email !== undefined) next.email = fields.email || '';
    if (fields.city) next.city = fields.city;
    if (fields.street) next.street = fields.street;
    if (fields.sector) next.sector = fields.sector;
    if (fields.source) next.source = fields.source;
    if (fields.notes) next.notes = fields.notes;
    if (fields.lookingFor) {
      const lf = String(fields.lookingFor).toLowerCase();
      next.lookingFor = lf === 'rent' ? 'rent' : 'buy';
    }
    if (fields.rooms != null && fields.rooms !== '') {
      const n = Number(fields.rooms);
      if (Number.isFinite(n)) {
        next.roomsMin = String(n);
        next.roomsMax = String(n);
      }
    }
    if (fields.budget != null && Number.isFinite(Number(fields.budget))) {
      const n = Number(fields.budget);
      // Use ±15% as a sensible range when only a single number was given.
      next.priceMin = Math.round(n * 0.85);
      next.priceMax = Math.round(n * 1.15);
    }
    return next;
  });
}

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

  // Commercial-lead brief (surfaced only when interestType === 'מסחרי').
  // Matches the existing Lead schema fields. Mirrors the set already
  // wired on CustomerEditDialog so agents can capture the same block
  // at create-time, not only post-creation.
  sqmGrossMin: null,
  sqmNetMin: null,
  workstationsMin: null,
  buildStateRequired: '',       // 'מעטפת' / 'גמר' / specific finish
  accessibilityRequired: false, // גישה לנכים
  kitchenetteRequired: false,   // מטבחון
  floorShelterRequired: false,  // ממ״ק
  inOfficeToiletsRequired: false, // שירותים בתוך המשרד
  onFloorToiletsRequired: false,  // שירותים משותפים בקומה
  openSpaceRequired: false,       // חלל פתוח

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
  // Inline Hebrew strings — i18n was dropped (PERF-004) since the app
  // is Hebrew-only and the English JSON locales were empty stubs.
  const navigate = useNavigate();
  const toast = useToast();
  const [form, setForm] = useState(INITIAL_FORM);
  const [draftBanner, setDraftBanner] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  // F-14 — once we successfully save, disarm the beforeunload prompt so
  // closing the tab after a save doesn't pop "יש שינויים שלא נשמרו".
  const savedRef = useRef(false);

  const hasContent = !!(form.name || form.phone || form.email || form.city || form.notes);
  const isDirty = hasContent && !savedRef.current;
  useBeforeUnload(isDirty, 'יש שינויים שלא נשמרו בליד — לעזוב?');
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
    // Voice-ingest cross-page handoff: if the user recorded on /properties/new
    // and the extractor identified a lead, the dialog stashed the payload in
    // sessionStorage and navigated here. Drain + apply it once.
    try {
      const raw = sessionStorage.getItem(VOICE_PREFILL_KEY);
      if (raw) {
        sessionStorage.removeItem(VOICE_PREFILL_KEY);
        const payload = JSON.parse(raw);
        if (payload?.kind === 'lead' && payload.fields) {
          applyVoicePrefillLead(setForm, payload.fields);
          toast?.success?.('הטופס מולא מההקלטה');
        }
      }
    } catch { /* ignore malformed payloads */ }
  }, [toast]);

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
      toast.success('טלפון הודבק');
    }
  };
  const dismissClipboard = () => {
    setClipboardSuggestion(null);
    setClipboardDismissed(true);
    try { sessionStorage.setItem(CLIP_DISMISS_KEY, String(Date.now())); } catch { /* ignore */ }
  };

  const update = (field, value) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  // F-1 (P0) — the previous handler navigated without persisting the
  // lead. Wire up api.createLead and surface success/failure properly.
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    if (!form.name?.trim()) {
      toast.error('שם הלקוח הוא שדה חובה');
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

        // Commercial brief — send integers or null. The backend drops
        // them on PRIVATE leads anyway, but zod expects the shape.
        sqmGrossMin: form.sqmGrossMin != null && form.sqmGrossMin !== ''
          ? Math.max(0, Math.round(Number(form.sqmGrossMin))) : null,
        sqmNetMin: form.sqmNetMin != null && form.sqmNetMin !== ''
          ? Math.max(0, Math.round(Number(form.sqmNetMin))) : null,
        workstationsMin: form.workstationsMin != null && form.workstationsMin !== ''
          ? Math.max(0, Math.round(Number(form.workstationsMin))) : null,
        buildStateRequired: form.buildStateRequired || null,
        accessibilityRequired: !!form.accessibilityRequired,
        kitchenetteRequired: !!form.kitchenetteRequired,
        floorShelterRequired: !!form.floorShelterRequired,
        inOfficeToiletsRequired: !!form.inOfficeToiletsRequired,
        onFloorToiletsRequired: !!form.onFloorToiletsRequired,
        openSpaceRequired: !!form.openSpaceRequired,

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
      toast.success('הליד נשמר');
      const newId = res?.id || res?.lead?.id;
      if (newId) navigate(`/customers/${newId}`);
      else navigate('/customers');
    } catch (err) {
      toast.error(err?.message || 'שמירת הליד נכשלה');
      setSubmitting(false);
    }
  };

  // Street autocomplete is narrowed by the selected city when there's a match
  const streetOptions = useMemo(() => {
    if (!form.city) return streetNames;
    return streetNames;
  }, [form.city]);

  return (
    <div
      dir="rtl"
      onFocusCapture={tryPeekClipboard}
      onTouchStartCapture={tryPeekClipboard}
      style={{
        ...FONT, padding: 28, color: DT.ink, minHeight: '100%',
        background: DT.cream, paddingBottom: 120,
      }}
    >
      {/* Back link */}
      <Link to="/customers" style={{
        ...FONT,
        display: 'inline-flex', alignItems: 'center', gap: 6,
        color: DT.muted, textDecoration: 'none',
        fontSize: 13, fontWeight: 700, marginBottom: 14,
      }}>
        <ArrowRight size={16} />
        חזרה ללידים
      </Link>

      {/* Page header card */}
      <div style={{
        background: DT.white, border: `1px solid ${DT.border}`,
        borderRadius: 14, padding: 20, marginBottom: 16,
        display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
      }}>
        <div style={{
          width: 56, height: 56, borderRadius: 14,
          background: `linear-gradient(160deg, ${DT.goldLight}, ${DT.gold})`,
          color: DT.ink, display: 'grid', placeItems: 'center', flexShrink: 0,
        }}>
          <UserCircle size={28} />
        </div>
        <div style={{ flex: 1, minWidth: 220 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.5, margin: 0 }}>
            ליד חדש
          </h1>
          <p style={{ fontSize: 13, color: DT.muted, margin: '4px 0 0' }}>
            הזן פרטי לקוח מתעניין
          </p>
        </div>
        <button
          type="button"
          onClick={() => setVoiceOpen(true)}
          aria-label="הקלטה חכמה — מילוי הטופס מהדיבור"
          style={{
            ...FONT,
            background: `linear-gradient(180deg, ${DT.goldLight}, ${DT.gold})`,
            border: 'none', color: DT.ink,
            padding: '10px 16px', borderRadius: 10,
            cursor: 'pointer', fontSize: 13, fontWeight: 800,
            display: 'inline-flex', gap: 6, alignItems: 'center',
            boxShadow: '0 4px 12px rgba(180,139,76,0.28)',
            flexShrink: 0,
          }}
        >
          <Sparkles size={14} /> <Mic size={14} /> הקלטה חכמה
        </button>
      </div>

      <VoiceCaptureDialog
        open={voiceOpen}
        onClose={() => setVoiceOpen(false)}
        preferKind="lead"
        onUse={({ kind, fields }) => {
          if (kind !== 'lead') return;
          applyVoicePrefillLead(setForm, fields);
          toast?.success?.('הטופס מולא מההקלטה');
        }}
      />

      {/* Draft restore banner */}
      {draftBanner && (
        <div role="status" style={{
          background: DT.cream4, border: `1px dashed ${DT.gold}`,
          borderRadius: 12, padding: '12px 16px', marginBottom: 12,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 12, flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: 13, color: DT.ink }}>
            נמצאה טיוטה שנשמרה
            {draftBanner.__savedAt && (
              <span style={{ color: DT.muted, marginInlineStart: 6 }}>
                · {relLabel(draftBanner.__savedAt)}
              </span>
            )}
          </span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" onClick={restoreDraft} style={secondaryBtn()}>
              שחזר
            </button>
            <button type="button" onClick={discardDraft} style={ghostBtn()}>
              מחק
            </button>
          </div>
        </div>
      )}

      {/* Clipboard phone suggestion chip */}
      {clipboardSuggestion && (
        <div
          role="status"
          aria-describedby="clip-chip-desc"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: DT.goldSoft, border: `1px solid ${DT.gold}`,
            borderRadius: 99, padding: '4px 4px 4px 12px', marginBottom: 12,
          }}
        >
          <button
            type="button"
            onClick={acceptClipboard}
            style={{
              ...FONT, background: 'transparent', border: 'none',
              display: 'inline-flex', alignItems: 'center', gap: 6,
              color: DT.goldDark, fontSize: 13, fontWeight: 700,
              cursor: 'pointer', padding: '4px 6px',
            }}
          >
            <Clipboard size={14} />
            <span>{`${clipboardSuggestion} מהלוח — הוסף`}</span>
          </button>
          <span id="clip-chip-desc" style={{
            position: 'absolute', width: 1, height: 1, padding: 0, margin: -1,
            overflow: 'hidden', clip: 'rect(0,0,0,0)', border: 0,
          }}>
            מספר טלפון זוהה בלוח העתקה
          </span>
          <button
            type="button"
            aria-label="סגור"
            onClick={dismissClipboard}
            style={{
              background: DT.white, border: `1px solid ${DT.border}`,
              width: 24, height: 24, borderRadius: 99,
              display: 'grid', placeItems: 'center',
              cursor: 'pointer', color: DT.muted,
            }}
          >
            <X size={12} />
          </button>
        </div>
      )}

      <form id="lead-form" onSubmit={handleSubmit} style={{
        display: 'flex', flexDirection: 'column', gap: 14,
      }}>
        {/* Section 1 — פרטי לקוח (identity + contact) */}
        <section style={sectionCard()} aria-label="פרטים אישיים">
          <h3 style={sectionTitle()}>
            <UserCircle size={16} /> פרטים אישיים
          </h3>
          <div style={gridRow2()}>
            <Field label="שם הלקוח">
              <input
                {...inputPropsForName()}
                className="form-input"
                placeholder="שם מלא"
                value={form.name}
                onChange={(e) => update('name', e.target.value)}
              />
            </Field>
            <Field label="טלפון">
              <PhoneField
                value={form.phone}
                onChange={(v) => update('phone', v)}
              />
            </Field>
          </div>
          <div style={gridRow2()}>
            <Field label="מקור הליד">
              {/* F-5 — grouped sources. Flat 9-option dropdown hurt
                  scanning; "הפניה" vs "הפניה מלקוח" adjacency cost real
                  agent seconds and polluted the funnel report. */}
              <SelectField
                value={form.source}
                onChange={(v) => update('source', v)}
                placeholder="בחר מקור..."
                groups={[
                  { label: 'אונליין', options: ['פייסבוק', 'יד 2', 'אתר'] },
                  { label: 'מכרים',   options: ['הפניה', 'הפניה מלקוח'] },
                  { label: 'פיזי',    options: ['בית פתוח', 'שלט', 'סיור סוכנים'] },
                  { label: 'אחר',     options: ['אחר'] },
                ]}
              />
            </Field>
            <Field label="סוג התעניינות">
              <Segmented
                value={form.interestType}
                onChange={(v) => update('interestType', v)}
                options={[
                  { value: 'פרטי', label: 'פרטי' },
                  { value: 'מסחרי', label: 'מסחרי' },
                ]}
                ariaLabel="סוג התעניינות"
              />
            </Field>
          </div>
        </section>

        {/* Section 2 — מה הוא מחפש (search preferences: purpose, type, city/street) */}
        <section style={sectionCard()} aria-label="העדפות חיפוש">
          <h3 style={sectionTitle()}>
            <Search size={16} /> העדפות חיפוש
          </h3>
          <div style={gridRow2()}>
            <Field label="קנייה / שכירות">
              <Segmented
                value={form.lookingFor}
                onChange={(v) => update('lookingFor', v)}
                options={[
                  { value: 'buy', label: 'קנייה' },
                  { value: 'rent', label: 'שכירות' },
                ]}
                ariaLabel="קנייה או שכירות"
              />
            </Field>
            <Field label="מגזר">
              <SelectField
                value={form.sector}
                onChange={(v) => update('sector', v)}
                options={['כללי', 'דתי', 'חרדי', 'ערבי']}
              />
            </Field>
          </div>
          <div style={gridRow2()}>
            <Field label="עיר מבוקשת">
              <SuggestPicker
                options={cityNames}
                value={form.city}
                onChange={(v) => update('city', v)}
                placeholder="תל אביב, ירושלים, חיפה…"
                label="עיר"
                inputProps={{ ...inputPropsForCity(), autoComplete: 'off' }}
                asyncFetch={async (q) => {
                  // Backend caps `limit` at 15 (zod rejects anything
                  // higher). The picker's maxVisible already clamps
                  // what we render; 12 leaves headroom for duplicates
                  // the filter step strips.
                  const res = await api.geoSearch({ q, limit: 12 });
                  return (res?.items || [])
                    .map((r) => r.city || r.label)
                    .filter(Boolean);
                }}
              />
            </Field>
            <Field label="רחוב (אופציונלי)">
              <SuggestPicker
                options={streetOptions}
                value={form.street}
                onChange={(v) => update('street', v)}
                placeholder="רוטשילד, אלנבי…"
                label="רחוב"
                inputProps={{ ...inputPropsForAddress(), autoComplete: 'off' }}
                asyncFetch={async (q) => {
                  const res = await api.geoSearch({ q, city: form.city, limit: 12 });
                  return (res?.items || [])
                    .map((r) => r.street || r.label)
                    .filter(Boolean);
                }}
              />
            </Field>
          </div>
          <Field label="קירבה לבית ספר">
            <SelectField
              value={form.schoolProximity}
              onChange={(v) => update('schoolProximity', v)}
              placeholder="לא חשוב"
              options={['עד 200 מטר', 'עד 500 מטר', 'הליכה', 'עד ק״מ']}
            />
          </Field>
        </section>

        {/* Section 3 — תקציב וחדרים */}
        <section style={sectionCard()} aria-label="טווח מחיר">
          <h3 style={sectionTitle()}>
            <Home size={16} /> טווח חדרים · טווח מחיר
          </h3>
          {/* UX review F-5.3 — one labeled "טווח חדרים" group instead
              of two stacked selectors with literal-translation labels
              ("חדרים: מ" / "חדרים: עד"). Mirrors the PriceRange pattern
              right below this. */}
          <Field label="טווח חדרים">
            <div style={gridRow2()}>
              <RoomsChips
                value={form.roomsMin}
                onChange={(v) => update('roomsMin', v)}
                label="מ"
              />
              <RoomsChips
                value={form.roomsMax}
                onChange={(v) => update('roomsMax', v)}
                label="עד"
              />
            </div>
          </Field>
          <Field label="טווח מחיר">
            <PriceRange
              minVal={form.priceMin}
              maxVal={form.priceMax}
              onChangeMin={(n) => update('priceMin', n)}
              onChangeMax={(n) => update('priceMax', n)}
              perMonth={form.lookingFor === 'rent'}
            />
          </Field>
        </section>

        {/* Section 4 — דרישות נוספות (amenities) */}
        <section style={sectionCard()} aria-label="מרפסת">
          <h3 style={sectionTitle()}>
            <SlidersHorizontal size={16} /> דרישות נוספות
          </h3>
          <div style={{
            display: 'grid', gap: 8,
            gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
          }}>
            <CheckboxItem
              checked={form.preApproval}
              onChange={(v) => update('preApproval', v)}
              label="אישור עקרוני למשכנתא"
            />
            <CheckboxItem
              checked={form.balconyRequired}
              onChange={(v) => update('balconyRequired', v)}
              label="מרפסת"
            />
            <CheckboxItem
              checked={form.parkingRequired}
              onChange={(v) => update('parkingRequired', v)}
              label="חניה"
            />
            <CheckboxItem
              checked={form.elevatorRequired}
              onChange={(v) => update('elevatorRequired', v)}
              label="מעלית"
            />
            <CheckboxItem
              checked={form.safeRoomRequired}
              onChange={(v) => update('safeRoomRequired', v)}
              label="ממ״ד"
            />
            <CheckboxItem
              checked={form.acRequired}
              onChange={(v) => update('acRequired', v)}
              label="מזגנים"
            />
            <CheckboxItem
              checked={form.storageRequired}
              onChange={(v) => update('storageRequired', v)}
              label="מחסן"
            />
          </div>
        </section>

        {/* Section 4.5 — Commercial-lead brief. Surfaces only for לקוח
            עסקי (interestType === 'מסחרי'); the same field-set is also
            wired on CustomerEditDialog so post-creation edits match. */}
        {form.interestType === 'מסחרי' && (
          <section style={sectionCard()} aria-label="דרישות עסקיות">
            <h3 style={sectionTitle()}>
              <Building2 size={16} /> דרישות עסקיות
            </h3>
            <div style={gridRow2()}>
              <Field label="מ״ר ברוטו (מינימום)">
                <NumberField
                  value={form.sqmGrossMin}
                  onChange={(v) => update('sqmGrossMin', v)}
                  unit="מ״ר"
                  placeholder="למשל 60"
                />
              </Field>
              <Field label="מ״ר נטו (מינימום)">
                <NumberField
                  value={form.sqmNetMin}
                  onChange={(v) => update('sqmNetMin', v)}
                  unit="מ״ר"
                  placeholder="למשל 50"
                />
              </Field>
              <Field label="מספר עמדות עבודה">
                <NumberField
                  value={form.workstationsMin}
                  onChange={(v) => update('workstationsMin', v)}
                  placeholder="למשל 3"
                />
              </Field>
              <Field label="מצב הנכס">
                <SelectField
                  value={form.buildStateRequired}
                  onChange={(v) => update('buildStateRequired', v)}
                  placeholder="מעטפת / גמר / לא משנה"
                  options={['מעטפת', 'גמר', 'גמר עם ריהוט', 'שיפוץ דרוש']}
                />
              </Field>
            </div>
            <div style={{
              display: 'grid', gap: 8, marginTop: 12,
              gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
            }}>
              <CheckboxItem
                checked={form.accessibilityRequired}
                onChange={(v) => update('accessibilityRequired', v)}
                label="גישה לנכים"
              />
              <CheckboxItem
                checked={form.kitchenetteRequired}
                onChange={(v) => update('kitchenetteRequired', v)}
                label="מטבחון"
              />
              <CheckboxItem
                checked={form.floorShelterRequired}
                onChange={(v) => update('floorShelterRequired', v)}
                label="ממ״ק"
              />
              <CheckboxItem
                checked={form.inOfficeToiletsRequired}
                onChange={(v) => update('inOfficeToiletsRequired', v)}
                label="שירותים בתוך המשרד"
              />
              <CheckboxItem
                checked={form.onFloorToiletsRequired}
                onChange={(v) => update('onFloorToiletsRequired', v)}
                label="שירותים משותפים בקומה"
              />
              <CheckboxItem
                checked={form.openSpaceRequired}
                onChange={(v) => update('openSpaceRequired', v)}
                label="חלל פתוח"
              />
              <CheckboxItem
                checked={form.parkingRequired}
                onChange={(v) => update('parkingRequired', v)}
                label="חניה"
              />
              <CheckboxItem
                checked={form.storageRequired}
                onChange={(v) => update('storageRequired', v)}
                label="מחסן"
              />
            </div>
          </section>
        )}

        {/* Section 5 — K1 contact / identity extended (optional) */}
        <section style={sectionCard()} aria-label="פרטים מורחבים">
          {/* K1 — contact / identity block. Optional: agents who only
              have a phone number can leave the whole section blank.
              L-4 — firstName / lastName removed here; the single "שם
              מלא" at the top of the form is the canonical name and the
              duplicate pair was causing confusion + split saves. */}
          <h3 style={sectionTitle()}>
            <UserCircle size={16} /> פרטים מורחבים
          </h3>
          <div style={gridRow2()}>
            <Field label="שם חברה">
              <input
                id="k1-company"
                className="form-input"
                dir="auto"
                enterKeyHint="next"
                value={form.companyName}
                onChange={(e) => update('companyName', e.target.value)}
              />
            </Field>
            <Field label="ת.ז / ח.פ">
              <input
                id="k1-pid"
                className="form-input"
                dir="ltr"
                inputMode="numeric"
                value={form.personalId}
                onChange={(e) => update('personalId', e.target.value)}
              />
            </Field>
          </div>
          <div style={gridRow2()}>
            <Field label="כתובת">
              <input
                id="k1-address"
                className="form-input"
                dir="auto"
                enterKeyHint="next"
                value={form.address}
                onChange={(e) => update('address', e.target.value)}
              />
            </Field>
            <Field label="עיר (חופשי)">
              <input
                id="k1-city"
                className="form-input"
                dir="auto"
                enterKeyHint="next"
                value={form.cityText}
                onChange={(e) => update('cityText', e.target.value)}
              />
            </Field>
          </div>
          <div style={gridRow2()}>
            <Field label="מיקוד">
              <input
                id="k1-zip"
                className="form-input"
                dir="ltr"
                inputMode="numeric"
                value={form.zip}
                onChange={(e) => update('zip', e.target.value)}
              />
            </Field>
            <Field label="טלפון עיקרי">
              <PhoneField
                value={form.primaryPhone}
                onChange={(v) => update('primaryPhone', v)}
              />
            </Field>
          </div>
          <div style={gridRow2()}>
            <Field label="טלפון נוסף 1">
              <PhoneField value={form.phone1} onChange={(v) => update('phone1', v)} />
            </Field>
            <Field label="טלפון נוסף 2">
              <PhoneField value={form.phone2} onChange={(v) => update('phone2', v)} />
            </Field>
          </div>
          <div style={gridRow2()}>
            <Field label="פקס">
              <input
                id="k1-fax"
                className="form-input"
                dir="ltr"
                inputMode="tel"
                value={form.fax}
                onChange={(e) => update('fax', e.target.value)}
              />
            </Field>
            {/* L-8 — "הוסף תיאור קצר" removed. Free-form copy belongs to
                the single "הערות" textarea at the bottom of the form so
                agents don't split the same content across two fields. */}
          </div>
        </section>

        {/* Section 6 — K2 + L1 admin block */}
        <section style={sectionCard()} aria-label="ניהול ולקוח">
          {/* K2 + L1 — admin block. Lives in its own section so agents
              can skip it entirely on quick-capture. */}
          <h3 style={sectionTitle()}>
            <Shield size={16} /> ניהול ולקוח
          </h3>
          <div style={gridRow2()}>
            <Field label="סטטוס לקוח">
              <SelectField
                value={form.customerStatus}
                onChange={(v) => update('customerStatus', v)}
                options={labelsToOptions(CUSTOMER_STATUS_LABELS)}
                aria-label="סטטוס לקוח"
                id="k2-cs"
              />
            </Field>
            <Field label="סטטוס ליד">
              <SelectField
                value={form.leadStatus}
                onChange={(v) => update('leadStatus', v)}
                options={labelsToOptions(QUICK_LEAD_STATUS_LABELS)}
                aria-label="סטטוס ליד"
                id="k2-ls"
              />
            </Field>
          </div>
          <div style={gridRow2()}>
            <Field label="אחוז עמלה">
              <NumberField
                value={form.commissionPct}
                onChange={(n) => update('commissionPct', n)}
                unit="%"
                min={0}
                max={100}
                placeholder="2"
                aria-label="אחוז עמלה"
              />
            </Field>
            <Field label="רצינות">
              <Segmented
                value={form.seriousnessOverride}
                onChange={(v) => update('seriousnessOverride', v)}
                options={labelsToOptions(SERIOUSNESS_LABELS)}
                ariaLabel="רצינות"
              />
            </Field>
          </div>
          <div style={{ marginTop: 8 }}>
            <div style={labelStyle()}>מטרת הרכישה</div>
            <div
              role="group"
              aria-label="מטרת הרכישה"
              style={{
                display: 'grid', gap: 8, marginTop: 6,
                gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
              }}
            >
              {PURPOSE_OPTIONS.map((val) => {
                const checked = form.purposes?.includes(val);
                return (
                  <CheckboxItem
                    key={val}
                    checked={!!checked}
                    onChange={(c) => {
                      const set = new Set(form.purposes || []);
                      if (c) set.add(val);
                      else set.delete(val);
                      update('purposes', Array.from(set));
                    }}
                    label={CUSTOMER_PURPOSE_LABELS[val]}
                  />
                );
              })}
            </div>
          </div>
          <div style={{ marginTop: 10 }}>
            <CheckboxItem
              checked={!!form.isPrivate}
              onChange={(v) => update('isPrivate', v)}
              label="לקוח פרטי (לא חשוף לשותפי משרד)"
            />
          </div>
        </section>

        {/* Section 7 — הערות */}
        <section style={sectionCard()} aria-label="הערות">
          <h3 style={sectionTitle()}>
            <StickyNote size={16} /> הערות
          </h3>
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
        </section>

        {/* Desktop actions — kept inline under the form so agents on
            desktop have a click target without scrolling back to the
            sticky bar. */}
        <div style={{
          display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap',
          marginTop: 4,
        }}>
          <button type="submit" disabled={submitting} style={primaryBtn(submitting)}>
            {submitting ? <Loader2 size={16} className="y2-spin" /> : <Save size={16} />}
            {submitting ? 'שומר…' : 'שמור ליד'}
          </button>
          <Link to="/customers" style={ghostBtn()}>
            ביטול
          </Link>
          {/* F-15 — honest autosave chip. During the debounce window
              (draftPending) we say "pending"; after the flush we show the
              actual savedAt time. No more lying about "saved" before the
              bytes actually hit sessionStorage. */}
          {hasContent && !savedRef.current && (
            <span
              aria-live="polite"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                fontSize: 12, color: draftPending ? DT.muted : DT.goldDark,
                background: draftPending ? DT.cream2 : DT.goldSoft,
                border: `1px solid ${DT.border}`,
                borderRadius: 99, padding: '4px 10px',
              }}
            >
              {draftPending
                ? (<><Loader2 size={12} className="y2-spin" /> שומר טיוטה…</>)
                : (<><Check size={12} /> {draftSavedAt ? `טיוטה נשמרה ${relLabel(draftSavedAt)}` : 'טיוטה נשמרה'}</>)
              }
            </span>
          )}
        </div>
      </form>

      {/* Sticky mobile action bar — points at the form via `form="lead-form"`. */}
      <StickyActionBar visible>
        <button type="submit" form="lead-form" disabled={submitting} style={primaryBtn(submitting)}>
          {submitting ? <Loader2 size={16} className="y2-spin" /> : <Save size={16} />}
          {submitting ? 'שומר…' : 'שמור ליד'}
        </button>
        <Link to="/customers" style={ghostBtn()}>ביטול</Link>
      </StickyActionBar>
    </div>
  );
}

// ── Style helpers ─────────────────────────────────────────────────────

function Field({ label, children, wide }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 4,
      gridColumn: wide ? '1 / -1' : 'auto',
      marginBottom: 10,
    }}>
      <label style={labelStyle()}>{label}</label>
      {children}
    </div>
  );
}

function CheckboxItem({ checked, onChange, label }) {
  return (
    <label style={{
      ...FONT,
      display: 'inline-flex', alignItems: 'center', gap: 8,
      background: checked ? DT.goldSoft : DT.cream4,
      border: `1px solid ${checked ? DT.gold : DT.border}`,
      borderRadius: 10, padding: '10px 12px',
      cursor: 'pointer', fontSize: 13, color: DT.ink,
      fontWeight: checked ? 700 : 500,
      transition: 'background 0.12s, border-color 0.12s',
    }}>
      <input
        type="checkbox"
        checked={!!checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ accentColor: DT.gold, width: 16, height: 16, flexShrink: 0 }}
      />
      <span>{label}</span>
    </label>
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
function labelStyle() {
  return {
    fontSize: 11, fontWeight: 700, color: DT.muted,
    textTransform: 'uppercase', letterSpacing: 0.3,
    display: 'block',
  };
}
function gridRow2() {
  return {
    display: 'grid', gap: 12,
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    marginBottom: 6,
  };
}
function primaryBtn(busy = false) {
  return {
    ...FONT,
    background: busy ? '#d8cfbf' : `linear-gradient(180deg, ${DT.goldLight}, ${DT.gold})`,
    border: 'none', color: DT.ink,
    padding: '11px 20px', borderRadius: 12, cursor: busy ? 'wait' : 'pointer',
    fontSize: 14, fontWeight: 800,
    display: 'inline-flex', gap: 6, alignItems: 'center',
    boxShadow: busy ? 'none'
      : '0 8px 18px rgba(180,139,76,0.28), inset 0 1px 0 rgba(255,255,255,0.35)',
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
    padding: '9px 14px', borderRadius: 10, cursor: 'pointer',
    fontSize: 13, fontWeight: 700,
    display: 'inline-flex', gap: 5, alignItems: 'center', color: DT.ink,
    textDecoration: 'none',
  };
}
