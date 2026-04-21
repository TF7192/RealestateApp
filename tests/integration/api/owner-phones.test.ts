import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { build } from '../../../backend/src/server.js';
import { prisma } from '../../setup/integration.setup.js';
import { createAgent } from '../../factories/user.factory.js';
import { createOwner } from '../../factories/owner.factory.js';
import { loginAs } from '../../helpers/auth.js';

let app: FastifyInstance;
beforeAll(async () => { app = await build(); await app.ready(); });
afterAll(async () => { await app.close(); });

describe('GET /api/owners/:id/phones', () => {
  it('H — lists the owner\'s phones ordered by sortOrder', async () => {
    const agent = await createAgent(prisma);
    const owner = await createOwner(prisma, { agentId: agent.id, phone: '0500000000' });
    // Seed two phones directly; also force a legacy primary row so the
    // lazy backfill below isn't triggered here.
    await prisma.ownerPhone.createMany({
      data: [
        { ownerId: owner.id, phone: '0501111111', kind: 'primary',   sortOrder: 0 },
        { ownerId: owner.id, phone: '0502222222', kind: 'secondary', sortOrder: 1 },
      ],
    });
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'GET', url: `/api/owners/${owner.id}/phones`, headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const phones = res.json().items.map((p: any) => p.phone);
    expect(phones).toEqual(['0501111111', '0502222222']);
  });

  it('H — lazy backfills a primary row when OwnerPhone is empty but Owner.phone is set', async () => {
    const agent = await createAgent(prisma);
    const owner = await createOwner(prisma, { agentId: agent.id, phone: '0503334444' });
    const cookie = await loginAs(app, agent.email, agent._plainPassword);

    const before = await prisma.ownerPhone.count({ where: { ownerId: owner.id } });
    expect(before).toBe(0);

    const res = await app.inject({
      method: 'GET', url: `/api/owners/${owner.id}/phones`, headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const items = res.json().items;
    expect(items).toHaveLength(1);
    expect(items[0].phone).toBe('0503334444');
    expect(items[0].kind).toBe('primary');
    // A second read should NOT create another row.
    const res2 = await app.inject({
      method: 'GET', url: `/api/owners/${owner.id}/phones`, headers: { cookie },
    });
    expect(res2.json().items).toHaveLength(1);
  });

  it('Az — 404 on another agent\'s owner', async () => {
    const [a, b] = await Promise.all([createAgent(prisma), createAgent(prisma)]);
    const bOwner = await createOwner(prisma, { agentId: b.id });
    const cookie = await loginAs(app, a.email, a._plainPassword);
    const res = await app.inject({
      method: 'GET', url: `/api/owners/${bOwner.id}/phones`, headers: { cookie },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('POST /api/owners/:id/phones', () => {
  it('H — adds a phone to an owned row', async () => {
    const agent = await createAgent(prisma);
    const owner = await createOwner(prisma, { agentId: agent.id });
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'POST', url: `/api/owners/${owner.id}/phones`, headers: { cookie },
      payload: { phone: '0509998877', kind: 'spouse', label: 'בן/בת זוג' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().phone.kind).toBe('spouse');
    const rows = await prisma.ownerPhone.findMany({ where: { ownerId: owner.id } });
    expect(rows).toHaveLength(1);
  });

  it('V — 400 on a too-short phone', async () => {
    const agent = await createAgent(prisma);
    const owner = await createOwner(prisma, { agentId: agent.id });
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'POST', url: `/api/owners/${owner.id}/phones`, headers: { cookie },
      payload: { phone: '05', kind: 'primary' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('Az — 404 on another agent\'s owner (no write)', async () => {
    const [a, b] = await Promise.all([createAgent(prisma), createAgent(prisma)]);
    const bOwner = await createOwner(prisma, { agentId: b.id });
    const cookie = await loginAs(app, a.email, a._plainPassword);
    const res = await app.inject({
      method: 'POST', url: `/api/owners/${bOwner.id}/phones`, headers: { cookie },
      payload: { phone: '0501234567', kind: 'primary' },
    });
    expect(res.statusCode).toBe(404);
    expect(await prisma.ownerPhone.count({ where: { ownerId: bOwner.id } })).toBe(0);
  });
});

describe('PATCH /api/owner-phones/:id', () => {
  it('H — patches the row in place', async () => {
    const agent = await createAgent(prisma);
    const owner = await createOwner(prisma, { agentId: agent.id });
    const phone = await prisma.ownerPhone.create({
      data: { ownerId: owner.id, phone: '0501111111', kind: 'primary' },
    });
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'PATCH', url: `/api/owner-phones/${phone.id}`, headers: { cookie },
      payload: { kind: 'work', label: 'משרד' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().phone.kind).toBe('work');
    expect(res.json().phone.label).toBe('משרד');
  });

  it('Az — 404 when the phone belongs to another agent\'s owner', async () => {
    const [a, b] = await Promise.all([createAgent(prisma), createAgent(prisma)]);
    const bOwner = await createOwner(prisma, { agentId: b.id });
    const bPhone = await prisma.ownerPhone.create({
      data: { ownerId: bOwner.id, phone: '0501111111', kind: 'primary' },
    });
    const cookie = await loginAs(app, a.email, a._plainPassword);
    const res = await app.inject({
      method: 'PATCH', url: `/api/owner-phones/${bPhone.id}`, headers: { cookie },
      payload: { kind: 'other' },
    });
    expect(res.statusCode).toBe(404);
    const after = await prisma.ownerPhone.findUnique({ where: { id: bPhone.id } });
    expect(after?.kind).toBe('primary');
  });
});

describe('DELETE /api/owner-phones/:id', () => {
  it('H — deletes an owned phone row', async () => {
    const agent = await createAgent(prisma);
    const owner = await createOwner(prisma, { agentId: agent.id });
    const phone = await prisma.ownerPhone.create({
      data: { ownerId: owner.id, phone: '0501111111', kind: 'primary' },
    });
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'DELETE', url: `/api/owner-phones/${phone.id}`, headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(await prisma.ownerPhone.findUnique({ where: { id: phone.id } })).toBeNull();
  });

  it('Az — 404 on another agent\'s phone; it survives', async () => {
    const [a, b] = await Promise.all([createAgent(prisma), createAgent(prisma)]);
    const bOwner = await createOwner(prisma, { agentId: b.id });
    const bPhone = await prisma.ownerPhone.create({
      data: { ownerId: bOwner.id, phone: '0501111111', kind: 'primary' },
    });
    const cookie = await loginAs(app, a.email, a._plainPassword);
    const res = await app.inject({
      method: 'DELETE', url: `/api/owner-phones/${bPhone.id}`, headers: { cookie },
    });
    expect(res.statusCode).toBe(404);
    expect(await prisma.ownerPhone.findUnique({ where: { id: bPhone.id } })).not.toBeNull();
  });
});
