import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
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
import AddressField from '../components/AddressField';
import { RoomsChips, DateQuickChips, SuggestPicker } from '../components/MobilePickers';
import { useDraftAutosave, readDraft } from '../hooks/mobile';
import { relLabel } from '../lib/relativeDate';
import {
  inputPropsForName,
  inputPropsForAddress,
  inputPropsForCity,
} from '../lib/inputProps';
import { NumberField, PhoneField, SelectField } from '../components/SmartFields';
import PageTour from '../components/PageTour';
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
  // Task 3 · validated structured address — populated by AddressField when
  // the agent picks from the Photon autocomplete. Nullable throughout so
  // we don't break legacy draft restores that predate this schema.
  placeId: null,
  formattedAddress: null,
  lat: null,
  lng: null,
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
  buildState: '',
  vacancyDate: '',
  vacancyFlexible: false,
  sector: 'כללי',
  airDirections: '',
  notes: '',
  closingPrice: null,
  sqmArnona: null,
  sqmTabu: null,
  sqmGross: null,
  sqmNet: null,
  exclusiveStart: '',
  exclusiveEnd: '',
  // Registry / fees
  neighborhood: '',
  gush: '',
  helka: '',
  arnonaAmount: null,
  buildingCommittee: null,
  // Elevator details
  elevator: false,
  elevatorCount: null,
  shabbatElevator: false,
  // Parking details
  parking: false,
  parkingType: '',
  parkingCount: null,
  parkingCovered: false,
  parkingCoupled: false,
  parkingTandem: false,
  parkingEvCharger: false,
  nearbyParking: false,
  // Storage details
  storage: false,
  storageLocation: '',
  storageSize: null,
  // Amenities + shelters
  ac: false,
  safeRoom: false,
  floorShelter: false,
  shelter: false,
  // Commercial-only
  kitchenette: false,
  meetingRoom: false,
  workstations: null,
  lobbySecurity: false,
};

/**
 * Two-step property wizard — serves BOTH create and edit.
 *
 *  Step 1 — 7 essentials (in create mode, saves = creates; in edit mode,
 *           saves = updates and keeps the same id).
 *  Step 2 — full marketing package (type, floor, features, photos).
 *
 * Mode is selected by route:
 *   /properties/new         → create
 *   /properties/:id/edit    → edit (form prefilled from the API)
 *
 * Edit mode disables the draft-autosave + restore banner (edits are
 * intentional, not recovered). Both modes share layout, validation,
 * SmartFields, animations, sticky action bar — so the edit screen is
 * the full-power form the agent is already trained to use.
 */
