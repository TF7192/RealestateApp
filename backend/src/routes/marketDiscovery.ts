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
import { normalizeCity } from '../lib/addressNormalize.js';

const listFiltersSchema = z.object({
  city:           z.string().trim().min(1).optional(),
  neighborhood:   z.string().trim().min(1).optional(),
  propertyType:   z.string().trim().min(1).optional(),
  kind:           z.enum(['forsale', 'rent', 'commercial']).optional(),
  posterType:     z.enum(['private', 'agency']).optional(),
  minPrice:       z.coerce.number().int().min(0).optional(),
  maxPrice:       z.coerce.number().int().min(0).optional(),
  minRooms:       z.coerce.number().min(0).optional(),
  maxRooms:       z.coerce.number().min(0).optional(),
  minSqm:         z.coerce.number().int().min(0).optional(),
  maxSqm:         z.coerce.number().int().min(0).optional(),
  status:         z.enum(['active', 'removed', 'unknown']).optional(),
  // ISO date or "24h" / "3d" / "7d" / "30d" / "all" shorthand. Default
  // is 3 days — agents return to this page across a workday and want
  // continuity, but not 6-month-old listings.
  firstSeenAfter: z.union([z.coerce.date(), z.enum(['24h', '3d', '7d', '30d', 'all'])]).optional(),
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
  // 2026-06-02 — tag filter. Comma-separated list of MarketTag.id; OR
  // semantics (a row matches if it carries ANY of the listed tags).
  // Capped at 20 to bound the IN-list size.
  tagIds:         z.string().trim().min(1).optional(),
  // Pagination
  limit:          z.coerce.number().int().min(1).max(100).default(50),
  offset:         z.coerce.number().int().min(0).default(0),
});

