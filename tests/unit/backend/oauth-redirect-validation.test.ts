import { describe, it, expect } from 'vitest';
import { safeRedirectPath } from '../../../backend/src/routes/oauth-google.js';

// SEC-015 — open redirect via /api/auth/google?redirect=
// Browsers interpret `//evil.com` as a protocol-relative URL pointing
// at https://evil.com. Some browsers (Edge, older IE) also normalize
// `/\evil.com` to `//evil.com`. Both must be rejected.
describe('safeRedirectPath — SEC-015 open-redirect guard', () => {
  it('accepts a normal in-app path', () => {
    expect(safeRedirectPath('/dashboard')).toBe('/dashboard');
  });

  it('accepts a deep in-app path with query string', () => {
    expect(safeRedirectPath('/properties/abc123?tab=matches')).toBe(
      '/properties/abc123?tab=matches'
    );
  });

  it('rejects a protocol-relative URL (//evil.com)', () => {
    expect(safeRedirectPath('//evil.com')).toBe('/');
  });

  it('rejects a backslash-escape (/\\evil.com) — Edge-style normalization', () => {
    expect(safeRedirectPath('/\\evil.com')).toBe('/');
  });

  it('rejects an absolute https URL', () => {
    expect(safeRedirectPath('https://evil.com')).toBe('/');
  });

  it('rejects an absolute http URL', () => {
    expect(safeRedirectPath('http://evil.com')).toBe('/');
  });

  it('rejects javascript: URI scheme', () => {
    expect(safeRedirectPath('javascript:alert(1)')).toBe('/');
  });

  it('rejects an empty string', () => {
    expect(safeRedirectPath('')).toBe('/');
  });

  it('rejects undefined', () => {
    expect(safeRedirectPath(undefined)).toBe('/');
  });

  it('rejects a path that does not start with `/`', () => {
    expect(safeRedirectPath('dashboard')).toBe('/');
  });
});
