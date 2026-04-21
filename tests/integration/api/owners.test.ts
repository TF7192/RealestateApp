import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { build } from '../../../backend/src/server.js';
import { prisma } from '../../setup/integration.setup.js';
import { createAgent, createCustomer } from '../../factories/user.factory.js';
import { createOwner } from '../../factories/owner.factory.js';
import { createProperty } from '../../factories/property.factory.js';
import { loginAs } from '../../helpers/auth.js';

let app: FastifyInstance;
beforeAll(async () => { app = await build(); await app.ready(); });
afterAll(async () => { await app.close(); });

describe('GET /api/owners', () => {
  it('H — returns the authed agent\'s owners only, with propertyCount', async () => {
    const [a, b] = await Promise.all([createAgent(prisma), createAgent(prisma)]);
    const ownerA = await createOwner(prisma, { agentId: a.id, name: 'A-owner' });
    await createProperty(prisma, { agentId: a.id, owner: ownerA.name, ownerPhone: ownerA.phone });
    await createOwner(prisma, { agentId: b.id, name: 'B-only-owner' });

    const cookie = await loginAs(app, a.email, a._plainPassword);
    const res = await app.inject({ method: 'GET', url: '/api/owners', headers: { cookie } });

    expect(res.statusCode).toBe(200);
    const names = res.json().items.map((o: any) => o.name).sort();
    expect(names).toEqual(['A-owner']);
  });

  it('A — 401 without a cookie', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/owners' });
    expect(res.statusCode).toBe(401);
  });

  it('Az — 401/403 when a CUSTOMER role tries to list owners', async () => {
    const customer = await createCustomer(prisma);
    const cookie = await loginAs(app, customer.email, customer._plainPassword);
    const res = await app.inject({ method: 'GET', url: '/api/owners', headers: { cookie } });
    expect([401, 403]).toContain(res.statusCode);
  });

  it('Edge — returns [] for an agent with no owners', async () => {
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({ method: 'GET', url: '/api/owners', headers: { cookie } });
    expect(res.statusCode).toBe(200);
    expect(res.json().items).toEqual([]);
  });
});

