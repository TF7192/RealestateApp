import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { build } from '../../../backend/src/server.js';
import { prisma } from '../../setup/integration.setup.js';
import { createAgent } from '../../factories/user.factory.js';

let app: FastifyInstance;

beforeAll(async () => {
  app = await build();
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

// Disable per-route rate-limits for this suite — we fire 5+ forgot
// requests in a single run and we don't want the global limiter
// blocking the last few.
process.env.AUTH_RATE_LIMIT_DISABLED = '1';

describe('POST /api/auth/forgot-password', () => {
  it('returns { ok: true } without leaking whether the email exists', async () => {
    const agent = await createAgent(prisma);
    const found = await app.inject({
      method: 'POST',
      url: '/api/auth/forgot-password',
      payload: { email: agent.email },
    });
    const missing = await app.inject({
      method: 'POST',
      url: '/api/auth/forgot-password',
      payload: { email: `does-not-exist-${Date.now()}@example.com` },
    });
    expect(found.statusCode).toBe(200);
    expect(missing.statusCode).toBe(200);
    expect(found.json().ok).toBe(true);
    expect(missing.json().ok).toBe(true);
  });

  it('mints a token row for a real user (token only returned in dev env)', async () => {
    const agent = await createAgent(prisma);
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/forgot-password',
      payload: { email: agent.email },
    });
    expect(res.statusCode).toBe(200);
    const rows = await prisma.passwordResetToken.findMany({ where: { userId: agent.id } });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].usedAt).toBeNull();
    expect(rows[0].expiresAt.getTime()).toBeGreaterThan(Date.now());
    // Token length = 48 hex chars (24 random bytes).
    expect(rows[0].token).toMatch(/^[0-9a-f]{48}$/);
  });

  it('400s on malformed email', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/forgot-password',
      payload: { email: 'not-an-email' },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('POST /api/auth/reset-password', () => {
  it('accepts a valid token + updates the password', async () => {
    const agent = await createAgent(prisma);
    await app.inject({
      method: 'POST',
      url: '/api/auth/forgot-password',
      payload: { email: agent.email },
    });
    const row = await prisma.passwordResetToken.findFirst({ where: { userId: agent.id } });
    expect(row).toBeTruthy();
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/reset-password',
      payload: { token: row!.token, password: 'brand-new-pw-789' },
    });
    expect(res.statusCode).toBe(200);
    // Login with the new password works.
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: agent.email, password: 'brand-new-pw-789' },
    });
    expect(login.statusCode).toBe(200);
    // Token flipped to used.
    const reread = await prisma.passwordResetToken.findUnique({ where: { id: row!.id } });
    expect(reread?.usedAt).toBeTruthy();
  });

  it('rejects a replayed token (second consume returns 400)', async () => {
    const agent = await createAgent(prisma);
    await app.inject({
      method: 'POST',
      url: '/api/auth/forgot-password',
      payload: { email: agent.email },
    });
    const row = await prisma.passwordResetToken.findFirst({ where: { userId: agent.id } });
    await app.inject({
      method: 'POST',
      url: '/api/auth/reset-password',
      payload: { token: row!.token, password: 'brand-new-pw-789' },
    });
    const second = await app.inject({
      method: 'POST',
      url: '/api/auth/reset-password',
      payload: { token: row!.token, password: 'another-pw-456' },
    });
    expect(second.statusCode).toBe(400);
  });

  it('rejects an expired token', async () => {
    const agent = await createAgent(prisma);
    // Manually plant an expired token.
    await prisma.passwordResetToken.create({
      data: {
        userId: agent.id,
        token: 'a'.repeat(48),
        expiresAt: new Date(Date.now() - 60_000),
      },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/reset-password',
      payload: { token: 'a'.repeat(48), password: 'brand-new-pw-789' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects a password shorter than 8 chars', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/reset-password',
      payload: { token: 'b'.repeat(48), password: 'short' },
    });
    expect(res.statusCode).toBe(400);
  });
});
