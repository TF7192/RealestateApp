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

// Sprint 6 / MLS parity — Task F1. Per-channel adverts on a property.
describe('Advert', () => {
  it('H — create + list scoped to the owning agent', async () => {
    const agent = await createAgent(prisma);
    const prop = await createProperty(prisma, { agentId: agent.id });
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const post = await app.inject({
      method: 'POST',
      url: `/api/properties/${prop.id}/adverts`,
      headers: { cookie },
      payload: {
        channel: 'YAD2',
        title: 'דירת 4 חד׳ משופצת',
        body: 'קומה 3, מעלית, חניה',
        publishedPrice: 2_900_000,
      },
    });
    expect(post.statusCode).toBe(200);
    expect(post.json().advert.channel).toBe('YAD2');
    expect(post.json().advert.status).toBe('DRAFT');

    const list = await app.inject({
      method: 'GET',
      url: `/api/properties/${prop.id}/adverts`,
      headers: { cookie },
    });
    expect(list.statusCode).toBe(200);
    expect(list.json().items.length).toBe(1);
  });

  it('H — patch updates selected fields', async () => {
    const agent = await createAgent(prisma);
    const prop = await createProperty(prisma, { agentId: agent.id });
    const advert = await prisma.advert.create({
      data: {
        agentId: agent.id, propertyId: prop.id,
        channel: 'FACEBOOK', title: 'old',
      },
    });
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'PATCH', url: `/api/adverts/${advert.id}`, headers: { cookie },
      payload: { status: 'PUBLISHED', title: 'new' },
    });
    expect(res.statusCode).toBe(200);
    const row = await prisma.advert.findUnique({ where: { id: advert.id } });
    expect(row?.status).toBe('PUBLISHED');
    expect(row?.title).toBe('new');
  });

  it('Az — 404 creating an advert on another agent\'s property', async () => {
    const [a, b] = await Promise.all([createAgent(prisma), createAgent(prisma)]);
    const bProp = await createProperty(prisma, { agentId: b.id });
    const cookie = await loginAs(app, a.email, a._plainPassword);
    const res = await app.inject({
      method: 'POST',
      url: `/api/properties/${bProp.id}/adverts`,
      headers: { cookie },
      payload: { channel: 'YAD2' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('V — 400 on invalid channel enum', async () => {
    const agent = await createAgent(prisma);
    const prop = await createProperty(prisma, { agentId: agent.id });
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'POST',
      url: `/api/properties/${prop.id}/adverts`,
      headers: { cookie },
      payload: { channel: 'NOT_A_CHANNEL' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('Edge — deleting the property cascades its adverts', async () => {
    const agent = await createAgent(prisma);
    const prop = await createProperty(prisma, { agentId: agent.id });
    await prisma.advert.create({
      data: { agentId: agent.id, propertyId: prop.id, channel: 'ONMAP' },
    });
    await prisma.property.delete({ where: { id: prop.id } });
    const left = await prisma.advert.count({ where: { propertyId: prop.id } });
    expect(left).toBe(0);
  });
});
