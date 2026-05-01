// Hebrew floor labels: 0 → "קומת קרקע", -1 → "מרתף", N → "קומה N".
// Returns null when the input is null/undefined so the caller can drop
// the segment from a specs join.

export function floorLabel(floor) {
  if (floor == null) return null;
  if (floor === 0) return 'קומת קרקע';
  if (floor === -1) return 'מרתף';
  return `קומה ${floor}`;
}
