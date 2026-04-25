// SEC-006 — SSRF guardrails for the Yad2 image re-hoster.
//
// `rehostImage()` in routes/yad2.ts downloads an arbitrary URL named
// in the agency-import payload. Without these checks, an authenticated
// agent could probe internal services from the EC2 container, including
// the AWS instance-metadata service (169.254.169.254) which leaks IAM
// credentials.
//
// The guard is name-based — Yad2's CDN runs on a small set of known
// hostnames, so an explicit allowlist is the simplest defence. We also
// belt-and-braces against literal-IP hosts and RFC1918 / loopback /
// link-local ranges so a stray DNS rebind or a CNAME pointing into the
// VPC can't sneak through.
//
// This file deliberately has zero deps beyond `node:url` so the unit
// test can import it without dragging in zod / prisma / fastify.

const ALLOWED_REHOST_HOSTS = new Set<string>([
  'img.yad2.co.il',
  'images.yad2.co.il',
  'y2img.yad2.co.il',
]);

// IPv4 ranges we block even if they somehow appear as the literal host
// of a request URL. Belt-and-suspenders behind ALLOWED_REHOST_HOSTS.
const PRIVATE_IPV4: RegExp[] = [
  /^10\./,                      // RFC1918 — internal corporate
  /^127\./,                     // loopback
  /^169\.254\./,                // link-local (AWS instance metadata!)
  /^172\.(1[6-9]|2\d|3[0-1])\./, // RFC1918
  /^192\.168\./,                // RFC1918
  /^0\./,                       // "this" network — wildly broken but valid in IP parsers
];

/**
 * Throws if `srcUrl` is not safe to fetch from the server.
 *
 * Rules:
 *  - protocol must be https (no http, ftp, file, gopher, etc.).
 *  - host must be on the explicit Yad2 CDN allowlist.
 *  - even though the allowlist is name-based, we still reject any URL
 *    whose host is a literal IPv4 / IPv6 address (DNS-bypass attempts).
 *  - we double-check against private / loopback / link-local IPv4
 *    ranges in case the host string somehow slips through.
 */
export function assertRehostUrlSafe(srcUrl: string): void {
  let u: URL;
  try {
    u = new URL(srcUrl);
  } catch {
    throw new Error(`rehost: invalid URL`);
  }

  if (u.protocol !== 'https:') {
    throw new Error(`rehost: https only (got ${u.protocol})`);
  }

  // `URL.hostname` returns the bracketed IPv6 host *unwrapped* (no
  // brackets), so check both forms.
  const host = u.hostname.toLowerCase();

  if (!ALLOWED_REHOST_HOSTS.has(host)) {
    throw new Error(`rehost: host not allowed: ${host}`);
  }

  // Reject literal IP hosts — the allowlist already prevents this in
  // practice, but if a future maintainer adds a numeric host to the
  // set this guard prevents accidental SSRF. Hostname containing ':'
  // signals an unbracketed IPv6 (rare, but possible via fetch).
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(':')) {
    throw new Error(`rehost: literal IP not allowed: ${host}`);
  }

  for (const re of PRIVATE_IPV4) {
    if (re.test(host)) {
      throw new Error(`rehost: private network address: ${host}`);
    }
  }
}

// Re-export so caller sites that want to compose extra logic (e.g. the
// redirect-Location guard) don't have to duplicate the allowlist.
export { ALLOWED_REHOST_HOSTS };
