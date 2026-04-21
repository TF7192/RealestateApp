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

// Sprint 2 / MLS parity — Task K4. LeadSearchProfile child resource.
describe('LeadSearchProfile routes', () => {
  it('H — POST creates a profile bound to the lead', async () => {
    const agent = await createAgent(prisma);
    const lead = await createLead(prisma, { agentId: agent.id });
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'POST',
      url: `/api/leads/${lead.id}/search-profiles`,
      headers: { cookie },
      payload: {
        label: 'השקעה בתל אביב',
        domain: 'RESIDENTIAL', dealType: 'SALE',
        propertyTypes: ['דירה', 'פנטהאוז'],
        cities: ['תל אביב'],
        minRoom: 3, maxRoom: 5,
        minPrice: 1_500_000, maxPrice: 3_000_000,
        parkingReq: true, elevatorReq: true,
      },
    });
    expect(res.statusCode).toBe(200);
    const profile = res.json().profile;
    expect(profile.label).toBe('השקעה בתל אביב');
    expect(profile.domain).toBe('RESIDENTIAL');
    expect(profile.propertyTypes).toEqual(['דירה', 'פנטהאוז']);
    expect(profile.parkingReq).toBe(true);
  });

  it('H — GET lists every profile on the lead', async () => {
    const agent = await createAgent(prisma);
    const lead = await createLead(prisma, { agentId: agent.id });
    await prisma.leadSearchProfile.createMany({
      data: [
        { leadId: lead.id, label: 'A' },
        { leadId: lead.id, label: 'B' },
      ],
    });
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'GET', url: `/api/leads/${lead.id}/search-profiles`, headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().items.map((p: any) => p.label).sort()).toEqual(['A', 'B']);
  });

  it('Az — 404 when listing profiles for another agent\'s lead', async () => {
    const [a, b] = await Promise.all([createAgent(prisma), createAgent(prisma)]);
    const bLead = await createLead(prisma, { agentId: b.id });
    const cookie = await loginAs(app, a.email, a._plainPassword);
    const res = await app.inject({
      method: 'GET', url: `/api/leads/${bLead.id}/search-profiles`, headers: { cookie },
    });
    expect(res.statusCode).toBe(404);
  });

  it('H — PATCH updates selected fields only', async () => {
    const agent = await createAgent(prisma);
    const lead = await createLead(prisma, { agentId: agent.id });
    const profile = await prisma.leadSearchProfile.create({
      data: { leadId: lead.id, label: 'old', minRoom: 2 },
    });
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/leads/${lead.id}/search-profiles/${profile.id}`,
      headers: { cookie },
      payload: { label: 'new', maxRoom: 5 },
    });
    expect(res.statusCode).toBe(200);
    const after = await prisma.leadSearchProfile.findUnique({ where: { id: profile.id } });
    expect(after?.label).toBe('new');
    expect(after?.minRoom).toBe(2);
    expect(after?.maxRoom).toBe(5);
  });

  it('H — DELETE removes a profile', async () => {
    const agent = await createAgent(prisma);
    const lead = await createLead(prisma, { agentId: agent.id });
    const profile = await prisma.leadSearchProfile.create({
      data: { leadId: lead.id, label: 'drop me' },
    });
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/leads/${lead.id}/search-profiles/${profile.id}`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(await prisma.leadSearchProfile.findUnique({ where: { id: profile.id } }))
      .toBeNull();
  });

  it('Edge — deleting the lead cascades its profiles', async () => {
    const agent = await createAgent(prisma);
    const lead = await createLead(prisma, { agentId: agent.id });
    await prisma.leadSearchProfile.create({ data: { leadId: lead.id } });
    await prisma.leadSearchProfile.create({ data: { leadId: lead.id } });
    await prisma.lead.delete({ where: { id: lead.id } });
    const left = await prisma.leadSearchProfile.count({ where: { leadId: lead.id } });
    expect(left).toBe(0);
  });

  it('V — 400 on invalid domain enum', async () => {
    const agent = await createAgent(prisma);
    const lead = await createLead(prisma, { agentId: agent.id });
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'POST',
      url: `/api/leads/${lead.id}/search-profiles`,
      headers: { cookie },
      payload: { domain: 'NOT_A_DOMAIN' },
    });
    expect(res.statusCode).toBe(400);
  });
});
