import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
// eslint-disable-next-line import/no-relative-packages
import { relativeTime, absoluteTime } from '@estia/frontend/lib/time.js';

const NOW = new Date('2026-04-21T12:00:00Z');
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW); });
afterEach(() => { vi.useRealTimers(); });

const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000);

describe('relativeTime — empty / invalid', () => {
  it.each([null, undefined, '', 'not-a-date'])('returns em-dash for %p', (v) => {
    expect(relativeTime(v as any)).toBe('—');
  });
});

describe('relativeTime — buckets', () => {
  it('< 45s past → "כרגע"', () => {
    expect(relativeTime(new Date(NOW.getTime() - 10_000))).toBe('כרגע');
  });
  it('< 45s future → "עוד רגע"', () => {
    expect(relativeTime(new Date(NOW.getTime() + 10_000))).toBe('עוד רגע');
  });
  it('1 minute ago → "לפני דקה"', () => {
    expect(relativeTime(minutesAgo(1))).toBe('לפני דקה');
  });
  it('30 minutes ago → "לפני 30 דקות"', () => {
    expect(relativeTime(minutesAgo(30))).toBe('לפני 30 דקות');
  });
  it('1 hour ago → "לפני שעה"', () => {
    expect(relativeTime(minutesAgo(60))).toBe('לפני שעה');
  });
  it('5 hours ago → "לפני 5 שעות"', () => {
    expect(relativeTime(minutesAgo(5 * 60))).toBe('לפני 5 שעות');
  });
  it('1 day ago → "אתמול"', () => {
    expect(relativeTime(minutesAgo(24 * 60))).toBe('אתמול');
  });
  it('1 week ago → "לפני שבוע"', () => {
    expect(relativeTime(minutesAgo(7 * 24 * 60))).toBe('לפני שבוע');
  });
  it('1 month ago → "לפני חודש"', () => {
    expect(relativeTime(minutesAgo(30 * 24 * 60))).toBe('לפני חודש');
  });
  it('> 1 year ago → locale date', () => {
    const out = relativeTime(minutesAgo(400 * 24 * 60));
    expect(out).toMatch(/2025|2024/); // Hebrew locale date should include the year
  });
});

describe('absoluteTime', () => {
  it('returns "" for falsy / invalid input', () => {
    expect(absoluteTime(null)).toBe('');
    expect(absoluteTime(undefined)).toBe('');
    expect(absoluteTime('garbage')).toBe('');
  });
  it('formats a valid ISO date in he-IL short form', () => {
    // he-IL short is dd.mm.yyyy; assert the year appears (OS/ICU variance
    // on exact separators, but the year is stable).
    expect(absoluteTime('2026-04-22')).toContain('2026');
  });
});
