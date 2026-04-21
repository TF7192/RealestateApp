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

// Sprint 1 / MLS parity — Task K2. Customer admin block on Lead.
describe('Lead customer admin block (K2)', () => {
  it('H — PATCH round-trips customerStatus / commissionPct / isPrivate / purposes / seriousness', async () => {
    const agent = await createAgent(prisma);
    const lead = await createLead(prisma, { agentId: agent.id });
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'PATCH', url: `/api/leads/${lead.id}`, headers: { cookie },
      payload: {
        customerStatus: 'IN_DEAL',
        commissionPct: 1.5,
        isPrivate: true,
        purposes: ['INVESTMENT', 'RESIDENCE'],
        seriousnessOverride: 'VERY',
      },
    });
    expect(res.statusCode).toBe(200);
    const after = await prisma.lead.findUnique({ where: { id: lead.id } });
    expect(after?.customerStatus).toBe('IN_DEAL');
    expect(after?.commissionPct).toBe(1.5);
    expect(after?.isPrivate).toBe(true);
    expect(after?.purposes).toEqual(['INVESTMENT', 'RESIDENCE']);
    expect(after?.seriousnessOverride).toBe('VERY');
  });

  it('H — `status` (thermal) and `customerStatus` (life-cycle) are orthogonal', async () => {
    const agent = await createAgent(prisma);
    const lead = await createLead(prisma, { agentId: agent.id, status: 'HOT' });
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'PATCH', url: `/api/leads/${lead.id}`, headers: { cookie },
      payload: { customerStatus: 'ACTIVE' },
    });
    expect(res.statusCode).toBe(200);
    const after = await prisma.lead.findUnique({ where: { id: lead.id } });
    expect(after?.status).toBe('HOT');
    expect(after?.customerStatus).toBe('ACTIVE');
  });

  it('V — 400 on invalid customerStatus enum', async () => {
    const agent = await createAgent(prisma);
    const lead = await createLead(prisma, { agentId: agent.id });
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'PATCH', url: `/api/leads/${lead.id}`, headers: { cookie },
      payload: { customerStatus: 'NOT_A_STATUS' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('V — 400 on commission over 100', async () => {
    const agent = await createAgent(prisma);
    const lead = await createLead(prisma, { agentId: agent.id });
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'PATCH', url: `/api/leads/${lead.id}`, headers: { cookie },
      payload: { commissionPct: 150 },
    });
    expect(res.statusCode).toBe(400);
  });

  it('V — 400 on invalid purpose enum entry', async () => {
    const agent = await createAgent(prisma);
    const lead = await createLead(prisma, { agentId: agent.id });
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'PATCH', url: `/api/leads/${lead.id}`, headers: { cookie },
      payload: { purposes: ['RESIDENCE', 'BOGUS'] },
    });
    expect(res.statusCode).toBe(400);
  });

  it('H — empty purposes array is allowed (clears the list)', async () => {
    const agent = await createAgent(prisma);
    const lead = await prisma.lead.create({
      data: {
        agentId: agent.id, name: 'x', phone: '0501234567',
        purposes: ['INVESTMENT'],
      },
    });
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'PATCH', url: `/api/leads/${lead.id}`, headers: { cookie },
      payload: { purposes: [] },
    });
    expect(res.statusCode).toBe(200);
    const after = await prisma.lead.findUnique({ where: { id: lead.id } });
    expect(after?.purposes).toEqual([]);
  });
});

// LeadAgent join table — multi-agent assignment.
describe('LeadAgent join table', () => {
  it('H — inserting a row adds an extra assignee', async () => {
    const [a, b] = await Promise.all([createAgent(prisma), createAgent(prisma)]);
    const lead = await createLead(prisma, { agentId: a.id });
    await prisma.leadAgent.create({
      data: { leadId: lead.id, agentId: b.id },
    });
    const withExtra = await prisma.lead.findUnique({
      where: { id: lead.id }, include: { extraAgents: true },
    });
    expect(withExtra?.extraAgents).toHaveLength(1);
    expect(withExtra?.extraAgents[0].agentId).toBe(b.id);
  });

  it('Edge — composite PK blocks duplicate assignment for the same pair', async () => {
    const [a, b] = await Promise.all([createAgent(prisma), createAgent(prisma)]);
    const lead = await createLead(prisma, { agentId: a.id });
    await prisma.leadAgent.create({ data: { leadId: lead.id, agentId: b.id } });
    await expect(
      prisma.leadAgent.create({ data: { leadId: lead.id, agentId: b.id } })
    ).rejects.toThrow();
  });
});
