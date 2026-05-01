// freshLabel — minute/hour/day-aware Hebrew relative label, tuned for
// the market-discovery feed where "לפני שעה" / "לפני 12 דקות" carries
// real signal (versus the page-wide relLabel which collapses sub-day
// to "היום").

export function freshLabel(input) {
  if (!input) return '—';
  const ts = input instanceof Date ? input.getTime() : new Date(input).getTime();
  if (!Number.isFinite(ts)) return '—';
  const diffMs = Date.now() - ts;
  if (diffMs < 60_000) return 'עכשיו';
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) return minutes === 1 ? 'לפני דקה' : `לפני ${minutes} דק׳`;
  const hours = Math.floor(diffMs / 3_600_000);
  if (hours < 24) return hours === 1 ? 'לפני שעה' : `לפני ${hours} שעות`;
  const days = Math.floor(diffMs / 86_400_000);
  if (days === 1) return 'אתמול';
  if (days === 2) return 'שלשום';
  // Days reads as "N ימים" up to (but not including) the שבועיים
  // boundary at 14 days. "13 ימים" still feels day-shaped; "14 ימים"
  // feels like an unconverted week count.
  if (days < 14) return `לפני ${days} ימים`;
  // Weeks branch: 14 → שבועיים, 15-27 → "N שבועות". 28+ jumps straight
  // to months — "4 שבועות" is awkward in agent-speak.
  if (days < 28) {
    const weeks = Math.round(days / 7);
    if (weeks === 2) return 'לפני שבועיים';
    return `לפני ${weeks} שבועות`;
  }
  const months = Math.round(days / 30);
  return months <= 1 ? 'לפני חודש' : `לפני ${months} חודשים`;
}
