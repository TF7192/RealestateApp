import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
// eslint-disable-next-line import/no-relative-packages
import { relativeDate, relLabel } from '@estia/frontend/lib/relativeDate.js';

// Freeze time so "days from now" arithmetic is deterministic.
const NOW = new Date('2026-04-21T12:00:00Z');

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW); });
afterEach(() => { vi.useRealTimers(); });

const days = (n: number) => new Date(NOW.getTime() + n * 86400000);

describe('relativeDate — empty / invalid', () => {
  it.each([null, undefined, '', 'not-a-date'])('returns em-dash for %p', (v) => {
    expect(relativeDate(v as any).label).toBe('—');
  });

  it('accepts Date and ISO string equally', () => {
    expect(relativeDate(NOW).label).toBe('היום');
    expect(relativeDate(NOW.toISOString()).label).toBe('היום');
  });
});

describe('relativeDate — near dates (special words)', () => {
  it('today → "היום"', () => {
    expect(relativeDate(NOW).label).toBe('היום');
  });
  it('tomorrow → "מחר"', () => {
    expect(relativeDate(days(1)).label).toBe('מחר');
  });
  it('yesterday → "אתמול"', () => {
    expect(relativeDate(days(-1)).label).toBe('אתמול');
  });
  it('day after tomorrow → "מחרתיים"', () => {
    expect(relativeDate(days(2)).label).toBe('מחרתיים');
  });
  it('day before yesterday → "שלשום"', () => {
    expect(relativeDate(days(-2)).label).toBe('שלשום');
  });
});

describe('relativeDate — days / weeks / months / years', () => {
  it('5 days out → "בעוד 5 ימים"', () => {
    expect(relativeDate(days(5)).label).toBe('בעוד 5 ימים');
  });
  it('3 days back → "לפני 3 ימים"', () => {
    expect(relativeDate(days(-3)).label).toBe('לפני 3 ימים');
  });
  it('at 14 days the ≤14-days branch wins → "לפני 14 ימים"', () => {
    // Edge-case of the implementation: exactly 14 days hits the days-
    // label branch, not "שבועיים". 15+ days rounds into the weeks bucket.
    expect(relativeDate(days(-14)).label).toBe('לפני 14 ימים');
  });
  it('15 days gets the "שבועיים" special-case (rounds to 2 weeks)', () => {
    expect(relativeDate(days(-15)).label).toBe('לפני שבועיים');
  });
  it('3 weeks out → "בעוד 3 שבועות"', () => {
    expect(relativeDate(days(21)).label).toBe('בעוד 3 שבועות');
  });
  it('5 months back → "לפני 5 חודשים"', () => {
    expect(relativeDate(days(-150)).label).toBe('לפני 5 חודשים');
  });
  it('1 year out → "בעוד שנה"', () => {
    expect(relativeDate(days(365)).label).toBe('בעוד שנה');
  });
  it('2 years back → "לפני 2 שנים"', () => {
    expect(relativeDate(days(-730)).label).toBe('לפני 2 שנים');
  });
});

describe('relativeDate — severity', () => {
  it('≤7 future days → urgent', () => {
    expect(relativeDate(days(3)).severity).toBe('urgent');
    expect(relativeDate(days(7)).severity).toBe('urgent');
  });
  it('8–30 future days → warning', () => {
    expect(relativeDate(days(8)).severity).toBe('warning');
    expect(relativeDate(days(30)).severity).toBe('warning');
  });
  it('31–90 future days → soon', () => {
    expect(relativeDate(days(60)).severity).toBe('soon');
  });
  it('past dates never get urgent/warning/soon', () => {
    expect(relativeDate(days(-5)).severity).toBe('normal');
    expect(relativeDate(days(-100)).severity).toBe('normal');
  });
});

describe('relLabel — convenience', () => {
  it('returns just the label string', () => {
    expect(relLabel(NOW)).toBe('היום');
    expect(relLabel(days(1))).toBe('מחר');
  });
});
