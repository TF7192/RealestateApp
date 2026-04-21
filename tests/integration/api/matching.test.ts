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

// Sprint 2 / MLS parity — Task C3. Server-side matching engine,
// both directions (lead → properties, property → leads).
describe('Matching engine', () => {
  it('H — GET /leads/:id/matches returns owned properties that match flat criteria', async () => {
    const agent = await createAgent(prisma);
    const lead = await createLead(prisma, {
      agentId: agent.id,
      city: 'תל אביב',
      interestType: 'PRIVATE',
      lookingFor: 'BUY',
    });
    // Matching property: same city, residential, sale.
    const match = await createProperty(prisma, {
      agentId: agent.id,
      city: 'תל אביב',
      assetClass: 'RESIDENTIAL',
      category: 'SALE',
      marketingPrice: 2_500_000,
      rooms: 4,
    });
    // Non-matching: different city.
    await createProperty(prisma, {
      agentId: agent.id,
      city: 'ירושלים',
      assetClass: 'RESIDENTIAL',
      category: 'SALE',
    });
    // Non-matching: wrong asset class.
    await createProperty(prisma, {
      agentId: agent.id,
      city: 'תל אביב',
      assetClass: 'COMMERCIAL',
      category: 'SALE',
    });

    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'GET',
      url: `/api/leads/${lead.id}/matches`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const items = res.json().items;
    expect(items.length).toBe(1);
    expect(items[0].property.id).toBe(match.id);
    expect(items[0].score).toBeGreaterThan(0);
    expect(items[0].reasons).toContain('asset_class');
    expect(items[0].reasons).toContain('city');
  });

  it('H — search profile city list overrides flat `city` on the lead', async () => {
    const agent = await createAgent(prisma);
    const lead = await createLead(prisma, {
      agentId: agent.id,
      city: 'תל אביב', // flat says TLV only
      interestType: 'PRIVATE',
      lookingFor: 'BUY',
    });
    // Profile lets in Herzliya too.
    await prisma.leadSearchProfile.create({
      data: {
        leadId: lead.id,
        label: 'profile',
        domain: 'RESIDENTIAL',
        dealType: 'SALE',
        cities: ['הרצליה'],
        minPrice: 1_000_000,
        maxPrice: 5_000_000,
      },
    });
    const hrzl = await createProperty(prisma, {
      agentId: agent.id,
      city: 'הרצליה',
      assetClass: 'RESIDENTIAL',
      category: 'SALE',
      marketingPrice: 3_000_000,
    });
    // Property in the flat city but NOT on the profile list — profile
    // should override and exclude it.
    await createProperty(prisma, {
      agentId: agent.id,
      city: 'תל אביב',
      assetClass: 'RESIDENTIAL',
      category: 'SALE',
      marketingPrice: 2_000_000,
    });

    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'GET', url: `/api/leads/${lead.id}/matches`, headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const items = res.json().items;
    expect(items.length).toBe(1);
    expect(items[0].property.id).toBe(hrzl.id);
    expect(items[0].reasons).toContain('profile_city');
  });

  it('Az — 404 when a different agent asks for matches on this lead', async () => {
    const [a, b] = await Promise.all([createAgent(prisma), createAgent(prisma)]);
    const aLead = await createLead(prisma, { agentId: a.id });
    const cookie = await loginAs(app, b.email, b._plainPassword);
    const res = await app.inject({
      method: 'GET', url: `/api/leads/${aLead.id}/matches`, headers: { cookie },
    });
    expect(res.statusCode).toBe(404);
  });

  it('H — GET /properties/:id/matching-customers returns leads for this agent sorted by score', async () => {
    const agent = await createAgent(prisma);
    const property = await createProperty(prisma, {
      agentId: agent.id,
      city: 'תל אביב',
      assetClass: 'RESIDENTIAL',
      category: 'SALE',
      marketingPrice: 3_000_000,
      rooms: 4,
    });
    // Strong match: same city + matching price band.
    const strong = await createLead(prisma, {
      agentId: agent.id,
      city: 'תל אביב',
      interestType: 'PRIVATE',
      lookingFor: 'BUY',
    });
    await prisma.lead.update({
      where: { id: strong.id },
      data: { budget: 3_000_000 },
    });
    // Weak match: same asset class + deal type, no city constraint.
    const weak = await createLead(prisma, {
      agentId: agent.id,
      city: undefined, // random city from faker
      interestType: 'PRIVATE',
      lookingFor: 'BUY',
    });
    await prisma.lead.update({ where: { id: weak.id }, data: { city: null } });
    // No-match: wrong deal type.
    await createLead(prisma, {
      agentId: agent.id,
      interestType: 'PRIVATE',
      lookingFor: 'RENT',
    });

    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'GET',
      url: `/api/properties/${property.id}/matching-customers`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const items = res.json().items;
    expect(items.length).toBe(2);
    // Stronger match should sort first.
    expect(items[0].lead.id).toBe(strong.id);
    expect(items[0].score).toBeGreaterThanOrEqual(items[1].score);
  });

  it('Az — 404 matching-customers on another agent\'s property', async () => {
    const [a, b] = await Promise.all([createAgent(prisma), createAgent(prisma)]);
    const aProp = await createProperty(prisma, { agentId: a.id });
    const cookie = await loginAs(app, b.email, b._plainPassword);
    const res = await app.inject({
      method: 'GET',
      url: `/api/properties/${aProp.id}/matching-customers`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(404);
  });

  it('Edge — empty items when nothing matches', async () => {
    const agent = await createAgent(prisma);
    const property = await createProperty(prisma, {
      agentId: agent.id,
      city: 'תל אביב',
      assetClass: 'COMMERCIAL',
      category: 'SALE',
    });
    // Residential / BUY lead, won't match commercial property.
    await createLead(prisma, {
      agentId: agent.id,
      city: 'תל אביב',
      interestType: 'PRIVATE',
      lookingFor: 'BUY',
    });
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'GET',
      url: `/api/properties/${property.id}/matching-customers`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().items).toEqual([]);
  });
});
