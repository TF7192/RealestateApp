// Client-side template rendering.
//
// Storage format uses {{var}} tokens internally for backwards compatibility,
// but users never see them — the editor renders Hebrew chips.

import { formatFloor } from './formatFloor';

export const TEMPLATE_KINDS = [
  { key: 'BUY_PRIVATE',     label: 'דירה למכירה',         subtitle: 'מגורים · מכירה' },
  { key: 'RENT_PRIVATE',    label: 'דירה להשכרה',         subtitle: 'מגורים · השכרה' },
  { key: 'BUY_COMMERCIAL',  label: 'נכס מסחרי למכירה',    subtitle: 'מסחרי · מכירה' },
  { key: 'RENT_COMMERCIAL', label: 'נכס מסחרי להשכרה',    subtitle: 'מסחרי · השכרה' },
  { key: 'TRANSFER',        label: 'העברה בין סוכנים',    subtitle: 'ללא פרטי סוכן' },
];

// Flat list with Hebrew-only labels (never expose the raw key to users).
export const PLACEHOLDERS = [
  { key: 'type',          label: 'סוג הנכס' },
  { key: 'street',        label: 'רחוב' },
  { key: 'city',          label: 'עיר' },
  { key: 'rooms',         label: 'חדרים' },
  { key: 'sqm',           label: 'שטח' },
  { key: 'sqmArnona',     label: 'מ״ר ארנונה' },
  { key: 'floor',         label: 'קומה' },
  { key: 'totalFloors',   label: 'סך קומות' },
  { key: 'balconySize',   label: 'גודל מרפסת' },
  { key: 'buildingAge',   label: 'גיל בניין' },
  { key: 'price',         label: 'מחיר' },
  { key: 'vacancyDate',   label: 'כניסה' },
  { key: 'airDirections', label: 'כיווני אוויר' },
  { key: 'renovated',     label: 'מצב הנכס' },
  { key: 'sector',        label: 'מגזר' },
  { key: 'parking',       label: 'חניה' },
  { key: 'storage',       label: 'מחסן' },
  { key: 'ac',            label: 'מזגנים' },
  { key: 'elevator',      label: 'מעלית' },
  { key: 'safeRoom',      label: 'ממ״ד' },
  { key: 'features',      label: 'מאפיינים (הכל)' },
  { key: 'notes',         label: 'הערות' },
  { key: 'propertyUrl',   label: 'קישור לנכס' },
  { key: 'agentName',     label: 'שם סוכן' },
  { key: 'agentAgency',   label: 'משרד' },
  { key: 'agentPhone',    label: 'טלפון סוכן' },
  { key: 'agentBio',      label: 'תיאור סוכן' },
];

export const LABEL_OF = Object.fromEntries(PLACEHOLDERS.map((p) => [p.key, p.label]));

// Grouped for UI. Users pick variables from these collapsible sections.
// `transferable: false` flags groups that don't apply to TRANSFER kind.
export const VAR_GROUPS = [
  {
    id: 'property',
    title: 'פרטי הנכס',
    hint: 'סוג, חדרים, שטח, קומה',
    keys: ['type', 'rooms', 'sqm', 'sqmArnona', 'floor', 'totalFloors', 'balconySize', 'buildingAge'],
  },
  {
    id: 'location',
    title: 'מיקום',
    hint: 'רחוב ועיר',
    keys: ['city', 'street'],
  },
  {
    id: 'price',
    title: 'מחיר ומצב',
    hint: 'מחיר, כניסה, מצב, כיוונים',
    keys: ['price', 'vacancyDate', 'renovated', 'airDirections', 'sector'],
  },
  {
    id: 'features',
    title: 'מאפיינים',
    hint: 'חניה, מחסן, מעלית, ממ״ד',
    keys: ['features', 'parking', 'storage', 'ac', 'elevator', 'safeRoom', 'notes'],
  },
  {
    id: 'agent',
    title: 'סוכן וקישור',
    hint: 'שם, טלפון, קישור',
    keys: ['agentName', 'agentAgency', 'agentPhone', 'agentBio', 'propertyUrl'],
    transferable: false,
  },
];

