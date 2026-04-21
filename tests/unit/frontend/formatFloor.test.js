import { describe, it, expect } from 'vitest';
import { formatFloor, formatFloorOutOf } from '../../../frontend/src/lib/formatFloor.js';

describe('formatFloor', () => {
  it('renders ground floor as "קרקע"', () => {
    expect(formatFloor(0)).toBe('קרקע');
  });

  it('renders positive floors as the integer', () => {
    expect(formatFloor(3)).toBe('3');
    expect(formatFloor(12)).toBe('12');
  });

  it('renders basement floors with the minus sign', () => {
    expect(formatFloor(-1)).toBe('-1');
    expect(formatFloor(-2)).toBe('-2');
  });

  it('is empty-string for null / undefined / "" / NaN', () => {
    expect(formatFloor(null)).toBe('');
    expect(formatFloor(undefined)).toBe('');
    expect(formatFloor('')).toBe('');
    expect(formatFloor('not a number')).toBe('');
  });

  it('combines with total — "קרקע / 5" case', () => {
    expect(formatFloor(0, 5)).toBe('קרקע/5');
    expect(formatFloor(3, 5)).toBe('3/5');
  });

  it('ignores missing / invalid total', () => {
    expect(formatFloor(3, null)).toBe('3');
    expect(formatFloor(3, '?')).toBe('3');
    expect(formatFloor(3, 'abc')).toBe('3');
  });

  it('total=0 is "קרקע" on the denominator side too', () => {
    expect(formatFloor(0, 0)).toBe('קרקע/קרקע');
  });
});

describe('formatFloorOutOf', () => {
  it('uses "מתוך" phrasing', () => {
    expect(formatFloorOutOf(3, 5)).toBe('3 מתוך 5');
    expect(formatFloorOutOf(0, 5)).toBe('קרקע מתוך 5');
  });

  it('omits "מתוך Y" when total is missing', () => {
    expect(formatFloorOutOf(3)).toBe('3');
  });

  it('empty for null/NaN', () => {
    expect(formatFloorOutOf(null)).toBe('');
    expect(formatFloorOutOf('x')).toBe('');
  });
});
