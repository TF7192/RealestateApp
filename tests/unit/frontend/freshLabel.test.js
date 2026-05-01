// freshLabel — minute/hour/day-aware Hebrew relative time used by the
// market-discovery feed. Pre-existing relLabel collapses sub-day to
// "היום" which loses signal for "just listed" UX, so freshLabel is its
// own helper. These tests pin the boundary cases.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { freshLabel } from '../../../frontend/src/pages/marketDiscovery/freshLabel.js';

const NOW = new Date('2026-05-01T12:00:00Z').getTime();

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

describe('freshLabel', () => {
  it('returns "—" for nullish or invalid input', () => {
    expect(freshLabel(null)).toBe('—');
    expect(freshLabel(undefined)).toBe('—');
    expect(freshLabel('not a date')).toBe('—');
  });

  it('"עכשיו" when less than a minute old', () => {
    expect(freshLabel(new Date(NOW - 30_000))).toBe('עכשיו');
  });

  it('"לפני דקה" exactly at 1 minute', () => {
    expect(freshLabel(new Date(NOW - 60_000))).toBe('לפני דקה');
  });

  it('"לפני N דק׳" for sub-hour ranges', () => {
    expect(freshLabel(new Date(NOW - 12 * 60_000))).toBe('לפני 12 דק׳');
  });

  it('"לפני שעה" exactly at 1 hour', () => {
    expect(freshLabel(new Date(NOW - 60 * 60_000))).toBe('לפני שעה');
  });

  it('"לפני N שעות" for sub-day ranges', () => {
    expect(freshLabel(new Date(NOW - 5 * 3_600_000))).toBe('לפני 5 שעות');
  });

  it('"אתמול" at 1 day, "שלשום" at 2 days', () => {
    expect(freshLabel(new Date(NOW - 24 * 3_600_000))).toBe('אתמול');
    expect(freshLabel(new Date(NOW - 2 * 24 * 3_600_000))).toBe('שלשום');
  });

  it('"לפני N ימים" between 3 and 14 days', () => {
    expect(freshLabel(new Date(NOW - 7 * 24 * 3_600_000))).toBe('לפני 7 ימים');
  });

  it('"לפני שבועיים" at exactly 14 days', () => {
    expect(freshLabel(new Date(NOW - 14 * 24 * 3_600_000))).toBe('לפני שבועיים');
  });

  it('"לפני חודש" / "לפני N חודשים" past 4 weeks', () => {
    expect(freshLabel(new Date(NOW - 30 * 24 * 3_600_000))).toBe('לפני חודש');
    expect(freshLabel(new Date(NOW - 90 * 24 * 3_600_000))).toBe('לפני 3 חודשים');
  });
});
