// Market Discovery API — covers the redesign-relevant surface:
//   1) GET /listings default window is 3 days (was 24h pre-redesign).
//   2) GET /listings honors `firstSeenAfter=24h | 3d | 7d | all`.
//   3) GET /pulse returns the expected shape and is agent-scoped for
//      matchesForMe; respects the agent's specialtyCities filter when
//      computing newToday / privatePct / hotNeighborhoods.
//   4) GET /pulse is auth-gated.
//
// The reactor and matching scorer have their own tests; this file is
// strictly the read API contract surfaced to the FE.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../../setup/integration.setup.js';
import { createAgent } from '../../factories/user.factory.js';
import { createLead } from '../../factories/lead.factory.js';
import { loginAs } from '../../helpers/auth.js';
import { normalizeCity } from '../../../backend/src/lib/addressNormalize.js';

const { build } = await import('../../../backend/src/server.js');

let app: FastifyInstance;

beforeAll(async () => {
  app = await build();
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

async function makeListing(input: {
  firstSeenAt: Date;
  city?: string;
  neighborhood?: string | null;
  posterType?: 'private' | 'agency';
  price?: number;
} = { firstSeenAt: new Date() }) {
  const id = `mdt-${Math.random().toString(36).slice(2, 10)}`;
  return prisma.marketListing.create({
    data: {
      id,
      source: 'yad2',
      externalListingId: id,
      originalUrl: `https://www.yad2.co.il/realestate/item/${id}`,
      city: input.city ?? 'הרצליה',
      neighborhood: input.neighborhood ?? 'מרכז העיר',
      street: 'בן גוריון',
      rooms: 4,
      sizeSqm: 95,
      price: input.price ?? 2_500_000,
      posterType: input.posterType ?? 'private',
      firstSeenAt: input.firstSeenAt,
      lastSeenAt: input.firstSeenAt,
      metadataHash: `hash-${id}`,
      reactedAt: null,
    },
  });
}

describe('GET /api/market-discovery/listings — default 3-day window', () => {
  it('returns listings from the last 3 days when firstSeenAfter is omitted', async () => {
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);

    const fresh = await makeListing({ firstSeenAt: new Date(Date.now() - 2 * HOUR) });
    const inWindow = await makeListing({ firstSeenAt: new Date(Date.now() - 2.5 * DAY) });
    const expired = await makeListing({ firstSeenAt: new Date(Date.now() - 5 * DAY) });

    const res = await app.inject({
      method: 'GET',
      url: '/api/market-discovery/listings',
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { items: Array<{ id: string }> };
    const ids = new Set(body.items.map((i) => i.id));
    expect(ids.has(fresh.id)).toBe(true);
    expect(ids.has(inWindow.id)).toBe(true);
    // 5 days old must not be included by the default window.
    expect(ids.has(expired.id)).toBe(false);
  });

  it('firstSeenAfter=24h narrows to sub-day listings', async () => {
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);

    const fresh = await makeListing({ firstSeenAt: new Date(Date.now() - 2 * HOUR) });
    const twoDaysOld = await makeListing({ firstSeenAt: new Date(Date.now() - 2 * DAY) });

    const res = await app.inject({
      method: 'GET',
      url: '/api/market-discovery/listings?firstSeenAfter=24h',
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { items: Array<{ id: string }> };
    const ids = new Set(body.items.map((i) => i.id));
    expect(ids.has(fresh.id)).toBe(true);
    expect(ids.has(twoDaysOld.id)).toBe(false);
  });

  it('firstSeenAfter=3d is accepted (was rejected before the redesign)', async () => {
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);

    const inWindow = await makeListing({ firstSeenAt: new Date(Date.now() - 2 * DAY) });

    const res = await app.inject({
      method: 'GET',
      url: '/api/market-discovery/listings?firstSeenAfter=3d',
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { items: Array<{ id: string }> };
    expect(body.items.some((i) => i.id === inWindow.id)).toBe(true);
  });
});

describe('GET /api/market-discovery/pulse', () => {
  it('returns the expected shape when authenticated', async () => {
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);

    const res = await app.inject({
      method: 'GET',
      url: '/api/market-discovery/pulse',
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as Record<string, unknown>;
    expect(body).toHaveProperty('newToday');
    expect(body).toHaveProperty('matchesForMe');
    expect(body).toHaveProperty('privatePct');
    expect(body).toHaveProperty('hotNeighborhoods');
    expect(Array.isArray((body as { hotNeighborhoods: unknown }).hotNeighborhoods)).toBe(true);
  });

  it('matchesForMe is agent-scoped (does not leak another agent\'s matches)', async () => {
    const agentA = await createAgent(prisma);
    const agentB = await createAgent(prisma);
    const cookieA = await loginAs(app, agentA.email, agentA._plainPassword);

    // Agent B has an active match in the last day; agent A has none.
    const leadB = await createLead(prisma, { agentId: agentB.id, city: 'תל אביב' });
    const listing = await makeListing({ firstSeenAt: new Date(Date.now() - 6 * HOUR) });
    await prisma.marketListingLeadMatch.create({
      data: {
        agentUserId: agentB.id,
        leadId: leadB.id,
        marketListingId: listing.id,
        score: 80,
        reasonsJson: ['city-match'],
        status: 'new',
      },
    });

    const res = await app.inject({
      method: 'GET',
      url: '/api/market-discovery/pulse',
      headers: { cookie: cookieA },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { matchesForMe: { count: number } };
    // Agent A's pulse must NOT include agent B's match.
    expect(body.matchesForMe.count).toBe(0);
  });

  it('respects the agent\'s specialtyCities when scoping newToday', async () => {
    // The route canonicalises both sides via normalizeCity. The seeded
    // listing's `city` must match the canonicalised value the user's
    // specialtyCities reduce to — otherwise the where { in: [...] }
    // filter rejects it. We canonicalise here to keep the test
    // independent of the alias map's specific entries.
    const inCity = normalizeCity('הרצליה')?.value ?? 'הרצליה';
    const outCity = normalizeCity('אילת')?.value ?? 'אילת';

    const agent = await createAgent(prisma);
    await prisma.user.update({
      where: { id: agent.id },
      data: { specialtyCities: [inCity] },
    });
    const cookie = await loginAs(app, agent.email, agent._plainPassword);

    await makeListing({ city: inCity,  firstSeenAt: new Date(Date.now() - 2 * HOUR) });
    await makeListing({ city: outCity, firstSeenAt: new Date(Date.now() - 2 * HOUR) });

    const res = await app.inject({
      method: 'GET',
      url: '/api/market-discovery/pulse',
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { newToday: { count: number } };
    // Listings inside the specialty city must count.
    expect(body.newToday.count).toBeGreaterThanOrEqual(1);
    // Listings outside the specialty city must NOT inflate the pulse —
    // the count must be strictly less than the global count over the
    // same window.
    const allCount = await prisma.marketListing.count({
      where: { firstSeenAt: { gte: new Date(Date.now() - DAY) } },
    });
    expect(body.newToday.count).toBeLessThan(allCount);
  });

  it('401 without an agent cookie', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/market-discovery/pulse',
    });
    expect(res.statusCode).toBe(401);
  });
});