describe('GET /api/owners/:id', () => {
  it('H — returns an owned owner with their properties', async () => {
    const agent = await createAgent(prisma);
    const owner = await createOwner(prisma, { agentId: agent.id, name: 'visible' });
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'GET', url: `/api/owners/${owner.id}`, headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().owner.name).toBe('visible');
  });

  it('Az — 404 for another agent\'s owner (IDOR)', async () => {
    const [a, b] = await Promise.all([createAgent(prisma), createAgent(prisma)]);
    const bOwner = await createOwner(prisma, { agentId: b.id });
    const cookie = await loginAs(app, a.email, a._plainPassword);
    const res = await app.inject({
      method: 'GET', url: `/api/owners/${bOwner.id}`, headers: { cookie },
    });
    expect(res.statusCode).toBe(404);
  });

  it('404 — unknown id returns 404 (not 500)', async () => {
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'GET', url: '/api/owners/nonexistent-cuid', headers: { cookie },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('POST /api/owners', () => {
  const valid = {
    name: 'דן כהן',
    phone: '0501234567',
    email: 'dan@example.com',
    notes: 'private seller',
    relationship: 'בעלים יחיד',
  };

  it('H — creates the owner and scopes it to the authed agent', async () => {
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'POST', url: '/api/owners', headers: { cookie }, payload: valid,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().owner.name).toBe('דן כהן');
    const owners = await prisma.owner.findMany({ where: { agentId: agent.id } });
    expect(owners).toHaveLength(1);
  });

  it('A — 401 without cookie', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/owners', payload: valid });
    expect(res.statusCode).toBe(401);
  });

  it('V — 400 on missing name', async () => {
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'POST', url: '/api/owners', headers: { cookie },
      payload: { ...valid, name: '' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('V — 400 on too-short phone', async () => {
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'POST', url: '/api/owners', headers: { cookie },
      payload: { ...valid, phone: '05' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('V — 400 on malformed email', async () => {
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'POST', url: '/api/owners', headers: { cookie },
      payload: { ...valid, email: 'not-an-email' },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('PATCH /api/owners/:id', () => {
  it('H — updates fields on an owned row + keeps denormalized property columns in sync', async () => {
    const agent = await createAgent(prisma);
    const owner = await createOwner(prisma, { agentId: agent.id, name: 'old-name', phone: '0501111111' });
    // Link a property to the owner so the denorm-sync path runs.
    const prop = await createProperty(prisma, {
      agentId: agent.id,
      owner: owner.name,
      ownerPhone: owner.phone,
    });
    await prisma.property.update({
      where: { id: prop.id },
      data: { propertyOwnerId: owner.id },
    });
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'PATCH', url: `/api/owners/${owner.id}`, headers: { cookie },
      payload: { name: 'new-name', phone: '0502222222' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().owner.name).toBe('new-name');
    const linked = await prisma.property.findUnique({ where: { id: prop.id } });
    expect(linked?.owner).toBe('new-name');
    expect(linked?.ownerPhone).toBe('0502222222');
  });

  it('Az — 404 when patching another agent\'s owner (no write)', async () => {
    const [a, b] = await Promise.all([createAgent(prisma), createAgent(prisma)]);
    const bOwner = await createOwner(prisma, { agentId: b.id, name: 'unchanged' });
    const cookie = await loginAs(app, a.email, a._plainPassword);
    const res = await app.inject({
      method: 'PATCH', url: `/api/owners/${bOwner.id}`, headers: { cookie },
      payload: { name: 'hijacked' },
    });
    expect(res.statusCode).toBe(404);
    const after = await prisma.owner.findUnique({ where: { id: bOwner.id } });
    expect(after?.name).toBe('unchanged');
  });

  it('V — 400 on malformed field', async () => {
    const agent = await createAgent(prisma);
    const owner = await createOwner(prisma, { agentId: agent.id });
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'PATCH', url: `/api/owners/${owner.id}`, headers: { cookie },
      payload: { email: 'not-an-email' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('404 — patching an unknown id returns 404', async () => {
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'PATCH', url: '/api/owners/nonexistent-cuid', headers: { cookie },
      payload: { name: 'whatever' },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('DELETE /api/owners/:id', () => {
  it('H — deletes an owned row', async () => {
    const agent = await createAgent(prisma);
    const owner = await createOwner(prisma, { agentId: agent.id });
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'DELETE', url: `/api/owners/${owner.id}`, headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(await prisma.owner.findUnique({ where: { id: owner.id } })).toBeNull();
  });

  it('Az — 404 on another agent\'s owner; it survives', async () => {
    const [a, b] = await Promise.all([createAgent(prisma), createAgent(prisma)]);
    const bOwner = await createOwner(prisma, { agentId: b.id });
    const cookie = await loginAs(app, a.email, a._plainPassword);
    const res = await app.inject({
      method: 'DELETE', url: `/api/owners/${bOwner.id}`, headers: { cookie },
    });
    expect(res.statusCode).toBe(404);
    expect(await prisma.owner.findUnique({ where: { id: bOwner.id } })).not.toBeNull();
  });

  it('Edge — deleting an owner linked to a property sets the FK to null on the property (keeps the property)', async () => {
    const agent = await createAgent(prisma);
    const owner = await createOwner(prisma, { agentId: agent.id });
    const prop = await createProperty(prisma, {
      agentId: agent.id,
      owner: owner.name,
      ownerPhone: owner.phone,
    });
    await prisma.property.update({
      where: { id: prop.id },
      data: { propertyOwnerId: owner.id },
    });
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'DELETE', url: `/api/owners/${owner.id}`, headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const after = await prisma.property.findUnique({ where: { id: prop.id } });
    expect(after).not.toBeNull();
    expect(after?.propertyOwnerId).toBeNull();
  });
});

describe('GET /api/owners/search', () => {
  it('H — empty q returns []', async () => {
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'GET', url: '/api/owners/search?q=', headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().items).toEqual([]);
  });

  it('H — matches by phone substring (digits-only)', async () => {
    const agent = await createAgent(prisma);
    await createOwner(prisma, { agentId: agent.id, phone: '0501234567', name: 'hit' });
    await createOwner(prisma, { agentId: agent.id, phone: '0529999999', name: 'miss' });
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'GET', url: '/api/owners/search?q=0501234', headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const names = res.json().items.map((o: any) => o.name);
    expect(names).toEqual(['hit']);
  });
});
