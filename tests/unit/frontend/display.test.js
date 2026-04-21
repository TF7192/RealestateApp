import { describe, it, expect } from 'vitest';
import {
  displayText,
  displayNumber,
  displayPrice,
  displayPriceShort,
  displaySqm,
  displayDate,
  displayDateTime,
} from '../../../frontend/src/lib/display.js';

const DASH = '—';

describe('display helpers — null safety', () => {
  it.each([null, undefined, '', '   '])('displayText returns em-dash for %p', (v) => {
    expect(displayText(v)).toBe(DASH);
  });

  it.each([null, undefined, '', NaN, 'abc'])('displayNumber returns em-dash for %p', (v) => {
    expect(displayNumber(v)).toBe(DASH);
  });

  it.each([null, undefined, '', NaN, 'abc'])('displayPrice returns em-dash for %p', (v) => {
    expect(displayPrice(v)).toBe(DASH);
  });

  it('displaySqm em-dash for null', () => {
    expect(displaySqm(null)).toBe(DASH);
  });

  it('displayDate / displayDateTime em-dash for null', () => {
    expect(displayDate(null)).toBe(DASH);
    expect(displayDateTime(null)).toBe(DASH);
    expect(displayDate('not-a-date')).toBe(DASH);
  });
});

describe('display helpers — formatting', () => {
  it('displayText trims whitespace-only values to em-dash', () => {
    expect(displayText('  x  ')).toBe('x');
  });

  it('displayNumber adds IL thousand separators', () => {
    expect(displayNumber(1234567)).toBe('1,234,567');
  });

  it('displayPrice outputs Intl currency ILS', () => {
    // Exact form depends on ICU; loose assertion on the shekel + digits.
    const s = displayPrice(2_500_000);
    expect(s).toMatch(/2,?500,?000/);
    expect(s).toMatch(/₪|ILS|ש״ח/);
  });

  it('displayPriceShort — millions', () => {
    expect(displayPriceShort(2_500_000)).toBe('₪2.5M');
    expect(displayPriceShort(3_000_000)).toBe('₪3M');
  });

  it('displayPriceShort — thousands rounded', () => {
    expect(displayPriceShort(850_000)).toBe('₪850K');
    expect(displayPriceShort(1_400)).toBe('₪1K');
  });

  it('displayPriceShort — under 1000 falls back to the full price form', () => {
    // The function returns `displayPrice(num)` for <1000 values, so the
    // output includes the shekel currency symbol + thousands separators.
    const s = displayPriceShort(450);
    expect(s).toMatch(/₪|ILS|ש״ח/);
    expect(s).toMatch(/450/);
  });

  it('displaySqm appends the unit', () => {
    expect(displaySqm(120)).toMatch(/120.*מ״ר/);
  });

  it('displayDate formats in Hebrew locale', () => {
    // 2026-04-22 ISO → he-IL short form. We don't hard-assert the exact
    // string because ICU outputs can vary across Node versions; we just
    // assert the year is rendered.
    expect(displayDate('2026-04-22')).toContain('2026');
  });
});