export default function NewProperty() {
  const navigate = useNavigate();
  const toast = useToast();
  const fileInput = useRef(null);
  const { id: editId } = useParams();
  const isEdit = !!editId;

  const [step, setStep] = useState(1);
  const [propertyId, setPropertyId] = useState(isEdit ? editId : null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [photoFiles, setPhotoFiles] = useState([]);
  const [geoLoading, setGeoLoading] = useState(false);
  const [draftBanner, setDraftBanner] = useState(null); // {form, step}
  const [ownerPickerOpen, setOwnerPickerOpen] = useState(false);
  const [loadingExisting, setLoadingExisting] = useState(isEdit);
  const [existingMeta, setExistingMeta] = useState(null); // { street, city, imageCount }

  const [form, setForm] = useState(INITIAL_FORM);

  // ── Draft autosave + restore banner ────────────────────────────────
  // In edit mode we explicitly skip autosave: the draft recovery UX
  // would be confusing when the form is already backed by a real
  // persisted property.
  const { clear: clearDraft } = useDraftAutosave(
    DRAFT_KEY,
    isEdit ? null : { form, step }
  );

  useEffect(() => {
    if (isEdit) return;
    // S16: readDraft now returns { value, savedAt }. `value` is the old
    // { form, step } payload. Keep the check on value.form.street so we
    // don't surface empty drafts; stash savedAt for the banner.
    const draft = readDraft(DRAFT_KEY);
    const inner = draft?.value;
    if (inner && inner.form && (inner.form.street || inner.form.city || inner.form.owner)) {
      setDraftBanner({ ...inner, savedAt: draft.savedAt });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEdit]);

  // ── Edit mode: hydrate form from the persisted property ────────────
  useEffect(() => {
    if (!isEdit) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await api.getProperty(editId);
        if (cancelled) return;
        const p = res?.property || res;
        if (!p || !p.id) throw new Error('נכס לא נמצא');
        const dateOnly = (v) => (v ? String(v).slice(0, 10) : '');
        setForm({
          ...INITIAL_FORM,
          assetClass: p.assetClass || 'RESIDENTIAL',
          category: p.category || 'SALE',
          street: p.street || '',
          city: p.city || '',
          // Task 3 · hydrate structured-address fields from the server so
          // edit-mode doesn't lose what was previously validated and the
          // hasValidatedAddress guard on save passes without forcing the
          // agent to re-pick.
          placeId: p.placeId || null,
          formattedAddress: p.formattedAddress || null,
          lat: p.lat ?? null,
          lng: p.lng ?? null,
          owner: p.owner || '',
          ownerPhone: p.ownerPhone || '',
          ownerEmail: p.ownerEmail || '',
          propertyOwnerId: p.propertyOwnerId || null,
          pickedOwner: null,
          marketingPrice: p.marketingPrice ?? null,
          sqm: p.sqm ?? null,
          type: p.type || 'דירה',
          rooms: p.rooms == null ? '' : p.rooms,
          floor: p.floor ?? null,
          totalFloors: p.totalFloors ?? null,
          balconySize: p.balconySize ?? null,
          buildingAge: p.buildingAge ?? null,
          renovated: p.renovated || '',
          buildState: p.buildState || '',
          vacancyDate: dateOnly(p.vacancyDate),
          vacancyFlexible: !!p.vacancyFlexible,
          sector: p.sector || 'כללי',
          airDirections: p.airDirections || '',
          notes: p.notes || '',
          closingPrice: p.closingPrice ?? null,
          sqmArnona: p.sqmArnona ?? null,
          sqmTabu: p.sqmTabu ?? null,
          sqmGross: p.sqmGross ?? null,
          sqmNet: p.sqmNet ?? null,
          exclusiveStart: dateOnly(p.exclusiveStart),
          exclusiveEnd: dateOnly(p.exclusiveEnd),
          neighborhood: p.neighborhood || '',
          gush: p.gush || '',
          helka: p.helka || '',
          arnonaAmount: p.arnonaAmount ?? null,
          buildingCommittee: p.buildingCommittee ?? null,
          elevator: !!p.elevator,
          elevatorCount: p.elevatorCount ?? null,
          shabbatElevator: !!p.shabbatElevator,
          parking: !!p.parking,
          parkingType: p.parkingType || '',
          parkingCount: p.parkingCount ?? null,
          parkingCovered: !!p.parkingCovered,
          parkingCoupled: !!p.parkingCoupled,
          parkingTandem: !!p.parkingTandem,
          parkingEvCharger: !!p.parkingEvCharger,
          nearbyParking: !!p.nearbyParking,
          storage: !!p.storage,
          storageLocation: p.storageLocation || '',
          storageSize: p.storageSize ?? null,
          ac: !!p.ac,
          safeRoom: !!p.safeRoom,
          floorShelter: !!p.floorShelter,
          shelter: !!p.shelter,
          kitchenette: !!p.kitchenette,
          meetingRoom: !!p.meetingRoom,
          workstations: p.workstations ?? null,
          lobbySecurity: !!p.lobbySecurity,
        });
        setExistingMeta({
          street: p.street,
          city: p.city,
          imageCount: (p.imageList || []).length,
          exclusivityAgreementUrl: p.exclusivityAgreementUrl || null,
        });
      } catch (e) {
        if (!cancelled) setError(e.message || 'טעינה נכשלה');
      } finally {
        if (!cancelled) setLoadingExisting(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isEdit, editId]);

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
      // Task 3 · "use current location" is itself a validation path — the
      // reverse-geocode confirms a real street + coordinates. Stamp lat/lng
      // onto the form alongside street/city so hasValidatedAddress passes
      // without making the agent re-pick from the typeahead.
      setForm((p) => ({
        ...p,
        city: city || p.city,
        street: street || p.street,
        lat: latitude,
        lng: longitude,
        // placeId stays null — reverse-geocode doesn't return an OSM id.
        // lat/lng alone satisfy hasValidatedAddress.
        formattedAddress: geo?.fullAddress || p.formattedAddress || null,
      }));
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

  // Full body builder for edit mode — every PATCH (from either step) sends
  // the union of fields, so switching tabs without explicit save can't
  // silently drop work. On CREATE we still use the minimal step-1 body so
  // the initial insert fast-paths.
  const numOrNull = (v) => (v === '' || v == null ? null : Number(v));
  const buildStep1Body = () => {
    const body = {
      assetClass: form.assetClass,
      category: form.category,
      type: form.type,
      street: form.street,
      city: form.city,
      // Task 3 · structured address components — null for legacy / non-
      // picker flows is fine, the backend schema treats them as optional.
      placeId: form.placeId || null,
      formattedAddress: form.formattedAddress || null,
      lat: form.lat ?? null,
      lng: form.lng ?? null,
      marketingPrice: Number(form.marketingPrice) || 0,
      sqm: Number(form.sqm) || 0,
    };
    if (form.propertyOwnerId) {
      body.propertyOwnerId = form.propertyOwnerId;
    } else {
      body.owner = form.owner;
      body.ownerPhone = form.ownerPhone;
      if (form.ownerEmail) body.ownerEmail = form.ownerEmail;
    }
    return body;
  };
  const buildStep2Body = () => ({
    type: form.type,
    rooms: numOrNull(form.rooms),
    floor: numOrNull(form.floor),
    totalFloors: numOrNull(form.totalFloors),
    balconySize: Number(form.balconySize) || 0,
    buildingAge: numOrNull(form.buildingAge),
    renovated: form.renovated || null,
    buildState: form.buildState || null,
    vacancyDate: form.vacancyDate || null,
    vacancyFlexible: !!form.vacancyFlexible,
    sector: form.sector || null,
    airDirections: form.airDirections || null,
    notes: form.notes || null,
    closingPrice: numOrNull(form.closingPrice),
    sqmArnona: numOrNull(form.sqmArnona),
    sqmTabu: numOrNull(form.sqmTabu),
    sqmGross: numOrNull(form.sqmGross),
    sqmNet: numOrNull(form.sqmNet),
    exclusiveStart: form.exclusiveStart ? new Date(form.exclusiveStart).toISOString() : null,
    exclusiveEnd: form.exclusiveEnd ? new Date(form.exclusiveEnd).toISOString() : null,
    // Registry / fees
    neighborhood: form.neighborhood || null,
    gush: form.gush || null,
    helka: form.helka || null,
    arnonaAmount: numOrNull(form.arnonaAmount),
    buildingCommittee: numOrNull(form.buildingCommittee),
    // Elevator
    elevator: !!form.elevator,
    elevatorCount: numOrNull(form.elevatorCount),
    shabbatElevator: !!form.shabbatElevator,
    // Parking
    parking: !!form.parking,
    parkingType: form.parkingType || null,
    parkingCount: numOrNull(form.parkingCount),
    parkingCovered: !!form.parkingCovered,
    parkingCoupled: !!form.parkingCoupled,
    parkingTandem: !!form.parkingTandem,
    parkingEvCharger: !!form.parkingEvCharger,
    nearbyParking: !!form.nearbyParking,
    // Storage
    storage: !!form.storage,
    storageLocation: form.storageLocation || null,
    storageSize: numOrNull(form.storageSize),
    // Shelters + amenities
    ac: !!form.ac,
    safeRoom: !!form.safeRoom,
    floorShelter: !!form.floorShelter,
    shelter: !!form.shelter,
    // Commercial
    kitchenette: !!form.kitchenette,
    meetingRoom: !!form.meetingRoom,
    workstations: numOrNull(form.workstations),
    lobbySecurity: !!form.lobbySecurity,
  });
  const buildFullEditBody = () => ({ ...buildStep1Body(), ...buildStep2Body() });

  // ── Step 1 save: creates the property ──────────────────────────────
  const saveStep1 = async (e) => {
    e?.preventDefault?.();
    setError(null);
    try {
      if (!form.street || !form.city) throw new Error('חסר רחוב ועיר');
      // Task 3 · the street must come from the AddressField autocomplete.
      // `placeId` is stamped only when the agent picks from the list (or the
      // property was already saved with one — edit mode fall-through below).
      // Legacy properties without a placeId can re-save because we fall back
      // to their existing lat/lng when present.
      const hasValidatedAddress = !!form.placeId
        || (form.lat != null && form.lng != null)
        || (isEdit && existingMeta?.lat != null);
      if (!hasValidatedAddress) {
        throw new Error('בחר רחוב מהרשימה המוצעת כדי לאמת את הכתובת');
      }
      const hasOwnerLink = !!form.propertyOwnerId;
      if (!hasOwnerLink && (!form.owner || !form.ownerPhone)) {
        throw new Error('חסרים פרטי בעל הנכס');
      }
      if (!form.marketingPrice) throw new Error('חסר מחיר שיווק');
      if (!form.sqm) throw new Error('חסר שטח במ״ר');
      setSubmitting(true);
      if (isEdit) {
        // Send the full union so step-2-only fields can't get dropped
        // when someone hits save from step 1.
        await api.updateProperty(editId, buildFullEditBody());
        toast.success('פרטי הנכס עודכנו · המשך למאפיינים');
        setStep(2);
      } else {
        const res = await api.createProperty(buildStep1Body());
        const id = res.property?.id;
        setPropertyId(id);
        toast.success('הנכס נשמר · המשך להשלמת הפרטים');
        setStep(2);
      }
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
      // Edit mode: send the full union too, so a save from step 2 never
      // leaves step-1 edits un-persisted (the bug: "יצאתי ונכנסתי לעריכה
      // ויש מצב שדברים לא נשמרו").
      const patch = isEdit ? buildFullEditBody() : buildStep2Body();
      await api.updateProperty(propertyId, patch);

      // Upload photos sequentially
      for (const p of photoFiles) {
        try {
          // eslint-disable-next-line no-await-in-loop
          await api.uploadPropertyImage(propertyId, p.file);
        } catch (_) { /* continue on per-file failure */ }
      }
      photoFiles.forEach((p) => URL.revokeObjectURL(p.url));
      if (!isEdit) clearDraft();
      toast.success(isEdit ? 'הנכס עודכן' : 'הנכס נשמר במלואו');
      navigate(`/properties/${propertyId}`);
    } catch (e2) {
      setError(e2.message || 'שמירה נכשלה');
      setSubmitting(false);
    }
  };

  const skipStep2 = () => {
    if (!isEdit) clearDraft();
    if (isEdit) toast.info('חזרה לכרטיס הנכס — השינויים שבשלב 1 כבר נשמרו');
    else toast.info('דילגת על ההשלמה — ניתן להשלים מעמוד הנכס');
    navigate(propertyId ? `/properties/${propertyId}` : '/properties');
  };

  if (isEdit && loadingExisting) {
    return (
      <div className="form-page np-wizard">
        <div className="page-header animate-in">
          <div className="page-header-info">
            <h2>טוען נכס…</h2>
            <p>רגע, מביאים את הפרטים המעודכנים</p>
          </div>
        </div>
      </div>
    );
  }

  const backTarget = isEdit ? `/properties/${editId}` : '/properties';
  const backLabel = isEdit ? 'חזרה לכרטיס' : 'חזרה לנכסים';
  const headerTitle = isEdit
    ? (step === 1 ? 'עריכת נכס' : 'עריכה — חבילת שיווק')
    : (step === 1 ? 'נכס חדש' : 'השלמת פרטי הנכס');
  const headerSub = isEdit
    ? `${existingMeta?.street || form.street}${existingMeta?.city || form.city ? ', ' : ''}${existingMeta?.city || form.city}`
    : (step === 1
        ? 'מינימום לקליטה מהירה — אפשר להמשיך מאוחר יותר'
        : `המשך לעבוד על ${form.street}, ${form.city}`);

  // In edit mode the property already exists, so the user can hop between
  // the two steps freely. In create mode, step 2 is gated behind step 1
  // actually persisting. Crucially for edit mode: auto-save before
  // switching so step-1 tweaks can't vanish when the agent hops to step 2
  // without hitting the save button.
  const goToStep = async (n) => {
    if (n === step) return;
    if (isEdit) {
      // S9: flush the currently-focused input's uncommitted React state
      // BEFORE building the save body. Without this blur, SmartFields'
      // onChange hasn't fired for the in-flight character and the last
      // keystroke disappears when the step switches.
      try {
        if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
      } catch { /* ignore */ }
      // Let React commit the blur-triggered state update before we read
      // form state to build the save body.
      await new Promise((resolve) => requestAnimationFrame(resolve));
      try {
        await api.updateProperty(editId, buildFullEditBody());
      } catch { /* non-blocking; user still moves to the other tab */ }
      setStep(n);
      return;
    }
    if (propertyId) setStep(n);
  };

  return (
    <div className={`form-page np-wizard has-sticky-bar ${isEdit ? 'np-is-edit' : ''}`}>
      {!isEdit && (
        <PageTour
          pageKey="new-property"
          steps={[
            { target: 'body', placement: 'center',
              title: 'נכס חדש בשני שלבים',
              content: 'שלב 1: 7 שדות חובה — נשמר. שלב 2: השלמת מאפיינים. טיוטה נשמרת אוטומטית, אפשר לעצור באמצע ולחזור.' },
          ]}
        />
      )}
      <Link to={backTarget} className="back-link animate-in">
        <ArrowRight size={16} />
        {backLabel}
      </Link>

      <div className="page-header animate-in">
        <div className="page-header-info">
          <h2>{headerTitle}</h2>
          <p>{headerSub}</p>
        </div>
      </div>

      {draftBanner && !isEdit && (
        <div className="draft-banner animate-in" role="status">
          <span>
            נמצאה טיוטה שנשמרה
            {draftBanner.savedAt && (
              <span className="draft-banner-age"> · {relLabel(draftBanner.savedAt)}</span>
            )}
          </span>
          <div className="draft-banner-actions">
            <button type="button" className="btn btn-secondary btn-sm" onClick={restoreDraft}>שחזר</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={discardDraft}>מחק</button>
          </div>
        </div>
      )}

      <div className="np-steps animate-in animate-in-delay-1">
        <button
          type="button"
          className={`np-step np-step-btn ${step === 1 ? 'active' : step > 1 ? 'done' : ''}`}
          onClick={() => goToStep(1)}
          aria-current={step === 1 ? 'step' : undefined}
          disabled={!isEdit && !propertyId && step === 1}
        >
          <span className="np-step-no">{step > 1 ? <CheckCircle2 size={14} /> : '1'}</span>
          <div>
            <strong>יסודות</strong>
            <span>{isEdit ? 'כתובת, מחיר, בעל הנכס' : '7 שדות · שמירה יוצרת את הנכס'}</span>
          </div>
        </button>
        <div className="np-step-line" />
        <button
          type="button"
          className={`np-step np-step-btn ${step === 2 ? 'active' : ''}`}
          onClick={() => goToStep(2)}
          aria-current={step === 2 ? 'step' : undefined}
          disabled={!isEdit && !propertyId}
        >
          <span className="np-step-no">2</span>
          <div>
            <strong>חבילת שיווק</strong>
            <span>{isEdit ? 'מאפיינים, תמונות, בלעדיות' : 'מאפיינים, תמונות, בלעדיות · לא חובה עכשיו'}</span>
          </div>
        </button>
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
                {/* Task 3 · Photon-backed autocomplete; only a picked
                    suggestion stamps lat/lng/placeId/formattedAddress onto
                    the form. Raw typing leaves placeId=null — form save
                    blocks with a Hebrew validation message below. */}
                <AddressField
                  value={form.street}
                  // Plain street-text edits — DON'T blow away the pick on
                  // every keystroke. Many Israeli streets have no per-house
                  // OSM record, so the agent legitimately needs to add a
                  // house number after picking the street row. AddressField
                  // tracks the picked label and only fires onClear when the
                  // typed text actually diverges from it.
                  onChange={(v) => setForm((p) => ({ ...p, street: v }))}
                  onPick={(r) => {
                    setForm((p) => ({
                      ...p,
                      street: r.street || p.street,
                      city: r.city || p.city,
                      placeId: r.placeId,
                      formattedAddress: r.formattedAddress,
                      lat: r.lat,
                      lng: r.lng,
                    }));
                  }}
                  onClear={() => {
                    // Fired only when the agent diverges from the picked
                    // label — invalidate the validated metadata so save
                    // blocks until they pick (or use-current-location).
                    setForm((p) => ({
                      ...p,
                      placeId: null,
                      formattedAddress: null,
                      lat: null,
                      lng: null,
                    }));
                  }}
                  city={form.city}
                  placeholder="לדוגמה: הרצל 15"
                  aria-label="רחוב ומספר"
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

            {/* Owner-as-fields: the inline inputs are the always-visible
              * primary form. The picker is a small auxiliary "quick-fill"
              * link at the top — it just pre-fills these same inputs and
              * stores the matched owner's id so the backend links instead
              * of duplicating. Editing any field after a pick implicitly
              * unlinks (the server-side dedupe by phone re-matches if the
              * user just adjusted casing or a typo). */}
            <div className="np-owner-quickpick">
              <button
                type="button"
                className="np-owner-quickpick-btn"
                onClick={() => setOwnerPickerOpen(true)}
              >
                <UserCheck size={14} />
                כבר במערכת? בחר בעל נכס קיים
              </button>
              {form.propertyOwnerId && (
                <span className="np-owner-linked-badge" title="מקושר לכרטיס בעל נכס קיים">
                  <CheckCircle2 size={12} />
                  בעל נכס מקושר
                  <button
                    type="button"
                    className="np-owner-unlink-link"
                    onClick={() => setForm((p) => ({
                      ...p, propertyOwnerId: null, pickedOwner: null,
                    }))}
                  >
                    שחרר
                  </button>
                </span>
              )}
              <span className="np-owner-divider np-mobile-only">או מלא פרטים חדשים למטה</span>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">שם מלא של בעל הנכס</label>
                <input
                  {...inputPropsForName()}
                  className="form-input"
                  value={form.owner}
                  onChange={(e) => {
                    update('owner', e.target.value);
                    // Editing implicitly unlinks — server dedupes by phone
                    if (form.propertyOwnerId) {
                      setForm((p) => ({ ...p, propertyOwnerId: null, pickedOwner: null }));
                    }
                  }}
                  placeholder="ישראל ישראלי"
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">טלפון בעל הנכס</label>
                <PhoneField
                  value={form.ownerPhone}
                  onChange={(v) => {
                    update('ownerPhone', v);
                    if (form.propertyOwnerId) {
                      setForm((p) => ({ ...p, propertyOwnerId: null, pickedOwner: null }));
                    }
                  }}
                />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">אימייל (אופציונלי)</label>
                <input
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  enterKeyHint="next"
                  className="form-input"
                  value={form.ownerEmail || ''}
                  onChange={(e) => update('ownerEmail', e.target.value)}
                  placeholder="owner@example.com"
                  dir="ltr"
                  style={{ textAlign: 'right' }}
                />
              </div>
            </div>
          </div>

          <div className="form-actions form-actions-desktop">
            <button type="submit" className="btn btn-primary btn-lg" disabled={submitting}>
              <Save size={18} />
              {submitting ? 'שומר…' : isEdit ? 'עדכן והמשך' : 'שמור והמשך'}
            </button>
            <Link to={backTarget} className="btn btn-secondary btn-lg">ביטול</Link>
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
                <input
                  type="date"
                  className="form-input"
                  value={form.vacancyDate}
                  onChange={(e) => update('vacancyDate', e.target.value)}
                  disabled={form.vacancyFlexible}
                />
                <DateQuickChips
                  value={form.vacancyDate}
                  onChange={(v) => { update('vacancyDate', v); update('vacancyFlexible', false); }}
                  chips={['today', '+3m', '+6m']}
                />
                <label className="checkbox-item" style={{ marginTop: 6 }}>
                  <input
                    type="checkbox"
                    checked={form.vacancyFlexible}
                    onChange={(e) => {
                      update('vacancyFlexible', e.target.checked);
                      if (e.target.checked) update('vacancyDate', '');
                    }}
                  />
                  <span className="checkbox-custom" />
                  גמיש
                </label>
              </div>
            </div>
            {isCommercial ? (
              <>
                <div className="form-row form-row-3">
                  <div className="form-group">
                    <label className="form-label">שטח ברוטו</label>
                    <NumberField unit="מ״ר" placeholder="220" value={form.sqmGross} onChange={(v) => update('sqmGross', v)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">שטח נטו</label>
                    <NumberField unit="מ״ר" placeholder="180" value={form.sqmNet} onChange={(v) => update('sqmNet', v)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">מצב בנייה</label>
                    <SelectField
                      value={form.buildState}
                      onChange={(v) => update('buildState', v)}
                      placeholder="בחר…"
                      options={['מעטפת', 'גמר']}
                    />
                  </div>
                </div>
                <div className="form-row form-row-3">
                  <div className="form-group">
                    <label className="form-label">מ״ר ארנונה</label>
                    <NumberField unit="מ״ר" placeholder="115" value={form.sqmArnona} onChange={(v) => update('sqmArnona', v)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">מ״ר טאבו</label>
                    <NumberField unit="מ״ר" placeholder="120" value={form.sqmTabu} onChange={(v) => update('sqmTabu', v)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">מספר עמדות ישיבה</label>
                    <NumberField placeholder="12" value={form.workstations} onChange={(v) => update('workstations', v)} />
                  </div>
                </div>
              </>
            ) : (
              <div className="form-row form-row-2">
                <div className="form-group">
                  <label className="form-label">מ״ר טאבו</label>
                  <NumberField unit="מ״ר" placeholder="120" value={form.sqmTabu} onChange={(v) => update('sqmTabu', v)} />
                </div>
                <div className="form-group">
                  <label className="form-label">מ״ר ארנונה</label>
                  <NumberField unit="מ״ר" placeholder="115" value={form.sqmArnona} onChange={(v) => update('sqmArnona', v)} />
                </div>
              </div>
            )}
            <div className="checkbox-grid">
              {[
                { key: 'elevator', label: 'מעלית' },
                { key: 'parking', label: 'חניה' },
                { key: 'storage', label: 'מחסן' },
                { key: 'ac', label: 'מזגנים' },
                ...(isCommercial
                  ? [
                      { key: 'kitchenette',   label: 'מטבחון' },
                      { key: 'meetingRoom',   label: 'חדר ישיבות' },
                      { key: 'lobbySecurity', label: 'עמדת שמירה בלובי' },
                      { key: 'nearbyParking', label: 'חניה זמינה בסביבה' },
                    ]
                  : [{ key: 'safeRoom', label: 'ממ״ד' }]),
                { key: 'floorShelter', label: 'מרחב מוגן קומתי' },
                { key: 'shelter',      label: 'מקלט' },
              ].map(({ key, label }) => (
                <label key={key} className="checkbox-item">
                  <input type="checkbox" checked={form[key]} onChange={(e) => update(key, e.target.checked)} />
                  <span className="checkbox-custom" />
                  {label}
                </label>
              ))}
            </div>
          </div>

          {/* ── אזור ורישום ─────────────────────────────────────────── */}
          <div className="form-section">
            <h3 className="form-section-title">אזור ורישום</h3>
            <div className="form-row form-row-3">
              <div className="form-group">
                <label className="form-label">שכונה</label>
                <input
                  autoCapitalize="words"
                  autoCorrect="off"
                  enterKeyHint="next"
                  className="form-input"
                  value={form.neighborhood}
                  onChange={(e) => update('neighborhood', e.target.value)}
                  placeholder="רמת שרת"
                />
              </div>
              <div className="form-group">
                <label className="form-label">גוש</label>
                <input
                  type="text"
                  className="form-input"
                  value={form.gush}
                  onChange={(e) => update('gush', e.target.value)}
                  placeholder="6118"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  enterKeyHint="next"
                  autoComplete="off"
                  dir="ltr"
                  style={{ textAlign: 'right' }}
                />
              </div>
              <div className="form-group">
                <label className="form-label">חלקה</label>
                <input
                  type="text"
                  className="form-input"
                  value={form.helka}
                  onChange={(e) => update('helka', e.target.value)}
                  placeholder="212"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  enterKeyHint="next"
                  autoComplete="off"
                  dir="ltr"
                  style={{ textAlign: 'right' }}
                />
              </div>
            </div>
            <div className="form-row form-row-2">
              <div className="form-group">
                <label className="form-label">ארנונה חודשית</label>
                <NumberField unit="₪" placeholder="450" value={form.arnonaAmount} onChange={(v) => update('arnonaAmount', v)} />
              </div>
              <div className="form-group">
                <label className="form-label">ועד בית חודשי</label>
                <NumberField unit="₪" placeholder="220" value={form.buildingCommittee} onChange={(v) => update('buildingCommittee', v)} />
              </div>
            </div>
          </div>

          {/* ── מעלית מפורט ─────────────────────────────────────────── */}
          {form.elevator && (
            <div className="form-section">
              <h3 className="form-section-title">פרטי מעלית</h3>
              <div className="form-row form-row-2">
                <div className="form-group">
                  <label className="form-label">כמה מעליות</label>
                  <NumberField placeholder="1" min={1} max={12} value={form.elevatorCount} onChange={(v) => update('elevatorCount', v)} />
                </div>
                <div className="form-group" style={{ alignSelf: 'end' }}>
                  <label className="checkbox-item" style={{ marginBottom: 0 }}>
                    <input type="checkbox" checked={form.shabbatElevator} onChange={(e) => update('shabbatElevator', e.target.checked)} />
                    <span className="checkbox-custom" />
                    מעלית שבת
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* ── חניה מפורט ─────────────────────────────────────────── */}
          {form.parking && (
            <div className="form-section">
              <h3 className="form-section-title">פרטי חניה</h3>
              <div className="form-row form-row-3">
                <div className="form-group">
                  <label className="form-label">סוג</label>
                  <SelectField
                    value={form.parkingType}
                    onChange={(v) => update('parkingType', v)}
                    placeholder="בחר…"
                    options={[
                      { value: 'tabu',    label: 'חניה בטאבו' },
                      { value: 'private', label: 'חניית דיירים פרטית' },
                      { value: 'nearby',  label: 'חניה בקרבת הנכס' },
                    ]}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">כמות</label>
                  <NumberField placeholder="1" min={0} max={20} value={form.parkingCount} onChange={(v) => update('parkingCount', v)} />
                </div>
              </div>
              <div className="checkbox-grid">
                {[
                  { key: 'parkingCovered',   label: 'מקורה' },
                  { key: 'parkingCoupled',   label: 'צמודה' },
                  { key: 'parkingTandem',    label: 'עוקבת' },
                  { key: 'parkingEvCharger', label: 'עמדת הטענה לרכב חשמלי' },
                ].map(({ key, label }) => (
                  <label key={key} className="checkbox-item">
                    <input type="checkbox" checked={form[key]} onChange={(e) => update(key, e.target.checked)} />
                    <span className="checkbox-custom" />
                    {label}
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* ── מחסן מפורט ─────────────────────────────────────────── */}
          {form.storage && (
            <div className="form-section">
              <h3 className="form-section-title">פרטי מחסן</h3>
              <div className="form-row form-row-2">
                <div className="form-group">
                  <label className="form-label">מיקום</label>
                  <SelectField
                    value={form.storageLocation}
                    onChange={(v) => update('storageLocation', v)}
                    placeholder="בחר…"
                    options={[
                      { value: 'attached', label: 'צמוד לנכס' },
                      { value: 'basement', label: 'במרתף' },
                    ]}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">גודל</label>
                  <NumberField unit="מ״ר" placeholder="4" min={0} max={200} value={form.storageSize} onChange={(v) => update('storageSize', v)} />
                </div>
              </div>
            </div>
          )}

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
            {isEdit && (
              <ExclusivityAgreementUpload
                propertyId={editId}
                initialUrl={existingMeta?.exclusivityAgreementUrl}
                onChange={(url) => setExistingMeta((m) => ({ ...(m || {}), exclusivityAgreementUrl: url }))}
                toast={toast}
              />
            )}
            <div className="form-group">
              <textarea className="form-textarea" rows={3} dir="auto" autoCapitalize="sentences" enterKeyHint="enter" placeholder="הערות נוספות על הנכס..." value={form.notes} onChange={(e) => update('notes', e.target.value)} />
            </div>
          </div>

          <div className="form-section">
            <h3 className="form-section-title">תמונות</h3>
            {isEdit && (
              <p className="np-edit-photo-hint">
                <span>
                  <strong>{existingMeta?.imageCount || 0}</strong> תמונות קיימות.
                  כל תמונה שתעלה כאן תתווסף לגלריה — לסידור או מחיקה של תמונות קיימות השתמש בכרטיס התמונות בעמוד הנכס.
                </span>
              </p>
            )}
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
              {submitting ? 'שומר…' : isEdit ? 'שמור שינויים' : 'שמור וסיים'}
            </button>
            <button type="button" className="btn btn-ghost btn-lg" onClick={skipStep2}>
              {isEdit ? 'חזור לכרטיס' : 'דלג להמשך מאוחר יותר'}
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
              {submitting ? 'שומר…' : isEdit ? 'עדכן והמשך' : 'שמור והמשך'}
            </button>
            <Link to={backTarget} className="btn btn-secondary btn-lg">ביטול</Link>
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
              {submitting ? 'שומר…' : isEdit ? 'שמור שינויים' : 'שמור וסיים'}
            </button>
            <button type="button" className="btn btn-ghost btn-lg" onClick={skipStep2}>
              {isEdit ? 'חזור' : 'דלג'}
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

function ExclusivityAgreementUpload({ propertyId, initialUrl, onChange, toast }) {
  const [url, setUrl] = useState(initialUrl || null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => { setUrl(initialUrl || null); }, [initialUrl]);

  const onPick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.type !== "application/pdf") {
      toast?.error?.("רק קובץ PDF");
      return;
    }
    setBusy(true);
    try {
      const res = await api.uploadExclusivityAgreement(propertyId, file);
      const newUrl = res?.exclusivityAgreementUrl || null;
      setUrl(newUrl);
      onChange?.(newUrl);
      toast?.success?.("הסכם הבלעדיות נשמר");
    } catch (err) {
      toast?.error?.(err?.message || "העלאת ההסכם נכשלה");
    } finally {
      setBusy(false);
    }
  };

  const onRemove = async () => {
    if (!url) return;
    setBusy(true);
    try {
      await api.deleteExclusivityAgreement(propertyId);
      setUrl(null);
      onChange?.(null);
      toast?.info?.("הוסר");
    } catch (err) {
      toast?.error?.(err?.message || "הסרה נכשלה");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="np-agreement">
      <div className="np-agreement-head">
        <strong>הסכם בלעדיות חתום (PDF)</strong>
        <span>חובה לפרסום ביד 2</span>
      </div>
      {url ? (
        <div className="np-agreement-row np-agreement-has">
          <a href={url} target="_blank" rel="noreferrer" className="np-agreement-link">
            פתח את ההסכם
          </a>
          <div className="np-agreement-actions">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => inputRef.current?.click()} disabled={busy}>
              החלף קובץ
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={onRemove} disabled={busy}>
              הסר
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="np-agreement-drop"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
        >
          <Upload size={16} />
          {busy ? "מעלה…" : "בחר PDF מההתקן"}
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        style={{ display: "none" }}
        onChange={onPick}
      />
    </div>
  );
}