// Preset starter templates — offered as one-click quick-starts at the top of
// the editor so users never face a blank page. All in Hebrew, with {{var}}
// tokens that the editor renders as visible Hebrew chips.
export const PRESETS = {
  BUY_PRIVATE: {
    short: `🏡 *{{type}} למכירה — {{street}}, {{city}}*

💰 {{price}} · {{rooms}} חד׳ · {{sqm}} מ״ר

📷 לפרטים ותמונות: {{propertyUrl}}`,
    standard: `🏡 *{{type}} למכירה — {{street}}, {{city}}*

💰 מחיר: {{price}}
🛏️ {{rooms}} חדרים · {{sqm}} מ״ר
🏢 קומה {{floor}} מתוך {{totalFloors}}
✨ {{features}}

📷 {{propertyUrl}}

—
{{agentName}} · {{agentAgency}}`,
    detailed: `🏡 *{{type}} למכירה — {{street}}, {{city}}*

💰 מחיר: {{price}}
🛏️ {{rooms}} חדרים · {{sqm}} מ״ר
🏢 קומה {{floor}} מתוך {{totalFloors}}
✨ {{features}}
🧭 כיווני אוויר: {{airDirections}}
🛠️ מצב: {{renovated}}
📅 כניסה: {{vacancyDate}}

📝 {{notes}}

📷 לפרטים ותמונות:
{{propertyUrl}}

—
{{agentName}} · {{agentAgency}} · {{agentPhone}}`,
  },
  RENT_PRIVATE: {
    short: `🔑 *{{type}} להשכרה — {{street}}, {{city}}*

💰 {{price}} · {{rooms}} חד׳ · {{sqm}} מ״ר

📷 {{propertyUrl}}`,
    standard: `🔑 *{{type}} להשכרה — {{street}}, {{city}}*

💰 {{price}}
🛏️ {{rooms}} חדרים · {{sqm}} מ״ר
🏢 קומה {{floor}} מתוך {{totalFloors}}
✨ {{features}}
📅 כניסה: {{vacancyDate}}

📷 {{propertyUrl}}

—
{{agentName}} · {{agentAgency}}`,
    detailed: `🔑 *{{type}} להשכרה — {{street}}, {{city}}*

💰 {{price}}
🛏️ {{rooms}} חדרים · {{sqm}} מ״ר
🏢 קומה {{floor}} מתוך {{totalFloors}}
✨ {{features}}
🧭 כיווני אוויר: {{airDirections}}
🛠️ מצב: {{renovated}}
📅 כניסה: {{vacancyDate}}

📝 {{notes}}

📷 {{propertyUrl}}

—
{{agentName}} · {{agentAgency}} · {{agentPhone}}`,
  },
  BUY_COMMERCIAL: {
    short: `🏢 *{{type}} מסחרי למכירה — {{street}}, {{city}}*

💰 {{price}} · {{sqm}} מ״ר

📷 {{propertyUrl}}`,
    standard: `🏢 *{{type}} מסחרי למכירה — {{street}}, {{city}}*

💰 מחיר: {{price}}
📐 שטח: {{sqm}} מ״ר
📄 מ״ר ארנונה: {{sqmArnona}}
🏢 קומה {{floor}}
✨ {{features}}

📷 {{propertyUrl}}

—
{{agentName}} · {{agentAgency}}`,
    detailed: `🏢 *{{type}} מסחרי למכירה — {{street}}, {{city}}*

💰 מחיר: {{price}}
📐 שטח: {{sqm}} מ״ר
📄 מ״ר ארנונה: {{sqmArnona}}
🏢 קומה {{floor}} מתוך {{totalFloors}}
✨ {{features}}
🛠️ מצב: {{renovated}}
📅 כניסה: {{vacancyDate}}
🧩 מגזר: {{sector}}

📝 {{notes}}

📷 {{propertyUrl}}

—
{{agentName}} · {{agentAgency}} · {{agentPhone}}`,
  },
  RENT_COMMERCIAL: {
    short: `🏬 *{{type}} מסחרי להשכרה — {{street}}, {{city}}*

💰 {{price}} · {{sqm}} מ״ר

📷 {{propertyUrl}}`,
    standard: `🏬 *{{type}} מסחרי להשכרה — {{street}}, {{city}}*

💰 {{price}}
📐 שטח: {{sqm}} מ״ר
📄 מ״ר ארנונה: {{sqmArnona}}
🏢 קומה {{floor}}
✨ {{features}}
📅 כניסה: {{vacancyDate}}

📷 {{propertyUrl}}

—
{{agentName}} · {{agentAgency}}`,
    detailed: `🏬 *{{type}} מסחרי להשכרה — {{street}}, {{city}}*

💰 {{price}}
📐 שטח: {{sqm}} מ״ר · ארנונה {{sqmArnona}}
🏢 קומה {{floor}} מתוך {{totalFloors}}
✨ {{features}}
🧭 כיווני אוויר: {{airDirections}}
🛠️ מצב: {{renovated}}
📅 כניסה: {{vacancyDate}}
🧩 מגזר: {{sector}}

📝 {{notes}}

📷 {{propertyUrl}}

—
{{agentName}} · {{agentAgency}} · {{agentPhone}}`,
  },
  TRANSFER: {
    short: `*{{type}} {{city}} — {{street}}*

💰 {{price}} · {{rooms}} חד׳ · {{sqm}} מ״ר

📷 {{propertyUrl}}`,
    standard: `*{{type}} ב{{city}}, {{street}}*

💰 {{price}}
🛏️ {{rooms}} חדרים · {{sqm}} מ״ר
🏢 קומה {{floor}} מתוך {{totalFloors}}
✨ {{features}}
📅 כניסה: {{vacancyDate}}

📷 {{propertyUrl}}`,
    detailed: `*{{type}} ב{{city}}, {{street}}*

💰 {{price}}
🛏️ {{rooms}} חדרים · {{sqm}} מ״ר
🏢 קומה {{floor}} מתוך {{totalFloors}}
✨ {{features}}
🧭 כיווני אוויר: {{airDirections}}
🛠️ מצב: {{renovated}}
📅 כניסה: {{vacancyDate}}

📝 {{notes}}

📷 {{propertyUrl}}`,
  },
};

