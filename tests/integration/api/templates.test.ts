import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { build } from '../../../backend/src/server.js';
import { prisma } from '../../setup/integration.setup.js';
import { createAgent, createCustomer } from '../../factories/user.factory.js';
import { loginAs } from '../../helpers/auth.js';

let app: FastifyInstance;
beforeAll(async () => { app = await build(); await app.ready(); });
afterAll(async () => { await app.close(); });

const KINDS = ['BUY_PRIVATE', 'RENT_PRIVATE', 'BUY_COMMERCIAL', 'RENT_COMMERCIAL', 'TRANSFER'] as const;

describe('GET /api/templates', () => {
  it('H — returns one template per kind, falling back to defaults when none are saved', async () => {
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({ method: 'GET', url: '/api/templates', headers: { cookie } });
    expect(res.statusCode).toBe(200);
    const items = res.json().templates;
    expect(items).toHaveLength(KINDS.length);
    for (const k of KINDS) {
      const t = items.find((x: any) => x.kind === k);
      expect(t).toBeTruthy();
      expect(t.custom).toBe(false);
      expect(t.body.length).toBeGreaterThan(10);
    }
  });

  it('H — customized template appears with custom: true', async () => {
    const agent = await createAgent(prisma);
    await prisma.messageTemplate.create({
      data: { agentId: agent.id, kind: 'BUY_PRIVATE', body: 'custom body' },
    });
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({ method: 'GET', url: '/api/templates', headers: { cookie } });
    expect(res.statusCode).toBe(200);
    const t = res.json().templates.find((x: any) => x.kind === 'BUY_PRIVATE');
    expect(t.custom).toBe(true);
    expect(t.body).toBe('custom body');
  });

  it('A — 401 without cookie', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/templates' });
    expect(res.statusCode).toBe(401);
  });

  it('Az — 401/403 for a customer role', async () => {
    const customer = await createCustomer(prisma);
    const cookie = await loginAs(app, customer.email, customer._plainPassword);
    const res = await app.inject({ method: 'GET', url: '/api/templates', headers: { cookie } });
    expect([401, 403]).toContain(res.statusCode);
  });
});

describe('PUT /api/templates/:kind', () => {
  it('H — creates a template on first PUT and returns custom:true', async () => {
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'PUT', url: '/api/templates/BUY_PRIVATE', headers: { cookie },
      payload: { body: 'hello world' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().template.body).toBe('hello world');
    expect(res.json().template.custom).toBe(true);
  });

  it('Idem — second PUT updates the existing row (no duplicate)', async () => {
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    await app.inject({
      method: 'PUT', url: '/api/templates/BUY_PRIVATE', headers: { cookie },
      payload: { body: 'first' },
    });
    const res = await app.inject({
      method: 'PUT', url: '/api/templates/BUY_PRIVATE', headers: { cookie },
      payload: { body: 'second' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().template.body).toBe('second');
    const rows = await prisma.messageTemplate.findMany({
      where: { agentId: agent.id, kind: 'BUY_PRIVATE' },
    });
    expect(rows).toHaveLength(1);
  });

  it('V — 400 on empty body', async () => {
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'PUT', url: '/api/templates/BUY_PRIVATE', headers: { cookie },
      payload: { body: '' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('V — 400 on unknown :kind', async () => {
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'PUT', url: '/api/templates/NOT_A_KIND', headers: { cookie },
      payload: { body: 'x' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('Az — agent A cannot write to agent B\'s templates (each agent has their own scope)', async () => {
    const [a, b] = await Promise.all([createAgent(prisma), createAgent(prisma)]);
    const cookieA = await loginAs(app, a.email, a._plainPassword);
    const resA = await app.inject({
      method: 'PUT', url: '/api/templates/BUY_PRIVATE', headers: { cookie: cookieA },
      payload: { body: 'A body' },
    });
    expect(resA.statusCode).toBe(200);
    // B sees their own default, not A's custom copy
    const cookieB = await loginAs(app, b.email, b._plainPassword);
    const resB = await app.inject({ method: 'GET', url: '/api/templates', headers: { cookie: cookieB } });
    const bTemplate = resB.json().templates.find((x: any) => x.kind === 'BUY_PRIVATE');
    expect(bTemplate.custom).toBe(false);
    expect(bTemplate.body).not.toContain('A body');
  });
});

describe('DELETE /api/templates/:kind', () => {
  it('H — reverts to default', async () => {
    const agent = await createAgent(prisma);
    await prisma.messageTemplate.create({
      data: { agentId: agent.id, kind: 'BUY_PRIVATE', body: 'custom body' },
    });
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'DELETE', url: '/api/templates/BUY_PRIVATE', headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().custom).toBe(false);
    const rows = await prisma.messageTemplate.findMany({
      where: { agentId: agent.id, kind: 'BUY_PRIVATE' },
    });
    expect(rows).toHaveLength(0);
  });

  it('Idem — deleting a non-customized kind returns 200 (no-op)', async () => {
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'DELETE', url: '/api/templates/TRANSFER', headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
  });
});
