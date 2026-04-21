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

// Sprint 2 / MLS parity — Task K1 (contact + identity) + L1 (quick-lead status).
describe('Lead K1 (contact + identity) + L1 (quick-lead status)', () => {
  it('H — PATCH round-trips firstName/lastName/companyName/address/cityText/zip', async () => {
    const agent = await createAgent(prisma);
    const lead = await createLead(prisma, { agentId: agent.id });
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'PATCH', url: `/api/leads/${lead.id}`, headers: { cookie },
      payload: {
        firstName: 'דן', lastName: 'כהן', companyName: 'Acme בע״מ',
        address: 'רוטשילד 45', cityText: 'תל אביב', zip: '6578901',
      },
    });
    expect(res.statusCode).toBe(200);
    const after = await prisma.lead.findUnique({ where: { id: lead.id } });
    expect(after?.firstName).toBe('דן');
    expect(after?.lastName).toBe('כהן');
    expect(after?.companyName).toBe('Acme בע״מ');
    expect(after?.address).toBe('רוטשילד 45');
    expect(after?.cityText).toBe('תל אביב');
    expect(after?.zip).toBe('6578901');
  });

  it('H — PATCH round-trips primaryPhone / phone1 / phone2 / fax / personalId', async () => {
    const agent = await createAgent(prisma);
    const lead = await createLead(prisma, { agentId: agent.id });
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'PATCH', url: `/api/leads/${lead.id}`, headers: { cookie },
      payload: {
        primaryPhone: '050-1234567',
        phone1: '03-1111111', phone2: '04-2222222',
        fax: '03-3333333', personalId: '123456789',
      },
    });
    expect(res.statusCode).toBe(200);
    const after = await prisma.lead.findUnique({ where: { id: lead.id } });
    expect(after?.primaryPhone).toBe('050-1234567');
    expect(after?.phone1).toBe('03-1111111');
    expect(after?.phone2).toBe('04-2222222');
    expect(after?.fax).toBe('03-3333333');
    expect(after?.personalId).toBe('123456789');
  });

  it('H — `description` (single-line) and `notes` (multi-line) are independent', async () => {
    const agent = await createAgent(prisma);
    const lead = await createLead(prisma, { agentId: agent.id, notes: 'long body' });
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'PATCH', url: `/api/leads/${lead.id}`, headers: { cookie },
      payload: { description: 'one-liner' },
    });
    expect(res.statusCode).toBe(200);
    const after = await prisma.lead.findUnique({ where: { id: lead.id } });
    expect(after?.description).toBe('one-liner');
    expect(after?.notes).toBe('long body');
  });

  it('H — new leads default leadStatus to NEW', async () => {
    const agent = await createAgent(prisma);
    const lead = await createLead(prisma, { agentId: agent.id });
    const fresh = await prisma.lead.findUnique({ where: { id: lead.id } });
    expect(fresh?.leadStatus).toBe('NEW');
  });

  it('H — PATCH transitions leadStatus through the nine values', async () => {
    const agent = await createAgent(prisma);
    const lead = await createLead(prisma, { agentId: agent.id });
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const sequence = [
      'INTENT_TO_CALL', 'IN_PROGRESS', 'CONVERTED',
      'CONVERTED_NO_OPPORTUNITY', 'DISQUALIFIED', 'NOT_INTERESTED',
      'DELETED', 'ARCHIVED', 'NEW',
    ] as const;
    for (const leadStatus of sequence) {
      const res = await app.inject({
        method: 'PATCH', url: `/api/leads/${lead.id}`, headers: { cookie },
        payload: { leadStatus },
      });
      expect(res.statusCode).toBe(200);
      const after = await prisma.lead.findUnique({ where: { id: lead.id } });
      expect(after?.leadStatus).toBe(leadStatus);
    }
  });

  it('V — 400 on unknown leadStatus', async () => {
    const agent = await createAgent(prisma);
    const lead = await createLead(prisma, { agentId: agent.id });
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'PATCH', url: `/api/leads/${lead.id}`, headers: { cookie },
      payload: { leadStatus: 'NOT_A_STATUS' },
    });
    expect(res.statusCode).toBe(400);
  });
});
