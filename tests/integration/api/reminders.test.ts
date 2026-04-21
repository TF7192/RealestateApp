import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { build } from '../../../backend/src/server.js';
import { prisma } from '../../setup/integration.setup.js';
import { createAgent } from '../../factories/user.factory.js';
import { createLead } from '../../factories/lead.factory.js';
import { createProperty } from '../../factories/property.factory.js';
import { loginAs } from '../../helpers/auth.js';

let app: FastifyInstance;
beforeAll(async () => { app = await build(); await app.ready(); });
afterAll(async () => { await app.close(); });

describe('POST /api/reminders', () => {
  it('H — creates a floating reminder (no anchors)', async () => {
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'POST', url: '/api/reminders', headers: { cookie },
      payload: { title: 'להתקשר לאמנון', dueAt: '2026-05-01T09:00:00Z' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().reminder.title).toBe('להתקשר לאמנון');
    expect(res.json().reminder.status).toBe('PENDING');
  });

  it('H — anchors to a lead / property when both IDs belong to the agent', async () => {
    const agent = await createAgent(prisma);
    const lead = await createLead(prisma, { agentId: agent.id });
    const prop = await createProperty(prisma, { agentId: agent.id });
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'POST', url: '/api/reminders', headers: { cookie },
      payload: {
        title: 'חזרה', dueAt: '2026-05-01T09:00:00Z',
        leadId: lead.id, propertyId: prop.id,
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().reminder.leadId).toBe(lead.id);
    expect(res.json().reminder.propertyId).toBe(prop.id);
  });

  it('Az — 404 when anchoring to another agent\'s lead', async () => {
    const [a, b] = await Promise.all([createAgent(prisma), createAgent(prisma)]);
    const bLead = await createLead(prisma, { agentId: b.id });
    const cookie = await loginAs(app, a.email, a._plainPassword);
    const res = await app.inject({
      method: 'POST', url: '/api/reminders', headers: { cookie },
      payload: { title: 'x', dueAt: '2026-05-01T09:00:00Z', leadId: bLead.id },
    });
    expect(res.statusCode).toBe(404);
  });

  it('V — 400 on invalid dueAt', async () => {
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'POST', url: '/api/reminders', headers: { cookie },
      payload: { title: 'x', dueAt: 'not-a-date' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('A — 401 without cookie', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/reminders',
      payload: { title: 'x', dueAt: '2026-05-01T09:00:00Z' },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('GET /api/reminders', () => {
  it('H — scopes to the authed agent; status filter works', async () => {
    const [a, b] = await Promise.all([createAgent(prisma), createAgent(prisma)]);
    await prisma.reminder.create({
      data: { agentId: a.id, title: 'A-pending', dueAt: new Date('2026-05-01Z') },
    });
    await prisma.reminder.create({
      data: {
        agentId: a.id, title: 'A-done', dueAt: new Date('2026-05-01Z'),
        status: 'COMPLETED', completedAt: new Date(),
      },
    });
    await prisma.reminder.create({
      data: { agentId: b.id, title: 'B-only', dueAt: new Date('2026-05-01Z') },
    });
    const cookie = await loginAs(app, a.email, a._plainPassword);
    const res = await app.inject({
      method: 'GET', url: '/api/reminders?status=PENDING', headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const titles = res.json().items.map((i: any) => i.title);
    expect(titles).toEqual(['A-pending']);
  });
});

describe('POST /api/reminders/:id/complete + /cancel', () => {
  it('H — complete sets status + completedAt', async () => {
    const agent = await createAgent(prisma);
    const r = await prisma.reminder.create({
      data: { agentId: agent.id, title: 't', dueAt: new Date('2026-05-01Z') },
    });
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'POST', url: `/api/reminders/${r.id}/complete`, headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const after = await prisma.reminder.findUnique({ where: { id: r.id } });
    expect(after?.status).toBe('COMPLETED');
    expect(after?.completedAt).not.toBeNull();
  });

  it('H — cancel sets status + cancelledAt', async () => {
    const agent = await createAgent(prisma);
    const r = await prisma.reminder.create({
      data: { agentId: agent.id, title: 't', dueAt: new Date('2026-05-01Z') },
    });
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'POST', url: `/api/reminders/${r.id}/cancel`, headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const after = await prisma.reminder.findUnique({ where: { id: r.id } });
    expect(after?.status).toBe('CANCELLED');
    expect(after?.cancelledAt).not.toBeNull();
  });

  it('Az — 404 on another agent\'s reminder', async () => {
    const [a, b] = await Promise.all([createAgent(prisma), createAgent(prisma)]);
    const r = await prisma.reminder.create({
      data: { agentId: b.id, title: 't', dueAt: new Date('2026-05-01Z') },
    });
    const cookie = await loginAs(app, a.email, a._plainPassword);
    const res = await app.inject({
      method: 'POST', url: `/api/reminders/${r.id}/complete`, headers: { cookie },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('PATCH + DELETE /api/reminders/:id', () => {
  it('H — PATCH updates title + notes + dueAt', async () => {
    const agent = await createAgent(prisma);
    const r = await prisma.reminder.create({
      data: { agentId: agent.id, title: 'old', dueAt: new Date('2026-05-01Z') },
    });
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'PATCH', url: `/api/reminders/${r.id}`, headers: { cookie },
      payload: { title: 'new', notes: 'gimel', dueAt: '2026-06-01T09:00:00Z' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().reminder.title).toBe('new');
  });

  it('H — DELETE removes the row', async () => {
    const agent = await createAgent(prisma);
    const r = await prisma.reminder.create({
      data: { agentId: agent.id, title: 't', dueAt: new Date('2026-05-01Z') },
    });
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'DELETE', url: `/api/reminders/${r.id}`, headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(await prisma.reminder.findUnique({ where: { id: r.id } })).toBeNull();
  });
});
