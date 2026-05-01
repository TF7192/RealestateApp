// Integration test for the match-digest scheduler
// (backend/src/workers/matchDigest.ts).
//
// The scheduler groups un-dispatched NotificationDispatch rows by
// agent and sends one digest email per agent. Idempotency contract:
// the unique (agentId, leadId, marketListingId) index dedups
// reactor writes; `dispatchedAt` flips on every row in the same
// transaction as the email send so a re-run finds nothing.
//
// runDigestOnce({ send }) accepts an injected sender, so we never
// touch SES.

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { prisma } from '../../setup/integration.setup.js';
import { createUser } from '../../factories/user.factory.js';
import { createLead } from '../../factories/lead.factory.js';
import { runDigestOnce } from '../../../backend/src/workers/matchDigest.js';

const sendMock = vi.fn();

beforeAll(() => { process.env.PUBLIC_ORIGIN = 'https://test.estia.co.il'; });
afterAll(() => { delete process.env.PUBLIC_ORIGIN; });
beforeEach(() => { sendMock.mockReset(); sendMock.mockResolvedValue(undefined); });

async function seedListing(overrides: Partial<{
  street: string; city: string; rooms: number; sizeSqm: number; price: number; originalUrl: string;
}> = {}) {
  const id = `ml-${Math.random().toString(36).slice(2, 10)}`;
  return prisma.marketListing.create({
    data: {
      id,
      source: 'yad2',
      externalListingId: id,
      originalUrl: overrides.originalUrl ?? `https://www.yad2.co.il/realestate/item/${id}`,
      street: overrides.street ?? 'הרצל',
      city: overrides.city ?? 'רעננה',
      rooms: overrides.rooms ?? 4,
      sizeSqm: overrides.sizeSqm ?? 95,
      price: overrides.price ?? 2_300_000,
      firstSeenAt: new Date(),
      lastSeenAt: new Date(),
      metadataHash: `hash-${id}`,
    },
  });
}

describe('matchDigest — runDigestOnce', () => {
  it('no-op when there are zero un-dispatched rows', async () => {
    const sent = await runDigestOnce({ send: sendMock as any });
    expect(sent).toBe(0);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('sends one digest per agent + stamps dispatchedAt on every row', async () => {
    const agent = await createUser(prisma, { email: 'digest-a@example.com' });
    await prisma.userNotificationPreference.create({
      data: {
        userId: agent.id,
        marketMatchEmailEnabled: true,
        minMatchScoreForExternalDelivery: 0,
      },
    });
    const lead = await createLead(prisma, { agentId: agent.id });
    const listingA = await seedListing({ price: 2_100_000 });
    const listingB = await seedListing({ price: 2_400_000 });

    await prisma.notificationDispatch.createMany({
      data: [
        { agentId: agent.id, leadId: lead.id, marketListingId: listingA.id, matchScore: 75 },
        { agentId: agent.id, leadId: lead.id, marketListingId: listingB.id, matchScore: 82 },
      ],
    });

    const sent = await runDigestOnce({ send: sendMock as any });
    expect(sent).toBe(1);
    expect(sendMock).toHaveBeenCalledTimes(1);

    // Both rows now carry dispatchedAt.
    const post = await prisma.notificationDispatch.findMany({
      where: { agentId: agent.id }, orderBy: { createdAt: 'asc' },
    });
    expect(post.every((r) => r.dispatchedAt !== null)).toBe(true);
  });

  it('agent with email channel disabled gets dispatchedAt stamped without a send', async () => {
    const agent = await createUser(prisma, { email: 'digest-disabled@example.com' });
    await prisma.userNotificationPreference.create({
      data: {
        userId: agent.id,
        marketMatchEmailEnabled: false, // opted out
      },
    });
    const lead = await createLead(prisma, { agentId: agent.id });
    const listing = await seedListing();
    await prisma.notificationDispatch.create({
      data: { agentId: agent.id, leadId: lead.id, marketListingId: listing.id, matchScore: 90 },
    });

    const sent = await runDigestOnce({ send: sendMock as any });
    expect(sent).toBe(0);
    expect(sendMock).not.toHaveBeenCalled();
    const row = await prisma.notificationDispatch.findFirst({ where: { agentId: agent.id } });
    expect(row?.dispatchedAt).not.toBeNull();
  });

  it('idempotent: a second run on the same data does NOT send again', async () => {
    const agent = await createUser(prisma, { email: 'digest-idem@example.com' });
    await prisma.userNotificationPreference.create({
      data: {
        userId: agent.id,
        marketMatchEmailEnabled: true,
        minMatchScoreForExternalDelivery: 0,
      },
    });
    const lead = await createLead(prisma, { agentId: agent.id });
    const listing = await seedListing();
    await prisma.notificationDispatch.create({
      data: { agentId: agent.id, leadId: lead.id, marketListingId: listing.id, matchScore: 70 },
    });

    const first = await runDigestOnce({ send: sendMock as any });
    expect(first).toBe(1);
    const second = await runDigestOnce({ send: sendMock as any });
    expect(second).toBe(0);
    expect(sendMock).toHaveBeenCalledTimes(1);
  });
});
