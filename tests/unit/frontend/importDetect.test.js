import { describe, it, expect } from 'vitest';
import { detectColumns, headerSignature } from '../../../frontend/src/lib/importDetect.js';

// Regression net for the regex-based column detector. Add a case
// here whenever a real Excel in the wild auto-detects wrong.

describe('detectColumns — LEAD', () => {
  it('hits the core Hebrew headers', () => {
    const m = detectColumns(['שם מלא', 'טלפון נייד', 'אימייל', 'עיר מבוקשת', 'תקציב'], 'LEAD');
    expect(m['שם מלא']).toBe('name');
    expect(m['טלפון נייד']).toBe('phone');
    expect(m['אימייל']).toBe('email');
    expect(m['עיר מבוקשת']).toBe('city');
    expect(m['תקציב']).toBe('priceMax');
  });

  it('prefers firstName/lastName when both present, not the generic name', () => {
    const m = detectColumns(['שם פרטי', 'שם משפחה', 'שם מלא'], 'LEAD');
    expect(m['שם פרטי']).toBe('firstName');
    expect(m['שם משפחה']).toBe('lastName');
    // generic name still available, but matches only after first-hit consumption
    expect(m['שם מלא']).toBe('name');
  });

  it('English headers map too', () => {
    const m = detectColumns(['Name', 'Phone', 'Email', 'City', 'Budget'], 'LEAD');
    expect(m).toMatchObject({ Name: 'name', Phone: 'phone', Email: 'email', City: 'city', Budget: 'priceMax' });
  });

  it('unknown headers fall through to null (skip)', () => {
    const m = detectColumns(['שם', 'סוף שבוע'], 'LEAD');
    expect(m['שם']).toBe('name');
    expect(m['סוף שבוע']).toBeNull();
  });
});

describe('detectColumns — PROPERTY (sample Ramla file)', () => {
  it('handles the exact headers from the real Excel', () => {
    // Pulled from the user's sample: טבלת נכסים רמלה 12.01.26.xlsx
    const m = detectColumns(
      ['שכונה', 'כתובת', 'חדרים', 'קומה', 'מ״ר', 'מעלית', 'תיאור המודעה', 'מחיר'],
      'PROPERTY',
    );
    expect(m).toMatchObject({
      'שכונה':       'neighborhood',
      'כתובת':       'street',
      'חדרים':       'rooms',
      'קומה':        'floor',
      'מ״ר':         'sqm',
      'מעלית':       'elevator',
      'תיאור המודעה': 'notes',
      'מחיר':        'marketingPrice',
    });
  });
});

describe('headerSignature', () => {
  it('is order-invariant and case-normalized', () => {
    const a = headerSignature(['שם', 'טלפון', 'עיר']);
    const b = headerSignature(['עיר', 'טלפון', 'שם']);
    const c = headerSignature([' שם ', 'טלפון', 'עיר']);
    expect(a).toEqual(b);
    expect(a).toEqual(c);
  });
});
