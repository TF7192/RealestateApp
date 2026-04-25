// Sprint 7 / MLS parity — Tasks G1 (neighborhoods), B3 (saved
// searches), B4 (favorites). Small, independent endpoints grouped
// into one route module so the server wiring stays lean.
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { getUser, requireUser } from '../middleware/auth.js';
import { isAdminUser } from './chat.js';

// SEC-035 — Neighborhoods is a platform-global lookup (no
// agentId/officeId on the row), so an OWNER from any office could
// otherwise poison every other office's autocomplete dropdown. Until
// SEC-010 introduces a real ADMIN role we gate writes on the existing
// email allowlist. Reads stay public — autocomplete needs them.
async function requireAdmin(req: any, reply: any) {
  const u = getUser(req);
  if (!u) return reply.code(401).send({ error: { message: 'Unauthorized' } });
  if (!isAdminUser(u.email)) {
    return reply.code(403).send({ error: { message: 'Admin only' } });
  }
}

// ────────────────────────── Neighborhoods (G1) ──────────────────────────
const neighborhoodQuery = z.object({
  city:   z.string().max(80).optional(),
  search: z.string().max(80).optional(),
});

export const registerNeighborhoodRoutes: FastifyPluginAsync = async (app) => {
  // Public: used by AddressField autocomplete for both the agent UI and
  // the customer-facing portal. No auth guard.
  app.get('/', async (req) => {
    const q = neighborhoodQuery.parse(req.query);
    const where: any = {};
    if (q.city)   where.city = q.city;
    if (q.search) {
      where.OR = [
        { name:    { contains: q.search, mode: 'insensitive' } },
        { aliases: { has: q.search } },
      ];
    }
    const items = await prisma.neighborhood.findMany({
      where,
      orderBy: [{ city: 'asc' }, { name: 'asc' }],
      take: 200,
    });
    return { items };
  });

  // SEC-035 — Admin-only write path. The Neighborhood table is
  // platform-global; OWNER alone is too permissive (any office's
  // OWNER can poison every other office's autocomplete).
  const input = z.object({
    city:    z.string().min(1).max(80),
    name:    z.string().min(1).max(120),
    aliases: z.array(z.string().max(120)).optional(),
  });
  app.post('/', { onRequest: [app.requireAuth, requireAdmin] }, async (req) => {
    const body = input.parse(req.body);
    const created = await prisma.neighborhood.upsert({
      where:  { city_name: { city: body.city, name: body.name } },
      create: { city: body.city, name: body.name, aliases: body.aliases ?? [] },
      update: { aliases: body.aliases ?? [] },
    });
    return { neighborhood: created };
  });
};

// ────────────────────────── SavedSearch (B3) ──────────────────────────
const savedInput = z.object({
  entityType: z.enum(['PROPERTY', 'LEAD']),
  name:       z.string().min(1).max(120),
  filters:    z.record(z.any()),
});

export const registerSavedSearchRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', { onRequest: [app.requireAgent] }, async (req) => {
    const uid = requireUser(req).id;
    const { entityType } = req.query as { entityType?: string };
    const where: any = { agentId: uid };
    if (entityType === 'PROPERTY' || entityType === 'LEAD') where.entityType = entityType;
    const items = await prisma.savedSearch.findMany({ where, orderBy: { updatedAt: 'desc' } });
    return { items };
  });

  app.post('/', { onRequest: [app.requireAgent] }, async (req) => {
    const uid = requireUser(req).id;
    const body = savedInput.parse(req.body);
    const created = await prisma.savedSearch.create({
      data: { agentId: uid, ...body },
    });
    return { savedSearch: created };
  });

  app.patch('/:id', { onRequest: [app.requireAgent] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const uid = requireUser(req).id;
    const existing = await prisma.savedSearch.findFirst({ where: { id, agentId: uid } });
    if (!existing) return reply.code(404).send({ error: { message: 'Not found' } });
    const body = savedInput.partial().parse(req.body);
    const updated = await prisma.savedSearch.update({ where: { id }, data: body });
    return { savedSearch: updated };
  });

  app.delete('/:id', { onRequest: [app.requireAgent] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const uid = requireUser(req).id;
    const existing = await prisma.savedSearch.findFirst({ where: { id, agentId: uid } });
    if (!existing) return reply.code(404).send({ error: { message: 'Not found' } });
    await prisma.savedSearch.delete({ where: { id } });
    return { ok: true };
  });
};

