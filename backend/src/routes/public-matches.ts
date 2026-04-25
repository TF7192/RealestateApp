// Sprint 10 — "התאמות פומביות" / Public matches.
//
// Cross-agent shared pool: any agent can opt a property into the pool;
// any other agent can browse the pool and clone a property into their
// own list. Source gets a notification + an attribution list of who
// cloned what. The pool is ranked per-viewer by how many of *their*
// leads match each pool property — the user's whole pitch for the
// feature is "don't make me read every listing, show me the ones my
// buyers want first".

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireUser } from '../middleware/auth.js';
import { logActivity } from '../lib/activity.js';
import { evaluateLeadProperty } from '../lib/matching.js';

// Publish note is the short blurb the publishing agent can attach —
// shows up in the pool card header, so we cap it tight.
const publishSchema = z.object({
  note: z.string().trim().max(280).nullable().optional(),
});

// Duplicate-body overrides — all optional. The default is "clone as-is
// into the viewer's list"; an agent might want to bump the price or
// rename the street before publishing on their own channels, so we
// accept the same normalised fields that a manual PATCH would.
const duplicateSchema = z.object({
  marketingPrice: z.number().int().nonnegative().nullable().optional(),
  brokerNotes:    z.string().max(4000).nullable().optional(),
  owner:          z.string().trim().min(1).max(120).nullable().optional(),
  ownerPhone:     z.string().trim().min(1).max(30).nullable().optional(),
});

type LeadWithProfiles = Awaited<
  ReturnType<typeof prisma.lead.findMany>
> extends (infer T)[] ? T : never;

// Slug helper — matches the existing property-slug conventions so the
// cloned row stays searchable. Falls back to "duplicate-<n>" when the
// source slug collides.
async function pickUniqueSlug(agentId: string, base: string): Promise<string> {
  const clean = (base || 'נכס').trim().replace(/\s+/g, '-').toLowerCase();
  let candidate = clean;
  let i = 0;
  while (true) {
    const collision = await prisma.property.findFirst({
      where: { agentId, slug: candidate },
      select: { id: true },
    });
    if (!collision) return candidate;
    i += 1;
    candidate = `${clean}-${i}`;
    if (i > 99) return `${clean}-${Date.now()}`;
  }
}

// Property shape the frontend wants for pool cards. Deliberately narrow
// — we don't leak owner PII or exclusivity expiry from the source
// agent's desk; attribution stays on agent level only.
function serializePoolProperty(
  p: any,
  matchCount: number,
  topMatches: Array<{ id: string; name: string | null }>,
  viewerDuplicatedAt: Date | null,
  viewerSeenAt: Date | null,
) {
  return {
    id: p.id,
    street: p.street,
    city: p.city,
    neighborhood: p.neighborhood,
    rooms: p.rooms,
    sqm: p.sqm,
    floor: p.floor,
    type: p.type,
    assetClass: p.assetClass,
    category: p.category,
    marketingPrice: p.marketingPrice,
    condition: p.condition,
    masterBedroom: p.masterBedroom,
    bathrooms: p.bathrooms,
    toilets: p.toilets,
    furnished: p.furnished,
    petFriendly: p.petFriendly,
    notes: p.notes,
    publicMatchNote: p.publicMatchNote,
    publicMatchAt: p.publicMatchAt,
    image: p.images?.[0]?.url || null,
    imagesCount: p.images?.length || 0,
    owner: {
      id: p.agent.id,
      displayName: p.agent.displayName,
      avatarUrl: p.agent.avatarUrl,
      officeName: p.agent.office?.name ?? null,
    },
    matchCount,
    topMatches,
    copies: p._count?.publicMatchCopies || 0,
    // Sprint 10 — mark rows the viewer already cloned so the pool
    // grid can show "כבר שוכפל" + a green ring instead of the
    // normal "שכפל" CTA. Value is the ISO timestamp of the clone.
    viewerDuplicatedAt: viewerDuplicatedAt ? viewerDuplicatedAt.toISOString() : null,
    // Sprint 10 — per-viewer "seen" flag. Set when the viewer clicks
    // "סמן כנצפה". Excluded from the topbar badge count, but the row
    // still renders in the pool with a "מסומן כנצפה" chip + an
    // "סמן כלא נצפה" toggle so the agent can flip back.
    viewerSeenAt: viewerSeenAt ? viewerSeenAt.toISOString() : null,
  };
}

