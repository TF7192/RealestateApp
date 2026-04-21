import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { build } from '../../../backend/src/server.js';
import { prisma } from '../../setup/integration.setup.js';
import { createAgent } from '../../factories/user.factory.js';
import { loginAs } from '../../helpers/auth.js';

let app: FastifyInstance;
beforeAll(async () => { app = await build(); await app.ready(); });
afterAll(async () => { await app.close(); });

describe('GET /api/me', () => {
  it('H — returns the authed user with profile fields', async () => {
    const agent = await createAgent(prisma, { displayName: 'שם מלא' });
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({ method: 'GET', url: '/api/me', headers: { cookie } });
    expect(res.statusCode).toBe(200);
    const u = res.json().user;
    expect(u.id).toBe(agent.id);
    expect(u.displayName).toBe('שם מלא');
    expect(u.agentProfile).toBeTruthy();
  });

  it('Edge — recording firstLoginPlatform from the X-Estia-Platform header is one-shot', async () => {
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    // First /me with a platform header sets it.
    await app.inject({
      method: 'GET', url: '/api/me',
      headers: { cookie, 'x-estia-platform': 'ios' },
    });
    const first = await prisma.user.findUnique({ where: { id: agent.id } });
    expect(first?.firstLoginPlatform).toBe('ios');
    // Second call with a different platform does NOT overwrite.
    await app.inject({
      method: 'GET', url: '/api/me',
      headers: { cookie, 'x-estia-platform': 'web' },
    });
    const second = await prisma.user.findUnique({ where: { id: agent.id } });
    expect(second?.firstLoginPlatform).toBe('ios');
  });

  it('Edge — rejects unknown platform header values silently', async () => {
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    await app.inject({
      method: 'GET', url: '/api/me',
      headers: { cookie, 'x-estia-platform': 'not-a-platform' },
    });
    const u = await prisma.user.findUnique({ where: { id: agent.id } });
    expect(u?.firstLoginPlatform).toBeNull();
  });

  it('A — 401 without cookie', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/me' });
    expect(res.statusCode).toBe(401);
  });
});

describe('PATCH /api/me', () => {
  it('H — updates profile fields and returns the fresh user', async () => {
    const agent = await createAgent(prisma, { displayName: 'before' });
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'PATCH', url: '/api/me', headers: { cookie },
      payload: {
        displayName: 'after',
        phone: '0501234567',
        agentProfile: { agency: 'Acme Realty', bio: 'hello' },
      },
    });
    expect(res.statusCode).toBe(200);
    const u = res.json().user;
    expect(u.displayName).toBe('after');
    expect(u.phone).toBe('0501234567');
    expect(u.agentProfile.agency).toBe('Acme Realty');
    expect(u.agentProfile.bio).toBe('hello');
  });

  it('V — 400 on too-long displayName', async () => {
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'PATCH', url: '/api/me', headers: { cookie },
      payload: { displayName: 'x'.repeat(200) },
    });
    expect(res.statusCode).toBe(400);
  });

  it('V — 400 on empty displayName', async () => {
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'PATCH', url: '/api/me', headers: { cookie },
      payload: { displayName: '' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('V — 400 on non-URL avatarUrl', async () => {
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'PATCH', url: '/api/me', headers: { cookie },
      payload: { avatarUrl: 'not-a-url' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('A — 401 without cookie', async () => {
    const res = await app.inject({
      method: 'PATCH', url: '/api/me', payload: { displayName: 'hijack' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('Edge — Az cross-account isolation: patching a value does not bleed to other agents', async () => {
    const [a, b] = await Promise.all([createAgent(prisma), createAgent(prisma)]);
    const cookieA = await loginAs(app, a.email, a._plainPassword);
    await app.inject({
      method: 'PATCH', url: '/api/me', headers: { cookie: cookieA },
      payload: { displayName: 'only-A' },
    });
    const afterA = await prisma.user.findUnique({ where: { id: a.id } });
    const afterB = await prisma.user.findUnique({ where: { id: b.id } });
    expect(afterA?.displayName).toBe('only-A');
    expect(afterB?.displayName).not.toBe('only-A');
  });
});

describe('POST /api/me/tutorial/complete', () => {
  it('H — marks the tutorial as completed and is idempotent', async () => {
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const r1 = await app.inject({
      method: 'POST', url: '/api/me/tutorial/complete', headers: { cookie },
    });
    expect(r1.statusCode).toBe(200);
    const u1 = await prisma.user.findUnique({ where: { id: agent.id } });
    expect(u1?.hasCompletedTutorial).toBe(true);
    // Second call is a no-op
    const r2 = await app.inject({
      method: 'POST', url: '/api/me/tutorial/complete', headers: { cookie },
    });
    expect(r2.statusCode).toBe(200);
  });

  it('A — 401 without cookie', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/me/tutorial/complete' });
    expect(res.statusCode).toBe(401);
  });
});
