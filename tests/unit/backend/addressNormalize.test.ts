import { describe, it, expect } from 'vitest';
import {
  normalizeCity,
  normalizeStreet,
  normalizeAddress,
  normKey,
} from '../../../backend/src/lib/addressNormalize.ts';

describe('normKey', () => {
  it('strips gershayim variants and collapses whitespace', () => {
    expect(normKey('תל" אביב')).toBe(normKey('תל אביב'));
    expect(normKey("ז'בוטינסקי")).toBe(normKey('זבוטינסקי'));
    expect(normKey('  שנקין  ')).toBe('שנקין');
  });
  it('strips parenthetical suffixes', () => {
    expect(normKey('אבו גוש (ישוב)')).toBe('אבו גוש');
  });
  it('strips trailing house numbers', () => {
    expect(normKey('הרצל 15')).toBe('הרצל');
    expect(normKey('הרצל 15א')).toBe('הרצל');
    expect(normKey('הרצל 15/3')).toBe('הרצל');
    expect(normKey('הרצל 15-17')).toBe('הרצל');
  });
  it('folds שדרות / רחוב prefixes', () => {
    expect(normKey('שדרות הרצל')).toBe('שד הרצל');
    expect(normKey("שד' הרצל")).toBe('שד הרצל');
    expect(normKey('רחוב שנקין')).toBe('שנקין');
    expect(normKey("רח' שנקין")).toBe('שנקין');
  });
});

describe('normalizeCity', () => {
  it('resolves "תל אביב" to the canonical "תל אביב - יפו" via token subset', () => {
    const out = normalizeCity('תל אביב');
    expect(out?.code).toBe(5000);
    expect(out?.value).toContain('תל אביב');
  });
  it('handles hyphenated variants of Rishon', () => {
    expect(normalizeCity('ראשון לציון')?.code).toBe(8300);
    expect(normalizeCity('ראשון-לציון')?.code).toBe(8300);
  });
  it('resolves Ramla', () => {
    expect(normalizeCity('רמלה')?.code).toBe(8500);
    expect(normalizeCity('רמלה ')?.code).toBe(8500);
  });
  it('returns null for gibberish', () => {
    expect(normalizeCity('zzzzzzzz')).toBeNull();
    expect(normalizeCity('')).toBeNull();
    expect(normalizeCity(null)).toBeNull();
  });
  it('does NOT fuzzy-match short city names into unrelated bedouin tribes', () => {
    // The 0.2 ratio cap exists because earlier tuning snapped
    // "תל אביב" (7 chars) to "ג'נאביב (שבט)" at edit distance 3.
    expect(normalizeCity('תל אביב')?.value).not.toMatch(/שבט/);
  });
});

describe('normalizeStreet', () => {
  it('snaps שיינקין → שינקין within ראשון לציון (the user-reported bug)', () => {
    const out = normalizeStreet('שיינקין', 'ראשון לציון');
    expect(out?.value).toBe('שינקין');
    expect(out?.code).toBeGreaterThan(0);
  });
  it('leaves Tel-Aviv Shenkin as שיינקין (its canonical spelling there)', () => {
    // Each city has its own government-registered spelling — we snap
    // to THAT city's canonical, not a global one.
    const out = normalizeStreet('שינקין', 'תל אביב');
    expect(out?.value).toBe('שיינקין');
  });
  it('returns null when the city is unknown', () => {
    expect(normalizeStreet('שינקין', 'Nowheresville')).toBeNull();
  });
  it('returns null without a city hint', () => {
    expect(normalizeStreet('שינקין', null)).toBeNull();
  });
  it('returns null when the street is unknown (never silently drops user input)', () => {
    expect(normalizeStreet('רחוב שלא קיים באמת', 'תל אביב')).toBeNull();
  });
  it('snaps "שדרות הרצל 15" → "שד הרצל 15" in Ramla (prefix folded, house # preserved)', () => {
    const out = normalizeStreet('שדרות הרצל 15', 'רמלה');
    expect(out?.value).toBe('שד הרצל 15');
  });
  it('does not mis-route הרצל into the nearby "שדרות הרמבלס"', () => {
    const out = normalizeStreet('שדרות הרצל 15', 'רמלה');
    expect(out?.value).not.toMatch(/רמבלס/);
  });
  it('preserves apartment-style house suffixes (15א, 15/3)', () => {
    expect(normalizeStreet('שינקין 42א', 'תל אביב')?.value).toBe('שיינקין 42א');
    expect(normalizeStreet('שינקין 42/3', 'תל אביב')?.value).toBe('שיינקין 42/3');
  });
});

describe('normalizeAddress overlay', () => {
  it('returns canonical fields when both resolve', () => {
    const out = normalizeAddress({ city: 'ראשון-לציון', street: 'שיינקין' });
    expect(out.city).toBe('ראשון לציון');
    expect(out.street).toBe('שינקין');
    expect(out.cityCode).toBe(8300);
    expect(out.streetCode).toBeDefined();
  });
  it('fills the city even when the street could not be resolved', () => {
    const out = normalizeAddress({ city: 'תל אביב', street: 'רחוב שלא קיים באמת' });
    expect(out.city).toContain('תל אביב');
    expect(out.street).toBeUndefined();
  });
  it('is a no-op for empty input', () => {
    expect(normalizeAddress({})).toEqual({});
    expect(normalizeAddress({ city: '', street: '' })).toEqual({});
  });
});
