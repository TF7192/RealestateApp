// Canonical shape of a pure-logic unit test in this suite.
// No DOM, no MSW, no provider wrappers. Just an input → output check.
import { describe, it, expect } from 'vitest';
// eslint-disable-next-line import/no-relative-packages
import { normalizeIsraeliPhone } from '@estia/frontend/lib/waLink.js';

describe('example: pure-logic unit', () => {
  it('normalizes an Israeli mobile number to country code', () => {
    expect(normalizeIsraeliPhone('050-123-4567')).toBe('972501234567');
  });
});
