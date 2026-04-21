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

/**
 * Calendar integration tests.
 *
 * Google APIs are NEVER hit. For status/disconnect we seed the User row
 * directly. For meetings we use `syncToCalendar: false` so the handler
 * creates a local LeadMeeting without ever touching Google.
 */

describe('GET /api/integrations/calendar/status', () => {
  it('H — disconnected for a fresh agent', async () => {
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'GET', url: '/api/integrations/calendar/status', headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.connected).toBe(false);
    expect(body.expiresAt).toBeNull();
    expect(typeof body.configured).toBe('boolean');
  });

  it('H — connected when the agent has a refresh token + enabled flag', async () => {
    const agent = await createAgent(prisma);
    const future = new Date(Date.now() + 30 * 60 * 1000);
    await prisma.user.update({
      where: { id: agent.id },
      data: {
        googleRefreshToken: 'fake-refresh-token',
        googleAccessToken: 'fake-access-token',
        googleTokenExpiresAt: future,
        googleCalendarEnabled: true,
      },
    });
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'GET', url: '/api/integrations/calendar/status', headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.connected).toBe(true);
    expect(body.expiresAt).toBe(future.toISOString());
  });

  it('A — 401 without a cookie', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/integrations/calendar/status',
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('POST /api/integrations/calendar/disconnect', () => {
  it('H — clears tokens + disables the flag (no Google call when refresh token is absent)', async () => {
    const agent = await createAgent(prisma);
    await prisma.user.update({
      where: { id: agent.id },
      data: {
        googleAccessToken: 'access',
        googleTokenExpiresAt: new Date(),
        googleCalendarEnabled: true,
      },
    });
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'POST', url: '/api/integrations/calendar/disconnect', headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const after = await prisma.user.findUnique({ where: { id: agent.id } });
    expect(after?.googleAccessToken).toBeNull();
    expect(after?.googleCalendarEnabled).toBe(false);
    expect(after?.googleTokenExpiresAt).toBeNull();
  });

  it('A — 401 without cookie', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/integrations/calendar/disconnect',
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('Lead meetings (local-only, no Google)', () => {
  it('H — list meetings for an owned lead returns [] initially', async () => {
    const agent = await createAgent(prisma);
    const lead = await createLead(prisma, { agentId: agent.id });
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'GET', url: `/api/integrations/calendar/leads/${lead.id}/meetings`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().items).toEqual([]);
  });

  it('Az — 404 when listing meetings for another agent\'s lead', async () => {
    const [a, b] = await Promise.all([createAgent(prisma), createAgent(prisma)]);
    const bLead = await createLead(prisma, { agentId: b.id });
    const cookie = await loginAs(app, a.email, a._plainPassword);
    const res = await app.inject({
      method: 'GET', url: `/api/integrations/calendar/leads/${bLead.id}/meetings`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(404);
  });

  it('H — create a local meeting (syncToCalendar:false) and read it back', async () => {
    const agent = await createAgent(prisma);
    const lead = await createLead(prisma, { agentId: agent.id });
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const startsAt = new Date('2026-05-01T09:00:00.000Z').toISOString();
    const endsAt   = new Date('2026-05-01T10:00:00.000Z').toISOString();
    const create = await app.inject({
      method: 'POST', url: `/api/integrations/calendar/leads/${lead.id}/meetings`,
      headers: { cookie },
      payload: {
        title: 'פגישה ראשונית', notes: 'הערה', location: 'רוטשילד 45',
        startsAt, endsAt, syncToCalendar: false,
      },
    });
    expect(create.statusCode).toBe(200);
    const list = await app.inject({
      method: 'GET', url: `/api/integrations/calendar/leads/${lead.id}/meetings`,
      headers: { cookie },
    });
    expect(list.statusCode).toBe(200);
    expect(list.json().items).toHaveLength(1);
    expect(list.json().items[0].title).toBe('פגישה ראשונית');
  });

  it('V — 400 on invalid datetime', async () => {
    const agent = await createAgent(prisma);
    const lead = await createLead(prisma, { agentId: agent.id });
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'POST', url: `/api/integrations/calendar/leads/${lead.id}/meetings`,
      headers: { cookie },
      payload: {
        title: 'x', startsAt: 'not-a-date', endsAt: 'also-not',
        syncToCalendar: false,
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it('Az — cannot delete another agent\'s meeting', async () => {
    const [a, b] = await Promise.all([createAgent(prisma), createAgent(prisma)]);
    const bLead = await createLead(prisma, { agentId: b.id });
    const meeting = await prisma.leadMeeting.create({
      data: {
        leadId: bLead.id, agentId: b.id,
        title: 'theirs',
        startsAt: new Date('2026-05-01T09:00:00Z'),
        endsAt: new Date('2026-05-01T10:00:00Z'),
      },
    });
    const cookie = await loginAs(app, a.email, a._plainPassword);
    const res = await app.inject({
      method: 'DELETE', url: `/api/integrations/calendar/meetings/${meeting.id}`,
      headers: { cookie },
    });
    expect([403, 404]).toContain(res.statusCode);
    expect(await prisma.leadMeeting.findUnique({ where: { id: meeting.id } })).not.toBeNull();
  });
});
