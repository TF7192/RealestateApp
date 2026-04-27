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
import { requireUser } from '../middleware/auth.js';

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
  // Pagination
  limit:          z.coerce.number().int().min(1).max(100).default(50),
  offset:         z.coerce.number().int().min(0).default(0),
});

export const registerMarketDiscoveryRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', requireUser);

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

    const [items, total] = await Promise.all([
      prisma.marketListing.findMany({
        where,
        orderBy: [{ firstSeenAt: 'desc' }],
        skip: f.offset,
        take: f.limit,
      }),
      prisma.marketListing.count({ where }),
    ]);
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
};
