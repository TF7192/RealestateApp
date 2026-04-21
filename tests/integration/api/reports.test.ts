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

// Sprint 4 / MLS parity — Tasks E1 + B5. Report endpoints + CSV export.
describe('Reports & CSV exports', () => {
  it('H — /reports/new-properties counts only the agent\'s properties in range', async () => {
    const [a, b] = await Promise.all([createAgent(prisma), createAgent(prisma)]);
    // 2 for agent a, 1 for agent b.
    await createProperty(prisma, { agentId: a.id });
    await createProperty(prisma, { agentId: a.id });
    await createProperty(prisma, { agentId: b.id });
    const cookie = await loginAs(app, a.email, a._plainPassword);
    const res = await app.inject({
      method: 'GET', url: '/api/reports/new-properties', headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.count).toBe(2);
    expect(body.items.every((p: any) => p.id && p.type)).toBe(true);
  });

  it('H — /reports/new-customers respects the `from` date bound', async () => {
    const agent = await createAgent(prisma);
    const old = await createLead(prisma, { agentId: agent.id });
    const fresh = await createLead(prisma, { agentId: agent.id });
    // Backdate `old` to a week ago.
    await prisma.lead.update({
      where: { id: old.id },
      data: { createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
    });
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const from = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const res = await app.inject({
      method: 'GET',
      url: `/api/reports/new-customers?from=${encodeURIComponent(from)}`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const ids = res.json().items.map((l: any) => l.id);
    expect(ids).toContain(fresh.id);
    expect(ids).not.toContain(old.id);
  });

  it('H — /reports/deals aggregates by status + totalCommission', async () => {
    const agent = await createAgent(prisma);
    const prop = await createProperty(prisma, { agentId: agent.id });
    await prisma.deal.create({
      data: {
        agentId: agent.id, propertyId: prop.id,
        propertyStreet: prop.street, city: prop.city,
        assetClass: prop.assetClass, category: prop.category,
        marketingPrice: 2_000_000, commission: 50_000, status: 'SIGNED',
      },
    });
    const prop2 = await createProperty(prisma, { agentId: agent.id });
    await prisma.deal.create({
      data: {
        agentId: agent.id, propertyId: prop2.id,
        propertyStreet: prop2.street, city: prop2.city,
        assetClass: prop2.assetClass, category: prop2.category,
        marketingPrice: 3_000_000, commission: 75_000, status: 'NEGOTIATING',
      },
    });
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'GET', url: '/api/reports/deals', headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.count).toBe(2);
    expect(body.byStatus.SIGNED).toBe(1);
    expect(body.byStatus.NEGOTIATING).toBe(1);
    // Only SIGNED contributes to totalCommission.
    expect(body.totalCommission).toBe(50_000);
  });

  it('H — /reports/export/leads.csv emits BOM + valid CSV rows', async () => {
    const agent = await createAgent(prisma);
    await createLead(prisma, { agentId: agent.id, name: 'יוסי, הבן של שרה' });
    await createLead(prisma, { agentId: agent.id });
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'GET', url: '/api/reports/export/leads.csv', headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('leads.csv');
    const body = res.body;
    // UTF-8 BOM first.
    expect(body.charCodeAt(0)).toBe(0xFEFF);
    // Header row present.
    expect(body).toContain('name');
    // Comma in the name is properly quoted.
    expect(body).toMatch(/"יוסי, הבן של שרה"/);
    // 1 header + 2 rows.
    const lines = body.split('\n').filter(Boolean);
    expect(lines.length).toBe(3);
  });

  it('Az — /reports/export/properties.csv never leaks another agent\'s rows', async () => {
    const [a, b] = await Promise.all([createAgent(prisma), createAgent(prisma)]);
    await createProperty(prisma, { agentId: a.id, street: 'רחוב A' });
    await createProperty(prisma, { agentId: b.id, street: 'רחוב ZZZ_SECRET' });
    const cookie = await loginAs(app, a.email, a._plainPassword);
    const res = await app.inject({
      method: 'GET', url: '/api/reports/export/properties.csv', headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('רחוב A');
    expect(res.body).not.toContain('ZZZ_SECRET');
  });

  it('V — invalid `from` returns 400 (Zod)', async () => {
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'GET',
      url: '/api/reports/new-properties?from=not-a-date',
      headers: { cookie },
    });
    expect(res.statusCode).toBe(400);
  });
});
