import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { build } from '../../../backend/src/server.js';
import { prisma } from '../../setup/integration.setup.js';
import { createAgent } from '../../factories/user.factory.js';
import { createLead } from '../../factories/lead.factory.js';
import { createOwner } from '../../factories/owner.factory.js';
import { createProperty } from '../../factories/property.factory.js';
import { loginAs } from '../../helpers/auth.js';

let app: FastifyInstance;
beforeAll(async () => { app = await build(); await app.ready(); });
afterAll(async () => { await app.close(); });

// Sprint 4 — global cmd-K search across leads / properties / owners /
// deals. Always agent-scoped; each bucket capped to 5 by default.
describe('GET /api/search', () => {
  it('requires auth — returns 401 without a session cookie', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/search?q=anything',
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns empty buckets for an empty query', async () => {
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'GET',
      url: '/api/search?q=',
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    // Shape contract — all four buckets present, all empty.
    expect(body).toMatchObject({
      properties: [],
      leads:      [],
      owners:     [],
      deals:      [],
    });
  });

  it('ILIKE-matches across name / phone / address / city for the current agent', async () => {
    const agent = await createAgent(prisma);
    await createProperty(prisma, {
      agentId: agent.id, street: 'רחוב הרצל', city: 'תל אביב',
    });
    await createLead(prisma, {
      agentId: agent.id, name: 'יוסי הרצל', city: 'ירושלים',
    });
    await createOwner(prisma, {
      agentId: agent.id, name: 'אבי הרצל', phone: '0509999999',
    });
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'GET',
      url: `/api/search?q=${encodeURIComponent('הרצל')}`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.properties.length).toBe(1);
    expect(body.leads.length).toBe(1);
    expect(body.owners.length).toBe(1);
    expect(body.leads[0].name).toContain('הרצל');
    expect(body.properties[0].street).toContain('הרצל');
    // Sanity — the payload shape includes all four buckets by name.
    expect(Object.keys(body)).toEqual(
      expect.arrayContaining(['properties', 'leads', 'owners', 'deals']),
    );
  });

  it('caps each bucket to 5 results (spotlight-style)', async () => {
    const agent = await createAgent(prisma);
    // Seed 8 leads all matching the same Hebrew stem — we only want 5 back.
    for (let i = 0; i < 8; i += 1) {
      await createLead(prisma, { agentId: agent.id, name: `נכדה ${i}` });
    }
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'GET',
      url: `/api/search?q=${encodeURIComponent('נכדה')}`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().leads.length).toBe(5);
  });

  it('never returns another agent\'s rows', async () => {
    const [a, b] = await Promise.all([createAgent(prisma), createAgent(prisma)]);
    await createProperty(prisma, { agentId: b.id, street: 'UNIQUE_XYZ_STREET' });
    const cookie = await loginAs(app, a.email, a._plainPassword);
    const res = await app.inject({
      method: 'GET', url: '/api/search?q=UNIQUE_XYZ_STREET', headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().properties).toEqual([]);
  });
});
