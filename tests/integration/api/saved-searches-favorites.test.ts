import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { build } from '../../../backend/src/server.js';
import { prisma } from '../../setup/integration.setup.js';
import { createAgent } from '../../factories/user.factory.js';
import { loginAs } from '../../helpers/auth.js';

let app: FastifyInstance;
beforeAll(async () => { app = await build(); await app.ready(); });
afterAll(async () => { await app.close(); });

// Sprint 7 / MLS parity — Tasks B3, B4, G1.
describe('SavedSearch + Favorite + Neighborhood', () => {
  it('H — SavedSearch create + list filtered by entityType', async () => {
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const create = await app.inject({
      method: 'POST', url: '/api/saved-searches', headers: { cookie },
      payload: {
        entityType: 'PROPERTY', name: 'תל אביב 4 חד׳',
        filters: { city: 'תל אביב', rooms: 4 },
      },
    });
    expect(create.statusCode).toBe(200);
    const list = await app.inject({
      method: 'GET', url: '/api/saved-searches?entityType=PROPERTY', headers: { cookie },
    });
    expect(list.statusCode).toBe(200);
    expect(list.json().items.length).toBe(1);
    expect(list.json().items[0].filters.city).toBe('תל אביב');
  });

  it('Az — SavedSearch never returns another agent\'s rows', async () => {
    const [a, b] = await Promise.all([createAgent(prisma), createAgent(prisma)]);
    await prisma.savedSearch.create({
      data: { agentId: b.id, entityType: 'PROPERTY', name: 'B only', filters: {} },
    });
    const cookie = await loginAs(app, a.email, a._plainPassword);
    const res = await app.inject({
      method: 'GET', url: '/api/saved-searches', headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().items).toEqual([]);
  });

  it('H — Favorite upsert is idempotent (same pin twice = one row)', async () => {
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    for (let i = 0; i < 2; i += 1) {
      const res = await app.inject({
        method: 'POST', url: '/api/favorites', headers: { cookie },
        payload: { entityType: 'PROPERTY', entityId: 'p_xyz' },
      });
      expect(res.statusCode).toBe(200);
    }
    const count = await prisma.favorite.count({
      where: { agentId: agent.id, entityType: 'PROPERTY', entityId: 'p_xyz' },
    });
    expect(count).toBe(1);
  });

  it('H — Favorite delete by entity pair', async () => {
    const agent = await createAgent(prisma);
    await prisma.favorite.create({
      data: { agentId: agent.id, entityType: 'LEAD', entityId: 'lead_1' },
    });
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'DELETE', url: '/api/favorites/LEAD/lead_1', headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const left = await prisma.favorite.count({ where: { agentId: agent.id } });
    expect(left).toBe(0);
  });

  it('H — Neighborhood search is public + matches aliases', async () => {
    await prisma.neighborhood.create({
      data: { city: 'תל אביב', name: 'רמת אביב', aliases: ['רמת-אביב', 'R. Aviv'] },
    });
    const res = await app.inject({
      method: 'GET',
      url: `/api/neighborhoods?search=${encodeURIComponent('רמת-אביב')}`,
    });
    expect(res.statusCode).toBe(200);
    const items = res.json().items;
    expect(items.length).toBeGreaterThanOrEqual(1);
    expect(items.some((n: any) => n.name === 'רמת אביב')).toBe(true);
  });
});