export const registerPublicMatchRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/public-matches — the pool, ranked by match-count for the
  // viewer's own leads. Excludes properties the viewer already owns.
  app.get('/', { onRequest: [app.requireAgent] }, async (req) => {
    const u = requireUser(req);

    const [pool, leads, myClones, mySeen] = await Promise.all([
      prisma.property.findMany({
        where: {
          isPublicMatch: true,
          NOT: { agentId: u.id },
          // Skip soft-deleted rows if the schema ever adds one; today
          // there is no `deletedAt` on Property so this is a no-op.
        },
        orderBy: { publicMatchAt: 'desc' },
        include: {
          images: { orderBy: { sortOrder: 'asc' }, take: 1 },
          agent: {
            select: {
              id: true, displayName: true, avatarUrl: true,
              office: { select: { name: true } },
            },
          },
          _count: { select: { publicMatchCopies: true } },
        },
      }),
      prisma.lead.findMany({
        // `status` is the thermal rating (HOT/WARM/COLD). `customerStatus`
        // is the lifecycle flag; skip terminal states so closed-out
        // customers don't inflate the match count.
        where: {
          agentId: u.id,
          OR: [
            { customerStatus: null },
            { customerStatus: { notIn: ['CANCELLED', 'BOUGHT', 'RENTED'] } },
          ],
        },
        include: { searchProfiles: true },
      }),
      // Every property the viewer already cloned from the pool —
      // keyed on sourceId → oldest createdAt so the pool grid can
      // surface a "כבר שוכפל" chip for rows they've seen.
      prisma.property.findMany({
        where: { agentId: u.id, publicMatchSourceId: { not: null } },
        select: { publicMatchSourceId: true, createdAt: true },
      }),
      // Viewer's per-row "seen" state — used to mute the badge count
      // and to render "מסומן כנצפה" chips on the cards.
      prisma.publicMatchSeen.findMany({
        where: { viewerId: u.id },
        select: { propertyId: true, seenAt: true },
      }),
    ]);

    const dupedBySource = new Map<string, Date>();
    for (const c of myClones) {
      if (!c.publicMatchSourceId) continue;
      const prev = dupedBySource.get(c.publicMatchSourceId);
      if (!prev || c.createdAt < prev) dupedBySource.set(c.publicMatchSourceId, c.createdAt);
    }
    const seenByProperty = new Map<string, Date>(
      mySeen.map((s) => [s.propertyId, s.seenAt]),
    );

    const scored = pool.map((p) => {
      const matches: Array<{ id: string; name: string | null; score: number }> = [];
      for (const lead of leads) {
        const sig = evaluateLeadProperty(lead as any, p as any);
        if (sig.matches) {
          matches.push({ id: lead.id, name: (lead as any).name ?? null, score: sig.score });
        }
      }
      matches.sort((a, b) => b.score - a.score);
      const top = matches.slice(0, 3).map(({ id, name }) => ({ id, name }));
      return serializePoolProperty(
        p,
        matches.length,
        top,
        dupedBySource.get(p.id) ?? null,
        seenByProperty.get(p.id) ?? null,
      );
    });

    // Highest match-count first, then most-recently published. An item
    // with zero matches still appears — the agent may want to browse
    // even outside their book — but it sinks to the bottom.
    scored.sort((a, b) => {
      if (b.matchCount !== a.matchCount) return b.matchCount - a.matchCount;
      const at = new Date(b.publicMatchAt ?? 0).getTime();
      const bt = new Date(a.publicMatchAt ?? 0).getTime();
      return at - bt;
    });

    return { items: scored };
  });

  // GET /api/public-matches/count — badge count. Counts pool properties
  // where the viewer has at least one matching lead. Cheap enough to
  // poll on every top-bar render; avoid the serialisation roundtrip of
  // the full list endpoint above.
  app.get('/count', { onRequest: [app.requireAgent] }, async (req) => {
    const u = requireUser(req);
    const [pool, leads, mySeen] = await Promise.all([
      prisma.property.findMany({
        where: { isPublicMatch: true, NOT: { agentId: u.id } },
        select: {
          id: true, assetClass: true, category: true, type: true,
          city: true, neighborhood: true, rooms: true, marketingPrice: true,
        },
      }),
      prisma.lead.findMany({
        // `status` is the thermal rating (HOT/WARM/COLD) — every thermal
        // state is still a viable match. `customerStatus` is the separate
        // lifecycle flag; skip the converted/disqualified terminal ones.
        where: {
          agentId: u.id,
          OR: [
            { customerStatus: null },
            { customerStatus: { notIn: ['CANCELLED', 'BOUGHT', 'RENTED'] } },
          ],
        },
        include: { searchProfiles: true },
      }),
      // Rows the viewer has already triaged — excluded from the
      // badge count so the chip doesn't keep nagging about pool
      // entries they've explicitly dismissed.
      prisma.publicMatchSeen.findMany({
        where: { viewerId: u.id },
        select: { propertyId: true },
      }),
    ]);
    const seenIds = new Set(mySeen.map((s) => s.propertyId));
    let count = 0;
    for (const p of pool) {
      if (seenIds.has(p.id)) continue;
      for (const l of leads) {
        if (evaluateLeadProperty(l as any, p as any).matches) { count += 1; break; }
      }
    }
    return { count, poolSize: pool.length };
  });

  // POST /api/public-matches/publish/:propertyId — opt-in.
  app.post('/publish/:propertyId', { onRequest: [app.requireAgent] }, async (req, reply) => {
    const { propertyId } = req.params as { propertyId: string };
    const u = requireUser(req);
    const body = publishSchema.parse(req.body ?? {});
    const existing = await prisma.property.findFirst({
      where: { id: propertyId, agentId: u.id },
    });
    if (!existing) return reply.code(404).send({ error: { message: 'Property not found' } });
    const updated = await prisma.property.update({
      where: { id: propertyId },
      data: {
        isPublicMatch: true,
        publicMatchAt: new Date(),
        publicMatchNote: body.note ?? null,
      },
    });
    await logActivity({
      agentId: u.id, actorId: u.id,
      verb: 'published', entityType: 'Property', entityId: updated.id,
      summary: `הוסיף להתאמות פומביות: ${updated.street}, ${updated.city}`,
    });
    return { property: updated };
  });

  // DELETE /api/public-matches/publish/:propertyId — opt-out. Keeps the
  // `publicMatchCopies` list intact (historical attribution), just
  // flips the flag so the row no longer renders in the pool.
  app.delete('/publish/:propertyId', { onRequest: [app.requireAgent] }, async (req, reply) => {
    const { propertyId } = req.params as { propertyId: string };
    const u = requireUser(req);
    const existing = await prisma.property.findFirst({
      where: { id: propertyId, agentId: u.id },
    });
    if (!existing) return reply.code(404).send({ error: { message: 'Property not found' } });
    const updated = await prisma.property.update({
      where: { id: propertyId },
      data: { isPublicMatch: false, publicMatchAt: null, publicMatchNote: null },
    });
    await logActivity({
      agentId: u.id, actorId: u.id,
      verb: 'unpublished', entityType: 'Property', entityId: updated.id,
      summary: `הסיר מהתאמות פומביות: ${updated.street}, ${updated.city}`,
    });
    return { property: updated };
  });

  // POST /api/public-matches/:id/duplicate — clone into the viewer's
  // list. New Property row with `publicMatchSourceId` pointing to the
  // source, a Notification to the source agent, and an Activity entry
  // on both sides so each one can see the trail in /activity.
  app.post('/:id/duplicate', { onRequest: [app.requireAgent] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const u = requireUser(req);
    const body = duplicateSchema.parse(req.body ?? {});

    const source = await prisma.property.findFirst({
      where: { id, isPublicMatch: true },
      include: { agent: { select: { id: true, displayName: true } }, images: true },
    });
    if (!source) return reply.code(404).send({ error: { message: 'Public property not found' } });
    if (source.agentId === u.id) {
      return reply.code(400).send({ error: { message: 'Cannot duplicate your own property' } });
    }
    // requireUser() returns the JWT-minted slice ({id, role, email}) — we
    // need the stored displayName for the notification title, so fetch
    // the row directly.
    const viewer = await prisma.user.findUnique({
      where: { id: u.id },
      select: { displayName: true },
    });

    const slug = await pickUniqueSlug(u.id, source.slug || `${source.street}-${source.city}`);

    // Build the new row — only fields the caller can legally own. Skip
    // owner / exclusivity / commission / pipeline stage so the clone
    // starts from a neutral pipeline position on the duplicator's side.
    const clone = await prisma.property.create({
      data: {
        agentId: u.id,
        slug,
        street: source.street,
        city: source.city,
        neighborhood: source.neighborhood,
        assetClass: source.assetClass,
        category: source.category,
        rooms: source.rooms,
        halfRooms: source.halfRooms,
        floor: source.floor,
        totalFloors: source.totalFloors,
        marketingPrice: body.marketingPrice ?? source.marketingPrice,
        notes: source.notes,
        condition: source.condition,
        heatingTypes: source.heatingTypes,
        masterBedroom: source.masterBedroom,
        bathrooms: source.bathrooms,
        toilets: source.toilets,
        furnished: source.furnished,
        petFriendly: source.petFriendly,
        doormenService: source.doormenService,
        gym: source.gym,
        pool: source.pool,
        gatedCommunity: source.gatedCommunity,
        accessibility: source.accessibility,
        utilityRoom: source.utilityRoom,
        commercialZone: source.commercialZone,
        // Attribution + sensible clean-start defaults.
        publicMatchSourceId: source.id,
        // The clone is NOT in the public pool on day one — the
        // duplicator opts it in explicitly if they want to re-share.
        isPublicMatch: false,
        publicMatchAt: null,
        publicMatchNote: null,
        // Pipeline + exclusivity reset — the clone starts fresh.
        stage: 'IN_PROGRESS',
        status: 'ACTIVE',
        // Owner fields fall back to placeholders so the record is
        // valid; the duplicator is expected to fill these in after.
        owner: body.owner ?? 'בעל פרטי',
        ownerPhone: body.ownerPhone ?? '050-0000000',
        brokerNotes: body.brokerNotes ?? source.brokerNotes,
        // Required scalar fields on Property carry forward from the
        // source so the clone is a valid row on day one.
        type: source.type,
        sqm: source.sqm,
        marketingStartDate: new Date(),
        images: source.images.length
          ? {
              create: source.images.map((img, i) => ({
                url: img.url,
                sortOrder: i,
              })),
            }
          : undefined,
      },
      include: { images: true },
    });

    // Notify the source agent. Deliberately phrased to make the
    // attribution obvious — "X duplicated your property on Y street".
    const duplicatorName = viewer?.displayName || u.email?.split('@')[0] || 'סוכן/ית';
    await prisma.notification.create({
      data: {
        userId: source.agentId,
        type: 'publicMatchDuplicated',
        title: `${duplicatorName} שכפל/ה את הנכס שלך`,
        body: `${source.street}, ${source.city}`,
        link: `/properties/${source.id}`,
      },
    });

    await logActivity({
      agentId: u.id, actorId: u.id,
      verb: 'duplicated', entityType: 'Property', entityId: clone.id,
      summary: `שוכפל מהתאמות פומביות: ${source.street}, ${source.city}`,
    });
    await logActivity({
      agentId: source.agentId, actorId: u.id,
      verb: 'duplicated-by', entityType: 'Property', entityId: source.id,
      summary: `הנכס שלך שוכפל על-ידי ${duplicatorName}: ${source.street}, ${source.city}`,
    });

    // Auto-mark the source as "seen" for this viewer. Once they've
    // cloned a row they're done with it — we don't want it to keep
    // counting against their topbar badge. Idempotent upsert so a
    // second duplicate of the same source (rare, but legal) is a
    // no-op on the seen table.
    await prisma.publicMatchSeen.upsert({
      where: { viewerId_propertyId: { viewerId: u.id, propertyId: source.id } },
      create: { viewerId: u.id, propertyId: source.id },
      update: {},
    });

    return { property: clone };
  });

  // GET /api/public-matches/property/:id/copies — attribution list for
  // the source property page. Returns the agents who've cloned this
  // property (newest first). 404 when the property isn't ours.
  app.get('/property/:id/copies', { onRequest: [app.requireAgent] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const u = requireUser(req);
    const source = await prisma.property.findFirst({ where: { id, agentId: u.id } });
    if (!source) return reply.code(404).send({ error: { message: 'Property not found' } });
    const copies = await prisma.property.findMany({
      where: { publicMatchSourceId: id },
      orderBy: { createdAt: 'desc' },
      include: {
        agent: {
          select: {
            id: true, displayName: true, avatarUrl: true,
            office: { select: { name: true } },
          },
        },
      },
    });
    return {
      items: copies.map((c) => ({
        id: c.id,
        createdAt: c.createdAt,
        agent: c.agent,
        street: c.street,
        city: c.city,
      })),
    };
  });

  // POST /api/public-matches/:id/seen — viewer marks a pool row as seen.
  // Idempotent: re-marking the same row is a no-op (composite PK
  // guarantees uniqueness; upsert keeps the original seenAt).
  app.post('/:id/seen', { onRequest: [app.requireAgent] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const u = requireUser(req);
    // Make sure the row exists and is actually in the pool — saves us
    // from accumulating PublicMatchSeen rows pointing at deleted or
    // private properties.
    const exists = await prisma.property.findFirst({
      where: { id, isPublicMatch: true, NOT: { agentId: u.id } },
      select: { id: true },
    });
    if (!exists) return reply.code(404).send({ error: { message: 'Public property not found' } });
    await prisma.publicMatchSeen.upsert({
      where: { viewerId_propertyId: { viewerId: u.id, propertyId: id } },
      create: { viewerId: u.id, propertyId: id },
      update: {},
    });
    return { ok: true };
  });

  // DELETE /api/public-matches/:id/seen — flip back to "unseen". The
  // row pops back into the badge count on the next /count poll.
  app.delete('/:id/seen', { onRequest: [app.requireAgent] }, async (req) => {
    const { id } = req.params as { id: string };
    const u = requireUser(req);
    await prisma.publicMatchSeen.deleteMany({
      where: { viewerId: u.id, propertyId: id },
    });
    return { ok: true };
  });
};
