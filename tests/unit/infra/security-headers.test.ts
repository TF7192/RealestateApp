import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// SEC-011 — `frontend/nginx.conf` fronts the SPA at the edge and was
// shipping zero hardening headers. The site was clickjackable in an
// iframe, first-HTTPS-visit had no HSTS pin, and a single XSS would
// have unbounded blast radius (no CSP). This test pins the header set
// at the static-config level so a future edit can't regress them
// silently — nginx isn't typically in the test runtime, so a string
// assertion against the config file is the cheapest signal we have.

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..', '..');
const NGINX_CONF = path.join(repoRoot, 'frontend', 'nginx.conf');

let conf = '';

beforeAll(() => {
  conf = fs.readFileSync(NGINX_CONF, 'utf8');
});

describe('frontend/nginx.conf — security headers', () => {
  it('pins HSTS for 2 years with includeSubDomains + preload', () => {
    expect(conf).toContain(
      'add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;',
    );
  });

  it('denies framing entirely (clickjacking defense)', () => {
    expect(conf).toContain('add_header X-Frame-Options DENY always;');
  });

  it('disables MIME sniffing', () => {
    expect(conf).toContain('add_header X-Content-Type-Options nosniff always;');
  });

  it('strips referrer when crossing origins', () => {
    expect(conf).toContain(
      'add_header Referrer-Policy strict-origin-when-cross-origin always;',
    );
  });

  it('declares a Permissions-Policy', () => {
    // The full policy string is long; just assert the directive prefix.
    expect(conf).toMatch(/add_header Permissions-Policy "/);
  });

  it('declares a Content-Security-Policy with the production-required origins', () => {
    expect(conf).toMatch(/add_header Content-Security-Policy "/);
    // Pin the directives we need so an edit can't accidentally widen
    // the default scope or drop the frame-ancestors lock.
    expect(conf).toContain("default-src 'self'");
    expect(conf).toContain("frame-ancestors 'none'");
    // PostHog ingest endpoint — see frontend/src/lib/analytics.js.
    expect(conf).toContain('https://us.i.posthog.com');
    // Google + Apple OAuth surfaces — even though our own OAuth flow
    // routes through the backend, Apple's Sign-in-with-Apple JS lib
    // and Google's One Tap can both call out to these origins.
    expect(conf).toContain('https://accounts.google.com');
    // Photon (geocoder). Today it's proxied through /api/geo, but the
    // allowlist documents the upstream so a future direct-call regression
    // doesn't silently break in production.
    expect(conf).toContain('https://photon.komoot.io');
    // Landing page loads React + Babel from unpkg — without this the
    // pre-rendered marketing page would break on every visit.
    expect(conf).toContain('https://unpkg.com');
    // Tile server for the /map view (OpenStreetMap raster tiles).
    expect(conf).toContain('tile.openstreetmap.org');
    // YouTube / Vimeo / Google Maps embeds inside property pages —
    // frame-src is what gates iframe sources.
    expect(conf).toMatch(/frame-src[^"]*youtube\.com/);
    expect(conf).toMatch(/frame-src[^"]*player\.vimeo\.com/);
    expect(conf).toMatch(/frame-src[^"]*google\.com\/maps/);
  });

  it('applies headers on error responses too (always qualifier)', () => {
    // The `always` qualifier on add_header makes nginx attach the
    // header even on 4xx/5xx responses. Without it, a 502 from the
    // backend would ship without HSTS / CSP — which is exactly when
    // a probing attacker is most interested in the response.
    const securityHeaders = [
      'Strict-Transport-Security',
      'X-Frame-Options',
      'X-Content-Type-Options',
      'Referrer-Policy',
      'Permissions-Policy',
      'Content-Security-Policy',
    ];
    for (const h of securityHeaders) {
      // For each header, find every add_header line and assert it ends
      // with `always;`. We match a whole logical line: the header name,
      // an optional double-quoted value (which may itself contain
      // semicolons inside the CSP / Permissions-Policy strings), and
      // then either the `always` qualifier or a bare semicolon.
      const re = new RegExp(`add_header ${h}\\s+(?:"[^"]*"|[^;]+)\\s*([^;]*);`, 'g');
      const matches = conf.match(re) || [];
      expect(matches.length).toBeGreaterThan(0);
      for (const m of matches) {
        expect(m).toMatch(/\balways;\s*$/);
      }
    }
  });
});
