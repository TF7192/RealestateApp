// Sprint 4 / Calendar — integration tests for GET /api/meetings.
//
// The existing calendar.ts route already covers POST/PATCH/DELETE for a
// LeadMeeting (nested under /api/integrations/calendar/leads/:id/meetings
// + /api/integrations/calendar/meetings/:id). The new Calendar page
// wants to render *every* meeting for the signed-in agent on a month
// grid, so we need a flat list endpoint scoped to the current agent.
//
// Covered here:
//   - H : list returns the agent's meetings ordered ascending by startsAt
//   - H : ?from=<ISO>&to=<ISO> bounds the window (inclusive start, exclusive end)
//   - Az: another agent's meetings are never returned
//   - A : 401 without a session cookie
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { build } from '../../../backend/src/server.js';
import { prisma } from '../../setup/integration.setup.js';
import { createAgent } from '../../factories/user.factory.js';
import { createLead } from '../../factories/lead.factory.js';
import { loginAs } from '../../helpers/auth.js';

let app: FastifyInstance;
beforeAll(async () => { app = await build(); await app.ready(); });
afterAll(async () => { await app.close(); });

async function seedMeeting(
  agentId: string,
  leadId: string,
  title: string,
  startsAt: string,
  endsAt: string,
) {
  return prisma.leadMeeting.create({
    data: {
      agentId,
      leadId,
      title,
      startsAt: new Date(startsAt),
      endsAt: new Date(endsAt),
    },
  });
}

describe('GET /api/meetings', () => {
  it('A — 401 without a session cookie', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/meetings' });
    expect(res.statusCode).toBe(401);
  });

  it('H — returns the current agent\'s meetings ordered by startsAt ascending', async () => {
    const agent = await createAgent(prisma);
    const lead  = await createLead(prisma, { agentId: agent.id });
    // Seed out of order — the server must sort by startsAt.
    await seedMeeting(agent.id, lead.id, 'שלישי',  '2026-05-20T10:00:00Z', '2026-05-20T11:00:00Z');
    await seedMeeting(agent.id, lead.id, 'ראשון',  '2026-05-01T09:00:00Z', '2026-05-01T10:00:00Z');
    await seedMeeting(agent.id, lead.id, 'שני',    '2026-05-10T15:00:00Z', '2026-05-10T16:00:00Z');

    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({ method: 'GET', url: '/api/meetings', headers: { cookie } });
    expect(res.statusCode).toBe(200);
    const items = res.json().items;
    expect(items).toHaveLength(3);
    expect(items.map((i: any) => i.title)).toEqual(['ראשון', 'שני', 'שלישי']);
  });

  it('H — ?from / ?to bounds the window', async () => {
    const agent = await createAgent(prisma);
    const lead  = await createLead(prisma, { agentId: agent.id });
    await seedMeeting(agent.id, lead.id, 'before', '2026-04-15T09:00:00Z', '2026-04-15T10:00:00Z');
    await seedMeeting(agent.id, lead.id, 'inside', '2026-05-10T09:00:00Z', '2026-05-10T10:00:00Z');
    await seedMeeting(agent.id, lead.id, 'after',  '2026-06-05T09:00:00Z', '2026-06-05T10:00:00Z');

    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const from = new Date('2026-05-01T00:00:00Z').toISOString();
    const to   = new Date('2026-06-01T00:00:00Z').toISOString();
    const res = await app.inject({
      method: 'GET',
      url: `/api/meetings?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const items = res.json().items;
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe('inside');
  });

  it('Az — never leaks another agent\'s meetings', async () => {
    const [a, b] = await Promise.all([createAgent(prisma), createAgent(prisma)]);
    const aLead = await createLead(prisma, { agentId: a.id });
    const bLead = await createLead(prisma, { agentId: b.id });
    await seedMeeting(a.id, aLead.id, 'mine',    '2026-05-01T09:00:00Z', '2026-05-01T10:00:00Z');
    await seedMeeting(b.id, bLead.id, 'theirs',  '2026-05-02T09:00:00Z', '2026-05-02T10:00:00Z');

    const cookie = await loginAs(app, a.email, a._plainPassword);
    const res = await app.inject({ method: 'GET', url: '/api/meetings', headers: { cookie } });
    expect(res.statusCode).toBe(200);
    const items = res.json().items;
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe('mine');
  });
});
