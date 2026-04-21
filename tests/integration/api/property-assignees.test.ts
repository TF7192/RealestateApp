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

// Sprint 5 / MLS parity — Task J10. Multi-agent property assignment.
describe('PropertyAssignee', () => {
  it('H — agent can add a same-office co-agent and list them', async () => {
    const office = await prisma.office.create({ data: { name: 'Acme' } });
    const owner = await createAgent(prisma);
    const coAgent = await createAgent(prisma);
    await prisma.user.update({ where: { id: owner.id },   data: { officeId: office.id } });
    await prisma.user.update({ where: { id: coAgent.id }, data: { officeId: office.id } });
    const prop = await createProperty(prisma, { agentId: owner.id });
    const cookie = await loginAs(app, owner.email, owner._plainPassword);

    const add = await app.inject({
      method: 'POST', url: `/api/properties/${prop.id}/assignees`, headers: { cookie },
      payload: { userId: coAgent.id, role: 'CO_AGENT' },
    });
    expect(add.statusCode).toBe(200);

    const list = await app.inject({
      method: 'GET', url: `/api/properties/${prop.id}/assignees`, headers: { cookie },
    });
    expect(list.statusCode).toBe(200);
    const items = list.json().items;
    expect(items.length).toBe(1);
    expect(items[0].userId).toBe(coAgent.id);
    expect(items[0].user.id).toBe(coAgent.id);
  });

  it('Az — 403 when the target agent belongs to a different office', async () => {
    const [o1, o2] = await Promise.all([
      prisma.office.create({ data: { name: 'O1' } }),
      prisma.office.create({ data: { name: 'O2' } }),
    ]);
    const owner = await createAgent(prisma);
    const outsider = await createAgent(prisma);
    await prisma.user.update({ where: { id: owner.id },    data: { officeId: o1.id } });
    await prisma.user.update({ where: { id: outsider.id }, data: { officeId: o2.id } });
    const prop = await createProperty(prisma, { agentId: owner.id });
    const cookie = await loginAs(app, owner.email, owner._plainPassword);
    const res = await app.inject({
      method: 'POST', url: `/api/properties/${prop.id}/assignees`, headers: { cookie },
      payload: { userId: outsider.id },
    });
    expect(res.statusCode).toBe(403);
  });

  it('H — delete removes the assignment', async () => {
    const owner = await createAgent(prisma);
    const coAgent = await createAgent(prisma);
    const prop = await createProperty(prisma, { agentId: owner.id });
    await prisma.propertyAssignee.create({
      data: { propertyId: prop.id, userId: coAgent.id, role: 'CO_AGENT' },
    });
    const cookie = await loginAs(app, owner.email, owner._plainPassword);
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/properties/${prop.id}/assignees/${coAgent.id}`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const remaining = await prisma.propertyAssignee.count({
      where: { propertyId: prop.id },
    });
    expect(remaining).toBe(0);
  });

  it('Az — listing assignees for another agent\'s property returns 404', async () => {
    const [a, b] = await Promise.all([createAgent(prisma), createAgent(prisma)]);
    const bProp = await createProperty(prisma, { agentId: b.id });
    const cookie = await loginAs(app, a.email, a._plainPassword);
    const res = await app.inject({
      method: 'GET', url: `/api/properties/${bProp.id}/assignees`, headers: { cookie },
    });
    expect(res.statusCode).toBe(404);
  });
});
