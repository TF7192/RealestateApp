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

// Sprint 5 / MLS parity — Task H1. Global search spans properties,
// leads, owners and deals.
describe('GET /api/search', () => {
  it('H — finds matches across properties and leads for the current agent', async () => {
    const agent = await createAgent(prisma);
    await createProperty(prisma, {
      agentId: agent.id, street: 'רחוב הרצל', city: 'תל אביב',
    });
    await createLead(prisma, {
      agentId: agent.id, name: 'יוסי הרצל', city: 'ירושלים',
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
    expect(body.total).toBeGreaterThanOrEqual(2);
  });

  it('Az — never returns another agent\'s rows', async () => {
    const [a, b] = await Promise.all([createAgent(prisma), createAgent(prisma)]);
    await createProperty(prisma, { agentId: b.id, street: 'UNIQUE_XYZ_STREET' });
    const cookie = await loginAs(app, a.email, a._plainPassword);
    const res = await app.inject({
      method: 'GET', url: '/api/search?q=UNIQUE_XYZ_STREET', headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().properties).toEqual([]);
  });

  it('V — rejects empty query with 400', async () => {
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'GET', url: '/api/search?q=', headers: { cookie },
    });
    expect(res.statusCode).toBe(400);
  });

  it('H — `take` param caps per-entity result count', async () => {
    const agent = await createAgent(prisma);
    // Seed 5 leads all matching "נכדה".
    for (let i = 0; i < 5; i += 1) {
      await createLead(prisma, { agentId: agent.id, name: `נכדה ${i}` });
    }
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'GET',
      url: `/api/search?q=${encodeURIComponent('נכדה')}&take=2`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().leads.length).toBe(2);
  });
});
