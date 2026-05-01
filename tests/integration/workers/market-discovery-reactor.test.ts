// Integration test for the market-discovery reactor
// (backend/src/workers/marketDiscoveryReactor.ts).
//
// Each tick:
//   1. Auto-seeds LeadSearchProfile for orphan leads (idempotent).
//   2. Picks unprocessed MarketListing rows (reactedAt = NULL).
//   3. Scores each against every LeadSearchProfile via lib/marketDiscoveryMatching.
//   4. For matches above MIN_SCORE: idempotent insert into
//      MarketListingLeadMatch + (per agent + listing) notification +
//      pending email row when posterType === 'private' and prefs allow.
//   5. Stamps reactedAt on the listing.
//
// We test the contract through the DB. The matching scorer has its
// own unit tests; here we just need real listings + profiles that
// pass MIN_SCORE so we can assert the side effects.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../setup/integration.setup.js';
import { createUser } from '../../factories/user.factory.js';
import { createLead } from '../../factories/lead.factory.js';
import { drainOnce } from '../../../backend/src/workers/marketDiscoveryReactor.js';

beforeAll(() => {
  // Loosen MIN_SCORE so a baseline city+price+rooms hit fires.
  process.env.MARKET_MATCH_MIN_SCORE = '20';
});
afterAll(() => {
  delete process.env.MARKET_MATCH_MIN_SCORE;
});

async function makeListing(overrides: Partial<{
  city: string; rooms: number; sizeSqm: number; price: number; posterType: 'private' | 'agency';
}> = {}) {
  const id = `mdr-${Math.random().toString(36).slice(2, 10)}`;
  return prisma.marketListing.create({
    data: {
      id,
      source: 'yad2',
      externalListingId: id,
      originalUrl: `https://www.yad2.co.il/realestate/item/${id}`,
      city: overrides.city ?? 'הרצליה',
      street: 'בן גוריון',
      rooms: overrides.rooms ?? 4,
      sizeSqm: overrides.sizeSqm ?? 95,
      price: overrides.price ?? 2_500_000,
      posterType: overrides.posterType ?? 'private',
      firstSeenAt: new Date(),
      lastSeenAt: new Date(),
      metadataHash: `hash-${id}`,
      reactedAt: null,
    },
  });
}

describe('marketDiscoveryReactor — drainOnce', () => {
  it('no-op when no MarketListing rows are pending', async () => {
    // Drain whatever the previous tests left, then assert a clean tick.
    await drainOnce();
    await drainOnce(); // second tick should be a no-op now.
    // (The function returns void; this just shouldn't throw.)
  });

  it('matches a private listing to an aligned LeadSearchProfile + creates Match + Notification', async () => {
    const agent = await createUser(prisma);
    const lead = await createLead(prisma, {
      agentId: agent.id,
      city: 'הרצליה',
      status: 'WARM',
    });
    await prisma.leadSearchProfile.create({
      data: {
        leadId: lead.id,
        cities: ['הרצליה'],
        minRoom: 3,
        maxRoom: 5,
        minPrice: 2_000_000,
        maxPrice: 3_000_000,
      },
    });
    const listing = await makeListing({
      city: 'הרצליה',
      rooms: 4,
      price: 2_500_000,
      posterType: 'private',
    });

    await drainOnce();

    // The listing is now reacted-on.
    const after = await prisma.marketListing.findUnique({ where: { id: listing.id } });
    expect(after?.reactedAt).not.toBeNull();

    // A MarketListingLeadMatch row exists for the (listing, lead) pair.
    const matches = await prisma.marketListingLeadMatch.findMany({
      where: { marketListingId: listing.id, leadId: lead.id },
    });
    expect(matches.length).toBe(1);
    expect(matches[0].score).toBeGreaterThanOrEqual(20);
    expect(matches[0].agentUserId).toBe(agent.id);

    // A Notification row exists for the agent (private posterType
    // means the reactor emits a notification, not just a match row).
    const notifs = await prisma.notification.findMany({
      where: { userId: agent.id },
    });
    expect(notifs.length).toBeGreaterThan(0);
  });

  it('does NOT emit a notification for posterType=agency listings (private-only filter)', async () => {
    const agent = await createUser(prisma);
    const lead = await createLead(prisma, { agentId: agent.id, city: 'תל אביב', status: 'WARM' });
    await prisma.leadSearchProfile.create({
      data: {
        leadId: lead.id,
        cities: ['תל אביב'],
        minRoom: 3, maxRoom: 5,
        minPrice: 2_000_000, maxPrice: 3_500_000,
      },
    });
    const listing = await makeListing({
      city: 'תל אביב',
      rooms: 4,
      price: 2_500_000,
      posterType: 'agency', // filter ON for this branch
    });

    await drainOnce();

    const after = await prisma.marketListing.findUnique({ where: { id: listing.id } });
    expect(after?.reactedAt).not.toBeNull();
    // Match row still created (so /market-discovery shows it), but
    // no Notification fired.
    const matches = await prisma.marketListingLeadMatch.findMany({
      where: { marketListingId: listing.id },
    });
    expect(matches.length).toBe(1);
    const notifsForListing = await prisma.notification.findMany({
      where: { userId: agent.id, type: 'market_listing_match' },
    });
    // The agency listing didn't add a notification beyond what the
    // earlier private test already emitted. We can't easily delta this
    // across tests — assert that none of the new notifications point
    // at this specific listing's id.
    for (const n of notifsForListing) {
      const data = n.data as { marketListingId?: string } | null;
      expect(data?.marketListingId).not.toBe(listing.id);
    }
  });

  it('idempotent — running drainOnce a second time on the same listing does NOT duplicate matches', async () => {
    const agent = await createUser(prisma);
    const lead = await createLead(prisma, { agentId: agent.id, city: 'רעננה', status: 'WARM' });
    await prisma.leadSearchProfile.create({
      data: {
        leadId: lead.id,
        cities: ['רעננה'],
        minRoom: 3, maxRoom: 5,
        minPrice: 2_000_000, maxPrice: 3_000_000,
      },
    });
    const listing = await makeListing({
      city: 'רעננה', rooms: 4, price: 2_500_000, posterType: 'private',
    });

    await drainOnce();
    // The listing's reactedAt is now non-null, so the second drain
    // skips it via `where: { reactedAt: null }`. Force a re-evaluate
    // to exercise the unique-constraint path inside the matcher.
    await prisma.marketListing.update({
      where: { id: listing.id },
      data: { reactedAt: null },
    });
    await drainOnce();

    const matches = await prisma.marketListingLeadMatch.findMany({
      where: { marketListingId: listing.id, leadId: lead.id },
    });
    expect(matches.length).toBe(1);
  });
});
