// 2026-06-02 — Per-agent Gmail-style labels on /market-discovery rows.
//
// Covers:
//   1) CRUD on /api/market/tags (create + list)
//   2) Assign + unassign idempotency
//   3) Listings endpoint filters by tagIds (OR semantics) and hydrates
//      assignedTagIds on each row
//   4) Cross-agent guard — an agent can't read, assign to, or filter by
//      another agent's tag

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../../setup/integration.setup.js';
import { createAgent } from '../../factories/user.factory.js';
import { loginAs } from '../../helpers/auth.js';

const { build } = await import('../../../backend/src/server.js');

let app: FastifyInstance;

beforeAll(async () => {
  app = await build();
  await app.ready();
});
afterAll(async () => {
  await app.close();
});

async function makeListing(input: { firstSeenAt?: Date; city?: string } = {}) {
  const id = `mt-${Math.random().toString(36).slice(2, 10)}`;
  return prisma.marketListing.create({
    data: {
      id,
      source: 'yad2',
      externalListingId: id,
      originalUrl: `https://www.yad2.co.il/realestate/item/${id}`,
      city: input.city ?? 'הרצליה',
      neighborhood: 'מרכז העיר',
      street: 'בן גוריון',
      rooms: 4,
      sizeSqm: 95,
      price: 2_500_000,
      posterType: 'private',
      firstSeenAt: input.firstSeenAt ?? new Date(Date.now() - 2 * 3600 * 1000),
      lastSeenAt: new Date(),
      metadataHash: `hash-${id}`,
      reactedAt: null,
    },
  });
}