// Compute "midnight (00:00:00.000) in Asia/Jerusalem", optionally
// `daysAgo` calendar days ago (1 = yesterday's midnight). DST-aware:
// derives the IL offset from `Intl.DateTimeFormat` for `now`, then
// applies the same offset when constructing the IL-midnight instant —
// good enough for the spring-forward / fall-back gap because the
// midnight boundary itself is stable (the gap happens at 02:00).
function ilMidnight(now: Date, daysAgo: number): Date {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(now).map((p) => [p.type, p.value]),
  ) as Record<string, string>;
  const y = Number(parts.year);
  const m = Number(parts.month);
  const d = Number(parts.day);
  const h = parts.hour === '24' ? 0 : Number(parts.hour);
  const mn = Number(parts.minute);
  const s = Number(parts.second);
  // The offset between the IL wall-clock representation of `now` and
  // the actual UTC instant. Israel is UTC+2 (winter) or UTC+3 (summer).
  const offsetMs = Date.UTC(y, m - 1, d, h, mn, s) - now.getTime();
  // IL midnight on the requested calendar day, expressed as a UTC instant.
  return new Date(Date.UTC(y, m - 1, d - daysAgo, 0, 0, 0) - offsetMs);
}

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
    // Per-agent specialty-city filter. When the agent has a non-empty
    // `specialtyCities` list, restrict the feed to listings whose city
    // matches one of those entries — canonicalised via `normalizeCity`
    // both sides so "תל אביב" picks up rows stored as "תל אביב יפו".
    // Empty list ⇒ legacy behavior (no extra filter), so existing
    // users see no regression.
    //
    // Skipped when the caller already passed an explicit `?city=` —
    // an explicit filter beats the global preference, and we don't
    // want to silently 0-out the request.
    const userId = getUser(req)!.id;
    if (!f.city) {
      const me = await prisma.user.findUnique({
        where: { id: userId },
        select: { specialtyCities: true },
      });
      const list = me?.specialtyCities ?? [];
      if (list.length > 0) {
        const canon = list.map((c) => normalizeCity(c)?.value ?? c);
        where.city = { in: canon };
      }
    }
    // Substring match (case-insensitive) for free-text fields — agents
    // shouldn't have to type the canonical Yad2 city name ("תל אביב יפו")
    // to match; "תל אביב" should be enough. Same for neighborhood and
    // propertyType. Backend stays Postgres-side via Prisma's `contains`.
    if (f.city)         where.city         = { contains: f.city,         mode: 'insensitive' };
    if (f.neighborhood) where.neighborhood = { contains: f.neighborhood, mode: 'insensitive' };
    if (f.propertyType) where.propertyType = { contains: f.propertyType, mode: 'insensitive' };
    if (f.kind) where.kind = f.kind;
    if (f.posterType) where.posterType = f.posterType;
    if (f.status) where.status = f.status;
    // 3d is the default: agents revisit this page across a workday and
    // expect continuity (a hot listing seen at 9am should still be on
    // the list at 4pm). Pass `firstSeenAfter=all` to disable.
    const sinceShorthand: Record<string, number | null> = {
      '24h': 24 * 3600 * 1000,
      '3d':  3 * 24 * 3600 * 1000,
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
      // Default — last 3 days.
      where.firstSeenAt = { gte: new Date(Date.now() - 3 * 24 * 3600 * 1000) };
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
    // 2026-06-02 — tag filter (OR semantics). Resolve the supplied ids
    // to THIS agent's tags only; ids belonging to other agents are
    // silently dropped (rather than 400'd) so a stale chip in another
    // tab doesn't blow up the feed.
    let tagFilterIds: string[] | null = null;
    if (f.tagIds) {
      const requested = f.tagIds.split(',').map((s) => s.trim()).filter(Boolean);
      const capped = requested.slice(0, 20);
      if (capped.length > 0) {
        const owned = await prisma.marketTag.findMany({
          where: { id: { in: capped }, agentId: userId },
          select: { id: true },
        });
        tagFilterIds = owned.map((t) => t.id);
      }
    }
    if (tagFilterIds) {
      // If the agent passed tag ids but NONE belong to them, force an
      // empty result rather than dropping the filter entirely.
      if (tagFilterIds.length === 0) {
        return reply.send({ items: [], total: 0, limit: f.limit, offset: f.offset });
      }
      where.tagAssignments = { some: { tagId: { in: tagFilterIds } } };
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
    // (`userId` is captured above, before the where-clause is built.)
    const ids = rawItems.map((x) => x.id);
    const [myMatches, myDuplicates, myTagAssignments] = await Promise.all([
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
              lead: { select: { id: true, name: true, phone: true } },
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
      // 2026-06-02 — hydrate THIS agent's tag assignments per listing.
      // Single covering query; tag-id list is attached to each row as
      // `assignedTagIds` so the FE can render the inline chips without
      // a second round-trip.
      ids.length
        ? prisma.marketTagAssignment.findMany({
            where: {
              marketListingId: { in: ids },
              tag: { is: { agentId: userId } },
            },
            select: { tagId: true, marketListingId: true },
          })
        : Promise.resolve([] as Array<{ tagId: string; marketListingId: string }>),
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
    const tagsByListing = new Map<string, string[]>();
    for (const a of myTagAssignments) {
      const arr = tagsByListing.get(a.marketListingId) || [];
      arr.push(a.tagId);
      tagsByListing.set(a.marketListingId, arr);
    }
    const items = rawItems.map((x) => {
      const ms = matchesByListing.get(x.id) || [];
      const matches = ms.slice(0, 5).map((m) => ({
        id:        m.id,
        score:     m.score,
        reasons:   m.reasonsJson,
        leadId:    m.leadId,
        leadName:  m.lead?.name || null,
        leadPhone: m.lead?.phone || null,
      }));
      return {
        ...x,
        // topMatch retained for back-compat (FE pre-existing readers); points
        // at the highest-scoring match for the current agent.
        topMatch: matches[0] || null,
        matches,
        duplicatedByMe: duplicateByListing.get(x.id) || null,
        assignedTagIds: tagsByListing.get(x.id) || [],
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
    // 'rent' → RENT, 'commercial' → SALE (commercial covers both
    // sale + rent on Yad2; agent overrides on edit), default SALE.
    const listingKind = (listing as { kind?: string | null }).kind;
    const category = listingKind === 'rent' ? 'RENT' : 'SALE';
    // 'commercial' listings span offices/stores/warehouses → tag
    // the CRM row as COMMERCIAL so it lands in the right filter on
    // /properties. forsale/rent stay RESIDENTIAL by default.
    const assetClass = listingKind === 'commercial' ? 'COMMERCIAL' : 'RESIDENTIAL';
    const newProp = await prisma.property.create({
      data: {
        agentId: userId,
        assetClass,
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

  // GET /api/market-discovery/pulse — Phase 5 dashboard tiles.
  // Cheap aggregate counts for the redesigned page header. Agent-scoped
  // where relevant (matchesForMe). Each query hits an existing index —
  // no new schema work needed. 60s in-memory cache is acceptable; the
  // upstream watcher only runs hourly, so freshness < 1min is overkill.
  app.get('/pulse', async (req, reply) => {
    const userId = getUser(req)!.id;
    const now = new Date();
    const dayMs = 24 * 3600 * 1000;
    // "Today" + "yesterday" boundaries — Asia/Jerusalem since-midnight,
    // not rolling-24h. Agents read "חדש היום" as "since I went to bed",
    // not "in the last day". DST-aware via Intl.DateTimeFormat.
    const startOfTodayIL = ilMidnight(now, 0);
    const startOfYesterdayIL = ilMidnight(now, 1);
    // Other windows stay rolling — privatePct is a 7d trend, not a
    // calendar-week metric, and the matches feed is naturally 3d-rolling.
    const since3d = new Date(now.getTime() - 3 * dayMs);
    const since7d = new Date(now.getTime() - 7 * dayMs);

    // Honor the agent's specialty-cities filter when scoping the pulse —
    // the dashboard tiles should reflect the same catalogue the user
    // sees in the row list, not the cross-country firehose.
    const me = await prisma.user.findUnique({
      where: { id: userId },
      select: { specialtyCities: true },
    });
    const specialty = (me?.specialtyCities ?? [])
      .map((c) => normalizeCity(c)?.value ?? c)
      .filter(Boolean);
    const cityScope = specialty.length > 0 ? { city: { in: specialty } } : {};

    const [
      newLast24,
      newPrev24,
      matchedListingIds,
      privateLast7,
      totalLast7,
      neighborhoodGroups,
    ] = await Promise.all([
      prisma.marketListing.count({ where: { ...cityScope, firstSeenAt: { gte: startOfTodayIL } } }),
      prisma.marketListing.count({
        where: { ...cityScope, firstSeenAt: { gte: startOfYesterdayIL, lt: startOfTodayIL } },
      }),
      // matchesForMe: count DISTINCT listings (not match rows) so the
      // tile count agrees with the number of cards the agent will see
      // when they click through to "matchedOnly". Also gated by the
      // agent's specialtyCities — the other 3 KPIs already respect
      // that scope, so a divergent matchesForMe number was confusing.
      prisma.marketListingLeadMatch.findMany({
        where: {
          agentUserId: userId,
          status: { not: 'dismissed' },
          createdAt: { gte: since3d },
          ...(specialty.length > 0
            ? { marketListing: { is: { city: { in: specialty } } } }
            : {}),
        },
        select: { marketListingId: true },
        distinct: ['marketListingId'],
      }),
      prisma.marketListing.count({
        where: { ...cityScope, posterType: 'private', firstSeenAt: { gte: since7d } },
      }),
      prisma.marketListing.count({ where: { ...cityScope, firstSeenAt: { gte: since7d } } }),
      // Hottest neighborhoods by raw listing count in last 3 days.
      prisma.marketListing.groupBy({
        by: ['neighborhood', 'city'],
        where: {
          ...cityScope,
          firstSeenAt: { gte: since3d },
          neighborhood: { not: null },
        },
        _count: { _all: true },
        orderBy: { _count: { neighborhood: 'desc' } },
        take: 5,
      }),
    ]);
    const newDeltaPct = newPrev24 > 0
      ? Math.round(((newLast24 - newPrev24) / newPrev24) * 100)
      : null;
    const privatePct = totalLast7 > 0 ? Math.round((privateLast7 / totalLast7) * 100) : null;

    return reply.send({
      // Since-midnight in Asia/Jerusalem. The FE labels this "חדש היום"
      // and the math finally agrees with the wall-clock the agent reads.
      newToday:     { count: newLast24, deltaPct: newDeltaPct },
      matchesForMe: { count: matchedListingIds.length },
      privatePct:   { value: privatePct },
      hotNeighborhoods: neighborhoodGroups.map((g) => ({
        neighborhood: g.neighborhood,
        city: g.city,
        count: g._count._all,
      })),
    });
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
        lead: { select: { id: true, name: true, phone: true, city: true } },
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
