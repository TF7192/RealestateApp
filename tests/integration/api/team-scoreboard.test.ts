import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { build } from '../../../backend/src/server.js';
import { prisma } from '../../setup/integration.setup.js';
import { createAgent } from '../../factories/user.factory.js';
import { loginAs } from '../../helpers/auth.js';

let app: FastifyInstance;
beforeAll(async () => { app = await build(); await app.ready(); });
afterAll(async () => { await app.close(); });

// Sprint 6 — GET /api/team/scoreboard
// Covers: auth gate, cross-office isolation, aggregation math, and
// quarter-filter windowing.

describe('GET /api/team/scoreboard', () => {
  it('A/V — 401 without a cookie and 404 for an agent with no office', async () => {
    // Unauthed.
    const noCookie = await app.inject({ method: 'GET', url: '/api/team/scoreboard' });
    expect(noCookie.statusCode).toBe(401);

    // Authed but no office.
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'GET', url: '/api/team/scoreboard', headers: { cookie },
    });
    expect(res.statusCode).toBe(404);
  });

  it('Az — does not leak other offices\' agents', async () => {
    // Two offices. Agent in office A calls the endpoint and must see
    // only members of office A.
    const officeA = await prisma.office.create({ data: { name: 'A' } });
    const officeB = await prisma.office.create({ data: { name: 'B' } });
    const a1 = await createAgent(prisma);
    const a2 = await createAgent(prisma);
    const b1 = await createAgent(prisma);
    await prisma.user.update({ where: { id: a1.id }, data: { officeId: officeA.id } });
    await prisma.user.update({ where: { id: a2.id }, data: { officeId: officeA.id } });
    await prisma.user.update({ where: { id: b1.id }, data: { officeId: officeB.id } });

    const cookie = await loginAs(app, a1.email, a1._plainPassword);
    const res = await app.inject({
      method: 'GET', url: '/api/team/scoreboard', headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const { agents } = res.json();
    const ids = agents.map((r: any) => r.agentId).sort();
    expect(ids).toEqual([a1.id, a2.id].sort());
    expect(ids).not.toContain(b1.id);
  });

  it('H — aggregates closedDeals + totalVolume per agent', async () => {
    // One office, two agents, a mix of deal statuses + prices.
    const office = await prisma.office.create({ data: { name: 'Acme' } });
    const alice = await createAgent(prisma);
    const bob = await createAgent(prisma);
    await prisma.user.update({ where: { id: alice.id }, data: { officeId: office.id } });
    await prisma.user.update({ where: { id: bob.id }, data: { officeId: office.id } });

    // Alice — two counted deals (SIGNED + CLOSED) this quarter.
    const now = new Date();
    const base = {
      propertyStreet: 'Dizengoff 1', city: 'TLV',
      assetClass: 'RESIDENTIAL' as const, category: 'SALE' as const,
      marketingPrice: 2_000_000,
    };
    await prisma.deal.create({
      data: { agentId: alice.id, ...base, status: 'SIGNED',
              closedPrice: 1_800_000, signedAt: now },
    });
    await prisma.deal.create({
      data: { agentId: alice.id, ...base, status: 'CLOSED',
              closedPrice: 2_500_000, signedAt: now },
    });
    // Alice — a NEGOTIATING deal is NOT counted (not closed).
    await prisma.deal.create({
      data: { agentId: alice.id, ...base, status: 'NEGOTIATING',
              closedPrice: 9_000_000 },
    });
    // Bob — one SIGNED, no closedPrice → counted as 1 deal, 0 volume.
    await prisma.deal.create({
      data: { agentId: bob.id, ...base, status: 'SIGNED', signedAt: now },
    });

    // Open leads + active listings — verify snapshot counts too.
    await prisma.lead.create({
      data: { agentId: alice.id, name: 'Lead A1', phone: '0500000001' },
    });
    await prisma.lead.create({
      data: { agentId: alice.id, name: 'Lead A2', phone: '0500000002',
              customerStatus: 'INACTIVE' }, // excluded
    });
    await prisma.property.create({
      data: {
        agentId: alice.id, type: 'דירה', street: 'x', city: 'TLV',
        owner: 'o', ownerPhone: '0500000009',
        assetClass: 'RESIDENTIAL', category: 'SALE',
        marketingPrice: 1_000_000, sqm: 60, status: 'ACTIVE',
      },
    });
    await prisma.property.create({
      data: {
        agentId: alice.id, type: 'דירה', street: 'y', city: 'TLV',
        owner: 'o', ownerPhone: '0500000008',
        assetClass: 'RESIDENTIAL', category: 'SALE',
        marketingPrice: 1_000_000, sqm: 60, status: 'SOLD', // excluded
      },
    });

    const cookie = await loginAs(app, alice.email, alice._plainPassword);
    const res = await app.inject({
      method: 'GET', url: '/api/team/scoreboard', headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const { agents } = res.json();
    const byId = new Map(agents.map((a: any) => [a.agentId, a]));
    const aliceRow: any = byId.get(alice.id);
    const bobRow: any   = byId.get(bob.id);
    expect(aliceRow.closedDeals).toBe(2);
    expect(aliceRow.totalVolume).toBe(1_800_000 + 2_500_000);
    expect(aliceRow.leadsOpen).toBe(1);
    expect(aliceRow.propertiesActive).toBe(1);
    expect(bobRow.closedDeals).toBe(1);
    expect(bobRow.totalVolume).toBe(0);
  });

  it('H — quarter filter excludes deals outside the window', async () => {
    const office = await prisma.office.create({ data: { name: 'TZ' } });
    const alice = await createAgent(prisma);
    await prisma.user.update({ where: { id: alice.id }, data: { officeId: office.id } });

    // A deal signed in Q1-2026 (Jan–Mar).
    await prisma.deal.create({
      data: {
        agentId: alice.id,
        propertyStreet: 'Herzl 1', city: 'TLV',
        assetClass: 'RESIDENTIAL', category: 'SALE',
        marketingPrice: 1_000_000, closedPrice: 1_100_000,
        status: 'SIGNED',
        signedAt: new Date(Date.UTC(2026, 1, 15)), // Feb 15 2026
      },
    });
    // A deal signed in Q2-2026 (Apr–Jun) — should be excluded when we
    // ask for Q1.
    await prisma.deal.create({
      data: {
        agentId: alice.id,
        propertyStreet: 'Herzl 2', city: 'TLV',
        assetClass: 'RESIDENTIAL', category: 'SALE',
        marketingPrice: 1_000_000, closedPrice: 5_500_000,
        status: 'CLOSED',
        signedAt: new Date(Date.UTC(2026, 4, 10)), // May 10 2026
      },
    });

    const cookie = await loginAs(app, alice.email, alice._plainPassword);
    const q1 = await app.inject({
      method: 'GET', url: '/api/team/scoreboard?quarter=Q1-2026', headers: { cookie },
    });
    expect(q1.statusCode).toBe(200);
    expect(q1.json().quarter).toBe('Q1-2026');
    const aliceQ1 = q1.json().agents.find((a: any) => a.agentId === alice.id);
    expect(aliceQ1.closedDeals).toBe(1);
    expect(aliceQ1.totalVolume).toBe(1_100_000);

    const q2 = await app.inject({
      method: 'GET', url: '/api/team/scoreboard?quarter=Q2-2026', headers: { cookie },
    });
    const aliceQ2 = q2.json().agents.find((a: any) => a.agentId === alice.id);
    expect(aliceQ2.closedDeals).toBe(1);
    expect(aliceQ2.totalVolume).toBe(5_500_000);
  });
});
