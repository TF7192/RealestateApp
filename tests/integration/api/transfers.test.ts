import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { build } from '../../../backend/src/server.js';
import { prisma } from '../../setup/integration.setup.js';
import { createAgent } from '../../factories/user.factory.js';
import { createProperty } from '../../factories/property.factory.js';
import { loginAs } from '../../helpers/auth.js';

let app: FastifyInstance;
beforeAll(async () => { app = await build(); await app.ready(); });
afterAll(async () => { await app.close(); });

describe('GET /api/transfers/agents/search', () => {
  it('H — finds another agent by email (exact match)', async () => {
    const [a, b] = await Promise.all([createAgent(prisma), createAgent(prisma)]);
    const cookie = await loginAs(app, a.email, a._plainPassword);
    const res = await app.inject({
      method: 'GET', url: `/api/transfers/agents/search?email=${encodeURIComponent(b.email)}`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().agent?.id).toBe(b.id);
  });

  it('Edge — returns {agent: null, self: true} when searching for yourself', async () => {
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'GET', url: `/api/transfers/agents/search?email=${encodeURIComponent(agent.email)}`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ agent: null, self: true });
  });

  it('Edge — returns {agent: null} for an unknown email', async () => {
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'GET', url: '/api/transfers/agents/search?email=nobody@example.com',
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ agent: null });
  });

  it('A — 401 without a cookie', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/transfers/agents/search?email=x@y.com',
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('GET /api/transfers', () => {
  it('H — lists transfers involving the agent (incoming + outgoing) with a direction flag', async () => {
    const [a, b, c] = await Promise.all([
      createAgent(prisma), createAgent(prisma), createAgent(prisma),
    ]);
    const propA = await createProperty(prisma, { agentId: a.id });
    const propB = await createProperty(prisma, { agentId: b.id });
    // a → b (outgoing for a, incoming for b)
    await prisma.propertyTransfer.create({
      data: { propertyId: propA.id, fromAgentId: a.id, toAgentId: b.id, status: 'PENDING' },
    });
    // c → a (incoming for a)
    const propC = await createProperty(prisma, { agentId: c.id });
    await prisma.propertyTransfer.create({
      data: { propertyId: propC.id, fromAgentId: c.id, toAgentId: a.id, status: 'PENDING' },
    });
    // b → c (irrelevant to a)
    await prisma.propertyTransfer.create({
      data: { propertyId: propB.id, fromAgentId: b.id, toAgentId: c.id, status: 'PENDING' },
    });
    const cookie = await loginAs(app, a.email, a._plainPassword);
    const res = await app.inject({ method: 'GET', url: '/api/transfers', headers: { cookie } });
    expect(res.statusCode).toBe(200);
    const items = res.json().items;
    expect(items).toHaveLength(2);
    const directions = items.map((i: any) => i.direction).sort();
    expect(directions).toEqual(['incoming', 'outgoing']);
  });

  it('A — 401 without cookie', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/transfers' });
    expect(res.statusCode).toBe(401);
  });
});

