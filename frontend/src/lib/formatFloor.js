// Task 2 · single source of truth for rendering a floor value.
//
// Floors are persisted as integers (`floor`, `totalFloors` on Property).
// The one non-obvious case is the ground floor: stored as `0`, displayed as
// "קרקע" (and never as "0" or the old "0/0" that agents reported).
// Basements stay as "-1", "-2" — only the ground floor gets a name.
//
// Two shapes:
//   formatFloor(v)           → "קרקע" | "3" | "-1" | ""
//   formatFloor(v, t)        → "קרקע / 5" | "3/5" | ""   (combined form)
//
// Null / undefined / "" → empty string, so call sites can safely render:
//     formatFloor(prop.floor, prop.totalFloors) || 'לא צוין'
//
// Never formats currency, never adds a prefix ("קומה X") — callers
// prepend the Hebrew word themselves so this helper stays reusable from
// inside longer composed strings (WhatsApp share text, templates, etc).

export function formatFloor(value, total) {
  if (value === null || value === undefined || value === '') return '';
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  const floorLabel = n === 0 ? 'קרקע' : String(n);

  if (total === null || total === undefined || total === '' || total === '?') {
    return floorLabel;
  }
  const t = Number(total);
  if (!Number.isFinite(t)) return floorLabel;
  const totalLabel = t === 0 ? 'קרקע' : String(t);
  return `${floorLabel}/${totalLabel}`;
}

// Convenience for callers that want the "X מתוך Y" phrasing instead of
// the compact "X/Y". Omits "מתוך Y" when total is missing.
export function formatFloorOutOf(value, total) {
  if (value === null || value === undefined || value === '') return '';
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  const floorLabel = n === 0 ? 'קרקע' : String(n);
  if (total === null || total === undefined || total === '' || total === '?') {
    return floorLabel;
  }
  const t = Number(total);
  if (!Number.isFinite(t)) return floorLabel;
  const totalLabel = t === 0 ? 'קרקע' : String(t);
  return `${floorLabel} מתוך ${totalLabel}`;
}
