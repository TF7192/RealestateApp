// Market Discovery routes — Phase 1.
//
// Read-only access to discovered MarketListing rows + lead-listing
// matches, plus a single mutation: "duplicate this discovered listing
// into my own properties". Strict ownership: every write uses
// `req.user.id`; client-supplied userId is never honored.
//
// See MARKET_DISCOVERY_PLAN.md for the full design.

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';

const listFiltersSchema = z.object({
  city:           z.string().trim().min(1).optional(),
  neighborhood:   z.string().trim().min(1).optional(),
  propertyType:   z.string().trim().min(1).optional(),
  minPrice:       z.coerce.number().int().min(0).optional(),
  maxPrice:       z.coerce.number().int().min(0).optional(),
  minRooms:       z.coerce.number().min(0).optional(),
  maxRooms:       z.coerce.number().min(0).optional(),
  minSqm:         z.coerce.number().int().min(0).optional(),
  maxSqm:         z.coerce.number().int().min(0).optional(),
  status:         z.enum(['active', 'removed', 'unknown']).optional(),
  firstSeenAfter: z.coerce.date().optional(),
  // Phase 2 sort options. Allowlisted enum so the orderBy mapping
  // below can't be tricked into ordering by a column that has no
  // index (every value here corresponds to a real index on
  // MarketListing — see schema.prisma).
  sort: z.enum([
    'firstSeenAt-desc',
    'price-asc',
    'price-desc',
    'pricePerSqm-asc',
  ]).default('firstSeenAt-desc'),
  // Pagination
  limit:          z.coerce.number().int().min(1).max(100).default(50),
  offset:         z.coerce.number().int().min(0).default(0),
});

function sortToOrderBy(sort: string): { [k: string]: 'asc' | 'desc' }[] {
  switch (sort) {
    case 'price-asc':       return [{ price: 'asc' },       { firstSeenAt: 'desc' }];
    case 'price-desc':      return [{ price: 'desc' },      { firstSeenAt: 'desc' }];
    case 'pricePerSqm-asc': return [{ pricePerSqm: 'asc' }, { firstSeenAt: 'desc' }];
    case 'firstSeenAt-desc':
    default:                return [{ firstSeenAt: 'desc' }];
  }
}

