import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { build } from '../../../backend/src/server.js';
import { prisma } from '../../setup/integration.setup.js';
import { createAgent, createCustomer } from '../../factories/user.factory.js';
import { createLead } from '../../factories/lead.factory.js';
import { loginAs } from '../../helpers/auth.js';

let app: FastifyInstance;
beforeAll(async () => { app = await build(); await app.ready(); });
afterAll(async () => { await app.close(); });

/**
 * /api/leads — 7-point matrix (Happy / Auth / Validation / Authz /
 * 404 / Idem / Edge). Every endpoint gets at least one test per column
 * that applies to it.
 */
describe('GET /api/leads', () => {
  it('H — returns the authed agent\'s leads only', async () => {
    const [agentA, agentB] = await Promise.all([createAgent(prisma), createAgent(prisma)]);
    await createLead(prisma, { agentId: agentA.id, name: 'A-1' });
    await createLead(prisma, { agentId: agentA.id, name: 'A-2' });
    await createLead(prisma, { agentId: agentB.id, name: 'B-only' });

    const cookie = await loginAs(app, agentA.email, agentA._plainPassword);
    const res = await app.inject({ method: 'GET', url: '/api/leads', headers: { cookie } });

    expect(res.statusCode).toBe(200);
    const names = res.json().items.map((l: any) => l.name).sort();
    expect(names).toEqual(['A-1', 'A-2']);
  });

  it('A — 401 without a cookie', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/leads' });
    expect(res.statusCode).toBe(401);
  });

  it('A — 401/403 when a CUSTOMER role tries to list leads', async () => {
    const customer = await createCustomer(prisma);
    const cookie = await loginAs(app, customer.email, customer._plainPassword);
    const res = await app.inject({ method: 'GET', url: '/api/leads', headers: { cookie } });
    // requireAgent → expect a 4xx deny, not a 2xx
    expect([401, 403]).toContain(res.statusCode);
  });

  it('Edge — returns [] for an agent with no leads (not 404, not 500)', async () => {
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({ method: 'GET', url: '/api/leads', headers: { cookie } });
    expect(res.statusCode).toBe(200);
    expect(res.json().items).toEqual([]);
  });

  it('H — filters by status=HOT', async () => {
    const agent = await createAgent(prisma);
    await createLead(prisma, { agentId: agent.id, status: 'HOT', name: 'hot1' });
    await createLead(prisma, { agentId: agent.id, status: 'COLD', name: 'cold1' });
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'GET', url: '/api/leads?status=HOT', headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const names = res.json().items.map((l: any) => l.name);
    expect(names).toEqual(['hot1']);
  });

  it('H — search by phone is substring-matched', async () => {
    const agent = await createAgent(prisma);
    await createLead(prisma, { agentId: agent.id, phone: '0501234567', name: 'hit' });
    await createLead(prisma, { agentId: agent.id, phone: '0529999999', name: 'miss' });
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'GET', url: '/api/leads?search=0501234', headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const names = res.json().items.map((l: any) => l.name);
    expect(names).toEqual(['hit']);
  });
});

