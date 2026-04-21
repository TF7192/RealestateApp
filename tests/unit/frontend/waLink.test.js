import { describe, it, expect } from 'vitest';
import {
  normalizeIsraeliPhone,
  waUrl,
  waUrlNoRecipient,
  telUrl,
  wazeUrl,
} from '../../../frontend/src/lib/waLink.js';

describe('normalizeIsraeliPhone — Postel\'s law', () => {
  it('normalizes local 05X to country-code 9725X', () => {
    expect(normalizeIsraeliPhone('0501234567')).toBe('972501234567');
  });

  it('strips dashes and spaces', () => {
    expect(normalizeIsraeliPhone('050-123-4567')).toBe('972501234567');
    expect(normalizeIsraeliPhone(' 050 123 4567 ')).toBe('972501234567');
  });

  it('keeps already-international numbers', () => {
    expect(normalizeIsraeliPhone('+972501234567')).toBe('972501234567');
    expect(normalizeIsraeliPhone('972501234567')).toBe('972501234567');
  });

  it('returns empty string for falsy / digits-free input', () => {
    expect(normalizeIsraeliPhone('')).toBe('');
    expect(normalizeIsraeliPhone(null)).toBe('');
    expect(normalizeIsraeliPhone('abc')).toBe('');
  });
});

describe('waUrl / waUrlNoRecipient', () => {
  it('builds the wa.me URL with a recipient', () => {
    expect(waUrl('0501234567')).toBe('https://wa.me/972501234567');
  });

  it('URL-encodes the text payload (Hebrew, emoji, newlines)', () => {
    const url = waUrl('0501234567', 'שלום\nDeal closed! 🎉');
    expect(url.startsWith('https://wa.me/972501234567?text=')).toBe(true);
    expect(url).toContain('%D7%A9%D7%9C%D7%95%D7%9D'); // "שלום"
    expect(url).toContain('%F0%9F%8E%89');            // 🎉
    expect(url).toContain('%0A');                     // newline
  });

  it('waUrlNoRecipient omits the recipient but keeps the text', () => {
    const url = waUrlNoRecipient('hi');
    expect(url).toBe('https://wa.me/?text=hi');
  });
});

describe('telUrl / wazeUrl', () => {
  it('telUrl keeps digits and +, strips everything else', () => {
    expect(telUrl('050-123 4567')).toBe('tel:0501234567');
    expect(telUrl('+972501234567')).toBe('tel:+972501234567');
  });

  it('wazeUrl encodes the address', () => {
    expect(wazeUrl('רוטשילד 45, תל אביב')).toMatch(/^https:\/\/waze\.com\/ul\?q=.+&navigate=yes$/);
  });
});