export const registerMarketDiscoveryRoutes: FastifyPluginAsync = async (app) => {
  // Auth gate — returns 401 (not 500) on missing/invalid cookies so the
  // FE error UI surfaces "session expired" rather than a generic crash.
  app.addHook('onRequest', app.requireAuth);

  // GET /api/market-discovery/listings — paginated list with filters
  app.get('/listings', async (req, reply) => {
    const parse = listFiltersSchema.safeParse(req.query);
    if (!parse.success) {
      return reply.code(400).send({ error: { message: 'Invalid filters', issues: parse.error.flatten() } });
    }
    const f = parse.data;
    const where: Record<string, unknown> = {};
    if (f.city) where.city = f.city;
    if (f.neighborhood) where.neighborhood = f.neighborhood;
    if (f.propertyType) where.propertyType = f.propertyType;
    if (f.status) where.status = f.status;
    if (f.firstSeenAfter) where.firstSeenAt = { gte: f.firstSeenAfter };
    if (f.minPrice != null || f.maxPrice != null) {
      where.price = {
        ...(f.minPrice != null ? { gte: f.minPrice } : {}),
        ...(f.maxPrice != null ? { lte: f.maxPrice } : {}),
      };
    }
    if (f.minRooms != null || f.maxRooms != null) {
      where.rooms = {
        ...(f.minRooms != null ? { gte: f.minRooms } : {}),
        ...(f.maxRooms != null ? { lte: f.maxRooms } : {}),
      };
    }
    if (f.minSqm != null || f.maxSqm != null) {
      where.sizeSqm = {
        ...(f.minSqm != null ? { gte: f.minSqm } : {}),
        ...(f.maxSqm != null ? { lte: f.maxSqm } : {}),
      };
    }

    const [rawItems, total] = await Promise.all([
      prisma.marketListing.findMany({
        where,
        orderBy: sortToOrderBy(f.sort) as any,
        skip: f.offset,
        take: f.limit,
      }),
      prisma.marketListing.count({ where }),
    ]);

    // Phase 2 polish — match-first sort. For each listing in this
    // page, check whether THIS agent has a non-dismissed
    // MarketListingLeadMatch row. If yes, attach `topMatch` (the
    // highest-scoring one) to the listing payload AND bubble matched
    // listings to the top of the page. Tie-broken by the user's
    // chosen sort (already applied at the DB level).
    //
    // Per-page (not catalog-wide) so pagination stays sane: page 1
    // surfaces the agent's hottest matches; deeper pages still serve
    // the chosen sort. With f.limit ≤ 100 the second query is cheap.
    const userId = (req as any).user?.id as string;
    const ids = rawItems.map((x) => x.id);
    const myMatches = ids.length
      ? await prisma.marketListingLeadMatch.findMany({
          where: {
            agentUserId: userId,
            marketListingId: { in: ids },
            status: { not: 'dismissed' },
          },
          orderBy: { score: 'desc' },
          select: {
            id: true, score: true, reasonsJson: true,
            leadId: true, marketListingId: true,
          },
        })
      : [];
    const matchByListing = new Map<string, typeof myMatches[number]>();
    for (const m of myMatches) {
      // findMany returns score-desc, so the first occurrence per
      // listing is the highest-scoring match for that agent.
      if (!matchByListing.has(m.marketListingId)) {
        matchByListing.set(m.marketListingId, m);
      }
    }
    const items = rawItems.map((x) => ({
      ...x,
      topMatch: matchByListing.get(x.id)
        ? {
            id:        matchByListing.get(x.id)!.id,
            score:     matchByListing.get(x.id)!.score,
            reasons:   matchByListing.get(x.id)!.reasonsJson,
            leadId:    matchByListing.get(x.id)!.leadId,
          }
        : null,
    }));
    // Stable in-memory sort: matched listings first (by score desc),
    // then everything else in the DB-side order. Array.prototype.sort
    // is stable in modern V8.
    items.sort((a, b) => {
      const sA = a.topMatch?.score ?? -1;
      const sB = b.topMatch?.score ?? -1;
      return sB - sA;
    });
    return reply.send({ items, total, limit: f.limit, offset: f.offset });
  });

  // GET /api/market-discovery/listings/:id
  app.get<{ Params: { id: string } }>('/listings/:id', async (req, reply) => {
    const item = await prisma.marketListing.findUnique({ where: { id: req.params.id } });
    if (!item) return reply.code(404).send({ error: { message: 'Not found' } });
    return reply.send(item);
  });

  // POST /api/market-discovery/listings/:id/duplicate
  // Duplicates a discovered listing into the authenticated agent's
  // properties. The new Property's agentId is set from req.user.id —
  // never from the request body.
  app.post<{ Params: { id: string } }>('/listings/:id/duplicate', async (req, reply) => {
    const userId = (req as any).user?.id as string | undefined;
    if (!userId) return reply.code(401).send({ error: { message: 'Unauthorized' } });

    const listing = await prisma.marketListing.findUnique({ where: { id: req.params.id } });
    if (!listing) return reply.code(404).send({ error: { message: 'Listing not found' } });

    // Map the source's property type → CRM enum. Phase 1 keeps this
    // intentionally minimal: residential sale for Yad2 forsale items.
    // Phase 2 will widen with rent + commercial mappings.
    const newProp = await prisma.property.create({
      data: {
        agentId: userId,
        assetClass: 'RESIDENTIAL',
        category: 'SALE',
        type: listing.propertyType ?? null,
        city: listing.city ?? '',
        street: listing.street ?? null,
        neighborhood: listing.neighborhood ?? null,
        rooms: listing.rooms ?? null,
        size: listing.sizeSqm ?? null,
        floor: listing.floor ?? null,
        marketingPrice: listing.price ?? null,
        status: 'ACTIVE',
        marketListingId: listing.id,
      } as any,
    });

    // If this duplication came from a lead-match, mark the match as
    // `duplicated` so it stops surfacing as a new match.
    const matchId = (req.body as { matchId?: string } | undefined)?.matchId;
    if (matchId) {
      await prisma.marketListingLeadMatch.updateMany({
        where: { id: matchId, agentUserId: userId },
        data: { status: 'duplicated' },
      });
    }

    return reply.send({ propertyId: newProp.id });
  });

  // GET /api/market-discovery/matches — agent-scoped
  app.get('/matches', async (req, reply) => {
    const userId = (req as any).user?.id as string;
    const items = await prisma.marketListingLeadMatch.findMany({
      where: { agentUserId: userId },
      include: { marketListing: true, lead: { select: { id: true, name: true } } },
      orderBy: [{ score: 'desc' }, { createdAt: 'desc' }],
      take: 100,
    });
    return reply.send({ items });
  });

  // POST /api/market-discovery/matches/:id/view
  app.post<{ Params: { id: string } }>('/matches/:id/view', async (req, reply) => {
    const userId = (req as any).user?.id as string;
    const updated = await prisma.marketListingLeadMatch.updateMany({
      where: { id: req.params.id, agentUserId: userId },
      data: { status: 'viewed' },
    });
    if (updated.count === 0) return reply.code(404).send({ error: { message: 'Match not found' } });
    return reply.send({ ok: true });
  });

  // POST /api/market-discovery/matches/:id/dismiss
  app.post<{ Params: { id: string } }>('/matches/:id/dismiss', async (req, reply) => {
    const userId = (req as any).user?.id as string;
    const updated = await prisma.marketListingLeadMatch.updateMany({
      where: { id: req.params.id, agentUserId: userId },
      data: { status: 'dismissed' },
    });
    if (updated.count === 0) return reply.code(404).send({ error: { message: 'Match not found' } });
    return reply.send({ ok: true });
  });

  // GET /api/market-discovery/last-scan — Phase 4 observability.
  // Returns the latest successful MarketWatcherRun summary so the
  // /market-discovery page can show "נסרק לפני X דקות". All agents
  // can read this — the watcher's run metadata isn't sensitive.
  app.get('/last-scan', async (_req, reply) => {
    const last = await prisma.marketWatcherRun.findFirst({
      where: { status: 'success' },
      orderBy: { startedAt: 'desc' },
      select: {
        id: true, startedAt: true, finishedAt: true, source: true,
        listingsSeen: true, listingsCreated: true, listingsUpdated: true,
        matchesCreated: true, notificationsCreated: true,
      },
    });
    return reply.send({ run: last });
  });

  // GET /api/market-discovery/match/:id — Phase 2 match deep-link.
  // The Notification row's link is /market-discovery?match=:id. The
  // page calls this endpoint to fetch the match + its listing + the
  // associated lead, and to mark the match as `viewed` in one shot.
  app.get<{ Params: { id: string } }>('/match/:id', async (req, reply) => {
    const userId = (req as any).user?.id as string;
    const match = await prisma.marketListingLeadMatch.findFirst({
      where: { id: req.params.id, agentUserId: userId },
      include: {
        marketListing: true,
        lead: { select: { id: true, name: true, city: true } },
      },
    });
    if (!match) return reply.code(404).send({ error: { message: 'Match not found' } });
    // Idempotent state transition: new → viewed. Doesn't downgrade
    // a `dismissed` or `duplicated` match.
    if (match.status === 'new') {
      await prisma.marketListingLeadMatch.update({
        where: { id: match.id },
        data: { status: 'viewed' },
      });
    }
    return reply.send({ match });
  });
};
