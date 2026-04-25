// F-10.1 / F-10.2 — display helpers.
//
// Every list + detail render in the app should route through these so
// `undefined` / `null` / empty-string never leaks to the UI, and number
// / date formatting is consistent across pages.

const DASH = '—';
const ils = new Intl.NumberFormat('he-IL', {
  style: 'currency',
  currency: 'ILS',
  maximumFractionDigits: 0,
});
const dateFmt = new Intl.DateTimeFormat('he-IL', {
  year: 'numeric', month: 'short', day: 'numeric',
});
const dateTimeFmt = new Intl.DateTimeFormat('he-IL', {
  year: 'numeric', month: 'short', day: 'numeric',
  hour: '2-digit', minute: '2-digit',
});

/** Display any text value; null / undefined / empty → em-dash. */
export function displayText(v) {
  if (v == null) return DASH;
  const s = String(v).trim();
  return s ? s : DASH;
}

/** Display a number with IL thousands separators; null → em-dash. */
export function displayNumber(n) {
  if (n == null || n === '' || !Number.isFinite(Number(n))) return DASH;
  return Number(n).toLocaleString('he-IL');
}

/** Format shekel values — "₪2,500,000"; null → em-dash. */
export function displayPrice(n) {
  if (n == null || n === '' || !Number.isFinite(Number(n))) return DASH;
  return ils.format(Math.round(Number(n)));
}

/** Short shekel shorthand — "₪2.5M", "₪850K"; under 1000 falls back
 *  to full. Useful for card-style summaries. */
export function displayPriceShort(n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return DASH;
  const abs = Math.abs(num);
  if (abs >= 1_000_000) {
    const v = num / 1_000_000;
    const trimmed = Number.isInteger(v) ? v : Number(v.toFixed(1));
    return `₪${trimmed}M`;
  }
  if (abs >= 1_000) return `₪${Math.round(num / 1_000)}K`;
  return displayPrice(num);
}

/** Area — "120 מ״ר"; null → em-dash. */
export function displaySqm(n) {
  if (n == null || n === '' || !Number.isFinite(Number(n))) return DASH;
  return `${Number(n).toLocaleString('he-IL')} מ״ר`;
}

/** Date (no time) — "21 באפר׳ 2026"; null → em-dash. */
export function displayDate(value) {
  if (!value) return DASH;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return DASH;
  return dateFmt.format(d);
}

/** Date + time — "21 באפר׳ 2026, 14:30". */
export function displayDateTime(value) {
  if (!value) return DASH;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return DASH;
  return dateTimeFmt.format(d);
}

// PERF-005 — pick the right image variant for a surface.
//
// Backend serializes properties with three parallel arrays:
//   • `images`        → full-size URLs (legacy field, lightbox source)
//   • `imageThumbs`   → 256 px URLs (list cards)
//   • `imageList[i]`  → { url, urlCard, urlThumb } (gallery / photo manager)
//
// Legacy rows uploaded before the variants pipeline only have `url` —
// `urlCard` / `urlThumb` are null and `imageThumbs[i]` falls back to
// the full URL on the backend side. That means callers can use the
// variant they want without crashing on older rows.

/** First-image thumbnail (256 px) — list cards. Falls back to the
 *  full-size URL when the row has no thumb yet. */
export function pickThumbUrl(prop) {
  if (!prop) return null;
  return prop.imageThumbs?.[0] || prop.images?.[0] || null;
}

/** Per-image variant lookup — used by gallery thumbs (`'card'`) and
 *  the lightbox (`'full'`). Pass an `imageList[i]` object. */
export function pickVariant(img, variant) {
  if (!img) return null;
  if (variant === 'thumb') return img.urlThumb || img.urlCard || img.url || null;
  if (variant === 'card')  return img.urlCard  || img.url      || img.urlThumb || null;
  return img.url || img.urlCard || img.urlThumb || null;
}
