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

// Tiny valid 1×1 PNG encoded as a data-URL. Enough to exercise the
// signature-image branch of the PDF renderer without shipping a
// binary fixture.
const PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

async function createSignedProspect(agentId: string, overrides: Partial<{
  name: string;
  phone: string;
  email: string;
  leadId: string | null;
}> = {}) {
  const property = await createProperty(prisma, { agentId });
  const prospect = await prisma.prospect.create({
    data: {
      propertyId: property.id,
      agentId,
      name: overrides.name ?? 'ישראל ישראלי',
      phone: overrides.phone ?? '0501112233',
      email: overrides.email ?? null,
      idType: 'ID',
      idNumber: '123456789',
      address: 'תל אביב',
      signatureDataUrl: PNG_DATA_URL,
      signedAt: new Date(),
      orderNumber: 1,
      leadId: overrides.leadId ?? null,
    },
  });
  return { property, prospect };
}

describe('GET /api/prospects/:id/agreement.pdf', () => {
  it('H — owning agent gets a PDF with correct content-type', async () => {
    const agent = await createAgent(prisma);
    const { prospect } = await createSignedProspect(agent.id);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);

    const res = await app.inject({
      method: 'GET',
      url: `/api/prospects/${prospect.id}/agreement.pdf`,
      headers: { cookie },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/pdf/);
    expect(res.headers['content-disposition']).toMatch(/agreement-/);
    // PDF magic header: %PDF-
    expect(res.rawPayload.slice(0, 5).toString()).toBe('%PDF-');
  });

  it('Az — cross-agent gets a 404', async () => {
    const [agentA, agentB] = await Promise.all([createAgent(prisma), createAgent(prisma)]);
    const { prospect } = await createSignedProspect(agentA.id);
    const cookie = await loginAs(app, agentB.email, agentB._plainPassword);

    const res = await app.inject({
      method: 'GET',
      url: `/api/prospects/${prospect.id}/agreement.pdf`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(404);
  });

  it('V — unsigned prospect gets a 404', async () => {
    const agent = await createAgent(prisma);
    const property = await createProperty(prisma, { agentId: agent.id });
    const prospect = await prisma.prospect.create({
      data: {
        propertyId: property.id,
        agentId: agent.id,
        name: 'לא חתום',
        orderNumber: 2,
      },
    });
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'GET',
      url: `/api/prospects/${prospect.id}/agreement.pdf`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(404);
  });

  it('A — 401 without a cookie', async () => {
    const agent = await createAgent(prisma);
    const { prospect } = await createSignedProspect(agent.id);
    const res = await app.inject({
      method: 'GET',
      url: `/api/prospects/${prospect.id}/agreement.pdf`,
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('POST /api/prospects/:id/link-lead', () => {
  it('H — links the prospect to an owned lead', async () => {
    const agent = await createAgent(prisma);
    const lead = await createLead(prisma, { agentId: agent.id });
    const { prospect } = await createSignedProspect(agent.id);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);

    const res = await app.inject({
      method: 'POST',
      url: `/api/prospects/${prospect.id}/link-lead`,
      headers: { cookie, 'content-type': 'application/json' },
      payload: { leadId: lead.id },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().prospect.leadId).toBe(lead.id);
  });

  it('Az — 403 when linking to a lead owned by another agent', async () => {
    const [agentA, agentB] = await Promise.all([createAgent(prisma), createAgent(prisma)]);
    const foreignLead = await createLead(prisma, { agentId: agentB.id });
    const { prospect } = await createSignedProspect(agentA.id);
    const cookie = await loginAs(app, agentA.email, agentA._plainPassword);

    const res = await app.inject({
      method: 'POST',
      url: `/api/prospects/${prospect.id}/link-lead`,
      headers: { cookie, 'content-type': 'application/json' },
      payload: { leadId: foreignLead.id },
    });
    expect(res.statusCode).toBe(403);
  });

  it('Az — 404 when linking a prospect owned by another agent', async () => {
    const [agentA, agentB] = await Promise.all([createAgent(prisma), createAgent(prisma)]);
    const leadB = await createLead(prisma, { agentId: agentB.id });
    const { prospect } = await createSignedProspect(agentA.id);
    const cookie = await loginAs(app, agentB.email, agentB._plainPassword);

    const res = await app.inject({
      method: 'POST',
      url: `/api/prospects/${prospect.id}/link-lead`,
      headers: { cookie, 'content-type': 'application/json' },
      payload: { leadId: leadB.id },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('POST /api/prospects/:id/unlink-lead', () => {
  it('H — clears leadId', async () => {
    const agent = await createAgent(prisma);
    const lead = await createLead(prisma, { agentId: agent.id });
    const { prospect } = await createSignedProspect(agent.id, { leadId: lead.id });
    const cookie = await loginAs(app, agent.email, agent._plainPassword);

    const res = await app.inject({
      method: 'POST',
      url: `/api/prospects/${prospect.id}/unlink-lead`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().prospect.leadId).toBeNull();
  });
});

describe('auto-link on sign', () => {
  it('H — exactly-one phone match auto-links on public sign', async () => {
    const agent = await createAgent(prisma);
    const lead = await createLead(prisma, {
      agentId: agent.id,
      phone: '050-111-2233',
    });
    // Create a digital prospect (public token flow).
    const property = await createProperty(prisma, { agentId: agent.id });
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const init = await app.inject({
      method: 'POST',
      url: `/api/properties/${property.id}/prospects/digital`,
      headers: { cookie, 'content-type': 'application/json' },
      payload: { name: 'משה פרץ', phone: '0501112233' },
    });
    expect(init.statusCode).toBe(200);
    const publicToken = init.json().prospect.publicToken;
    // Public sign — posts directly, no auth.
    const signRes = await app.inject({
      method: 'POST',
      url: `/api/prospects/public/${publicToken}`,
      headers: { 'content-type': 'application/json' },
      payload: {
        phone: '050-1112233',
        signatureDataUrl: PNG_DATA_URL,
        idType: 'ID',
        idNumber: '987654321',
        address: 'חיפה',
      },
    });
    expect(signRes.statusCode).toBe(200);
    const prospectId = signRes.json().prospect.id;
    const fromDb = await prisma.prospect.findUnique({ where: { id: prospectId } });
    expect(fromDb?.leadId).toBe(lead.id);
  });

  it('V — no auto-link when two leads share the phone (ambiguous)', async () => {
    const agent = await createAgent(prisma);
    await createLead(prisma, { agentId: agent.id, phone: '0502223344' });
    await createLead(prisma, { agentId: agent.id, phone: '0502223344' });
    const property = await createProperty(prisma, { agentId: agent.id });
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const init = await app.inject({
      method: 'POST',
      url: `/api/properties/${property.id}/prospects/digital`,
      headers: { cookie, 'content-type': 'application/json' },
      payload: { name: 'דני לוי', phone: '0502223344' },
    });
    const publicToken = init.json().prospect.publicToken;
    const signRes = await app.inject({
      method: 'POST',
      url: `/api/prospects/public/${publicToken}`,
      headers: { 'content-type': 'application/json' },
      payload: { signatureDataUrl: PNG_DATA_URL },
    });
    expect(signRes.statusCode).toBe(200);
    const prospectId = signRes.json().prospect.id;
    const fromDb = await prisma.prospect.findUnique({ where: { id: prospectId } });
    expect(fromDb?.leadId).toBeNull();
  });
});
