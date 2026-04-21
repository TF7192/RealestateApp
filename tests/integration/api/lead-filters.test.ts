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

// Sprint 2 / MLS parity — Task C2. Nadlan-parity filter panel on
// GET /api/leads.
describe('GET /api/leads — Nadlan-parity filters', () => {
  it('H — cities[] filter returns only leads in the allowed cities', async () => {
    const agent = await createAgent(prisma);
    const tlv = await createLead(prisma, { agentId: agent.id, city: 'תל אביב' });
    const hrz = await createLead(prisma, { agentId: agent.id, city: 'הרצליה' });
    await createLead(prisma, { agentId: agent.id, city: 'ירושלים' });
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'GET',
      url: '/api/leads?cities=%D7%AA%D7%9C%20%D7%90%D7%91%D7%99%D7%91&cities=%D7%94%D7%A8%D7%A6%D7%9C%D7%99%D7%94',
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const ids = res.json().items.map((l: any) => l.id).sort();
    expect(ids).toEqual([tlv.id, hrz.id].sort());
  });

  it('H — minPrice/maxPrice narrows on budget', async () => {
    const agent = await createAgent(prisma);
    const cheap = await createLead(prisma, { agentId: agent.id });
    const mid = await createLead(prisma, { agentId: agent.id });
    const pricey = await createLead(prisma, { agentId: agent.id });
    await prisma.lead.update({ where: { id: cheap.id },  data: { budget: 1_000_000 } });
    await prisma.lead.update({ where: { id: mid.id },    data: { budget: 2_500_000 } });
    await prisma.lead.update({ where: { id: pricey.id }, data: { budget: 8_000_000 } });
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'GET',
      url: '/api/leads?minPrice=2000000&maxPrice=5000000',
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const ids = res.json().items.map((l: any) => l.id);
    expect(ids).toEqual([mid.id]);
  });

  it('H — requirement booleans filter only flagged rows', async () => {
    const agent = await createAgent(prisma);
    const needs = await createLead(prisma, { agentId: agent.id });
    await createLead(prisma, { agentId: agent.id }); // no flag
    await prisma.lead.update({
      where: { id: needs.id },
      data: { parkingRequired: true, safeRoomRequired: true },
    });
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'GET',
      url: '/api/leads?parkingRequired=1&safeRoomRequired=true',
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const ids = res.json().items.map((l: any) => l.id);
    expect(ids).toEqual([needs.id]);
  });

  it('H — keyword matches notes + name + description', async () => {
    const agent = await createAgent(prisma);
    const hit = await createLead(prisma, { agentId: agent.id, notes: 'צריך חניה ומרפסת' });
    await createLead(prisma, { agentId: agent.id, notes: 'רק דירת חדר' });
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'GET',
      url: `/api/leads?keyword=${encodeURIComponent('מרפסת')}`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const ids = res.json().items.map((l: any) => l.id);
    expect(ids).toEqual([hit.id]);
  });

  it('H — tag filter returns only leads with that tag assignment', async () => {
    const agent = await createAgent(prisma);
    const [tagged, untagged] = await Promise.all([
      createLead(prisma, { agentId: agent.id }),
      createLead(prisma, { agentId: agent.id }),
    ]);
    const tag = await prisma.tag.create({
      data: { agentId: agent.id, name: 'VIP', scope: 'ALL' },
    });
    await prisma.tagAssignment.create({
      data: { tagId: tag.id, entityType: 'LEAD', entityId: tagged.id },
    });
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'GET',
      url: `/api/leads?tags=${tag.id}`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const ids = res.json().items.map((l: any) => l.id);
    expect(ids).toEqual([tagged.id]);
    expect(ids).not.toContain(untagged.id);
  });

  it('H — customerStatus & leadStatus enum filters', async () => {
    const agent = await createAgent(prisma);
    const a = await createLead(prisma, { agentId: agent.id });
    const b = await createLead(prisma, { agentId: agent.id });
    await prisma.lead.update({
      where: { id: a.id },
      data: { customerStatus: 'IN_DEAL', leadStatus: 'IN_PROGRESS' },
    });
    await prisma.lead.update({
      where: { id: b.id },
      data: { customerStatus: 'ACTIVE', leadStatus: 'NEW' },
    });
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'GET',
      url: '/api/leads?customerStatus=IN_DEAL',
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const ids = res.json().items.map((l: any) => l.id);
    expect(ids).toEqual([a.id]);
  });

  it('H — minRoom via searchProfile overlap', async () => {
    const agent = await createAgent(prisma);
    const big = await createLead(prisma, { agentId: agent.id });
    const small = await createLead(prisma, { agentId: agent.id });
    await prisma.leadSearchProfile.create({
      data: { leadId: big.id,   minRoom: 4, maxRoom: 6 },
    });
    await prisma.leadSearchProfile.create({
      data: { leadId: small.id, minRoom: 1, maxRoom: 2 },
    });
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'GET',
      url: '/api/leads?minRoom=4',
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const ids = res.json().items.map((l: any) => l.id);
    expect(ids).toContain(big.id);
    expect(ids).not.toContain(small.id);
  });

  it('Az — filters still respect agent scope', async () => {
    const [a, b] = await Promise.all([createAgent(prisma), createAgent(prisma)]);
    await createLead(prisma, { agentId: a.id, city: 'תל אביב' });
    await createLead(prisma, { agentId: b.id, city: 'תל אביב' });
    const cookie = await loginAs(app, a.email, a._plainPassword);
    const res = await app.inject({
      method: 'GET',
      url: '/api/leads?cities=%D7%AA%D7%9C%20%D7%90%D7%91%D7%99%D7%91',
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    // Only agent a's lead — must never leak agent b's row.
    expect(res.json().items.length).toBe(1);
  });
});
