import { describe, it, expect } from 'vitest';
import { urlToKey } from '../../../backend/src/lib/storage.ts';

// SEC-028 — `urlToKey()` strips the /uploads/ prefix from a stored URL
// to recover the storage key. Keys are server-generated UUIDs in real
// use, so a `..` segment or absolute path here is a sign of corruption
// or tampering — reject defensively rather than rely on the fact that
// callers (currently) only pass row.path values written by putUpload.
//
// We pin the negative cases here so a future refactor of the function
// can't quietly drop the traversal guard.

describe('SEC-028 — urlToKey traversal hardening', () => {
  describe('rejects (returns null)', () => {
    it("rejects '..' parent segment", () => {
      expect(urlToKey('/uploads/../etc/passwd')).toBeNull();
    });

    it("rejects nested '..' inside a key", () => {
      expect(urlToKey('/uploads/foo/../bar')).toBeNull();
    });

    it('rejects an absolute path that is not /uploads/', () => {
      expect(urlToKey('/etc/passwd')).toBeNull();
    });

    it('rejects empty string', () => {
      expect(urlToKey('')).toBeNull();
    });

    it('rejects null/undefined safely', () => {
      // @ts-expect-error — runtime guard; the function accepts string but
      // legacy callers occasionally pass null when a row column was nullable.
      expect(urlToKey(null)).toBeNull();
      // @ts-expect-error — see above.
      expect(urlToKey(undefined)).toBeNull();
    });

    it('rejects URLs with no /uploads/ prefix', () => {
      expect(urlToKey('https://evil.com/uploads/x')).toBeNull();
    });
  });

  describe('accepts (returns key)', () => {
    it('returns the key for a normal /uploads/ path', () => {
      expect(urlToKey('/uploads/properties/abc-123/img.jpg')).toBe(
        'properties/abc-123/img.jpg',
      );
    });

    it('returns the key for a UUID-style document path', () => {
      expect(urlToKey('/uploads/documents/agent-1/uuid-1234.pdf')).toBe(
        'documents/agent-1/uuid-1234.pdf',
      );
    });
  });
});