// ────────────────────────── Favorites (B4) ──────────────────────────
const favInput = z.object({
  entityType: z.enum(['PROPERTY', 'LEAD', 'OWNER']),
  entityId:   z.string().min(1).max(40),
});

export const registerFavoriteRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', { onRequest: [app.requireAgent] }, async (req) => {
    const uid = requireUser(req).id;
    const { entityType, hydrated } = req.query as { entityType?: string; hydrated?: string };
    const where: any = { agentId: uid };
    if (['PROPERTY', 'LEAD', 'OWNER'].includes(String(entityType))) where.entityType = entityType;
    const items = await prisma.favorite.findMany({ where, orderBy: { createdAt: 'desc' } });
    // Default `hydrated=1` mode joins minimal display rows so Layout.jsx
    // can render the sidebar from a single round-trip instead of fetching
    // the whole property/lead/owner book per page-load (PERF-001).
    if (hydrated !== '1' && hydrated !== 'true') {
      return { items };
    }
    const propIds  = items.filter((f) => f.entityType === 'PROPERTY').map((f) => f.entityId);
    const leadIds  = items.filter((f) => f.entityType === 'LEAD').map((f) => f.entityId);
    const ownerIds = items.filter((f) => f.entityType === 'OWNER').map((f) => f.entityId);
    const [props, leads, owners] = await Promise.all([
      propIds.length
        ? prisma.property.findMany({
            where: { id: { in: propIds }, agentId: uid },
            select: { id: true, slug: true, street: true, city: true },
          })
        : [],
      leadIds.length
        ? prisma.lead.findMany({
            where: { id: { in: leadIds }, agentId: uid },
            select: { id: true, name: true, city: true },
          })
        : [],
      ownerIds.length
        ? prisma.owner.findMany({
            where: { id: { in: ownerIds }, agentId: uid },
            select: { id: true, name: true },
          })
        : [],
    ]);
    const pById = new Map(props.map((p)  => [p.id, p]));
    const lById = new Map(leads.map((l)  => [l.id, l]));
    const oById = new Map(owners.map((o) => [o.id, o]));
    const hydratedItems = items.map((f) => {
      if (f.entityType === 'PROPERTY') {
        const p = pById.get(f.entityId);
        if (!p) return null;
        return {
          entityType: 'PROPERTY',
          entityId: p.id,
          label: [p.street, p.city].filter(Boolean).join(', ') || 'נכס',
          to: `/properties/${p.id}`,
        };
      }
      if (f.entityType === 'LEAD') {
        const l = lById.get(f.entityId);
        if (!l) return null;
        return {
          entityType: 'LEAD',
          entityId: l.id,
          label: l.name || 'ליד',
          to: `/customers/${l.id}`,
        };
      }
      if (f.entityType === 'OWNER') {
        const o = oById.get(f.entityId);
        if (!o) return null;
        return {
          entityType: 'OWNER',
          entityId: o.id,
          label: o.name || 'בעל נכס',
          to: `/owners/${o.id}`,
        };
      }
      return null;
    }).filter(Boolean);
    return { items: hydratedItems };
  });

  app.post('/', { onRequest: [app.requireAgent] }, async (req) => {
    const uid = requireUser(req).id;
    const body = favInput.parse(req.body);
    const created = await prisma.favorite.upsert({
      where: {
        agentId_entityType_entityId: {
          agentId: uid, entityType: body.entityType, entityId: body.entityId,
        },
      },
      create: { agentId: uid, ...body },
      update: {},
    });
    return { favorite: created };
  });

  app.delete('/:entityType/:entityId', { onRequest: [app.requireAgent] }, async (req, reply) => {
    const { entityType, entityId } = req.params as { entityType: string; entityId: string };
    if (!['PROPERTY', 'LEAD', 'OWNER'].includes(entityType)) {
      return reply.code(400).send({ error: { message: 'Invalid entityType' } });
    }
    const uid = requireUser(req).id;
    await prisma.favorite.deleteMany({
      where: { agentId: uid, entityType: entityType as any, entityId },
    });
    return { ok: true };
  });
};
