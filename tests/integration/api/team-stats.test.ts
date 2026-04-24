import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { build } from '../../../backend/src/server.js';
import { prisma } from '../../setup/integration.setup.js';
import { createAgent } from '../../factories/user.factory.js';
import { loginAs } from '../../helpers/auth.js';

let app: FastifyInstance;
beforeAll(async () => { app = await build(); await app.ready(); });
afterAll(async () => { await app.close(); });

// Sprint 10 — GET /api/team/stats. Office-scoped widget aggregator.
// Five cases keep the matrix tight: auth gate, lone-agent fallback,
// happy-path payload shape, median math, and the asset-class split
// counts every agent-owned property exactly once.

describe('GET /api/team/stats', () => {
  it('A — 401 without a cookie', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/team/stats' });
    expect(res.statusCode).toBe(401);
  });

  it('Edge — 404 for a lone agent (no office)', async () => {
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'GET', url: '/api/team/stats', headers: { cookie },
    });
    expect(res.statusCode).toBe(404);
  });

  it('H — happy path returns the full payload shape', async () => {
    const office = await prisma.office.create({ data: { name: 'Acme' } });
    const alice = await createAgent(prisma);
    await prisma.user.update({ where: { id: alice.id }, data: { officeId: office.id } });

    // Seed minimal data so the endpoint exercises its query paths.
    await prisma.property.create({
      data: {
        agentId: alice.id, type: 'דירה', street: 'a', city: 'TLV',
        owner: 'o', ownerPhone: '0500000001',
        assetClass: 'RESIDENTIAL', category: 'SALE',
        marketingPrice: 2_000_000, sqm: 60, rooms: 3, status: 'ACTIVE',
      },
    });
    await prisma.lead.create({
      data: { agentId: alice.id, name: 'L1', phone: '0500000010', status: 'HOT', source: 'yad2' },
    });
    await prisma.deal.create({
      data: {
        agentId: alice.id, propertyStreet: 'x', city: 'TLV',
        assetClass: 'RESIDENTIAL', category: 'SALE',
        marketingPrice: 1_000_000, closedPrice: 950_000, commission: 18_000,
        status: 'SIGNED', signedAt: new Date(),
      },
    });

    const cookie = await loginAs(app, alice.email, alice._plainPassword);
    const res = await app.inject({
      method: 'GET', url: '/api/team/stats', headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    // Every documented widget bucket must be present so the frontend
    // can rely on a stable shape.
    for (const key of [
      'propertiesByCity', 'medianSalePriceByCity', 'medianRentPriceByCity',
      'leadTemperature', 'leadSources', 'roomsDistribution', 'priceBands',
      'weeklySignedDeals', 'totalCommissionsYtd', 'topReferrers',
      'inquiryToLeadConvRate', 'avgDaysToSign', 'assetClassSplit',
      'newThisWeek', 'newLastWeek',
    ]) {
      expect(body, `missing key ${key}`).toHaveProperty(key);
    }
    expect(Array.isArray(body.propertiesByCity)).toBe(true);
    expect(Array.isArray(body.weeklySignedDeals)).toBe(true);
    expect(body.leadTemperature).toMatchObject({
      HOT: expect.any(Number),
      WARM: expect.any(Number),
      COLD: expect.any(Number),
      unspecified: expect.any(Number),
    });
    expect(body.assetClassSplit).toMatchObject({
      residential: expect.any(Number),
      commercial: expect.any(Number),
    });
    expect(body.newThisWeek).toMatchObject({
      leads: expect.any(Number),
      properties: expect.any(Number),
    });
    expect(body.leadTemperature.HOT).toBe(1);
    expect(body.totalCommissionsYtd).toBe(18_000);
  });

  it('H — medianSalePriceByCity computes the middle value per city', async () => {
    // Five SALE properties: TLV [1M, 2M, 3M] → median 2M, count 3.
    // Haifa [4M, 6M] → median 5M (avg of 2 middle values), count 2.
    // A RENT row in TLV must NOT bleed into the SALE median.
    const office = await prisma.office.create({ data: { name: 'M' } });
    const a = await createAgent(prisma);
    await prisma.user.update({ where: { id: a.id }, data: { officeId: office.id } });

    const seed = async (city: string, price: number, category: 'SALE' | 'RENT' = 'SALE') => {
      await prisma.property.create({
        data: {
          agentId: a.id, type: 'דירה', street: faker(), city,
          owner: 'o', ownerPhone: '0500000099',
          assetClass: 'RESIDENTIAL', category,
          marketingPrice: price, sqm: 60, status: 'ACTIVE',
        },
      });
    };
    function faker() { return Math.random().toString(36).slice(2, 8); }
    await seed('TLV', 1_000_000);
    await seed('TLV', 2_000_000);
    await seed('TLV', 3_000_000);
    await seed('Haifa', 4_000_000);
    await seed('Haifa', 6_000_000);
    // RENT row that should be excluded from medianSalePriceByCity.
    await seed('TLV', 9_000_000, 'RENT');

    const cookie = await loginAs(app, a.email, a._plainPassword);
    const res = await app.inject({
      method: 'GET', url: '/api/team/stats', headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const { medianSalePriceByCity } = res.json();
    const tlv = medianSalePriceByCity.find((r: any) => r.city === 'TLV');
    const hfa = medianSalePriceByCity.find((r: any) => r.city === 'Haifa');
    expect(tlv).toEqual({ city: 'TLV', median: 2_000_000, count: 3 });
    // Median of two middle values for an even-length set is their average.
    expect(hfa).toEqual({ city: 'Haifa', median: 5_000_000, count: 2 });
  });

  it('H — assetClassSplit equals the count of all agent-owned properties', async () => {
    const office = await prisma.office.create({ data: { name: 'Sum' } });
    const a = await createAgent(prisma);
    const b = await createAgent(prisma);
    await prisma.user.update({ where: { id: a.id }, data: { officeId: office.id } });
    await prisma.user.update({ where: { id: b.id }, data: { officeId: office.id } });

    const make = (agentId: string, klass: 'RESIDENTIAL' | 'COMMERCIAL', n: number) =>
      Promise.all(Array.from({ length: n }).map((_, i) =>
        prisma.property.create({
          data: {
            agentId, type: 'דירה', street: `${klass}-${i}`, city: 'TLV',
            owner: 'o', ownerPhone: '0500000088',
            assetClass: klass, category: 'SALE',
            marketingPrice: 1_000_000, sqm: 60, status: 'ACTIVE',
          },
        })));
    await make(a.id, 'RESIDENTIAL', 4);
    await make(a.id, 'COMMERCIAL', 1);
    await make(b.id, 'RESIDENTIAL', 2);
    await make(b.id, 'COMMERCIAL', 3);

    const cookie = await loginAs(app, a.email, a._plainPassword);
    const res = await app.inject({
      method: 'GET', url: '/api/team/stats', headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const { assetClassSplit } = res.json();
    const totalProps = await prisma.property.count({
      where: { agentId: { in: [a.id, b.id] } },
    });
    expect(assetClassSplit.residential + assetClassSplit.commercial).toBe(totalProps);
    expect(assetClassSplit.residential).toBe(6);
    expect(assetClassSplit.commercial).toBe(4);
  });
});
