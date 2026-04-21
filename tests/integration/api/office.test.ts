import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { build } from '../../../backend/src/server.js';
import { prisma } from '../../setup/integration.setup.js';
import { createAgent, createCustomer } from '../../factories/user.factory.js';
import { loginAs } from '../../helpers/auth.js';

let app: FastifyInstance;
beforeAll(async () => { app = await build(); await app.ready(); });
afterAll(async () => { await app.close(); });

async function createOwner(email?: string) {
  const agent = await createAgent(prisma, { email });
  await prisma.user.update({ where: { id: agent.id }, data: { role: 'OWNER' } });
  return agent;
}

describe('GET /api/office', () => {
  it('H — returns {office: null} for a user with no office', async () => {
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({ method: 'GET', url: '/api/office', headers: { cookie } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ office: null });
  });

  it('H — returns the office + members for an attached user', async () => {
    const owner = await createOwner();
    const office = await prisma.office.create({
      data: { name: 'Acme Realty', members: { connect: { id: owner.id } } },
    });
    const cookie = await loginAs(app, owner.email, owner._plainPassword);
    const res = await app.inject({ method: 'GET', url: '/api/office', headers: { cookie } });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.office.id).toBe(office.id);
    expect(body.office.members).toHaveLength(1);
    expect(body.office.members[0].id).toBe(owner.id);
  });

  it('A — 401 without a cookie', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/office' });
    expect(res.statusCode).toBe(401);
  });
});

describe('POST /api/office', () => {
  it('Az — 403 when the caller is not OWNER', async () => {
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'POST', url: '/api/office', headers: { cookie },
      payload: { name: 'Acme' },
    });
    expect([401, 403]).toContain(res.statusCode);
  });

  it('H — OWNER can create their office and is auto-attached', async () => {
    const owner = await createOwner();
    const cookie = await loginAs(app, owner.email, owner._plainPassword);
    const res = await app.inject({
      method: 'POST', url: '/api/office', headers: { cookie },
      payload: { name: 'Acme', phone: '03-1111111' },
    });
    expect(res.statusCode).toBe(200);
    const after = await prisma.user.findUnique({ where: { id: owner.id } });
    expect(after?.officeId).toBe(res.json().office.id);
  });

  it('Idem — 409 on a second create for the same owner', async () => {
    const owner = await createOwner();
    const office = await prisma.office.create({
      data: { name: 'Existing', members: { connect: { id: owner.id } } },
    });
    const cookie = await loginAs(app, owner.email, owner._plainPassword);
    const res = await app.inject({
      method: 'POST', url: '/api/office', headers: { cookie },
      payload: { name: 'Another' },
    });
    expect(res.statusCode).toBe(409);
    // Existing office untouched.
    const again = await prisma.office.findUnique({ where: { id: office.id } });
    expect(again?.name).toBe('Existing');
  });

  it('V — 400 on missing name', async () => {
    const owner = await createOwner();
    const cookie = await loginAs(app, owner.email, owner._plainPassword);
    const res = await app.inject({
      method: 'POST', url: '/api/office', headers: { cookie },
      payload: { phone: '' },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('PATCH /api/office', () => {
  it('H — OWNER updates name/phone/address', async () => {
    const owner = await createOwner();
    await prisma.office.create({
      data: { name: 'Old', members: { connect: { id: owner.id } } },
    });
    const cookie = await loginAs(app, owner.email, owner._plainPassword);
    const res = await app.inject({
      method: 'PATCH', url: '/api/office', headers: { cookie },
      payload: { name: 'New', phone: '050-1234567', address: 'Tel Aviv' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().office.name).toBe('New');
    expect(res.json().office.address).toBe('Tel Aviv');
  });

  it('Az — 403 for a non-OWNER', async () => {
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'PATCH', url: '/api/office', headers: { cookie },
      payload: { name: 'Hijack' },
    });
    expect([401, 403]).toContain(res.statusCode);
  });

  it('404 — OWNER without an office yet', async () => {
    const owner = await createOwner();
    const cookie = await loginAs(app, owner.email, owner._plainPassword);
    const res = await app.inject({
      method: 'PATCH', url: '/api/office', headers: { cookie },
      payload: { name: 'x' },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('POST /api/office/members', () => {
  it('H — OWNER adds an existing agent to their office', async () => {
    const owner = await createOwner();
    await prisma.office.create({
      data: { name: 'Acme', members: { connect: { id: owner.id } } },
    });
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, owner.email, owner._plainPassword);
    const res = await app.inject({
      method: 'POST', url: '/api/office/members', headers: { cookie },
      payload: { email: agent.email },
    });
    expect(res.statusCode).toBe(200);
    const after = await prisma.user.findUnique({ where: { id: agent.id } });
    expect(after?.officeId).toBeTruthy();
  });

  it('V — 400 when the target user is a CUSTOMER role', async () => {
    const owner = await createOwner();
    await prisma.office.create({
      data: { name: 'Acme', members: { connect: { id: owner.id } } },
    });
    const customer = await createCustomer(prisma);
    const cookie = await loginAs(app, owner.email, owner._plainPassword);
    const res = await app.inject({
      method: 'POST', url: '/api/office/members', headers: { cookie },
      payload: { email: customer.email },
    });
    expect(res.statusCode).toBe(400);
  });

  it('404 — unknown email', async () => {
    const owner = await createOwner();
    await prisma.office.create({
      data: { name: 'Acme', members: { connect: { id: owner.id } } },
    });
    const cookie = await loginAs(app, owner.email, owner._plainPassword);
    const res = await app.inject({
      method: 'POST', url: '/api/office/members', headers: { cookie },
      payload: { email: 'nobody@example.com' },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('DELETE /api/office/members/:id', () => {
  it('H — OWNER removes an agent from the office', async () => {
    const owner = await createOwner();
    const office = await prisma.office.create({
      data: { name: 'Acme', members: { connect: { id: owner.id } } },
    });
    const agent = await createAgent(prisma);
    await prisma.user.update({ where: { id: agent.id }, data: { officeId: office.id } });
    const cookie = await loginAs(app, owner.email, owner._plainPassword);
    const res = await app.inject({
      method: 'DELETE', url: `/api/office/members/${agent.id}`, headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const after = await prisma.user.findUnique({ where: { id: agent.id } });
    expect(after?.officeId).toBeNull();
  });

  it('Edge — 400 if OWNER tries to remove themselves', async () => {
    const owner = await createOwner();
    await prisma.office.create({
      data: { name: 'Acme', members: { connect: { id: owner.id } } },
    });
    const cookie = await loginAs(app, owner.email, owner._plainPassword);
    const res = await app.inject({
      method: 'DELETE', url: `/api/office/members/${owner.id}`, headers: { cookie },
    });
    expect(res.statusCode).toBe(400);
  });

  it('Az — 404 when removing a user who isn\'t in this office', async () => {
    const [ownerA, ownerB] = await Promise.all([createOwner(), createOwner()]);
    const officeA = await prisma.office.create({
      data: { name: 'A', members: { connect: { id: ownerA.id } } },
    });
    await prisma.office.create({
      data: { name: 'B', members: { connect: { id: ownerB.id } } },
    });
    const cookie = await loginAs(app, ownerA.email, ownerA._plainPassword);
    const res = await app.inject({
      method: 'DELETE', url: `/api/office/members/${ownerB.id}`, headers: { cookie },
    });
    expect(res.statusCode).toBe(404);
  });
});