describe('POST /api/market/tags — create', () => {
  it('happy path — returns the new tag with default color', async () => {
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'POST', url: '/api/market/tags', headers: { cookie },
      payload: { name: 'חם' },
    });
    expect(res.statusCode).toBe(200);
    const { tag } = res.json() as { tag: { id: string; name: string; color: string } };
    expect(tag).toMatchObject({ name: 'חם', color: '#b48b4c' });
    expect(tag.id).toBeTruthy();
  });

  it('rejects empty name (400)', async () => {
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'POST', url: '/api/market/tags', headers: { cookie },
      payload: { name: '' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects malformed color (400)', async () => {
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'POST', url: '/api/market/tags', headers: { cookie },
      payload: { name: 'X', color: 'red' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('409 on duplicate name per agent', async () => {
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    await app.inject({
      method: 'POST', url: '/api/market/tags', headers: { cookie },
      payload: { name: 'יוקרה' },
    });
    const dup = await app.inject({
      method: 'POST', url: '/api/market/tags', headers: { cookie },
      payload: { name: 'יוקרה' },
    });
    expect(dup.statusCode).toBe(409);
  });

  it('401 without cookie', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/market/tags',
      payload: { name: 'X' },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('POST /api/market/tags/:id/assign — attach', () => {
  it('idempotent attach — same body twice returns 200 both times', async () => {
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const listing = await makeListing();
    const tag = await prisma.marketTag.create({
      data: { agentId: agent.id, name: 'מעקב' },
    });
    const a = await app.inject({
      method: 'POST', url: `/api/market/tags/${tag.id}/assign`,
      headers: { cookie }, payload: { advertId: listing.id },
    });
    expect(a.statusCode).toBe(200);
    const b = await app.inject({
      method: 'POST', url: `/api/market/tags/${tag.id}/assign`,
      headers: { cookie }, payload: { advertId: listing.id },
    });
    expect(b.statusCode).toBe(200);
    const count = await prisma.marketTagAssignment.count({
      where: { tagId: tag.id, marketListingId: listing.id },
    });
    expect(count).toBe(1);
  });

  it('404 on missing listing', async () => {
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const tag = await prisma.marketTag.create({
      data: { agentId: agent.id, name: 'X' },
    });
    const res = await app.inject({
      method: 'POST', url: `/api/market/tags/${tag.id}/assign`,
      headers: { cookie }, payload: { advertId: 'does-not-exist' },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('DELETE /api/market/tags/:id/assign/:advertId — detach', () => {
  it('removes the assignment, idempotent on second call', async () => {
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const listing = await makeListing();
    const tag = await prisma.marketTag.create({
      data: { agentId: agent.id, name: 'מעקב' },
    });
    await prisma.marketTagAssignment.create({
      data: { tagId: tag.id, marketListingId: listing.id },
    });
    const first = await app.inject({
      method: 'DELETE',
      url: `/api/market/tags/${tag.id}/assign/${listing.id}`,
      headers: { cookie },
    });
    expect(first.statusCode).toBe(200);
    const second = await app.inject({
      method: 'DELETE',
      url: `/api/market/tags/${tag.id}/assign/${listing.id}`,
      headers: { cookie },
    });
    expect(second.statusCode).toBe(200);
    const count = await prisma.marketTagAssignment.count({
      where: { tagId: tag.id, marketListingId: listing.id },
    });
    expect(count).toBe(0);
  });
});

describe('GET /api/market-discovery/listings — tagIds filter + hydration', () => {
  it('hydrates assignedTagIds on each row (this agent only)', async () => {
    const agentA = await createAgent(prisma);
    const agentB = await createAgent(prisma);
    const cookieA = await loginAs(app, agentA.email, agentA._plainPassword);
    const listing = await makeListing();
    const tagA = await prisma.marketTag.create({
      data: { agentId: agentA.id, name: 'A-tag' },
    });
    const tagB = await prisma.marketTag.create({
      data: { agentId: agentB.id, name: 'B-tag' },
    });
    await prisma.marketTagAssignment.create({
      data: { tagId: tagA.id, marketListingId: listing.id },
    });
    await prisma.marketTagAssignment.create({
      data: { tagId: tagB.id, marketListingId: listing.id },
    });

    const res = await app.inject({
      method: 'GET',
      url: '/api/market-discovery/listings',
      headers: { cookie: cookieA },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { items: Array<{ id: string; assignedTagIds: string[] }> };
    const row = body.items.find((i) => i.id === listing.id);
    expect(row).toBeTruthy();
    // Only THIS agent's tag is on the payload — agent B's tag must
    // never leak across the agent boundary.
    expect(row!.assignedTagIds).toEqual([tagA.id]);
  });

  it('tagIds query restricts the feed with OR semantics', async () => {
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const [l1, l2, l3] = await Promise.all([makeListing(), makeListing(), makeListing()]);
    const tagHot   = await prisma.marketTag.create({ data: { agentId: agent.id, name: 'חם' } });
    const tagWatch = await prisma.marketTag.create({ data: { agentId: agent.id, name: 'מעקב' } });
    await prisma.marketTagAssignment.create({
      data: { tagId: tagHot.id, marketListingId: l1.id },
    });
    await prisma.marketTagAssignment.create({
      data: { tagId: tagWatch.id, marketListingId: l2.id },
    });
    // l3 has no tags

    const res = await app.inject({
      method: 'GET',
      url: `/api/market-discovery/listings?tagIds=${tagHot.id},${tagWatch.id}`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { items: Array<{ id: string }> };
    const ids = new Set(body.items.map((i) => i.id));
    expect(ids.has(l1.id)).toBe(true);
    expect(ids.has(l2.id)).toBe(true);
    expect(ids.has(l3.id)).toBe(false);
  });
});

describe('Cross-agent guard', () => {
  it("agent A cannot read agent B's tags via GET /api/market/tags", async () => {
    const agentA = await createAgent(prisma);
    const agentB = await createAgent(prisma);
    await prisma.marketTag.create({ data: { agentId: agentA.id, name: 'my-tag' } });
    await prisma.marketTag.create({ data: { agentId: agentB.id, name: 'secret' } });
    const cookieA = await loginAs(app, agentA.email, agentA._plainPassword);
    const res = await app.inject({
      method: 'GET', url: '/api/market/tags', headers: { cookie: cookieA },
    });
    expect(res.statusCode).toBe(200);
    const names = (res.json() as { tags: Array<{ name: string }> }).tags.map((t) => t.name);
    expect(names).toEqual(['my-tag']);
  });

  it("agent A cannot assign to agent B's tag (404, no mutation)", async () => {
    const agentA = await createAgent(prisma);
    const agentB = await createAgent(prisma);
    const tagB = await prisma.marketTag.create({
      data: { agentId: agentB.id, name: 'B-only' },
    });
    const listing = await makeListing();
    const cookieA = await loginAs(app, agentA.email, agentA._plainPassword);
    const res = await app.inject({
      method: 'POST', url: `/api/market/tags/${tagB.id}/assign`,
      headers: { cookie: cookieA }, payload: { advertId: listing.id },
    });
    expect(res.statusCode).toBe(404);
    const count = await prisma.marketTagAssignment.count({
      where: { tagId: tagB.id, marketListingId: listing.id },
    });
    expect(count).toBe(0);
  });

  it("tagIds filter silently drops other agents' tag ids (force empty result)", async () => {
    const agentA = await createAgent(prisma);
    const agentB = await createAgent(prisma);
    const cookieA = await loginAs(app, agentA.email, agentA._plainPassword);
    const tagB = await prisma.marketTag.create({
      data: { agentId: agentB.id, name: 'B-only' },
    });
    const listing = await makeListing();
    await prisma.marketTagAssignment.create({
      data: { tagId: tagB.id, marketListingId: listing.id },
    });
    // Agent A queries listings using ONLY agent B's tag id — the
    // backend strips ids the caller doesn't own. Since none survive,
    // the feed must come back empty (rather than dropping the filter
    // entirely and showing the catalogue).
    const res = await app.inject({
      method: 'GET',
      url: `/api/market-discovery/listings?tagIds=${tagB.id}`,
      headers: { cookie: cookieA },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { items: unknown[]; total: number };
    expect(body.items).toEqual([]);
    expect(body.total).toBe(0);
  });
});

describe('POST /api/market/tags/assign-batch', () => {
  it('attaches a set of tags to a set of adverts in one call', async () => {
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const t1 = await prisma.marketTag.create({ data: { agentId: agent.id, name: 'b1' } });
    const t2 = await prisma.marketTag.create({ data: { agentId: agent.id, name: 'b2' } });
    const [a1, a2] = await Promise.all([makeListing(), makeListing()]);
    const res = await app.inject({
      method: 'POST', url: '/api/market/tags/assign-batch',
      headers: { cookie },
      payload: { tagIds: [t1.id, t2.id], advertIds: [a1.id, a2.id] },
    });
    expect(res.statusCode).toBe(200);
    const total = await prisma.marketTagAssignment.count({
      where: { tagId: { in: [t1.id, t2.id] } },
    });
    expect(total).toBe(4);
  });
});
