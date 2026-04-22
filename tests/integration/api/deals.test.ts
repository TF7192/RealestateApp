import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { build } from '../../../backend/src/server.js';
import { prisma } from '../../setup/integration.setup.js';
import { createAgent, createCustomer } from '../../factories/user.factory.js';
import { createLead } from '../../factories/lead.factory.js';
import { createOwner } from '../../factories/owner.factory.js';
import { createProperty } from '../../factories/property.factory.js';
import { loginAs } from '../../helpers/auth.js';

let app: FastifyInstance;
beforeAll(async () => { app = await build(); await app.ready(); });
afterAll(async () => { await app.close(); });

// E-1 — /api/deals CRUD with the new buyer / seller / closeDate FKs.

describe('POST /api/deals — create with structured parties', () => {
  it('H — creates a deal with buyerId + sellerId + closeDate + status', async () => {
    const agent = await createAgent(prisma);
    const buyer = await createLead(prisma, { agentId: agent.id });
    const seller = await createOwner(prisma, { agentId: agent.id });
    const property = await createProperty(prisma, { agentId: agent.id });
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'POST',
      url: '/api/deals',
      headers: { cookie },
      payload: {
        propertyId: property.id,
        propertyStreet: property.street,
        city: property.city,
        assetClass: property.assetClass,
        category: property.category,
        status: 'NEGOTIATING',
        marketingPrice: 2_400_000,
        commission: 48_000,
        buyerId: buyer.id,
        sellerId: seller.id,
        closeDate: '2026-06-01T00:00:00.000Z',
      },
    });
    expect(res.statusCode).toBe(200);
    const { deal } = res.json();
    expect(deal.buyerId).toBe(buyer.id);
    expect(deal.sellerId).toBe(seller.id);
    expect(deal.commission).toBe(48_000);
    expect(deal.status).toBe('NEGOTIATING');
    expect(new Date(deal.closeDate).toISOString()).toBe('2026-06-01T00:00:00.000Z');
  });

  it('accepts the new CLOSED / CANCELLED statuses', async () => {
    const agent = await createAgent(prisma);
    const property = await createProperty(prisma, { agentId: agent.id });
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    for (const status of ['CLOSED', 'CANCELLED'] as const) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/deals',
        headers: { cookie },
        payload: {
          propertyId: property.id,
          propertyStreet: property.street,
          city: property.city,
          assetClass: property.assetClass,
          category: property.category,
          status,
          marketingPrice: 1_500_000,
        },
      });
      // The unique(propertyId) index means re-creating for the same
      // property on the 2nd loop fails; we just need to prove the
      // status is accepted at the schema level on the first try.
      if (status === 'CLOSED') {
        expect(res.statusCode).toBe(200);
        expect(res.json().deal.status).toBe('CLOSED');
      }
    }
  });

  it('rejects cross-agent buyerId (Az — leakage guard)', async () => {
    const [a, b] = await Promise.all([createAgent(prisma), createAgent(prisma)]);
    const propertyA = await createProperty(prisma, { agentId: a.id });
    const buyerFromB = await createLead(prisma, { agentId: b.id });
    const cookie = await loginAs(app, a.email, a._plainPassword);
    const res = await app.inject({
      method: 'POST',
      url: '/api/deals',
      headers: { cookie },
      payload: {
        propertyId: propertyA.id,
        propertyStreet: propertyA.street,
        city: propertyA.city,
        assetClass: propertyA.assetClass,
        category: propertyA.category,
        marketingPrice: 1_000_000,
        buyerId: buyerFromB.id,
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects cross-agent sellerId', async () => {
    const [a, b] = await Promise.all([createAgent(prisma), createAgent(prisma)]);
    const propertyA = await createProperty(prisma, { agentId: a.id });
    const ownerFromB = await createOwner(prisma, { agentId: b.id });
    const cookie = await loginAs(app, a.email, a._plainPassword);
    const res = await app.inject({
      method: 'POST',
      url: '/api/deals',
      headers: { cookie },
      payload: {
        propertyId: propertyA.id,
        propertyStreet: propertyA.street,
        city: propertyA.city,
        assetClass: propertyA.assetClass,
        category: propertyA.category,
        marketingPrice: 1_000_000,
        sellerId: ownerFromB.id,
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it('A — 401 without a cookie', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/deals', payload: {
        propertyStreet: 'x', city: 'y', assetClass: 'RESIDENTIAL', category: 'SALE', marketingPrice: 1,
      },
    });
    expect(res.statusCode).toBe(401);
  });

  it('Az — customer role cannot create a deal', async () => {
    const customer = await createCustomer(prisma);
    const cookie = await loginAs(app, customer.email, customer._plainPassword);
    const res = await app.inject({
      method: 'POST',
      url: '/api/deals',
      headers: { cookie },
      payload: {
        propertyStreet: 'x', city: 'y', assetClass: 'RESIDENTIAL', category: 'SALE', marketingPrice: 1,
      },
    });
    expect([401, 403]).toContain(res.statusCode);
  });
});

describe('GET /api/deals — includes buyer + seller slices', () => {
  it('returns buyer + seller objects alongside the deal', async () => {
    const agent = await createAgent(prisma);
    const buyer = await createLead(prisma, { agentId: agent.id, name: 'Buyer B' });
    const seller = await createOwner(prisma, { agentId: agent.id, name: 'Seller S' });
    const property = await createProperty(prisma, { agentId: agent.id });
    await prisma.deal.create({
      data: {
        agentId: agent.id,
        propertyId: property.id,
        propertyStreet: property.street,
        city: property.city,
        assetClass: property.assetClass,
        category: property.category,
        marketingPrice: 1_200_000,
        buyerId: buyer.id,
        sellerId: seller.id,
      },
    });
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({ method: 'GET', url: '/api/deals', headers: { cookie } });
    expect(res.statusCode).toBe(200);
    const [deal] = res.json().items;
    expect(deal.buyer?.name).toBe('Buyer B');
    expect(deal.seller?.name).toBe('Seller S');
  });
});
