import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { build } from '../../../backend/src/server.js';
import { prisma } from '../../setup/integration.setup.js';
import { createAgent } from '../../factories/user.factory.js';
import { loginAs } from '../../helpers/auth.js';

let app: FastifyInstance;
beforeAll(async () => { app = await build(); await app.ready(); });
afterAll(async () => { await app.close(); });

// Sprint 5 / MLS parity — Task H3. Activity log — writes happen as
// a side-effect of entity mutations, reads through /api/activity.
describe('ActivityLog', () => {
  it('H — creating a lead records an activity row', async () => {
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'POST', url: '/api/leads', headers: { cookie },
      payload: {
        name: 'מתן כהן', phone: '0501234567',
        interestType: 'PRIVATE', lookingFor: 'BUY',
      },
    });
    expect(res.statusCode).toBe(200);

    const list = await app.inject({
      method: 'GET', url: '/api/activity?entityType=Lead', headers: { cookie },
    });
    expect(list.statusCode).toBe(200);
    const items = list.json().items;
    expect(items.length).toBe(1);
    expect(items[0].verb).toBe('created');
    expect(items[0].summary).toContain('מתן כהן');
  });

  it('Az — an agent never sees another agent\'s activity', async () => {
    const [a, b] = await Promise.all([createAgent(prisma), createAgent(prisma)]);
    await prisma.activityLog.create({
      data: { agentId: a.id, verb: 'created', entityType: 'Property', entityId: 'x', summary: 'A-owned' },
    });
    await prisma.activityLog.create({
      data: { agentId: b.id, verb: 'created', entityType: 'Property', entityId: 'y', summary: 'B-owned' },
    });
    const cookie = await loginAs(app, a.email, a._plainPassword);
    const list = await app.inject({
      method: 'GET', url: '/api/activity', headers: { cookie },
    });
    expect(list.statusCode).toBe(200);
    const summaries = list.json().items.map((i: any) => i.summary);
    expect(summaries).toContain('A-owned');
    expect(summaries).not.toContain('B-owned');
  });

  it('H — limit param caps the result set', async () => {
    const agent = await createAgent(prisma);
    for (let i = 0; i < 5; i += 1) {
      await prisma.activityLog.create({
        data: { agentId: agent.id, verb: 'created', entityType: 'Lead', summary: `row-${i}` },
      });
    }
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const list = await app.inject({
      method: 'GET', url: '/api/activity?limit=2', headers: { cookie },
    });
    expect(list.statusCode).toBe(200);
    expect(list.json().items.length).toBe(2);
  });
});