describe('GET /api/leads/:id', () => {
  it('H — returns the lead when owned by the agent', async () => {
    const agent = await createAgent(prisma);
    const lead = await createLead(prisma, { agentId: agent.id, name: 'owned' });
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({ method: 'GET', url: `/api/leads/${lead.id}`, headers: { cookie } });
    expect(res.statusCode).toBe(200);
    expect(res.json().lead.name).toBe('owned');
  });

  it('Az — 404 when the lead belongs to another agent (IDOR)', async () => {
    const [a, b] = await Promise.all([createAgent(prisma), createAgent(prisma)]);
    const bLead = await createLead(prisma, { agentId: b.id, name: 'b-only' });
    const cookie = await loginAs(app, a.email, a._plainPassword);
    const res = await app.inject({
      method: 'GET', url: `/api/leads/${bLead.id}`, headers: { cookie },
    });
    // 404 (not 403) is the correct behavior — don't leak existence
    expect(res.statusCode).toBe(404);
  });

  it('404 — unknown id returns 404, not 500', async () => {
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'GET', url: '/api/leads/nonexistent-cuid', headers: { cookie },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('POST /api/leads', () => {
  const validBody = {
    name: 'John Buyer',
    phone: '0501234567',
    interestType: 'PRIVATE' as const,
    lookingFor: 'BUY' as const,
  };

  it('H — creates the lead and scopes it to the authed agent', async () => {
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'POST', url: '/api/leads', headers: { cookie }, payload: validBody,
    });
    expect(res.statusCode).toBe(200);
    const created = res.json().lead;
    expect(created.name).toBe('John Buyer');
    expect(created.agentId).toBe(agent.id);
  });

  it('V — 400 on missing `name`', async () => {
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'POST', url: '/api/leads', headers: { cookie },
      payload: { ...validBody, name: '' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('V — 400 on invalid enum for interestType', async () => {
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'POST', url: '/api/leads', headers: { cookie },
      payload: { ...validBody, interestType: 'NOT_A_THING' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('A — 401 without cookie', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/leads', payload: validBody,
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('PATCH /api/leads/:id', () => {
  it('A — 401 without cookie', async () => {
    const agent = await createAgent(prisma);
    const lead = await createLead(prisma, { agentId: agent.id });
    const res = await app.inject({
      method: 'PATCH', url: `/api/leads/${lead.id}`,
      payload: { status: 'HOT' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('V — 400 on invalid status enum', async () => {
    const agent = await createAgent(prisma);
    const lead = await createLead(prisma, { agentId: agent.id });
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'PATCH', url: `/api/leads/${lead.id}`, headers: { cookie },
      payload: { status: 'NOT_A_STATUS' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('404 — unknown id is 404', async () => {
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'PATCH', url: '/api/leads/does-not-exist', headers: { cookie },
      payload: { status: 'HOT' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('H — updates fields on an owned lead', async () => {
    const agent = await createAgent(prisma);
    const lead = await createLead(prisma, { agentId: agent.id, status: 'WARM' });
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'PATCH', url: `/api/leads/${lead.id}`, headers: { cookie },
      payload: { status: 'HOT' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().lead.status).toBe('HOT');
  });

  it('Az — 404 when patching another agent\'s lead', async () => {
    const [a, b] = await Promise.all([createAgent(prisma), createAgent(prisma)]);
    const bLead = await createLead(prisma, { agentId: b.id });
    const cookie = await loginAs(app, a.email, a._plainPassword);
    const res = await app.inject({
      method: 'PATCH', url: `/api/leads/${bLead.id}`, headers: { cookie },
      payload: { status: 'HOT' },
    });
    expect(res.statusCode).toBe(404);
    // Verify no write happened
    const after = await prisma.lead.findUnique({ where: { id: bLead.id } });
    expect(after?.status).toBe(bLead.status);
  });
});

describe('DELETE /api/leads/:id', () => {
  it('A — 401 without cookie', async () => {
    const agent = await createAgent(prisma);
    const lead = await createLead(prisma, { agentId: agent.id });
    const res = await app.inject({
      method: 'DELETE', url: `/api/leads/${lead.id}`,
    });
    expect(res.statusCode).toBe(401);
    expect(await prisma.lead.findUnique({ where: { id: lead.id } })).not.toBeNull();
  });

  it('404 — unknown id is 404', async () => {
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'DELETE', url: '/api/leads/does-not-exist', headers: { cookie },
    });
    expect(res.statusCode).toBe(404);
  });

  it('H — deletes an owned lead', async () => {
    const agent = await createAgent(prisma);
    const lead = await createLead(prisma, { agentId: agent.id });
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'DELETE', url: `/api/leads/${lead.id}`, headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const after = await prisma.lead.findUnique({ where: { id: lead.id } });
    expect(after).toBeNull();
  });

  it('Az — 404 when deleting another agent\'s lead (and the lead survives)', async () => {
    const [a, b] = await Promise.all([createAgent(prisma), createAgent(prisma)]);
    const bLead = await createLead(prisma, { agentId: b.id });
    const cookie = await loginAs(app, a.email, a._plainPassword);
    const res = await app.inject({
      method: 'DELETE', url: `/api/leads/${bLead.id}`, headers: { cookie },
    });
    expect(res.statusCode).toBe(404);
    const after = await prisma.lead.findUnique({ where: { id: bLead.id } });
    expect(after).not.toBeNull();
  });
});
