import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { build } from '../../../backend/src/server.js';
import { prisma } from '../../setup/integration.setup.js';
import { createAgent } from '../../factories/user.factory.js';
import { createLead } from '../../factories/lead.factory.js';
import { createOwner } from '../../factories/owner.factory.js';
import { createProperty } from '../../factories/property.factory.js';
import { loginAs } from '../../helpers/auth.js';

let app: FastifyInstance;
beforeAll(async () => { app = await build(); await app.ready(); });
afterAll(async () => { await app.close(); });

// Helper — fetch activity rows written by the route mutation. Reads
// via prisma (not the /api/activity endpoint) so the assertion isn't
// coupled to the list-endpoint's filter/limit semantics.
async function activityFor(agentId: string, entityType: string, verb?: string) {
  return prisma.activityLog.findMany({
    where: { agentId, entityType, ...(verb ? { verb } : {}) },
    orderBy: { createdAt: 'asc' },
  });
}

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

// ──────────────────────────────────────────────────────────────────
// Phase-4 H3 — coverage for the 7 route files that didn't yet log.
// One test per verb per entityType, each asserting an ActivityLog
// row is persisted with the right shape.
// ──────────────────────────────────────────────────────────────────

describe('ActivityLog — Office', () => {
  async function makeOwner() {
    const agent = await createAgent(prisma);
    await prisma.user.update({ where: { id: agent.id }, data: { role: 'OWNER' } });
    return agent;
  }

  it('logs Office/created on POST /api/office', async () => {
    const owner = await makeOwner();
    const cookie = await loginAs(app, owner.email, owner._plainPassword);
    const res = await app.inject({
      method: 'POST', url: '/api/office', headers: { cookie },
      payload: { name: 'Acme' },
    });
    expect(res.statusCode).toBe(200);
    const rows = await activityFor(owner.id, 'Office', 'created');
    expect(rows).toHaveLength(1);
    expect(rows[0].summary).toContain('Acme');
  });

  it('logs Office/added_member on POST /api/office/members', async () => {
    const owner = await makeOwner();
    const office = await prisma.office.create({
      data: { name: 'Acme', members: { connect: { id: owner.id } } },
    });
    const target = await createAgent(prisma);
    const cookie = await loginAs(app, owner.email, owner._plainPassword);
    const res = await app.inject({
      method: 'POST', url: '/api/office/members', headers: { cookie },
      payload: { email: target.email },
    });
    expect(res.statusCode).toBe(200);
    const rows = await activityFor(owner.id, 'Office', 'added_member');
    expect(rows).toHaveLength(1);
    expect(rows[0].entityId).toBe(office.id);
    expect((rows[0].metadata as any).memberId).toBe(target.id);
  });

  it('logs Office/removed_member on DELETE /api/office/members/:id', async () => {
    const owner = await makeOwner();
    const target = await createAgent(prisma);
    const office = await prisma.office.create({
      data: {
        name: 'Acme',
        members: { connect: [{ id: owner.id }, { id: target.id }] },
      },
    });
    const cookie = await loginAs(app, owner.email, owner._plainPassword);
    const res = await app.inject({
      method: 'DELETE', url: `/api/office/members/${target.id}`, headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const rows = await activityFor(owner.id, 'Office', 'removed_member');
    expect(rows).toHaveLength(1);
    expect(rows[0].entityId).toBe(office.id);
    expect((rows[0].metadata as any).memberId).toBe(target.id);
  });
});

describe('ActivityLog — Tag', () => {
  it('logs Tag/created on POST /api/tags', async () => {
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'POST', url: '/api/tags', headers: { cookie },
      payload: { name: 'חם' },
    });
    expect(res.statusCode).toBe(200);
    const rows = await activityFor(agent.id, 'Tag', 'created');
    expect(rows).toHaveLength(1);
    expect(rows[0].summary).toContain('חם');
  });

  it('logs Tag/updated on PATCH /api/tags/:id', async () => {
    const agent = await createAgent(prisma);
    const tag = await prisma.tag.create({ data: { agentId: agent.id, name: 'חם' } });
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'PATCH', url: `/api/tags/${tag.id}`, headers: { cookie },
      payload: { name: 'חמים' },
    });
    expect(res.statusCode).toBe(200);
    const rows = await activityFor(agent.id, 'Tag', 'updated');
    expect(rows).toHaveLength(1);
  });

  it('logs Tag/deleted on DELETE /api/tags/:id', async () => {
    const agent = await createAgent(prisma);
    const tag = await prisma.tag.create({ data: { agentId: agent.id, name: 'חם' } });
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'DELETE', url: `/api/tags/${tag.id}`, headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const rows = await activityFor(agent.id, 'Tag', 'deleted');
    expect(rows).toHaveLength(1);
  });

  it('logs Tag/assigned + Tag/unassigned on assign/unassign', async () => {
    const agent = await createAgent(prisma);
    const tag = await prisma.tag.create({ data: { agentId: agent.id, name: 'חם' } });
    const property = await createProperty(prisma, { agentId: agent.id });
    const cookie = await loginAs(app, agent.email, agent._plainPassword);

    const assigned = await app.inject({
      method: 'POST', url: `/api/tags/${tag.id}/assign`, headers: { cookie },
      payload: { entityType: 'PROPERTY', entityId: property.id },
    });
    expect(assigned.statusCode).toBe(200);
    const assignRows = await activityFor(agent.id, 'Tag', 'assigned');
    expect(assignRows).toHaveLength(1);
    expect((assignRows[0].metadata as any).entityId).toBe(property.id);

    const unassigned = await app.inject({
      method: 'DELETE', url: `/api/tags/${tag.id}/assign`, headers: { cookie },
      payload: { entityType: 'PROPERTY', entityId: property.id },
    });
    expect(unassigned.statusCode).toBe(200);
    const unassignRows = await activityFor(agent.id, 'Tag', 'unassigned');
    expect(unassignRows).toHaveLength(1);
    expect((unassignRows[0].metadata as any).entityId).toBe(property.id);
  });
});

