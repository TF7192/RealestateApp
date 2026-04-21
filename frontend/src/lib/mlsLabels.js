// Hebrew labels for MLS-parity enum values.
//
// Mirrors backend/src/lib/mls-labels.ts. Kept as a separate frontend
// file so we don't import across the backend/frontend boundary (TS → JS,
// backend bundles pull in pino/etc.). Keep the two files in sync when
// values are added — the unit test in tests/unit/frontend/mlsLabels.test.js
// asserts the maps cover every enum value the app renders.

// ── Lead heat — thermal status ──────────────────────────────────────
export const LEAD_HEAT_LABELS = {
  HOT:  'חם',
  WARM: 'חמים',
  COLD: 'קר',
};

// ── Customer lifecycle (Nadlan "סטטוס לקוח") ────────────────────────
export const CUSTOMER_STATUS_LABELS = {
  ACTIVE:    'פעיל',
  INACTIVE:  'לא פעיל',
  CANCELLED: 'מבוטל',
  PAUSED:    'מושהה',
  IN_DEAL:   'בעיסקה',
  BOUGHT:    'רכש',
  RENTED:    'שכר',
};

// ── Quick-lead status (Nadlan "LeadStatusID") ───────────────────────
export const QUICK_LEAD_STATUS_LABELS = {
  NEW:                      'חדש',
  INTENT_TO_CALL:           'בכוונת התקשרות',
  CONVERTED:                'הומר',
  DISQUALIFIED:             'נפסל',
  NOT_INTERESTED:           'לא מעוניין',
  IN_PROGRESS:              'בתהליך',
  CONVERTED_NO_OPPORTUNITY: 'הומר, אין הזדמנות',
  DELETED:                  'נמחק',
  ARCHIVED:                 'ארכיון',
};

// ── Seriousness (shared: Lead + Property.sellerSeriousness) ─────────
export const SERIOUSNESS_LABELS = {
  NONE:    'ללא',
  SORT_OF: 'סוג של',
  MEDIUM:  'בינוני',
  VERY:    'מאוד',
};

// ── Customer purpose ────────────────────────────────────────────────
export const CUSTOMER_PURPOSE_LABELS = {
  INVESTMENT:   'השקעה',
  RESIDENCE:    'מגורים',
  COMMERCIAL:   'מסחרי',
  COMBINATION:  'משולב',
};

// ── Interest / property kind (filter drawer on Customers page) ──────
// Not from Nadlan; centralized here so the label list has one home.
export const PROPERTY_TYPE_LABELS = {
  residential: 'מגורים',
  commercial:  'מסחרי',
  land:        'קרקע',
  office:      'משרד',
  storage:     'מחסן',
  parking:     'חניה',
};

// ── Helpers ─────────────────────────────────────────────────────────
// Turn a {VALUE: 'תווית'} map into the options array shape the
// SelectField/Segmented components accept ([{value, label}, …]).
export function labelsToOptions(map) {
  return Object.entries(map).map(([value, label]) => ({ value, label }));
}

// Back-compat alias — earlier callers imported `labelOptions`.
export const labelOptions = labelsToOptions;

// Look up a label with a safe fallback so raw enum values never leak
// to the UI when the map is out of date. Returns the original string
// when no entry exists rather than throwing.
export function labelFor(map, value) {
  if (value == null || value === '') return '';
  return map[value] ?? String(value);
}