export const PRESET_LABELS = [
  { id: 'short',    title: 'מהיר',   subtitle: 'בסיס בלבד' },
  { id: 'standard', title: 'מומלץ',  subtitle: 'איזון טוב' },
  { id: 'detailed', title: 'מפורט',  subtitle: 'הכל כלול' },
];

function formatPrice(p) {
  if (!p) return '—';
  if (p < 10000) return `₪${p.toLocaleString('he-IL')}/חודש`;
  return `₪${p.toLocaleString('he-IL')}`;
}

export function buildVariables(property, agent, opts = {}) {
  const stripAgent = opts.stripAgent === true;
  if (!property) return {};
  const features = [];
  if (property.parking)  features.push('חניה');
  if (property.storage)  features.push('מחסן');
  if (property.ac)       features.push('מזגנים');
  if (property.elevator) features.push('מעלית');
  if (property.assetClass === 'RESIDENTIAL' && property.safeRoom) features.push('ממ״ד');
  if (property.balconySize > 0) features.push(`מרפסת ${property.balconySize}מ״ר`);
  const fStr = features.length ? features.join(' · ') : '';

  // Prefer the SEO slug URL when available (set by /api/public/lookup/...
  // or by the agent's own user.slug). Falls back to the legacy /p/<id>.
  const slugPath = property.slug && (agent?.slug || property.agentSlug)
    ? `/agents/${encodeURI(agent?.slug || property.agentSlug)}/${encodeURI(property.slug)}`
    : `/p/${property.id}`;
  const pUrl = typeof window !== 'undefined'
    ? `${window.location.origin}${slugPath}`
    : slugPath;

  const yesNo = (v) => (v ? 'יש' : 'אין');

  return {
    type:          property.type || '',
    street:        property.street || '',
    city:          property.city || '',
    rooms:         property.rooms != null ? String(property.rooms) : '',
    sqm:           property.sqm != null ? String(property.sqm) : '',
    sqmArnona:     property.sqmArnona != null ? String(property.sqmArnona) : '',
    // Task 2 — floor 0 must render as "קרקע" everywhere, including templates
    // the agent sends to customers over WhatsApp. Use the shared helper so
    // behaviour stays in lockstep with the UI.
    floor:         formatFloor(property.floor),
    totalFloors:   formatFloor(property.totalFloors),
    balconySize:   property.balconySize != null ? String(property.balconySize) : '',
    buildingAge:   property.buildingAge != null ? String(property.buildingAge) : '',
    price:         formatPrice(property.marketingPrice),
    vacancyDate:   property.vacancyDate || '',
    airDirections: property.airDirections || '',
    renovated:     property.renovated || '',
    sector:        property.sector || '',
    parking:       yesNo(property.parking),
    storage:       yesNo(property.storage),
    ac:            yesNo(property.ac),
    elevator:      yesNo(property.elevator),
    safeRoom:      yesNo(property.safeRoom),
    features:      fStr,
    notes:         property.notes || '',
    propertyUrl:   pUrl,
    agentName:     stripAgent ? '' : (agent?.displayName || ''),
    agentAgency:   stripAgent ? '' : (agent?.agentProfile?.agency || ''),
    agentPhone:    stripAgent ? '' : (agent?.phone || ''),
    agentBio:      stripAgent ? '' : (agent?.agentProfile?.bio || ''),
  };
}

export function renderTemplate(body, vars) {
  if (!body) return '';
  let out = body.replace(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g, (_, key) => {
    return vars[key] != null ? vars[key] : '';
  });
  // Collapse orphaned separators that result from missing vars
  out = out.replace(/([·|·|,])\s*(?:[·|·|,])+/g, '$1');
  out = out.split('\n').map((l) => l.trimEnd()).join('\n');
  // Drop lines that became nothing but emoji + whitespace (e.g. "💰 מחיר: ")
  out = out
    .split('\n')
    .filter((line) => {
      const stripped = line.replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}\s—:·\-|]/gu, '');
      return stripped.length > 0 || line.trim().length === 0;
    })
    .join('\n');
  // Collapse multiple blank lines
  out = out.replace(/\n{3,}/g, '\n\n');
  return out.trim();
}

/**
 * Pick the right template kind for a given (property, mode).
 * mode: 'client' | 'transfer'
 */
export function pickTemplateKind(property, mode = 'client') {
  if (mode === 'transfer') return 'TRANSFER';
  const isCom = property.assetClass === 'COMMERCIAL';
  const isRent = property.category === 'RENT';
  if (isCom && isRent)  return 'RENT_COMMERCIAL';
  if (isCom && !isRent) return 'BUY_COMMERCIAL';
  if (!isCom && isRent) return 'RENT_PRIVATE';
  return 'BUY_PRIVATE';
}
