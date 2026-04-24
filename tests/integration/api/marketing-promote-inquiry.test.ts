import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { build } from '../../../backend/src/server.js';
import { prisma } from '../../setup/integration.setup.js';
import { createAgent } from '../../factories/user.factory.js';
import { createProperty } from '../../factories/property.factory.js';
import { loginAs } from '../../helpers/auth.js';

let app: FastifyInstance;
beforeAll(async () => { app = await build(); await app.ready(); });
afterAll(async () => { await app.close(); });

// Sprint 9 / marketing — lane B. Promote an inquiry (landing-page form
// submission) into an actionable Lead row.
describe('POST /api/marketing/inquiries/:id/promote', () => {
  it('H — happy path: creates a Lead owned by the caller, linked to inquiry contact', async () => {
    const agent = await createAgent(prisma);
    const prop = await createProperty(prisma, { agentId: agent.id, city: 'תל אביב' });
    const inquiry = await prisma.propertyInquiry.create({
      data: {
        propertyId: prop.id,
        contactName: 'דנה כהן',
        contactPhone: '0501234567',
        contactEmail: 'dana@example.com',
        message: 'מעוניינת לראות את הנכס',
      },
    });

    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'POST',
      url: `/api/marketing/inquiries/${inquiry.id}/promote`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const { leadId } = res.json();
    expect(typeof leadId).toBe('string');

    const lead = await prisma.lead.findUnique({ where: { id: leadId } });
    expect(lead).not.toBeNull();
    expect(lead!.agentId).toBe(agent.id);
    expect(lead!.name).toBe('דנה כהן');
    expect(lead!.phone).toBe('0501234567');
    expect(lead!.email).toBe('dana@example.com');
    expect(lead!.city).toBe('תל אביב');
    expect(lead!.notes).toBe('מעוניינת לראות את הנכס');
    expect(lead!.source).toBe('landing-page');
    expect(lead!.status).toBe('WARM');
  });

  it('Az — 404 when another agent tries to promote this agent\'s inquiry (IDOR)', async () => {
    const [agentA, agentB] = await Promise.all([createAgent(prisma), createAgent(prisma)]);
    const propA = await createProperty(prisma, { agentId: agentA.id });
    const inquiry = await prisma.propertyInquiry.create({
      data: {
        propertyId: propA.id,
        contactName: 'Someone',
        contactPhone: '0509876543',
      },
    });

    const cookieB = await loginAs(app, agentB.email, agentB._plainPassword);
    const res = await app.inject({
      method: 'POST',
      url: `/api/marketing/inquiries/${inquiry.id}/promote`,
      headers: { cookie: cookieB },
    });
    expect(res.statusCode).toBe(404);
    // No lead should have been created under B
    const countB = await prisma.lead.count({ where: { agentId: agentB.id } });
    expect(countB).toBe(0);
  });

  it('Idem — re-promoting same-phone inquiry returns the existing leadId', async () => {
    const agent = await createAgent(prisma);
    const prop = await createProperty(prisma, { agentId: agent.id });
    const inquiry1 = await prisma.propertyInquiry.create({
      data: {
        propertyId: prop.id,
        contactName: 'שם ראשון',
        contactPhone: '0507777777',
        contactEmail: 'first@example.com',
      },
    });
    const inquiry2 = await prisma.propertyInquiry.create({
      data: {
        propertyId: prop.id,
        contactName: 'שם שני',
        contactPhone: '0507777777', // same phone
        contactEmail: 'second@example.com',
      },
    });

    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const firstRes = await app.inject({
      method: 'POST',
      url: `/api/marketing/inquiries/${inquiry1.id}/promote`,
      headers: { cookie },
    });
    expect(firstRes.statusCode).toBe(200);
    const firstLeadId = firstRes.json().leadId;

    const secondRes = await app.inject({
      method: 'POST',
      url: `/api/marketing/inquiries/${inquiry2.id}/promote`,
      headers: { cookie },
    });
    expect(secondRes.statusCode).toBe(200);
    const secondLeadId = secondRes.json().leadId;

    // Idempotent on (agentId, phone, source='landing-page')
    expect(secondLeadId).toBe(firstLeadId);
    const leads = await prisma.lead.findMany({
      where: { agentId: agent.id, phone: '0507777777', source: 'landing-page' },
    });
    expect(leads).toHaveLength(1);
  });
});