describe('ActivityLog — Reminder', () => {
  it('logs Reminder/created + completed + cancelled + deleted', async () => {
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);

    const created = await app.inject({
      method: 'POST', url: '/api/reminders', headers: { cookie },
      payload: { title: 'להתקשר', dueAt: '2026-05-01T09:00:00Z' },
    });
    expect(created.statusCode).toBe(200);
    const reminderId = created.json().reminder.id;
    const createRows = await activityFor(agent.id, 'Reminder', 'created');
    expect(createRows).toHaveLength(1);
    expect(createRows[0].summary).toBe('להתקשר');

    const completed = await app.inject({
      method: 'POST', url: `/api/reminders/${reminderId}/complete`, headers: { cookie },
    });
    expect(completed.statusCode).toBe(200);
    expect(await activityFor(agent.id, 'Reminder', 'completed')).toHaveLength(1);

    const cancelled = await app.inject({
      method: 'POST', url: `/api/reminders/${reminderId}/cancel`, headers: { cookie },
    });
    expect(cancelled.statusCode).toBe(200);
    expect(await activityFor(agent.id, 'Reminder', 'cancelled')).toHaveLength(1);

    const deleted = await app.inject({
      method: 'DELETE', url: `/api/reminders/${reminderId}`, headers: { cookie },
    });
    expect(deleted.statusCode).toBe(200);
    expect(await activityFor(agent.id, 'Reminder', 'deleted')).toHaveLength(1);
  });
});

describe('ActivityLog — Deal', () => {
  it('logs Deal/created on POST /api/deals', async () => {
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'POST', url: '/api/deals', headers: { cookie },
      payload: {
        propertyStreet: 'דיזנגוף 1', city: 'תל אביב',
        assetClass: 'RESIDENTIAL', category: 'SALE',
        marketingPrice: 3_000_000,
      },
    });
    expect(res.statusCode).toBe(200);
    const rows = await activityFor(agent.id, 'Deal', 'created');
    expect(rows).toHaveLength(1);
    expect((rows[0].metadata as any).status).toBe('NEGOTIATING');
  });

  it('logs Deal/updated on PATCH /api/deals/:id', async () => {
    const agent = await createAgent(prisma);
    const deal = await prisma.deal.create({
      data: {
        agentId: agent.id,
        propertyStreet: 'דיזנגוף 1', city: 'תל אביב',
        assetClass: 'RESIDENTIAL', category: 'SALE',
        marketingPrice: 3_000_000,
      },
    });
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'PATCH', url: `/api/deals/${deal.id}`, headers: { cookie },
      payload: { status: 'SIGNED' },
    });
    expect(res.statusCode).toBe(200);
    const rows = await activityFor(agent.id, 'Deal', 'updated');
    expect(rows).toHaveLength(1);
    expect((rows[0].metadata as any).status).toBe('SIGNED');
  });
});

