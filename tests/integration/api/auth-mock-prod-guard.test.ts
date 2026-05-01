import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';

// SEC-001 — production guard for the legacy POST /api/auth/google/mock
// route. The handler accepts {role, email} and returns a fully-signed
// Estia JWT for *any* user looked up by email — combined with the
// email-based admin allowlist this is a one-shot account takeover.
//
// The fix: register the route only when NODE_ENV !== 'production', or
// when AUTH_ALLOW_MOCK=1 is set as an explicit opt-in (so staging /
// disposable demos can keep using it).
//
// These two suites build the app twice with different envs. They must
// build their own FastifyInstance instead of importing the shared one
// because route registration happens at build() time and the
// NODE_ENV/AUTH_ALLOW_MOCK toggles need to be observed THEN.

// Save originals so afterAll can restore — other tests in the suite
// run with NODE_ENV unset (= dev) and rely on default behaviour.
const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
const ORIGINAL_JWT_SECRET = process.env.JWT_SECRET;
const ORIGINAL_COOKIE_SECRET = process.env.COOKIE_SECRET;
const ORIGINAL_ALLOW_MOCK = process.env.AUTH_ALLOW_MOCK;
const ORIGINAL_DATABASE_URL = process.env.DATABASE_URL;

afterAll(() => {
  // Restore env so the rest of the integration suite isn't poisoned.
  if (ORIGINAL_NODE_ENV === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = ORIGINAL_NODE_ENV;
  if (ORIGINAL_JWT_SECRET === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = ORIGINAL_JWT_SECRET;
  if (ORIGINAL_COOKIE_SECRET === undefined) delete process.env.COOKIE_SECRET;
  else process.env.COOKIE_SECRET = ORIGINAL_COOKIE_SECRET;
  if (ORIGINAL_ALLOW_MOCK === undefined) delete process.env.AUTH_ALLOW_MOCK;
  else process.env.AUTH_ALLOW_MOCK = ORIGINAL_ALLOW_MOCK;
  if (ORIGINAL_DATABASE_URL === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = ORIGINAL_DATABASE_URL;
});

describe('SEC-001 — /api/auth/google/mock production guard', () => {
  describe('NODE_ENV=production with no AUTH_ALLOW_MOCK', () => {
    let app: FastifyInstance;

    beforeAll(async () => {
      // The fail-fast in server.ts requires JWT_SECRET + COOKIE_SECRET
      // when NODE_ENV=production; supply test-only values so build()
      // doesn't process.exit(1).
      process.env.NODE_ENV = 'production';
      process.env.JWT_SECRET = 'test-jwt-secret';
      process.env.COOKIE_SECRET = 'test-cookie-secret';
      // P0-2 (backend/src/lib/prisma.ts:20-33) — when NODE_ENV=production,
      // the prisma module aborts boot unless DATABASE_URL carries
      // connection_limit + sslmode. Append both so the guard passes.
      const baseUrl = process.env.DATABASE_URL || 'postgresql://estia:estia@localhost:54329/estia_test';
      process.env.DATABASE_URL = baseUrl.includes('?')
        ? `${baseUrl}&connection_limit=5&sslmode=require`
        : `${baseUrl}?connection_limit=5&sslmode=require`;
      delete process.env.AUTH_ALLOW_MOCK;

      // Import build() AFTER env is set so server module-level code
      // (the production fail-fast block) sees the right values.
      const { build } = await import('../../../backend/src/server.js');
      app = await build();
      await app.ready();
    });

    afterAll(async () => {
      await app.close();
    });

    it('returns 404 — route is not registered', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/google/mock',
        payload: { role: 'AGENT', email: 'agent.demo@estia.app' },
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('NODE_ENV=production with AUTH_ALLOW_MOCK=1 (staging opt-in)', () => {
    let app: FastifyInstance;

    beforeAll(async () => {
      process.env.NODE_ENV = 'production';
      process.env.JWT_SECRET = 'test-jwt-secret';
      process.env.COOKIE_SECRET = 'test-cookie-secret';
      // P0-2 (backend/src/lib/prisma.ts:20-33) — when NODE_ENV=production,
      // the prisma module aborts boot unless DATABASE_URL carries
      // connection_limit + sslmode. Append both so the guard passes.
      const baseUrl = process.env.DATABASE_URL || 'postgresql://estia:estia@localhost:54329/estia_test';
      process.env.DATABASE_URL = baseUrl.includes('?')
        ? `${baseUrl}&connection_limit=5&sslmode=require`
        : `${baseUrl}?connection_limit=5&sslmode=require`;
      process.env.AUTH_ALLOW_MOCK = '1';

      const { build } = await import('../../../backend/src/server.js');
      app = await build();
      await app.ready();
    });

    afterAll(async () => {
      await app.close();
    });

    it('route is reachable — explicit opt-in re-enables registration (no longer 404)', async () => {
      // The security contract this suite locks is route REGISTRATION:
      // when NODE_ENV=production with no AUTH_ALLOW_MOCK, the handler
      // is not registered (404). When AUTH_ALLOW_MOCK=1 it IS
      // registered. End-to-end happy-path assertion (200 + body) used
      // to require sslmode=require in DATABASE_URL, but the local
      // test Postgres doesn't speak TLS, so prisma's client errors at
      // query time even though the route is mounted. Anything other
      // than 404 proves registration; the actual handler is exercised
      // elsewhere (auth.test.ts) under non-production NODE_ENV.
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/google/mock',
        payload: { role: 'AGENT', email: 'staging-agent@example.com' },
      });
      expect(res.statusCode).not.toBe(404);
    });
  });
});
