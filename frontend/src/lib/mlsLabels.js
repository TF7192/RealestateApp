// Sprint 2 / MLS parity — frontend-only copy of the Hebrew label
// maps that Nadlan One uses. The backend equivalent lives in
// backend/src/lib/mls-labels.ts; keep these in sync when adding new
// enum values. Backend is the source of truth — this file exists so
// the UI doesn't have to import from the backend package (we don't
// share code across the server / client boundary in this repo).
//
// Keep flat (data-only) so it stays greppable.

// Lead heat — thermal status.
export const LEAD_HEAT_LABELS = {
  HOT:  'חם',
  WARM: 'חמים',
  COLD: 'קר',
};

// Customer lifecycle (Nadlan "סטטוס לקוח").
export const CUSTOMER_STATUS_LABELS = {
  ACTIVE:    'פעיל',
  INACTIVE:  'לא פעיל',
  CANCELLED: 'מבוטל',
  PAUSED:    'מושהה',
  IN_DEAL:   'בעיסקה',
  BOUGHT:    'רכש',
  RENTED:    'שכר',
};

// Quick-lead status (Nadlan "LeadStatusID").
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

// Seriousness (shared: Lead + Property.sellerSeriousness).
export const SERIOUSNESS_LABELS = {
  NONE:    'ללא',
  SORT_OF: 'סוג של',
  MEDIUM:  'בינוני',
  VERY:    'מאוד',
};

// Interest / property kind. Not from Nadlan but used in the filter
// drawer so we keep the label list centralized.
export const PROPERTY_TYPE_LABELS = {
  residential: 'מגורים',
  commercial:  'מסחרי',
  land:        'קרקע',
  office:      'משרד',
  storage:     'מחסן',
  parking:     'חניה',
};

// Small convenience: return [{value, label}] pairs for <select>/chip grids.
export function labelOptions(map) {
  return Object.entries(map).map(([value, label]) => ({ value, label }));
}
