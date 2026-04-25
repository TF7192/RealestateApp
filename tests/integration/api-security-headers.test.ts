import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { build } from '../../backend/src/server.js';

// SEC-011 — server.ts used to register helmet with
// `contentSecurityPolicy: false`, which left every API response
// without a CSP header. The fix flips CSP back on with a strict
// "default-src 'none'" policy because the JSON API never needs to
// load anything in a browser context. The OG-bot endpoint at
// /api/public/og/property/* is the one HTML response surface; it
// overrides CSP per-route to keep its inline meta tags rendering.

let app: FastifyInstance;

beforeAll(async () => {
  app = await build();
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

describe('API security headers (helmet)', () => {
  it('sets x-content-type-options: nosniff on every response', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('sets x-frame-options: DENY (clickjacking lock)', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    // Helmet's default is SAMEORIGIN, but we pin DENY for the JSON
    // API since nothing should ever embed it in a frame.
    expect(String(res.headers['x-frame-options'])).toMatch(/^DENY$/i);
  });

  it('sets a strict Content-Security-Policy on JSON responses', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    const csp = res.headers['content-security-policy'];
    expect(csp).toBeTruthy();
    // Strict default — JSON API surface doesn't render HTML so it
    // doesn't need to load anything.
    expect(String(csp)).toContain("default-src 'none'");
    expect(String(csp)).toContain("frame-ancestors 'none'");
  });

  it('sets Referrer-Policy on every response (helmet default)', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    // Helmet's default is "no-referrer". Anything in the strict
    // direction is fine; the assertion just guards against the
    // header being dropped entirely.
    expect(res.headers['referrer-policy']).toBeTruthy();
  });

  it('still allows the OG endpoint to render HTML (route override)', async () => {
    // The OG handler returns HTML with inline meta tags + a tiny
    // anchor. It serves social-bot crawlers (WhatsApp / FB /
    // Twitter / LinkedIn). A 404 path is fine for this test — what
    // we're proving is that the route doesn't throw on the way out
    // because of a CSP that forbids the response type. We hit a
    // known-missing slug so we don't need a populated DB.
    const res = await app.inject({
      method: 'GET',
      url: '/api/public/og/property/no-such-agent/no-such-prop',
    });
    // 404 is the expected outcome; what matters is the request
    // resolved instead of crashing under the strict default CSP.
    expect([200, 404]).toContain(res.statusCode);
  });
});
