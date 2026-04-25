import { describe, it, expect } from 'vitest';
import { assertRehostUrlSafe } from '../../../backend/src/lib/rehostGuards.ts';

// SEC-006 — `rehostImage()` in routes/yad2.ts blindly fetches any
// https URL the import payload supplies. Without an allowlist + private
// network block, an authenticated agent can pivot through the EC2
// container to AWS instance metadata (169.254.169.254), RDS, etc.
//
// `assertRehostUrlSafe()` is the surface we test in isolation — it
// throws synchronously on anything that doesn't look like a Yad2 image
// CDN URL. The fetch + S3 upload halves of `rehostImage()` stay private
// and don't need to be mocked.

describe('SEC-006 — assertRehostUrlSafe', () => {
  describe('blocks (must throw)', () => {
    it('rejects AWS instance metadata (169.254.169.254)', () => {
      expect(() =>
        assertRehostUrlSafe('http://169.254.169.254/latest/meta-data/iam/security-credentials/whatever'),
      ).toThrow();
    });

    it('rejects RFC1918 10.0.0.0/8', () => {
      expect(() => assertRehostUrlSafe('http://10.0.0.5/foo')).toThrow();
    });

    it('rejects RFC1918 172.16.0.0/12', () => {
      expect(() => assertRehostUrlSafe('http://172.16.0.1/foo')).toThrow();
    });

    it('rejects RFC1918 192.168.0.0/16', () => {
      expect(() => assertRehostUrlSafe('http://192.168.1.1/foo')).toThrow();
    });

    it('rejects IPv6 loopback ::1', () => {
      expect(() => assertRehostUrlSafe('http://[::1]/foo')).toThrow();
    });

    it('rejects DNS-loopback "localhost"', () => {
      expect(() => assertRehostUrlSafe('http://localhost/foo')).toThrow();
    });

    it('rejects 127.0.0.1', () => {
      expect(() => assertRehostUrlSafe('http://127.0.0.1/foo')).toThrow();
    });

    it('rejects non-http(s) protocols (ftp://)', () => {
      expect(() => assertRehostUrlSafe('ftp://img.yad2.co.il/foo')).toThrow();
    });

    it('rejects http:// even on the allowlisted host (https only)', () => {
      expect(() => assertRehostUrlSafe('http://img.yad2.co.il/foo')).toThrow();
    });

    it('rejects an arbitrary internet host not on the allowlist', () => {
      expect(() => assertRehostUrlSafe('https://evil.com/foo')).toThrow();
    });

    it('rejects look-alike subdomains (foo.yad2.co.il.evil.com)', () => {
      expect(() => assertRehostUrlSafe('https://img.yad2.co.il.evil.com/foo')).toThrow();
    });
  });

  describe('allows (must NOT throw)', () => {
    it('accepts https://img.yad2.co.il/Pic/...', () => {
      expect(() =>
        assertRehostUrlSafe('https://img.yad2.co.il/Pic/202312/01/2_5/o2_5_1_03234_20231201124745.jpeg'),
      ).not.toThrow();
    });

    it('accepts https://images.yad2.co.il/Pic/...', () => {
      expect(() =>
        assertRehostUrlSafe('https://images.yad2.co.il/Pic/202312/01/2_5/o2_5_1_03234_20231201124745.jpeg'),
      ).not.toThrow();
    });

    it('accepts https://y2img.yad2.co.il/...', () => {
      expect(() =>
        assertRehostUrlSafe('https://y2img.yad2.co.il/Pic/foo.jpg'),
      ).not.toThrow();
    });
  });
});
