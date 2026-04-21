// Hebrew labels for MLS-parity enum values.
//
// Mirrors backend/src/lib/mls-labels.ts. Kept as a separate frontend file
// so we don't import across the backend/frontend boundary (TS → JS, and
// backend bundles pull in pino/etc.). Keep the two files in sync when
// values are added — the unit test in tests/unit/frontend/mlsLabels.test.js
// asserts the maps cover every enum value the app renders.

// ── Property lifecycle (Nadlan "שלב הנכס") ─────────────────────────
export const PROPERTY_STAGE_LABELS = {
  WATCHING:              'במעקב',
  PRE_ACQUISITION:       'טרום-קליטה',
  IN_PROGRESS:           'בתהליך',
  SIGNED_NON_EXCLUSIVE:  'חתום — לא בלעדי',
  SIGNED_EXCLUSIVE:      'חתום — בלעדי',
  EXCLUSIVITY_ENDED:     'סיום בלעדיות',
  REFUSED_BROKERAGE:     'סירב לתיווך',
  REMOVED:               'הוסר',
};

// ── Property condition (J4) ────────────────────────────────────────
export const PROPERTY_CONDITION_LABELS = {
  NEW:               'חדש מקבלן',
  AS_NEW:            'כחדש',
  RENOVATED:         'משופצת',
  PRESERVED:         'שמורה',
  NEEDS_RENOVATION:  'דרוש שיפוץ',
  NEEDS_TLC:         'דרוש רענון',
  RAW:               'מעטפת',
};

// ── Seriousness (shared: Lead + Property.sellerSeriousness) ────────
export const SERIOUSNESS_LABELS = {
  NONE:    'ללא',
  SORT_OF: 'סוג של',
  MEDIUM:  'בינוני',
  VERY:    'מאוד',
};

// ── Heating types (J6) ─────────────────────────────────────────────
export const HEATING_TYPE_LABELS = {
  gas:     'גז',
  electric: 'חשמל',
  solar:   'שמש',
  floor:   'רצפתי',
  central: 'מרכזי',
};

// ── Advert channels (F1) ───────────────────────────────────────────
export const ADVERT_CHANNEL_LABELS = {
  YAD2:      'יד2',
  ONMAP:     'on map',
  MADLAN:    'מדלן',
  FACEBOOK:  'פייסבוק',
  WHATSAPP:  'וואטסאפ',
  INSTAGRAM: 'אינסטגרם',
  WEBSITE:   'אתר',
  OTHER:     'אחר',
};

// ── Advert statuses (F1) ───────────────────────────────────────────
export const ADVERT_STATUS_LABELS = {
  DRAFT:     'טיוטה',
  PUBLISHED: 'פורסם',
  PAUSED:    'מושהה',
  EXPIRED:   'פג תוקף',
  REMOVED:   'הוסר',
};

// ── Property assignee roles (J10) ──────────────────────────────────
export const ASSIGNEE_ROLE_LABELS = {
  CO_AGENT: 'שותף',
  OBSERVER: 'צופה',
};

// Helper — turn a {VALUE: 'תווית'} map into the options array shape the
// SelectField/Segmented components accept ([{value, label}, …]).
export function labelsToOptions(map) {
  return Object.entries(map).map(([value, label]) => ({ value, label }));
}

// Helper — look up a label with a safe fallback so raw enum values never
// leak to the UI when the map is out of date. Returns the original
// string when no entry exists rather than throwing.
export function labelFor(map, value) {
  if (value == null || value === '') return '';
  return map[value] ?? String(value);
}
