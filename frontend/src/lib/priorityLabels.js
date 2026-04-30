// Property priority — agent-set ranking that floats listings to the
// top of /properties. Stored as Int (Property.priority); rendered as
// one of four named buckets so the UI doesn't expose the magic
// numbers. Backend orderBy is `priority desc, createdAt desc`.
//
// Mapping (descending — highest first):
//   200 → "עדיפות גבוהה מאוד"   (top of the list)
//   100 → "עדיפות גבוהה"
//    50 → "עדיפות בינונית"
//    25 → "עדיפות נמוכה"
//     0 → "ללא קידום"            (default for legacy + unset rows)
export const PRIORITY_LEVELS = [
  { value: 200, label: 'עדיפות גבוהה מאוד', short: 'גבוהה מאוד', tone: 'critical' },
  { value: 100, label: 'עדיפות גבוהה',        short: 'גבוהה',       tone: 'high' },
  { value:  50, label: 'עדיפות בינונית',       short: 'בינונית',     tone: 'medium' },
  { value:  25, label: 'עדיפות נמוכה',         short: 'נמוכה',       tone: 'low' },
];

// Bucket a numeric priority into the closest named level. Anything
// at-or-above 200 is "very high"; below 25 (incl. 0 / negative) falls
// through as the unset/legacy state — the badge hides and the form
// renders the "ללא קידום" toggle.
export function priorityBucket(value) {
  const n = Number(value) || 0;
  if (n >= 200) return PRIORITY_LEVELS[0];
  if (n >= 100) return PRIORITY_LEVELS[1];
  if (n >= 50)  return PRIORITY_LEVELS[2];
  if (n >= 25)  return PRIORITY_LEVELS[3];
  return null;
}

export function priorityLabel(value) {
  return priorityBucket(value)?.label ?? 'ללא קידום';
}

export function priorityShort(value) {
  return priorityBucket(value)?.short ?? null;
}

export function priorityTone(value) {
  return priorityBucket(value)?.tone ?? null;
}
