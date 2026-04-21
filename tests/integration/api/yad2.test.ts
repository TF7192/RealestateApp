import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { build } from '../../../backend/src/server.js';
import { prisma } from '../../setup/integration.setup.js';
import { createAgent } from '../../factories/user.factory.js';
import { loginAs } from '../../helpers/auth.js';

let app: FastifyInstance;
beforeAll(async () => {
  // Yad2 routes are gated by FEATURE_YAD2_IMPORT; enable for tests.
  process.env.FEATURE_YAD2_IMPORT = 'true';
  app = await build();
  await app.ready();
});
afterAll(async () => { await app.close(); });

describe('GET /api/integrations/yad2/quota', () => {
  it('A — 401 without a cookie', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/integrations/yad2/quota' });
    expect(res.statusCode).toBe(401);
  });

  it('H — returns the initial {limit: 3, remaining: 3, used: 0} quota for a fresh agent', async () => {
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'GET', url: '/api/integrations/yad2/quota', headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.limit).toBe(3);
    expect(body.remaining).toBe(3);
    expect(body.used).toBe(0);
    expect(body.resetAt).toBeNull();
  });

  it('H — quota decrements after a recorded attempt', async () => {
    const agent = await createAgent(prisma);
    // Directly create an attempt row — cheaper than invoking the real
    // crawl, and exactly what the quota logic queries.
    await prisma.yad2ImportAttempt.create({ data: { agentId: agent.id } });
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'GET', url: '/api/integrations/yad2/quota', headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ limit: 3, used: 1, remaining: 2 });
  });

  it('Edge — returns a resetAt ISO timestamp once the agent has used all 3 slots', async () => {
    const agent = await createAgent(prisma);
    // Seed 3 attempts within the rolling window
    for (let i = 0; i < 3; i++) {
      await prisma.yad2ImportAttempt.create({ data: { agentId: agent.id } });
    }
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'GET', url: '/api/integrations/yad2/quota', headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.remaining).toBe(0);
    expect(body.used).toBe(3);
    expect(typeof body.resetAt).toBe('string');
    expect(body.msUntilReset).toBeGreaterThan(0);
  });
});

describe('POST /api/integrations/yad2/agency/preview', () => {
  it('V — 400 on non-yad2.co.il URL', async () => {
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'POST',
      url: '/api/integrations/yad2/agency/preview',
      headers: { cookie },
      payload: { url: 'https://example.com/foo' },
    });
    // Zod will 400 on the URL refine, or the handler 400s on "not an
    // agency URL". Either way, not a 2xx, not a 5xx.
    expect(res.statusCode).toBe(400);
  });

  it('A — 401 without cookie', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/integrations/yad2/agency/preview',
      payload: { url: 'https://www.yad2.co.il/realestate/agency/7098700' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('Quota — returns 429 when the agent has hit the 3/hour limit', async () => {
    const agent = await createAgent(prisma);
    for (let i = 0; i < 3; i++) {
      await prisma.yad2ImportAttempt.create({ data: { agentId: agent.id } });
    }
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'POST',
      url: '/api/integrations/yad2/agency/preview',
      headers: { cookie },
      payload: { url: 'https://www.yad2.co.il/realestate/agency/7098700' },
    });
    expect(res.statusCode).toBe(429);
    const body = res.json();
    expect(body.error.code).toBe('quota_exceeded');
    expect(body.error.quota.remaining).toBe(0);
  });
});

describe('POST /api/integrations/yad2/agency/import', () => {
  it('A — 401 without cookie', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/integrations/yad2/agency/import',
      payload: { listings: [] },
    });
    expect(res.statusCode).toBe(401);
  });

  it('V — 400 on invalid body shape', async () => {
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'POST', url: '/api/integrations/yad2/agency/import',
      headers: { cookie },
      payload: { listings: 'not-an-array' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('V — 400 on empty listings array (schema enforces min 1)', async () => {
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'POST', url: '/api/integrations/yad2/agency/import',
      headers: { cookie },
      payload: { listings: [] },
    });
    expect(res.statusCode).toBe(400);
  });
});
