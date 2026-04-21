// Sprint 1 / MLS parity — Task K5 / J11 (stub).
//
// Single source of truth for mapping Nadlan One's Hebrew field labels
// and value IDs onto Estia's English enum values. Imported by import/
// export code paths and the UI label components. Keep this file flat
// (data-only) so it stays greppable and diffable.

// ── Property status — Nadlan "סטטוס נכס" ────────────────────────────
export const PROPERTY_STATUS_LABELS: Record<string, string> = {
  ACTIVE:    'אקטואלי',
  PAUSED:    'מושהה',
  SOLD:      'נמכר',
  RENTED:    'מושכר',
  ARCHIVED:  'ארכיון',
  INACTIVE:  'לא אקטואלי',
  CANCELLED: 'מבוטל',
  IN_DEAL:   'עיסקה',
};

// ── Property stage — Nadlan "שלב טיפול" ─────────────────────────────
export const PROPERTY_STAGE_LABELS: Record<string, string> = {
  WATCHING:              'במעקב',
  PRE_ACQUISITION:       'לפני רכישה',
  IN_PROGRESS:           'נכס בטיפול',
  SIGNED_NON_EXCLUSIVE:  'חתום אי-בלעדיות',
  SIGNED_EXCLUSIVE:      'חתום בלעדיות',
  EXCLUSIVITY_ENDED:     'בלעדיות הסתיימה',
  REFUSED_BROKERAGE:     'סירב שיווק',
  REMOVED:               'הוסר',
};

// ── Lead heat — thermal status ──────────────────────────────────────
export const LEAD_HEAT_LABELS: Record<string, string> = {
  HOT:  'חם',
  WARM: 'חמים',
  COLD: 'קר',
};

// ── Customer lifecycle (Nadlan "סטטוס לקוח") ────────────────────────
export const CUSTOMER_STATUS_LABELS: Record<string, string> = {
  ACTIVE:    'פעיל',
  INACTIVE:  'לא פעיל',
  CANCELLED: 'מבוטל',
  PAUSED:    'מושהה',
  IN_DEAL:   'בעיסקה',
  BOUGHT:    'רכש',
  RENTED:    'שכר',
};

// ── Quick-lead status (Nadlan "LeadStatusID") ───────────────────────
export const QUICK_LEAD_STATUS_LABELS: Record<string, string> = {
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
export const SERIOUSNESS_LABELS: Record<string, string> = {
  NONE:    'ללא',
  SORT_OF: 'סוג של',
  MEDIUM:  'בינוני',
  VERY:    'מאוד',
};

// ── Customer purpose ────────────────────────────────────────────────
export const CUSTOMER_PURPOSE_LABELS: Record<string, string> = {
  INVESTMENT:   'השקעה',
  RESIDENCE:    'מגורים',
  COMMERCIAL:   'מסחרי',
  COMBINATION:  'משולב',
};

// ── Property condition (J5) ─────────────────────────────────────────
export const PROPERTY_CONDITION_LABELS: Record<string, string> = {
  NEW:              'חדש מקבלן',
  AS_NEW:           'חדש',
  RENOVATED:        'משופץ',
  PRESERVED:        'שמור',
  NEEDS_RENOVATION: 'דורש שיפוץ',
  NEEDS_TLC:        'זקוק לחידוש',
  RAW:              'שלד / מעטפת',
};

// ── Reverse lookups — Hebrew label → English enum value. Useful for
// import pipelines (Nadlan export XLSX, Yad2 scrape). Throws on
// unknown label so broken imports fail loudly instead of silently
// dropping to a default.
function invert(map: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(map)) out[v.trim()] = k;
  return out;
}

export const PROPERTY_STATUS_BY_LABEL    = invert(PROPERTY_STATUS_LABELS);
export const PROPERTY_STAGE_BY_LABEL     = invert(PROPERTY_STAGE_LABELS);
export const LEAD_HEAT_BY_LABEL          = invert(LEAD_HEAT_LABELS);
export const CUSTOMER_STATUS_BY_LABEL    = invert(CUSTOMER_STATUS_LABELS);
export const QUICK_LEAD_STATUS_BY_LABEL  = invert(QUICK_LEAD_STATUS_LABELS);
export const SERIOUSNESS_BY_LABEL        = invert(SERIOUSNESS_LABELS);
export const CUSTOMER_PURPOSE_BY_LABEL   = invert(CUSTOMER_PURPOSE_LABELS);
export const PROPERTY_CONDITION_BY_LABEL = invert(PROPERTY_CONDITION_LABELS);

export function enumFromLabel(
  map: Record<string, string>,
  label: string | null | undefined,
): string | null {
  if (!label) return null;
  const hit = map[label.trim()];
  return hit ?? null;
}
