// Column auto-detection for the Excel/CSV import wizard.
//
// Given a list of raw header strings from an uploaded sheet, suggest the
// Estia field each column maps to. The wizard then renders the
// suggestions in a table; the agent confirms or overrides per column.
//
// The patterns below are seeded from the sample files the user sent
// (Hebrew real-estate asset tables) plus the common English field
// names used by the export tools agents bounce between. Add more as
// we see new formats — the detector is additive, never destructive:
// a column that matches nothing falls through to `null` ("ignore").

export type EntityType = 'LEAD' | 'PROPERTY';

// Fields a Lead row can carry post-import. `null` = skip this column.
export const LEAD_FIELDS = [
  'name',          // "ישראל ישראלי"  (will auto-split to firstName/lastName if combined)
  'firstName',
  'lastName',
  'phone',
  'email',
  'city',
  'street',
  'lookingFor',    // 'BUY' | 'RENT'
  'interestType',  // 'PRIVATE' | 'COMMERCIAL'
  'priceMin',
  'priceMax',
  'roomsMin',
  'roomsMax',
  'source',
  'seriousnessOverride',
  'notes',
] as const;
export type LeadField = typeof LEAD_FIELDS[number];

// Fields a Property row can carry post-import.
export const PROPERTY_FIELDS = [
  'assetClass',    // 'RESIDENTIAL' | 'COMMERCIAL'
  'category',      // 'SALE' | 'RENT'
  'type',
  'street',
  'city',
  'neighborhood',
  'rooms',
  'sqm',
  'floor',
  'totalFloors',
  'marketingPrice',
  'owner',
  'ownerPhone',
  'ownerEmail',
  'elevator',
  'parking',
  'storage',
  'airConditioning',
  'balconySize',
  'notes',
] as const;
export type PropertyField = typeof PROPERTY_FIELDS[number];

// Regex table — each row says "if the header matches any of these
// patterns, suggest this field." First match wins. Patterns are
// case-insensitive and tolerant of double-quote vs gershayim in
// Hebrew abbreviations ("מ״ר" vs "מ\"ר").
//
// Hebrew letters aren't in \w, so JS \b anchors silently fail on
// Hebrew headers. Patterns rely on ordered specificity + the `used`
// set in detectColumns — longer/more-specific patterns come first,
// and each field can only bind to one column per sheet.
const LEAD_PATTERNS: Array<[LeadField, RegExp[]]> = [
  ['firstName',           [/^(שם ?פרטי|first ?name)/i]],
  ['lastName',            [/^(שם ?משפחה|last ?name|surname)/i]],
  ['name',                [/^(שם ?מלא|full ?name|contact|client|לקוח)/i, /^שם(?:$|\s)/, /^name/i]],
  ['phone',               [/^(טלפון ?נייד|נייד|טלפון|phone|mobile|cell|tel)/i]],
  ['email',               [/^(אימייל|אימיל|דוא"?ל|email|e[- ]?mail|mail)/i]],
  ['city',                [/^(עיר ?מבוקשת|עיר|ישוב|city|town|locality)/i]],
  ['street',              [/^(רחוב ?מבוקש|רחוב|כתובת|street|address|addr)/i]],
  ['lookingFor',          [/^(מחפש|סוג ?עסקה|deal ?type|looking ?for)/i]],
  ['interestType',        [/^(סוג ?נכס|interest|property ?type|private\/?commercial)/i]],
  ['priceMin',            [/^(מחיר ?מ|price ?min|מינימום ?מחיר)/i]],
  ['priceMax',            [/^(מחיר ?עד|price ?max|תקציב|מקסימום ?מחיר|max ?price|budget)/i]],
  ['roomsMin',            [/^(חדרים ?מ|rooms ?min|מינימום ?חדרים)/i]],
  ['roomsMax',            [/^(חדרים ?עד|rooms ?max|מקסימום ?חדרים|max ?rooms)/i]],
  ['source',              [/^(מקור ?ליד|מקור|source|utm|origin)/i]],
  ['seriousnessOverride', [/^(רצינות|seriousness|priority)/i]],
  ['notes',               [/^(הערות|תיאור|comments?|notes?|remarks?|description|desc)/i]],
];

const PROPERTY_PATTERNS: Array<[PropertyField, RegExp[]]> = [
  ['neighborhood',    [/^(שכונה|שכ'|neighborhood|neighbourhood)/i]],
  ['street',          [/^(רחוב|כתובת|address|street)/i]],
  ['city',            [/^(עיר|ישוב|city|town)/i]],
  ['rooms',           [/^(חדרים|rooms)/i]],
  ['sqm',             [/^(מ["״]?ר|שטח|area|sqm|size|m2|m²)/i]],
  ['totalFloors',     [/^(סה"כ ?קומות|total ?floors|floors ?total)/i]],
  ['floor',           [/^(קומה|floor)/i]],
  ['marketingPrice',  [/^(מחיר|price|asking|amount|ask)/i]],
  ['type',            [/^(סוג ?נכס|סוג|type)/i]],
  ['assetClass',      [/^(קטגוריה|category|class|residential\/?commercial)/i]],
  ['category',        [/^(מכירה\/?השכרה|sale\/?rent|deal ?type)/i]],
  ['ownerPhone',      [/^(טלפון ?בעלים|owner ?phone|seller ?phone|contact)/i]],
  ['ownerEmail',      [/^(אימייל ?בעלים|owner ?email|seller ?email)/i]],
  ['owner',           [/^(בעלים|מוכר|owner|seller|landlord)/i]],
  ['elevator',        [/^(מעלית|elevator|lift)/i]],
  ['parking',         [/^(חניה|חנייה|parking)/i]],
  ['storage',         [/^(מחסן|storage)/i]],
  ['airConditioning', [/^(מזגן|מ["״]?א|a\/?c|ac|airconditioning|air ?condition)/i]],
  ['balconySize',     [/^(מרפסת|balcony)/i]],
  ['notes',           [/^(תיאור ?המודעה|תיאור|הערות|comments?|notes?|description|desc|remarks?)/i]],
];

export type Mapping = Record<string, string | null>;

/**
 * Suggest an Estia field for each header. Unmatched headers map to
 * `null` and the wizard renders them as "skip."
 */
export function detectColumns(headers: string[], entityType: EntityType): Mapping {
  const table = entityType === 'LEAD' ? LEAD_PATTERNS : PROPERTY_PATTERNS;
  const out: Mapping = {};
  const used = new Set<string>();
  for (const raw of headers) {
    const header = (raw ?? '').toString().trim();
    if (!header) { out[raw] = null; continue; }
    // Strip non-letter prefixes ("1. שם") and leading/trailing punct.
    const normalized = header.replace(/^[\d.\s:-]+/, '').trim();
    let hit: string | null = null;
    for (const [field, patterns] of table) {
      if (used.has(field)) continue;
      if (patterns.some((p) => p.test(normalized))) { hit = field; break; }
    }
    if (hit) used.add(hit);
    out[raw] = hit;
  }
  return out;
}

/**
 * Stable signature for a header row — used as the lookup key for the
 * per-agent saved-mapping table. Lowercase + trim + sort so header
 * order shuffles don't prevent re-use of the last mapping.
 */
export function headerSignature(headers: string[]): string {
  return headers
    .map((h) => (h ?? '').toString().trim().toLowerCase())
    .filter(Boolean)
    .sort()
    .join('|');
}
