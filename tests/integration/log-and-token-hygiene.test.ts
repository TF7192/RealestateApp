// SEC-004 / SEC-005 / SEC-031 — sensitive-data-leak fixes.
//
//   SEC-004 Password reset tokens were logged at info level. Anyone
//           with read access to the prod log pipeline could take over
//           an account during the 30-minute TTL. The token must not
//           appear anywhere in the pino output for the forgot-password
//           handler.
//
//   SEC-031 Login + signup + google/mock used to return the JWT in the
//           response body in addition to the httpOnly cookie. The web
//           client never reads it (no localStorage write); the cookie
//           is the canonical session. Stripping it from the body
//           shrinks the leak surface (PostHog, sentry, server logs).
//           The native (iOS) /google/native-exchange path is left
//           alone — the iPhone app actively reads `token` there.
//
//   SEC-005 The Google token-exchange response body — which in some
//           failure modes carries access_token / refresh_token /
//           id_token — was logged at warn level on failure. Tested as
//           a unit on the redaction helper because the integration
//           path requires a Google API failure we can't easily fake.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Writable } from 'node:stream';
import type { FastifyInstance } from 'fastify';
import { build } from '../../backend/src/server.js';
import { prisma } from '../setup/integration.setup.js';
import { createAgent } from '../factories/user.factory.js';
import { redactTokenExchangeError } from '../../backend/src/lib/oauthLog.js';

// AUTH_ALLOW_MOCK guards the /google/mock route once SEC-001 lands;
// flip it on for this suite so the assertion path stays exercised.
process.env.AUTH_ALLOW_MOCK = '1';
// Disable the per-route rate limiter — we hit /signup + /login + the
// google/mock handler back-to-back inside one run.
process.env.AUTH_RATE_LIMIT_DISABLED = '1';

// Capture every pino line emitted while the request is in flight. We
// use a plain Writable in object-mode-off so pino's NDJSON output lands
// here as Buffer chunks; we keep them as raw strings for the regex
// assertion.
function makeLogCapture() {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk, _enc, cb) {
      lines.push(String(chunk));
      cb();
    },
  });
  return { lines, stream };
}

let app: FastifyInstance;
const captured = makeLogCapture();

beforeAll(async () => {
  // Pino accepts `{ level, stream }` via Fastify's logger option. We
  // crank the level down to trace so nothing is filtered out before
  // the writable receives it.
  app = await build({
    logger: { level: 'trace', stream: captured.stream },
  });
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

describe('SEC-004 — POST /api/auth/forgot-password does not log the reset token', () => {
  it('issues a token but the token string never appears in any log line', async () => {
    const agent = await createAgent(prisma);
    // Snapshot the line count before the request so we only inspect
    // lines that the forgot-password handler emitted.
    const before = captured.lines.length;
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/forgot-password',
      payload: { email: agent.email },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    // In non-prod the handler returns the token via `devToken` so the
    // dev workflow can deep-link the reset page without SES wired up.
    // That's the known string we want to grep the logs for.
    const devToken: string = body.devToken;
    expect(devToken).toBeTruthy();
    expect(devToken).toMatch(/^[0-9a-f]{48}$/);

    // Allow pino's writable a tick to flush.
    await new Promise((r) => setImmediate(r));
    const newLines = captured.lines.slice(before).join('\n');
    // The smoking gun: the literal token string must not appear in any
    // log line. The handler may still log `password reset token issued`
    // with a userId — that's fine.
    expect(newLines).not.toContain(devToken);
  });
});

describe('SEC-031 — auth response bodies no longer carry the JWT', () => {
  it('POST /api/auth/login returns { user } without a top-level token field', async () => {
    const agent = await createAgent(prisma);
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: agent.email, password: agent._plainPassword },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.user?.id).toBe(agent.id);
    expect(body.token).toBeUndefined();
    // The cookie still rides as before — that's the canonical session.
    expect(String(res.headers['set-cookie'])).toMatch(/estia_token=/);
  });

  it('POST /api/auth/signup returns { user } without a top-level token field', async () => {
    const email = `sec031-signup-${Date.now()}@example.com`;
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/signup',
      payload: {
        email,
        password: 'StrongPass1!',
        role: 'AGENT',
        displayName: 'SEC-031 שם',
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.user?.email).toBe(email);
    expect(body.token).toBeUndefined();
    expect(String(res.headers['set-cookie'])).toMatch(/estia_token=/);
  });

  it('POST /api/auth/google/mock returns { user } without a top-level token field', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/google/mock',
      payload: {
        role: 'AGENT',
        email: `sec031-google-${Date.now()}@example.com`,
        displayName: 'מוק גוגל',
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.user?.email).toMatch(/sec031-google-/);
    expect(body.token).toBeUndefined();
    expect(String(res.headers['set-cookie'])).toMatch(/estia_token=/);
  });
});

describe('SEC-005 — redactTokenExchangeError', () => {
  it('drops access_token / refresh_token / id_token and keeps error + error_description', () => {
    const tokens = {
      access_token: 'leaky-access',
      refresh_token: 'leaky-refresh',
      id_token: 'leaky-id',
      error: 'invalid_grant',
      error_description: 'Bad code',
    };
    const out = redactTokenExchangeError(tokens, 400);
    expect(out).toEqual({
      status: 400,
      error: 'invalid_grant',
      error_description: 'Bad code',
    });
    // Belt + braces — the redacted shape must NOT carry any token field
    // even on a deep walk.
    const flat = JSON.stringify(out);
    expect(flat).not.toContain('leaky-access');
    expect(flat).not.toContain('leaky-refresh');
    expect(flat).not.toContain('leaky-id');
  });

  it('handles a fully-empty tokens body (Google sometimes returns html)', () => {
    expect(redactTokenExchangeError(null, 502)).toEqual({
      status: 502,
      error: null,
      error_description: null,
    });
    expect(redactTokenExchangeError({}, 500)).toEqual({
      status: 500,
      error: null,
      error_description: null,
    });
  });
});
