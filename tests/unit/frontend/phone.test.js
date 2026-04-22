import { describe, it, expect } from 'vitest';
import { formatPhone, toE164, digitsOnly } from '../../../frontend/src/lib/phone.js';

// X-2 — one phone formatter for the whole app.
//
// Display rules (Hebrew-first, Israeli market):
//   +972 / 972 / +972-  → "+972 XX-XXX-XXXX"  (international inbound)
//   Local 05X…          → "05X-XXX-XXXX"       (unchanged display)
//   Landline 0[2-4,8,9] → "0X-XXX-XXXX"
//   Empty / invalid     → empty string (caller decides fallback)
//
// Canonicalization (toE164): strip separators, resolve leading 0 or
// 972 variants to a strict E.164 `+972…` string. Used when we POST
// back to the server so stored numbers converge on one shape.

describe('X-2 — formatPhone (display)', () => {
  it.each([
    ['+972501234567',        '+972 50-123-4567'],
    ['972501234567',         '+972 50-123-4567'],
    ['+972-50-123-4567',     '+972 50-123-4567'],
    ['+972 50 123 4567',     '+972 50-123-4567'],
    ['00972501234567',       '+972 50-123-4567'],
    ['0501234567',           '050-123-4567'],
    ['050-1234567',          '050-123-4567'],
    ['050 123 4567',         '050-123-4567'],
    ['03-5551234',           '03-555-1234'],
    ['035551234',            '03-555-1234'],
    ['02-1234567',           '02-123-4567'],
  ])('formats %s → %s', (input, expected) => {
    expect(formatPhone(input)).toBe(expected);
  });

  it.each([null, undefined, '', '   '])('returns empty string for %p', (v) => {
    expect(formatPhone(v)).toBe('');
  });

  it('falls through unchanged for clearly non-Israeli numbers', () => {
    // US-shaped 10-digit number — no Israeli prefix, no leading 0.
    // We don't pretend to understand other locales; we return the
    // caller's digits with a single hyphenless shape so the UI isn't
    // broken.
    expect(formatPhone('4155551234')).toBe('4155551234');
  });
});

describe('X-2 — toE164 (canonical for storage)', () => {
  it.each([
    ['0501234567',           '+972501234567'],
    ['+972501234567',        '+972501234567'],
    ['972501234567',         '+972501234567'],
    ['00972501234567',       '+972501234567'],
    ['050-123-4567',         '+972501234567'],
    ['+972 50 123 4567',     '+972501234567'],
  ])('canonicalizes %s → %s', (input, expected) => {
    expect(toE164(input)).toBe(expected);
  });

  it('returns null for empty/invalid input', () => {
    expect(toE164(null)).toBeNull();
    expect(toE164('')).toBeNull();
    expect(toE164('abc')).toBeNull();
  });
});

describe('X-2 — digitsOnly', () => {
  it.each([
    ['+972 50-123-4567', '972501234567'],
    ['050-1234567',      '0501234567'],
    ['   (050) 123 4567', '0501234567'],
  ])('strips non-digits %s → %s', (i, o) => expect(digitsOnly(i)).toBe(o));
});
