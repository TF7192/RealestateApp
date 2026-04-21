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

describe('GET /api/properties', () => {
  it('H — PUBLIC list returns all active properties (no auth required)', async () => {
    // Properties list is deliberately public — the customer-facing agent
    // portal uses the same endpoint.
    const agent = await createAgent(prisma);
    await createProperty(prisma, { agentId: agent.id, city: 'תל אביב' });
    const res = await app.inject({ method: 'GET', url: '/api/properties' });
    expect(res.statusCode).toBe(200);
    const items = res.json().items;
    expect(Array.isArray(items)).toBe(true);
    expect(items.length).toBeGreaterThan(0);
  });

  it('H — `mine=1` scopes to the authed agent', async () => {
    const [a, b] = await Promise.all([createAgent(prisma), createAgent(prisma)]);
    await createProperty(prisma, { agentId: a.id, city: 'A-city' });
    await createProperty(prisma, { agentId: b.id, city: 'B-city' });
    const cookie = await loginAs(app, a.email, a._plainPassword);
    const res = await app.inject({
      method: 'GET', url: '/api/properties?mine=1', headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const cities = res.json().items.map((p: any) => p.city);
    expect(cities).toContain('A-city');
    expect(cities).not.toContain('B-city');
  });
});

describe('GET /api/properties/:id', () => {
  it('H — returns the property publicly', async () => {
    const agent = await createAgent(prisma);
    const prop = await createProperty(prisma, { agentId: agent.id });
    const res = await app.inject({ method: 'GET', url: `/api/properties/${prop.id}` });
    expect(res.statusCode).toBe(200);
  });

  it('404 — returns 404 for unknown id', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/properties/never-existed' });
    expect(res.statusCode).toBe(404);
  });
});

describe('POST /api/properties', () => {
  const valid = {
    assetClass: 'RESIDENTIAL',
    category: 'SALE',
    type: 'דירה',
    street: 'רוטשילד 45',
    city: 'תל אביב',
    owner: 'דן כהן',
    ownerPhone: '0501234567',
    marketingPrice: 2_500_000,
    sqm: 95,
    rooms: 4,
  };

  it('A — 401 without cookie', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/properties', payload: valid });
    expect(res.statusCode).toBe(401);
  });

  it('H — creates, scopes to authed agent, persists owner', async () => {
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'POST', url: '/api/properties', headers: { cookie }, payload: valid,
    });
    expect(res.statusCode).toBe(200);
    const created = res.json().property;
    expect(created.agentId).toBe(agent.id);
    expect(created.city).toBe('תל אביב');
    // Owner should have been auto-created or linked
    const props = await prisma.property.findMany({ where: { agentId: agent.id } });
    expect(props).toHaveLength(1);
  });

  it('V — 400 on missing required field', async () => {
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'POST', url: '/api/properties', headers: { cookie },
      payload: { ...valid, street: '' }, // empty required
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('PATCH /api/properties/:id', () => {
  it('H — owner can patch their own property', async () => {
    const agent = await createAgent(prisma);
    const prop = await createProperty(prisma, { agentId: agent.id, marketingPrice: 1_000_000 });
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'PATCH', url: `/api/properties/${prop.id}`, headers: { cookie },
      payload: { marketingPrice: 1_250_000 },
    });
    expect(res.statusCode).toBe(200);
    const after = await prisma.property.findUnique({ where: { id: prop.id } });
    expect(after?.marketingPrice).toBe(1_250_000);
  });

  it('A — 401 without cookie', async () => {
    const agent = await createAgent(prisma);
    const prop = await createProperty(prisma, { agentId: agent.id });
    const res = await app.inject({
      method: 'PATCH', url: `/api/properties/${prop.id}`,
      payload: { marketingPrice: 1 },
    });
    expect(res.statusCode).toBe(401);
  });

  it('404 — unknown id returns 404 (not 500)', async () => {
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'PATCH', url: '/api/properties/does-not-exist',
      headers: { cookie },
      payload: { marketingPrice: 1 },
    });
    expect(res.statusCode).toBe(404);
  });

  it('Az — 404 (not 403) when patching another agent\'s property', async () => {
    const [a, b] = await Promise.all([createAgent(prisma), createAgent(prisma)]);
    const bProp = await createProperty(prisma, { agentId: b.id, marketingPrice: 1_000_000 });
    const cookie = await loginAs(app, a.email, a._plainPassword);
    const res = await app.inject({
      method: 'PATCH', url: `/api/properties/${bProp.id}`, headers: { cookie },
      payload: { marketingPrice: 999 },
    });
    expect(res.statusCode).toBe(404);
    const after = await prisma.property.findUnique({ where: { id: bProp.id } });
    expect(after?.marketingPrice).toBe(1_000_000);
  });
});

describe('DELETE /api/properties/:id', () => {
  it('A — 401 without cookie', async () => {
    const agent = await createAgent(prisma);
    const prop = await createProperty(prisma, { agentId: agent.id });
    const res = await app.inject({
      method: 'DELETE', url: `/api/properties/${prop.id}`,
    });
    expect(res.statusCode).toBe(401);
    expect(await prisma.property.findUnique({ where: { id: prop.id } })).not.toBeNull();
  });

  it('404 — unknown id is 404, not 500', async () => {
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'DELETE', url: '/api/properties/does-not-exist',
      headers: { cookie },
    });
    expect(res.statusCode).toBe(404);
  });

  it('H — owner can delete own property', async () => {
    const agent = await createAgent(prisma);
    const prop = await createProperty(prisma, { agentId: agent.id });
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'DELETE', url: `/api/properties/${prop.id}`, headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const after = await prisma.property.findUnique({ where: { id: prop.id } });
    expect(after).toBeNull();
  });

  it('Az — 404 on another agent\'s property; it survives', async () => {
    const [a, b] = await Promise.all([createAgent(prisma), createAgent(prisma)]);
    const bProp = await createProperty(prisma, { agentId: b.id });
    const cookie = await loginAs(app, a.email, a._plainPassword);
    const res = await app.inject({
      method: 'DELETE', url: `/api/properties/${bProp.id}`, headers: { cookie },
    });
    expect(res.statusCode).toBe(404);
    expect(await prisma.property.findUnique({ where: { id: bProp.id } })).not.toBeNull();
  });
});
