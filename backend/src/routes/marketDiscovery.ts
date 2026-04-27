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
import { getUser } from '../middleware/auth.js';

const listFiltersSchema = z.object({
  city:           z.string().trim().min(1).optional(),
  neighborhood:   z.string().trim().min(1).optional(),
  propertyType:   z.string().trim().min(1).optional(),
  kind:           z.enum(['forsale', 'rent']).optional(),
  posterType:     z.enum(['private', 'agency']).optional(),
  minPrice:       z.coerce.number().int().min(0).optional(),
  maxPrice:       z.coerce.number().int().min(0).optional(),
  minRooms:       z.coerce.number().min(0).optional(),
  maxRooms:       z.coerce.number().min(0).optional(),
  minSqm:         z.coerce.number().int().min(0).optional(),
  maxSqm:         z.coerce.number().int().min(0).optional(),
  status:         z.enum(['active', 'removed', 'unknown']).optional(),
  // ISO date or "24h" / "7d" / "30d" / "all" shorthand. Default 24h:
  // agents care about fresh deal flow, not 6-month-old listings.
  firstSeenAfter: z.union([z.coerce.date(), z.enum(['24h', '7d', '30d', 'all'])]).optional(),
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
    if (f.kind) where.kind = f.kind;
    if (f.posterType) where.posterType = f.posterType;
    if (f.status) where.status = f.status;
    // 24h is the default: an agent opens "מודעות חדשות בשוק" expecting
    // *new* deal flow, not yesterday's leftovers. Pass `firstSeenAfter=all`
    // to disable.
    const sinceShorthand: Record<string, number | null> = {
      '24h': 24 * 3600 * 1000,
      '7d':  7 * 24 * 3600 * 1000,
      '30d': 30 * 24 * 3600 * 1000,
      'all': null,
    };
    if (typeof f.firstSeenAfter === 'string') {
      const ms = sinceShorthand[f.firstSeenAfter];
      if (ms != null) where.firstSeenAt = { gte: new Date(Date.now() - ms) };
    } else if (f.firstSeenAfter instanceof Date) {
      where.firstSeenAt = { gte: f.firstSeenAfter };
    } else {
      // Default — last 24h.
      where.firstSeenAt = { gte: new Date(Date.now() - 24 * 3600 * 1000) };
    }
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
    const userId = getUser(req)!.id;
    const ids = rawItems.map((x) => x.id);
    const [myMatches, myDuplicates] = await Promise.all([
      ids.length
        ? prisma.marketListingLeadMatch.findMany({
            where: {
              agentUserId: userId,
              marketListingId: { in: ids },
              status: { not: 'dismissed' },
            },
            orderBy: { score: 'desc' },
            select: {
              id: true, score: true, reasonsJson: true,
              leadId: true, marketListingId: true,
              lead: { select: { name: true } },
            },
          })
        : Promise.resolve([] as any[]),
      // "Already in my CRM" — Property rows owned by this agent that
      // point back to one of these MarketListings. Drives the green
      // "כבר בנכסים שלי" outline + button state.
      ids.length
        ? prisma.property.findMany({
            where: {
              agentId: userId,
              marketListingId: { in: ids },
            },
            select: { id: true, marketListingId: true },
          })
        : Promise.resolve([] as any[]),
    ]);
    // Group ALL matches per listing (was: top-only). UI now shows lead
    // names ("מתאים לטל פוקס, הדר…") instead of a 55/100 score, so we
    // need every match — sorted score-desc, capped at 5 per listing
    // for sane payload size.
    const matchesByListing = new Map<string, typeof myMatches>();
    for (const m of myMatches) {
      const arr = matchesByListing.get(m.marketListingId) || [];
      arr.push(m);
      matchesByListing.set(m.marketListingId, arr);
    }
    const duplicateByListing = new Map<string, string>();
    for (const p of myDuplicates) {
      if (p.marketListingId) duplicateByListing.set(p.marketListingId, p.id);
    }
    const items = rawItems.map((x) => {
      const ms = matchesByListing.get(x.id) || [];
      const matches = ms.slice(0, 5).map((m) => ({
        id:       m.id,
        score:    m.score,
        reasons:  m.reasonsJson,
        leadId:   m.leadId,
        leadName: m.lead?.name || null,
      }));
      return {
        ...x,
        // topMatch retained for back-compat (FE pre-existing readers); points
        // at the highest-scoring match for the current agent.
        topMatch: matches[0] || null,
        matches,
        duplicatedByMe: duplicateByListing.get(x.id) || null,
      };
    });
    // Stable in-memory sort: matched listings first (by top score desc),
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
    const userId = getUser(req)?.id;
    if (!userId) return reply.code(401).send({ error: { message: 'Unauthorized' } });

    const listing = await prisma.marketListing.findUnique({ where: { id: req.params.id } });
    if (!listing) return reply.code(404).send({ error: { message: 'Listing not found' } });

    // Map the source's property type → CRM enum. The Property model
    // requires several fields that Yad2 listings don't expose
    // (owner / ownerPhone — by legal-safety design we never store
    // PII from the watcher). Use empty-string placeholders so the
    // create succeeds; the agent immediately lands on /edit and can
    // fill in real values. category mirrors the listing's kind:
    // 'rent' → RENT, anything else → SALE.
    const category =
      (listing as { kind?: string | null }).kind === 'rent' ? 'RENT' : 'SALE';
    const newProp = await prisma.property.create({
      data: {
        agentId: userId,
        assetClass: 'RESIDENTIAL',
        category,
        type: listing.propertyType ?? 'דירה',
        city: listing.city ?? '',
        street: listing.street ?? '',
        neighborhood: listing.neighborhood ?? null,
        rooms: listing.rooms ?? null,
        sqm: listing.sizeSqm ?? 0,
        floor: listing.floor ?? null,
        marketingPrice: listing.price ?? 0,
        owner: '',
        ownerPhone: '',
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
    const userId = getUser(req)!.id;
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
    const userId = getUser(req)!.id;
    const updated = await prisma.marketListingLeadMatch.updateMany({
      where: { id: req.params.id, agentUserId: userId },
      data: { status: 'viewed' },
    });
    if (updated.count === 0) return reply.code(404).send({ error: { message: 'Match not found' } });
    return reply.send({ ok: true });
  });

  // POST /api/market-discovery/matches/:id/dismiss
  app.post<{ Params: { id: string } }>('/matches/:id/dismiss', async (req, reply) => {
    const userId = getUser(req)!.id;
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
    const userId = getUser(req)!.id;
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
