// Column auto-detection — ported from backend/src/lib/importDetect.ts
// so the wizard can suggest mappings client-side (zero round trips).
// Backend keeps its own copy for batch validation; they must stay in
// sync. Fields list + regex table matches the TS version byte-for-byte
// (see backend/src/lib/importDetect.ts for the reference version with
// doc comments).

export const LEAD_FIELDS = [
  'name', 'firstName', 'lastName', 'phone', 'email',
  'city', 'street', 'lookingFor', 'interestType',
  'priceMin', 'priceMax', 'roomsMin', 'roomsMax',
  'source', 'seriousnessOverride', 'notes',
];
export const PROPERTY_FIELDS = [
  'assetClass', 'category', 'type',
  'street', 'city', 'neighborhood',
  'rooms', 'sqm', 'floor', 'totalFloors',
  'marketingPrice', 'owner', 'ownerPhone', 'ownerEmail',
  'elevator', 'parking', 'storage', 'airConditioning', 'balconySize',
  'notes',
];

// Hebrew letters aren't in \w, so JS \b anchors silently fail on Hebrew
// headers. Patterns rely on ordered specificity + the `used` set below
// instead — longer/more-specific patterns come first, and each field
// can only bind to one column per sheet.
const LEAD_PATTERNS = [
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

const PROPERTY_PATTERNS = [
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

export function detectColumns(headers, entityType) {
  const table = entityType === 'LEAD' ? LEAD_PATTERNS : PROPERTY_PATTERNS;
  const out = {};
  const used = new Set();
  for (const raw of headers) {
    const header = (raw ?? '').toString().trim();
    if (!header) { out[raw] = null; continue; }
    const normalized = header.replace(/^[\d.\s:-]+/, '').trim();
    let hit = null;
    for (const [field, patterns] of table) {
      if (used.has(field)) continue;
      if (patterns.some((p) => p.test(normalized))) { hit = field; break; }
    }
    if (hit) used.add(hit);
    out[raw] = hit;
  }
  return out;
}

export function headerSignature(headers) {
  return headers
    .map((h) => (h ?? '').toString().trim().toLowerCase())
    .filter(Boolean)
    .sort()
    .join('|');
}

// Hebrew display labels for each Estia field — surfaced in the
// mapping-step dropdown and the preview grid.
export const FIELD_LABELS = {
  name:              'שם מלא',
  firstName:         'שם פרטי',
  lastName:          'שם משפחה',
  phone:             'טלפון',
  email:             'אימייל',
  city:              'עיר',
  street:            'רחוב / כתובת',
  neighborhood:      'שכונה',
  lookingFor:        'מכירה / השכרה',
  interestType:      'פרטי / מסחרי',
  priceMin:          'מחיר מינימום',
  priceMax:          'מחיר מקסימום',
  roomsMin:          'חדרים מינימום',
  roomsMax:          'חדרים מקסימום',
  rooms:             'חדרים',
  sqm:               'שטח (מ״ר)',
  floor:             'קומה',
  totalFloors:       'סה״כ קומות',
  type:              'סוג נכס',
  assetClass:        'קטגוריה (מגורים/מסחרי)',
  category:          'עסקה (מכירה/השכרה)',
  marketingPrice:    'מחיר',
  owner:             'שם בעלים',
  ownerPhone:        'טלפון בעלים',
  ownerEmail:        'אימייל בעלים',
  elevator:          'מעלית',
  parking:           'חניה',
  storage:           'מחסן',
  airConditioning:   'מזגן',
  balconySize:       'מרפסת (מ״ר)',
  source:            'מקור',
  seriousnessOverride: 'רצינות',
  notes:             'הערות / תיאור',
};
