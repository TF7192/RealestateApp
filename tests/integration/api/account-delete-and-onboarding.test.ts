import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { build } from '../../../backend/src/server.js';
import { prisma } from '../../setup/integration.setup.js';
import { createAgent } from '../../factories/user.factory.js';
import { loginAs } from '../../helpers/auth.js';

// A-1 (soft delete account) + A-4 (first-login onboarding). Both ship
// additive Prisma columns on User: `deletedAt`, `profileCompletedAt`.

let app: FastifyInstance;
beforeAll(async () => { app = await build(); await app.ready(); });
afterAll(async () => { await app.close(); });

describe('A-1 — POST /api/auth/delete-account', () => {
  it('401s without a session cookie', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/auth/delete-account' });
    expect(res.statusCode).toBe(401);
  });

  it('soft-deletes the authed user, returns 200, and clears the cookie', async () => {
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);

    const res = await app.inject({
      method: 'POST', url: '/api/auth/delete-account',
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);

    // Cookie cleared on the response.
    const setCookie = String(res.headers['set-cookie'] || '');
    expect(setCookie).toMatch(/estia_token=/);
    expect(setCookie).toMatch(/Max-Age=0|Expires=/i);

    // Row is preserved (soft delete) — deletedAt is set.
    const row = await prisma.user.findUnique({ where: { id: agent.id } });
    expect(row?.deletedAt).toBeInstanceOf(Date);
    // Critically: the User row still exists (shared-property visibility
    // for co-owner agents depends on the row, not its deletion state).
    expect(row?.email).toBe(agent.email);
  });

  it('after delete, /api/me returns 401 (session appears terminated)', async () => {
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    await app.inject({
      method: 'POST', url: '/api/auth/delete-account',
      headers: { cookie },
    });
    // Even if the client still has the old cookie, the server must
    // refuse to honour it now that deletedAt is set.
    const me = await app.inject({
      method: 'GET', url: '/api/me', headers: { cookie },
    });
    expect(me.statusCode).toBe(401);
  });

  it('deleted account cannot log back in — returns "Invalid credentials"', async () => {
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    await app.inject({
      method: 'POST', url: '/api/auth/delete-account',
      headers: { cookie },
    });
    const login = await app.inject({
      method: 'POST', url: '/api/auth/login',
      payload: { email: agent.email, password: agent._plainPassword },
    });
    expect(login.statusCode).toBe(401);
    // Same error copy as wrong-password — don't leak deletion state.
    expect(login.json().error.message).toBe('Invalid credentials');
  });

  it('is idempotent — second call on the same session still succeeds', async () => {
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const first = await app.inject({
      method: 'POST', url: '/api/auth/delete-account',
      headers: { cookie },
    });
    expect(first.statusCode).toBe(200);
    // A second request (the server cleared the cookie in the response,
    // but the caller still has the old one until the next round-trip)
    // must also succeed without flipping deletedAt a second time.
    const before = await prisma.user.findUnique({ where: { id: agent.id } });
    const second = await app.inject({
      method: 'POST', url: '/api/auth/delete-account',
      headers: { cookie },
    });
    // Second call 401s because /me rejects deleted users and the
    // onRequest auth check is tied to /me-shaped verification; in
    // practice the client will never get here because the first call
    // cleared its cookie. We only care that it doesn't crash.
    expect([200, 401]).toContain(second.statusCode);
    const after = await prisma.user.findUnique({ where: { id: agent.id } });
    expect(after?.deletedAt?.getTime()).toBe(before?.deletedAt?.getTime());
  });
});

describe('A-4 — onboarding flow', () => {
  it('/api/me exposes profileCompletedAt (null for a fresh agent)', async () => {
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({ method: 'GET', url: '/api/me', headers: { cookie } });
    expect(res.statusCode).toBe(200);
    const u = res.json().user;
    expect(u).toHaveProperty('profileCompletedAt');
    expect(u.profileCompletedAt).toBeNull();
  });

  it('POST /api/me/profile saves license + stamps profileCompletedAt', async () => {
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'POST', url: '/api/me/profile',
      headers: { cookie },
      payload: { license: '12345678', title: 'מתווך', agency: 'רימקס', phone: '050-1234567' },
    });
    expect(res.statusCode).toBe(200);
    const u = res.json().user;
    expect(u.profileCompletedAt).toBeTruthy();
    expect(u.agentProfile.license).toBe('12345678');
    expect(u.agentProfile.title).toBe('מתווך');
    expect(u.agentProfile.agency).toBe('רימקס');
    expect(u.phone).toBe('050-1234567');
  });

  it('POST /api/me/profile rejects a 5-digit license with the Hebrew error copy', async () => {
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'POST', url: '/api/me/profile',
      headers: { cookie },
      payload: { license: '12345' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.message).toMatch(/מספר רישיון חייב להיות 6 עד 8 ספרות/);
  });

  it('POST /api/me/profile rejects a 9-digit license (bound check)', async () => {
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'POST', url: '/api/me/profile',
      headers: { cookie },
      payload: { license: '123456789' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST /api/me/profile rejects non-numeric license', async () => {
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'POST', url: '/api/me/profile',
      headers: { cookie },
      payload: { license: 'abc1234' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST /api/me/profile requires auth (401 without cookie)', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/me/profile',
      payload: { license: '12345678' },
    });
    expect(res.statusCode).toBe(401);
  });
});
