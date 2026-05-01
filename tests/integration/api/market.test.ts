// /api/market — cached Nadlan market context for an agent's
// properties. Two main shapes:
//   - GET /property/:id          → look up cached payload (204 if none)
//   - POST /property/:id/refresh/start → kick off async crawl, returns
//                                         { jobId }; client polls /jobs/:id
//
// We mock the nadlan-crawler at the helper boundary so no real
// Playwright instance launches in CI. The auth + ownership +
// quota + job-state shape is what we actually want covered here.

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../../setup/integration.setup.js';
import { createAgent } from '../../factories/user.factory.js';
import { createProperty } from '../../factories/property.factory.js';
import { loginAs } from '../../helpers/auth.js';

// Mock the crawler at the lib boundary. The route imports
// fetchNadlanMarket via runRefresh internally.
const fetchMock = vi.fn();
vi.mock('../../../backend/src/lib/nadlan-crawler.js', () => ({
  fetchNadlanMarket: (...args: unknown[]) => fetchMock(...args),
}));

const { build } = await import('../../../backend/src/server.js');

let app: FastifyInstance;

beforeAll(async () => {
  app = await build();
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  fetchMock.mockReset();
});

describe('GET /api/market/property/:id', () => {
  it('A — 401 without an agent cookie', async () => {
    const agent = await createAgent(prisma);
    const prop = await createProperty(prisma, { agentId: agent.id });
    const res = await app.inject({
      method: 'GET',
      url: `/api/market/property/${prop.id}`,
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 204 when no MarketContext row has been computed yet', async () => {
    const agent = await createAgent(prisma);
    const prop = await createProperty(prisma, { agentId: agent.id });
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'GET',
      url: `/api/market/property/${prop.id}`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(204);
  });

  it('returns the cached payload when one exists', async () => {
    const agent = await createAgent(prisma);
    const prop = await createProperty(prisma, {
      agentId: agent.id,
      street: 'הרצל',
      city: 'פתח תקווה',
    });
    // Seed a cached MarketContext for the (city, street, kind) key.
    // The route normalises the city/street via normKey; for this
    // simple Hebrew input, the helper trims + lowercases.
    await prisma.marketContext.create({
      data: {
        cityKey: 'פתח תקווה',
        streetKey: 'הרצל',
        kind: 'buy',
        fetchedAt: new Date(),
        dealCount: 4,
        payload: { medianPrice: 2_300_000 } as any,
      },
    });
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'GET',
      url: `/api/market/property/${prop.id}?kind=buy`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.kind).toBe('buy');
    expect(body.dealCount).toBe(4);
    expect(body.payload).toMatchObject({ medianPrice: 2_300_000 });
  });
});

describe('POST /api/market/property/:id/refresh', () => {
  it('A — 401 without an agent cookie', async () => {
    const agent = await createAgent(prisma);
    const prop = await createProperty(prisma, { agentId: agent.id });
    const res = await app.inject({
      method: 'POST',
      url: `/api/market/property/${prop.id}/refresh`,
    });
    expect(res.statusCode).toBe(401);
  });

  it('502s when the crawler throws', async () => {
    fetchMock.mockRejectedValueOnce(new Error('Playwright timeout'));
    const agent = await createAgent(prisma);
    const prop = await createProperty(prisma, { agentId: agent.id });
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'POST',
      url: `/api/market/property/${prop.id}/refresh?kind=buy`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(502);
  });
});

describe('POST /api/market/property/:id/refresh/start', () => {
  it('returns 202 + jobId; subsequent GET /jobs/:id resolves the result', async () => {
    // The crawler returns { deals: [], error?: ... }; the route reads
    // `result.deals.length` to populate the dealCount column.
    fetchMock.mockResolvedValueOnce({
      deals: [
        { date: '2026-04-01', price: 2_100_000, sqm: 95, rooms: 4 },
        { date: '2026-03-15', price: 1_800_000, sqm: 80, rooms: 3 },
      ],
      error: null,
    });
    const agent = await createAgent(prisma);
    const prop = await createProperty(prisma, { agentId: agent.id });
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const start = await app.inject({
      method: 'POST',
      url: `/api/market/property/${prop.id}/refresh/start?kind=buy`,
      headers: { cookie },
    });
    expect(start.statusCode).toBe(202);
    const { jobId } = start.json();
    expect(typeof jobId).toBe('string');

    // Poll the job status; the crawler ran synchronously (mocked +
    // microtask) so it should be terminal on the first poll.
    // Allow a single retry to cover any microtask ordering quirks.
    let body: any;
    for (let i = 0; i < 5; i += 1) {
      const status = await app.inject({
        method: 'GET',
        url: `/api/market/jobs/${jobId}`,
        headers: { cookie },
      });
      expect(status.statusCode).toBe(200);
      body = status.json();
      if (body.status !== 'running') break;
      await new Promise((r) => setTimeout(r, 10));
    }
    expect(body.status).toBe('done');
  });

  it('403 — another agent cannot poll this agent\'s job', async () => {
    // The crawler returns { deals: [], error?: ... }; the route reads
    // `result.deals.length` to populate the dealCount column.
    fetchMock.mockResolvedValueOnce({
      deals: [
        { date: '2026-04-01', price: 2_100_000, sqm: 95, rooms: 4 },
        { date: '2026-03-15', price: 1_800_000, sqm: 80, rooms: 3 },
      ],
      error: null,
    });
    const [a, b] = await Promise.all([createAgent(prisma), createAgent(prisma)]);
    const prop = await createProperty(prisma, { agentId: a.id });
    const aCookie = await loginAs(app, a.email, a._plainPassword);
    const bCookie = await loginAs(app, b.email, b._plainPassword);
    const start = await app.inject({
      method: 'POST',
      url: `/api/market/property/${prop.id}/refresh/start`,
      headers: { cookie: aCookie },
    });
    const { jobId } = start.json();
    const status = await app.inject({
      method: 'GET',
      url: `/api/market/jobs/${jobId}`,
      headers: { cookie: bCookie },
    });
    expect(status.statusCode).toBe(403);
  });

  it('404 on a job id that doesn\'t exist', async () => {
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'GET',
      url: '/api/market/jobs/never-existed',
      headers: { cookie },
    });
    expect(res.statusCode).toBe(404);
  });
});