describe('POST /api/properties/:id/transfer', () => {
  it('H — creates a pending transfer to another agent', async () => {
    const [a, b] = await Promise.all([createAgent(prisma), createAgent(prisma)]);
    const prop = await createProperty(prisma, { agentId: a.id });
    const cookie = await loginAs(app, a.email, a._plainPassword);
    const res = await app.inject({
      method: 'POST', url: `/api/properties/${prop.id}/transfer`, headers: { cookie },
      payload: { toAgentEmail: b.email, message: 'please accept' },
    });
    expect(res.statusCode).toBe(200);
    const t = res.json().transfer;
    expect(t.status).toBe('PENDING');
    expect(t.toAgentId).toBe(b.id);
    expect(t.fromAgentId).toBe(a.id);
  });

  it('Az — 404 when initiating for a property you don\'t own', async () => {
    const [a, b] = await Promise.all([createAgent(prisma), createAgent(prisma)]);
    const bProp = await createProperty(prisma, { agentId: b.id });
    const cookie = await loginAs(app, a.email, a._plainPassword);
    const res = await app.inject({
      method: 'POST', url: `/api/properties/${bProp.id}/transfer`, headers: { cookie },
      payload: { toAgentEmail: b.email },
    });
    expect(res.statusCode).toBe(404);
  });

  it('Edge — 400 when initiating a transfer to yourself', async () => {
    const agent = await createAgent(prisma);
    const prop = await createProperty(prisma, { agentId: agent.id });
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'POST', url: `/api/properties/${prop.id}/transfer`, headers: { cookie },
      payload: { toAgentEmail: agent.email },
    });
    expect(res.statusCode).toBe(400);
  });

  it('Edge — 409 when a pending transfer already exists for the property', async () => {
    const [a, b, c] = await Promise.all([
      createAgent(prisma), createAgent(prisma), createAgent(prisma),
    ]);
    const prop = await createProperty(prisma, { agentId: a.id });
    await prisma.propertyTransfer.create({
      data: { propertyId: prop.id, fromAgentId: a.id, toAgentId: c.id, status: 'PENDING' },
    });
    const cookie = await loginAs(app, a.email, a._plainPassword);
    const res = await app.inject({
      method: 'POST', url: `/api/properties/${prop.id}/transfer`, headers: { cookie },
      payload: { toAgentEmail: b.email },
    });
    expect(res.statusCode).toBe(409);
  });

  it('V — 400 on invalid email', async () => {
    const agent = await createAgent(prisma);
    const prop = await createProperty(prisma, { agentId: agent.id });
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'POST', url: `/api/properties/${prop.id}/transfer`, headers: { cookie },
      payload: { toAgentEmail: 'not-an-email' },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('POST /api/transfers/:id/accept', () => {
  it('H — accepting reassigns the property to the target agent', async () => {
    const [a, b] = await Promise.all([createAgent(prisma), createAgent(prisma)]);
    const prop = await createProperty(prisma, { agentId: a.id });
    const t = await prisma.propertyTransfer.create({
      data: { propertyId: prop.id, fromAgentId: a.id, toAgentId: b.id, status: 'PENDING' },
    });
    const cookie = await loginAs(app, b.email, b._plainPassword);
    const res = await app.inject({
      method: 'POST', url: `/api/transfers/${t.id}/accept`, headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().transfer.status).toBe('ACCEPTED');
    const after = await prisma.property.findUnique({ where: { id: prop.id } });
    expect(after?.agentId).toBe(b.id);
  });

  it('Az — 404 when the authed agent is not the target (sender can\'t accept their own)', async () => {
    const [a, b] = await Promise.all([createAgent(prisma), createAgent(prisma)]);
    const prop = await createProperty(prisma, { agentId: a.id });
    const t = await prisma.propertyTransfer.create({
      data: { propertyId: prop.id, fromAgentId: a.id, toAgentId: b.id, status: 'PENDING' },
    });
    const cookie = await loginAs(app, a.email, a._plainPassword);
    const res = await app.inject({
      method: 'POST', url: `/api/transfers/${t.id}/accept`, headers: { cookie },
    });
    expect(res.statusCode).toBe(404);
    const after = await prisma.property.findUnique({ where: { id: prop.id } });
    expect(after?.agentId).toBe(a.id);
  });

  it('Edge — 409 when the transfer is not PENDING (idempotent under re-accept)', async () => {
    const [a, b] = await Promise.all([createAgent(prisma), createAgent(prisma)]);
    const prop = await createProperty(prisma, { agentId: a.id });
    const t = await prisma.propertyTransfer.create({
      data: {
        propertyId: prop.id, fromAgentId: a.id, toAgentId: b.id,
        status: 'ACCEPTED', respondedAt: new Date(),
      },
    });
    const cookie = await loginAs(app, b.email, b._plainPassword);
    const res = await app.inject({
      method: 'POST', url: `/api/transfers/${t.id}/accept`, headers: { cookie },
    });
    expect(res.statusCode).toBe(409);
  });
});

describe('POST /api/transfers/:id/decline', () => {
  it('H — declining marks DECLINED and leaves the property owned by the sender', async () => {
    const [a, b] = await Promise.all([createAgent(prisma), createAgent(prisma)]);
    const prop = await createProperty(prisma, { agentId: a.id });
    const t = await prisma.propertyTransfer.create({
      data: { propertyId: prop.id, fromAgentId: a.id, toAgentId: b.id, status: 'PENDING' },
    });
    const cookie = await loginAs(app, b.email, b._plainPassword);
    const res = await app.inject({
      method: 'POST', url: `/api/transfers/${t.id}/decline`, headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().transfer.status).toBe('DECLINED');
    const after = await prisma.property.findUnique({ where: { id: prop.id } });
    expect(after?.agentId).toBe(a.id);
  });
});

describe('POST /api/transfers/:id/cancel', () => {
  it('H — sender can cancel their own pending transfer', async () => {
    const [a, b] = await Promise.all([createAgent(prisma), createAgent(prisma)]);
    const prop = await createProperty(prisma, { agentId: a.id });
    const t = await prisma.propertyTransfer.create({
      data: { propertyId: prop.id, fromAgentId: a.id, toAgentId: b.id, status: 'PENDING' },
    });
    const cookie = await loginAs(app, a.email, a._plainPassword);
    const res = await app.inject({
      method: 'POST', url: `/api/transfers/${t.id}/cancel`, headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().transfer.status).toBe('CANCELLED');
  });

  it('Az — 404 when the recipient tries to cancel instead of decline', async () => {
    const [a, b] = await Promise.all([createAgent(prisma), createAgent(prisma)]);
    const prop = await createProperty(prisma, { agentId: a.id });
    const t = await prisma.propertyTransfer.create({
      data: { propertyId: prop.id, fromAgentId: a.id, toAgentId: b.id, status: 'PENDING' },
    });
    const cookie = await loginAs(app, b.email, b._plainPassword);
    const res = await app.inject({
      method: 'POST', url: `/api/transfers/${t.id}/cancel`, headers: { cookie },
    });
    expect(res.statusCode).toBe(404);
  });
});
