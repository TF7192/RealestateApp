// Hebrew relative-date formatter for the audit's P2-M18.
//
// Examples (ts in the FUTURE):
//   today          → "היום"
//   tomorrow       → "מחר"
//   in 5 days      → "בעוד 5 ימים"
//   in 12 days     → "בעוד 12 יום" (warning)
//   in 5 months    → "בעוד 5 חודשים"
//   in 1 year      → "בעוד שנה"
//
// Examples (ts in the PAST):
//   today          → "היום"
//   yesterday      → "אתמול"
//   3 days ago     → "לפני 3 ימים"
//   2 weeks ago    → "לפני שבועיים"
//   5 months ago   → "לפני 5 חודשים"
//
// Returns { label, severity } where severity is one of:
//   'urgent' (≤ 7 future days), 'warning' (≤ 30 future days), 'soon'
//   (≤ 90), 'normal' (default).

export function relativeDate(input) {
  if (!input) return { label: '—', severity: 'normal' };
  const ts = input instanceof Date ? input.getTime() : new Date(input).getTime();
  if (!Number.isFinite(ts)) return { label: '—', severity: 'normal' };

  const now = Date.now();
  const diffMs = ts - now;
  const isFuture = diffMs >= 0;
  const days = Math.round(Math.abs(diffMs) / 86400000);

  let severity = 'normal';
  if (isFuture) {
    if (days <= 7)  severity = 'urgent';
    else if (days <= 30) severity = 'warning';
    else if (days <= 90) severity = 'soon';
  }

  if (days === 0) return { label: 'היום', severity };
  if (days === 1) return { label: isFuture ? 'מחר'    : 'אתמול', severity };
  if (days === 2) return { label: isFuture ? 'מחרתיים' : 'שלשום', severity };

  if (days <= 14) {
    return {
      label: isFuture ? `בעוד ${days} ימים` : `לפני ${days} ימים`,
      severity,
    };
  }

  const weeks = Math.round(days / 7);
  if (weeks <= 4) {
    if (weeks === 2) {
      return { label: isFuture ? 'בעוד שבועיים' : 'לפני שבועיים', severity };
    }
    return {
      label: isFuture ? `בעוד ${weeks} שבועות` : `לפני ${weeks} שבועות`,
      severity,
    };
  }

  const months = Math.round(days / 30);
  if (months < 12) {
    return {
      label: isFuture
        ? (months === 1 ? 'בעוד חודש' : `בעוד ${months} חודשים`)
        : (months === 1 ? 'לפני חודש' : `לפני ${months} חודשים`),
      severity,
    };
  }

  const years = Math.round(days / 365);
  return {
    label: isFuture
      ? (years === 1 ? 'בעוד שנה' : `בעוד ${years} שנים`)
      : (years === 1 ? 'לפני שנה' : `לפני ${years} שנים`),
    severity,
  };
}

// Convenience: just the label
export function relLabel(input) { return relativeDate(input).label; }
