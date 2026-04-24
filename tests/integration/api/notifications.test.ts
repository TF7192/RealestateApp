// Sprint 4 — Notifications API integration tests.
//
// Covers auth, ordering + scoping, single-row mark-read, and bulk
// mark-all-read. Rows are created directly via Prisma (the service
// layer seeds notifications from event handlers — out of scope for
// this suite; we only care about the read-side endpoints).

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { build } from '../../../backend/src/server.js';
import { prisma } from '../../setup/integration.setup.js';
import { createAgent } from '../../factories/user.factory.js';
import { loginAs } from '../../helpers/auth.js';

let app: FastifyInstance;
beforeAll(async () => { app = await build(); await app.ready(); });
afterAll(async () => { await app.close(); });

describe('GET /api/notifications', () => {
  it('A — 401 without cookie', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/notifications' });
    expect(res.statusCode).toBe(401);
  });

  it('H — returns this-user rows ordered by createdAt DESC; excludes other users', async () => {
    const [a, b] = await Promise.all([createAgent(prisma), createAgent(prisma)]);
    // Plant three rows for agent A with staggered timestamps, one row
    // for agent B that we expect NOT to leak.
    await prisma.notification.createMany({
      data: [
        { userId: a.id, type: 'reminder_due',     title: 'A-oldest', createdAt: new Date('2026-04-20T09:00:00Z') },
        { userId: a.id, type: 'lead_assigned',    title: 'A-middle', createdAt: new Date('2026-04-22T09:00:00Z') },
        { userId: a.id, type: 'property_transfer', title: 'A-newest', createdAt: new Date('2026-04-24T09:00:00Z') },
        { userId: b.id, type: 'reminder_due',     title: 'B-only',   createdAt: new Date('2026-04-23T09:00:00Z') },
      ],
    });
    const cookie = await loginAs(app, a.email, a._plainPassword);
    const res = await app.inject({
      method: 'GET', url: '/api/notifications', headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    const titles = body.items.map((n: any) => n.title);
    expect(titles).toEqual(['A-newest', 'A-middle', 'A-oldest']);
    // Unread count reflects the three unread A-rows.
    expect(body.unreadCount).toBe(3);
  });

  it('H — unread count drops after a row is marked read', async () => {
    const agent = await createAgent(prisma);
    await prisma.notification.createMany({
      data: [
        { userId: agent.id, type: 'x', title: 'unread-1' },
        { userId: agent.id, type: 'x', title: 'unread-2', readAt: new Date() },
      ],
    });
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'GET', url: '/api/notifications', headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().unreadCount).toBe(1);
    // Both rows surface in the list so the UI can render read history too.
    expect(res.json().items).toHaveLength(2);
  });
});

describe('POST /api/notifications/:id/read', () => {
  it('H — flips readAt on the authed user\'s row', async () => {
    const agent = await createAgent(prisma);
    const n = await prisma.notification.create({
      data: { userId: agent.id, type: 'reminder_due', title: 'תזכורת' },
    });
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'POST', url: `/api/notifications/${n.id}/read`, headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const after = await prisma.notification.findUnique({ where: { id: n.id } });
    expect(after?.readAt).not.toBeNull();
  });

  it('Az — 404 when the row belongs to another user', async () => {
    const [a, b] = await Promise.all([createAgent(prisma), createAgent(prisma)]);
    const n = await prisma.notification.create({
      data: { userId: b.id, type: 'reminder_due', title: 'b-only' },
    });
    const cookie = await loginAs(app, a.email, a._plainPassword);
    const res = await app.inject({
      method: 'POST', url: `/api/notifications/${n.id}/read`, headers: { cookie },
    });
    expect(res.statusCode).toBe(404);
    // And the row stays unread.
    const after = await prisma.notification.findUnique({ where: { id: n.id } });
    expect(after?.readAt).toBeNull();
  });
});

describe('POST /api/notifications/read-all', () => {
  it('H — flips every unread row for the authed user; leaves other users alone', async () => {
    const [a, b] = await Promise.all([createAgent(prisma), createAgent(prisma)]);
    await prisma.notification.createMany({
      data: [
        { userId: a.id, type: 'x', title: 'a-1' },
        { userId: a.id, type: 'x', title: 'a-2' },
        { userId: a.id, type: 'x', title: 'a-read', readAt: new Date('2026-04-20') },
        { userId: b.id, type: 'x', title: 'b-unread' },
      ],
    });
    const cookie = await loginAs(app, a.email, a._plainPassword);
    const res = await app.inject({
      method: 'POST', url: '/api/notifications/read-all', headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    // Every A row is now read.
    const aRows = await prisma.notification.findMany({ where: { userId: a.id } });
    expect(aRows.every((r) => r.readAt !== null)).toBe(true);
    // B's unread row is untouched.
    const bRow = await prisma.notification.findFirst({ where: { userId: b.id } });
    expect(bRow?.readAt).toBeNull();
  });

  it('A — 401 without cookie', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/notifications/read-all' });
    expect(res.statusCode).toBe(401);
  });
});
