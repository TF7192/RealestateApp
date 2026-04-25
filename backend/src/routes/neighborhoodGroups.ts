// Sprint 7 / MLS parity — Task G2. Marketable-area grouping on top of
// the G1 Neighborhood dictionary. SEC-035 — admins (via the
// ADMIN_EMAILS allowlist) curate groups; everyone else reads only.
// Keeps the public GET consistent with the G1 /api/neighborhoods
// shape so the frontend can pair them freely.
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { normalizeCity } from '../lib/addressNormalize.js';
import { getUser } from '../middleware/auth.js';
import { isAdminUser } from './chat.js';

// SEC-035 — Same rationale as in mlsSprint7.ts: NeighborhoodGroup is
// platform-global, so an OWNER alone is too permissive. Until SEC-010
// lands a real ADMIN role we gate writes on the existing email
// allowlist.
async function requireAdmin(req: any, reply: any) {
  const u = getUser(req);
  if (!u) return reply.code(401).send({ error: { message: 'Unauthorized' } });
  if (!isAdminUser(u.email)) {
    return reply.code(403).send({ error: { message: 'Admin only' } });
  }
}

// Include shape reused by every responder so callers always get the
// same payload. `sortOrder` lets the admin UI preserve the agent-
// curated order; Prisma orderBy collapses members to that order.
const includeMembers = {
  members: {
    orderBy: { sortOrder: 'asc' as const },
    include: { neighborhood: true },
  },
};

const listQuery = z.object({
  city:   z.string().max(80).optional(),
  search: z.string().max(80).optional(),
});

const createInput = z.object({
  city:        z.string().min(1).max(80),
  name:        z.string().min(1).max(120),
  description: z.string().max(2000).optional(),
  aliases:     z.array(z.string().max(120)).optional(),
  // Array of Neighborhood ids; we replace the member set wholesale on
  // every mutation that provides one. A missing field leaves members
  // untouched (so "rename only" PATCHes don't nuke the join rows).
  memberIds:   z.array(z.string().min(1).max(40)).optional(),
});

// Same shape, but every field is optional on update.
const updateInput = createInput.partial();

export const registerNeighborhoodGroupRoutes: FastifyPluginAsync = async (app) => {
  // Public read — same stance as /api/neighborhoods. Both autocomplete
  // flows (agent UI + customer portal) need it, so there's no login
  // guard here.
  app.get('/', async (req) => {
    const q = listQuery.parse(req.query);
    const where: any = {};
    if (q.city)   where.city = normalizeCity(q.city)?.value ?? q.city;
    if (q.search) {
      where.OR = [
        { name:        { contains: q.search, mode: 'insensitive' } },
        { description: { contains: q.search, mode: 'insensitive' } },
        { aliases:     { has: q.search } },
      ];
    }
    const items = await prisma.neighborhoodGroup.findMany({
      where,
      include: includeMembers,
      orderBy: [{ city: 'asc' }, { name: 'asc' }],
      take: 200,
    });
    return { items };
  });

  // SEC-035 — Admin-only writes. Same stance as the G1 write path —
  // the lookup is platform-global, so OWNER alone is too permissive.
  app.post('/', { onRequest: [app.requireAuth, requireAdmin] }, async (req, reply) => {
    const body = createInput.parse(req.body);
    try {
      const created = await prisma.neighborhoodGroup.create({
        data: {
          city:        normalizeCity(body.city)?.value ?? body.city,
          name:        body.name,
          description: body.description,
          aliases:     body.aliases ?? [],
          members:     body.memberIds?.length
            ? {
                create: body.memberIds.map((id, i) => ({
                  neighborhoodId: id,
                  sortOrder:      i,
                })),
              }
            : undefined,
        },
        include: includeMembers,
      });
      return { group: created };
    } catch (err: any) {
      // Unique-violation on (city, name) → 409. Everything else
      // bubbles up as the usual 500 so we don't hide real bugs.
      if (err?.code === 'P2002') {
        return reply.code(409).send({ error: { message: 'קבוצה עם שם זה כבר קיימת בעיר' } });
      }
      throw err;
    }
  });

  app.patch('/:id', { onRequest: [app.requireAuth, requireAdmin] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const existing = await prisma.neighborhoodGroup.findUnique({ where: { id } });
    if (!existing) return reply.code(404).send({ error: { message: 'Not found' } });
    const body = updateInput.parse(req.body);

    // Replace member set in a single txn so a partial failure doesn't
    // leave half a group. `memberIds === undefined` means "don't
    // touch"; an empty array means "clear".
    try {
      const updated = await prisma.$transaction(async (tx) => {
        await tx.neighborhoodGroup.update({
          where: { id },
          data: {
            city:        body.city !== undefined
              ? (normalizeCity(body.city)?.value ?? body.city)
              : undefined,
            name:        body.name,
            description: body.description,
            aliases:     body.aliases,
          },
        });
        if (body.memberIds !== undefined) {
          await tx.neighborhoodGroupMember.deleteMany({ where: { groupId: id } });
          if (body.memberIds.length) {
            await tx.neighborhoodGroupMember.createMany({
              data: body.memberIds.map((nid, i) => ({
                groupId:        id,
                neighborhoodId: nid,
                sortOrder:      i,
              })),
            });
          }
        }
        return tx.neighborhoodGroup.findUnique({
          where:   { id },
          include: includeMembers,
        });
      });
      return { group: updated };
    } catch (err: any) {
      if (err?.code === 'P2002') {
        return reply.code(409).send({ error: { message: 'קבוצה עם שם זה כבר קיימת בעיר' } });
      }
      throw err;
    }
  });

  app.delete('/:id', { onRequest: [app.requireAuth, requireAdmin] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const existing = await prisma.neighborhoodGroup.findUnique({ where: { id } });
    if (!existing) return reply.code(404).send({ error: { message: 'Not found' } });
    // Members cascade via the FK ON DELETE CASCADE from the migration.
    await prisma.neighborhoodGroup.delete({ where: { id } });
    return { ok: true };
  });
};
