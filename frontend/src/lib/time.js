// Hebrew relative-time helper. Returns strings like "לפני 3 דקות", "היום", "אתמול",
// "לפני 2 ימים", "לפני שבועיים", etc. For longer ranges falls back to a locale date.

export function relativeTime(value) {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const diff = Date.now() - date.getTime();
  const abs = Math.abs(diff);
  const sec = Math.round(abs / 1000);
  const min = Math.round(sec / 60);
  const hr = Math.round(min / 60);
  const day = Math.round(hr / 24);

  if (sec < 45) return diff < 0 ? 'עוד רגע' : 'כרגע';
  if (min < 2) return 'לפני דקה';
  if (min < 50) return `לפני ${min} דקות`;
  if (hr < 2) return 'לפני שעה';
  if (hr < 24) return `לפני ${hr} שעות`;
  if (day === 1) return 'אתמול';
  if (day < 7) return `לפני ${day} ימים`;
  if (day < 14) return 'לפני שבוע';
  if (day < 30) return `לפני ${Math.round(day / 7)} שבועות`;
  if (day < 60) return 'לפני חודש';
  if (day < 365) return `לפני ${Math.round(day / 30)} חודשים`;
  return date.toLocaleDateString('he-IL');
}

export function absoluteTime(value) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('he-IL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}