describe('ActivityLog — Owner', () => {
  it('logs Owner/created on POST /api/owners', async () => {
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'POST', url: '/api/owners', headers: { cookie },
      payload: { name: 'דוד לוי', phone: '0501111111' },
    });
    expect(res.statusCode).toBe(200);
    const rows = await activityFor(agent.id, 'Owner', 'created');
    expect(rows).toHaveLength(1);
    expect(rows[0].summary).toBe('דוד לוי');
  });

  it('logs Owner/updated on PATCH /api/owners/:id', async () => {
    const agent = await createAgent(prisma);
    const owner = await createOwner(prisma, { agentId: agent.id });
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'PATCH', url: `/api/owners/${owner.id}`, headers: { cookie },
      payload: { name: 'שם חדש' },
    });
    expect(res.statusCode).toBe(200);
    const rows = await activityFor(agent.id, 'Owner', 'updated');
    expect(rows).toHaveLength(1);
    expect(rows[0].summary).toBe('שם חדש');
  });

  it('logs Owner/deleted on DELETE /api/owners/:id', async () => {
    const agent = await createAgent(prisma);
    const owner = await createOwner(prisma, { agentId: agent.id });
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'DELETE', url: `/api/owners/${owner.id}`, headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const rows = await activityFor(agent.id, 'Owner', 'deleted');
    expect(rows).toHaveLength(1);
    expect(rows[0].summary).toBe(owner.name);
  });
});

describe('ActivityLog — Advert', () => {
  it('logs Advert/created + updated + deleted', async () => {
    const agent = await createAgent(prisma);
    const property = await createProperty(prisma, { agentId: agent.id });
    const cookie = await loginAs(app, agent.email, agent._plainPassword);

    const created = await app.inject({
      method: 'POST', url: `/api/properties/${property.id}/adverts`, headers: { cookie },
      payload: { channel: 'YAD2' },
    });
    expect(created.statusCode).toBe(200);
    const advertId = created.json().advert.id;
    const cr = await activityFor(agent.id, 'Advert', 'created');
    expect(cr).toHaveLength(1);
    expect((cr[0].metadata as any).channel).toBe('YAD2');

    const updated = await app.inject({
      method: 'PATCH', url: `/api/adverts/${advertId}`, headers: { cookie },
      payload: { status: 'PUBLISHED' },
    });
    expect(updated.statusCode).toBe(200);
    const ur = await activityFor(agent.id, 'Advert', 'updated');
    expect(ur).toHaveLength(1);
    expect((ur[0].metadata as any).status).toBe('PUBLISHED');

    const deleted = await app.inject({
      method: 'DELETE', url: `/api/adverts/${advertId}`, headers: { cookie },
    });
    expect(deleted.statusCode).toBe(200);
    expect(await activityFor(agent.id, 'Advert', 'deleted')).toHaveLength(1);
  });
});

describe('ActivityLog — LeadSearchProfile', () => {
  it('logs LeadSearchProfile/created + updated + deleted', async () => {
    const agent = await createAgent(prisma);
    const lead = await createLead(prisma, { agentId: agent.id });
    const cookie = await loginAs(app, agent.email, agent._plainPassword);

    const created = await app.inject({
      method: 'POST', url: `/api/leads/${lead.id}/search-profiles`, headers: { cookie },
      payload: { label: 'דירה בתל אביב' },
    });
    expect(created.statusCode).toBe(200);
    const profileId = created.json().profile.id;
    const cr = await activityFor(agent.id, 'LeadSearchProfile', 'created');
    expect(cr).toHaveLength(1);
    expect((cr[0].metadata as any).leadId).toBe(lead.id);
    expect((cr[0].metadata as any).label).toBe('דירה בתל אביב');

    const updated = await app.inject({
      method: 'PATCH', url: `/api/leads/${lead.id}/search-profiles/${profileId}`, headers: { cookie },
      payload: { label: 'דירה בחיפה' },
    });
    expect(updated.statusCode).toBe(200);
    const ur = await activityFor(agent.id, 'LeadSearchProfile', 'updated');
    expect(ur).toHaveLength(1);
    expect((ur[0].metadata as any).label).toBe('דירה בחיפה');

    const deleted = await app.inject({
      method: 'DELETE', url: `/api/leads/${lead.id}/search-profiles/${profileId}`, headers: { cookie },
    });
    expect(deleted.statusCode).toBe(200);
    expect(await activityFor(agent.id, 'LeadSearchProfile', 'deleted')).toHaveLength(1);
  });
});
