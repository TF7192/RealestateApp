import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { build } from '../../../backend/src/server.js';
import { prisma } from '../../setup/integration.setup.js';
import { createAgent, createCustomer } from '../../factories/user.factory.js';
import { createProperty } from '../../factories/property.factory.js';
import { loginAs } from '../../helpers/auth.js';

let app: FastifyInstance;
beforeAll(async () => { app = await build(); await app.ready(); });
afterAll(async () => { await app.close(); });

// ─────────────────────────────────────────────────────────────────
// Helper — insert PropertyView rows. Each insertView call should use
// a unique visitorHash so the (propertyId, visitorHash, viewedAt)
// unique constraint doesn't dedup same-day test inserts into one row.
// ─────────────────────────────────────────────────────────────────
async function insertView(
  propertyId: string,
  viewedAt: Date,
  visitorHash = `visitor-${Math.random().toString(36).slice(2)}`,
) {
  await prisma.propertyView.create({
    data: { propertyId, visitorHash, viewedAt },
  });
}

// Sprint 9 / marketing — lane B. Agent-scoped marketing aggregation.
describe('GET /api/marketing/overview', () => {
  it('A — auth required (401 anon, 4xx for non-agent role)', async () => {
    // No cookie → 401
    const anonRes = await app.inject({ method: 'GET', url: '/api/marketing/overview' });
    expect(anonRes.statusCode).toBe(401);
    // CUSTOMER role → 401/403 (requireAgent rejects non-agents)
    const customer = await createCustomer(prisma);
    const cookie = await loginAs(app, customer.email, customer._plainPassword);
    const customerRes = await app.inject({
      method: 'GET', url: '/api/marketing/overview', headers: { cookie },
    });
    expect([401, 403]).toContain(customerRes.statusCode);
  });

  it('H — counts views + inquiries + agreements scoped to the caller', async () => {
    const agent = await createAgent(prisma);
    const prop = await createProperty(prisma, { agentId: agent.id, street: 'דיזנגוף 1', city: 'תל אביב' });

    // 3 views today, 1 view 5 days ago → viewsLast30d = 4
    const now = new Date();
    const fiveDaysAgo = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);
    await insertView(prop.id, now, 'v1');
    await insertView(prop.id, now, 'v2');
    await insertView(prop.id, now, 'v3');
    await insertView(prop.id, fiveDaysAgo, 'v4');
    // One view > 30 days ago → should NOT count in last30d
    const fortyDaysAgo = new Date(now.getTime() - 40 * 24 * 60 * 60 * 1000);
    await insertView(prop.id, fortyDaysAgo, 'v5');

    // 2 inquiries in last 30d (inquiries30d), total inquiries = 2
    await prisma.propertyInquiry.create({
      data: { propertyId: prop.id, contactName: 'פניה 1', contactPhone: '0501111111' },
    });
    await prisma.propertyInquiry.create({
      data: { propertyId: prop.id, contactName: 'פניה 2', contactPhone: '0502222222' },
    });

    // 1 SIGNED agreement + 1 SENT — count should be 1
    await prisma.agreement.create({
      data: { propertyId: prop.id, signerName: 'בעלים', status: 'SIGNED' },
    });
    await prisma.agreement.create({
      data: { propertyId: prop.id, signerName: 'אחר', status: 'SENT' },
    });

    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'GET', url: '/api/marketing/overview', headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();

    expect(body.funnel.viewsLast30d).toBe(4);
    expect(body.funnel.inquiriesLast30d).toBe(2);
    expect(body.funnel.agreementsSigned).toBe(1);

    expect(Array.isArray(body.byProperty)).toBe(true);
    expect(body.byProperty).toHaveLength(1);
    const row = body.byProperty[0];
    expect(row.propertyId).toBe(prop.id);
    expect(row.street).toBe('דיזנגוף 1');
    expect(row.city).toBe('תל אביב');
    expect(row.views30d).toBe(4);
    expect(row.inquiries30d).toBe(2);
    expect(row.inquiriesTotal).toBe(2);
    expect(row.agreementsSigned).toBe(1);
    // conversionPct = round(2 / max(1, 4) * 100, 1) = 50.0
    expect(row.conversionPct).toBe(50);
    expect(Array.isArray(row.viewsTrend)).toBe(true);
    expect(row.viewsTrend).toHaveLength(14);
    // Most-recent-first, daily — today (index 0) should have 3 views.
    expect(row.viewsTrend[0]).toBe(3);
    // Index 5 = 5 days ago = 1 view
    expect(row.viewsTrend[5]).toBe(1);

    expect(Array.isArray(body.topPerformers)).toBe(true);
  });

  it('Az — cross-agent isolation: A never sees B\'s views/inquiries/agreements', async () => {
    const [agentA, agentB] = await Promise.all([createAgent(prisma), createAgent(prisma)]);
    const propA = await createProperty(prisma, { agentId: agentA.id, street: 'A-street' });
    const propB = await createProperty(prisma, { agentId: agentB.id, street: 'B-street' });

    const now = new Date();
    await insertView(propA.id, now, 'a-visitor');
    await insertView(propB.id, now, 'b-visitor');
    await insertView(propB.id, now, 'b-visitor-2');

    await prisma.propertyInquiry.create({
      data: { propertyId: propA.id, contactName: 'A-inq', contactPhone: '0501111111' },
    });
    await prisma.propertyInquiry.create({
      data: { propertyId: propB.id, contactName: 'B-inq1', contactPhone: '0502222222' },
    });
    await prisma.propertyInquiry.create({
      data: { propertyId: propB.id, contactName: 'B-inq2', contactPhone: '0503333333' },
    });

    await prisma.agreement.create({
      data: { propertyId: propA.id, signerName: 'A-signer', status: 'SIGNED' },
    });
    await prisma.agreement.create({
      data: { propertyId: propB.id, signerName: 'B-signer', status: 'SIGNED' },
    });

    const cookieA = await loginAs(app, agentA.email, agentA._plainPassword);
    const resA = await app.inject({
      method: 'GET', url: '/api/marketing/overview', headers: { cookie: cookieA },
    });
    expect(resA.statusCode).toBe(200);
    const bodyA = resA.json();
    // A sees only 1 view, 1 inquiry, 1 signed agreement
    expect(bodyA.funnel.viewsLast30d).toBe(1);
    expect(bodyA.funnel.inquiriesLast30d).toBe(1);
    expect(bodyA.funnel.agreementsSigned).toBe(1);
    expect(bodyA.byProperty).toHaveLength(1);
    expect(bodyA.byProperty[0].street).toBe('A-street');
    const streetsA = bodyA.byProperty.map((p: any) => p.street);
    expect(streetsA).not.toContain('B-street');
  });

  it('Edge — empty-state shape: agent with no properties returns 200 + zeroed funnel + []', async () => {
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'GET', url: '/api/marketing/overview', headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.funnel).toEqual({
      viewsLast30d: 0,
      inquiriesLast30d: 0,
      agreementsSigned: 0,
    });
    expect(body.topPerformers).toEqual([]);
    expect(body.byProperty).toEqual([]);
  });
});
