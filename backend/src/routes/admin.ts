import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { getUser } from '../middleware/auth.js';
import { isAdminUser } from './chat.js';

/**
 * Admin-only routes. Mirrors the per-route admin gate pattern from
 * routes/chat.ts (no app-wide hook — each route opts in via the
 * `requireAdmin` onRequest entry).
 *
 * Mounted at /api/admin in server.ts.
 */
export const registerAdminRoutes: FastifyPluginAsync = async (app) => {
  const requireAdmin = async (req: any, reply: any) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: { message: 'Unauthorized' } });
    if (!isAdminUser(u.email)) {
      return reply.code(403).send({ error: { message: 'Admin only' } });
    }
  };

  // ── GET /api/admin/users ────────────────────────────────────────
  // Single round-trip: every user with their owned-property count and
  // owned-lead count, plus their last session activity. No N+1 — counts
  // come from Prisma's _count relation aggregation, which Prisma
  // compiles to a single LEFT JOIN ... GROUP BY in SQL.
  const ListQ = z.object({
    page:    z.coerce.number().int().min(1).optional(),
    pageSize:z.coerce.number().int().min(1).max(200).optional(),
    sort:    z.enum(['name', 'createdAt', 'assetsCount', 'leadsCount', 'lastActiveAt']).optional(),
    dir:     z.enum(['asc', 'desc']).optional(),
    search:  z.string().trim().max(120).optional(),
    role:    z.enum(['AGENT', 'ADMIN', 'CUSTOMER']).optional(),
  });

  app.get('/users', { onRequest: [app.requireAuth, requireAdmin] }, async (req) => {
    const q = ListQ.parse(req.query);
    const page     = q.page     ?? 1;
    const pageSize = q.pageSize ?? 50;
    const sort     = q.sort     ?? 'createdAt';
    const dir      = q.dir      ?? 'desc';
    const skip     = (page - 1) * pageSize;

    // Build a Prisma where clause from search + role.
    const where: any = {};
    if (q.role) where.role = q.role;
    if (q.search) {
      where.OR = [
        { email:       { contains: q.search, mode: 'insensitive' } },
        { displayName: { contains: q.search, mode: 'insensitive' } },
      ];
    }

    // Counts come from the User._count relation on `properties` (assets
    // owned as agent) and `leads` (leads owned as agent). For non-agent
    // users both will be 0 — that's correct.
    //
    // For sorting on count columns we use Prisma's _count orderBy.
    let orderBy: any;
    switch (sort) {
      case 'name':         orderBy = { displayName: dir }; break;
      case 'assetsCount':  orderBy = { properties: { _count: dir } }; break;
      case 'leadsCount':   orderBy = { leads:      { _count: dir } }; break;
      // lastActiveAt is the MAX(Session.createdAt) per user; Prisma
      // can't orderBy aggregate-of-relation directly, so we sort by
      // updatedAt as a close proxy (it bumps on user-driven writes).
      case 'lastActiveAt': orderBy = { updatedAt: dir }; break;
      case 'createdAt':
      default:             orderBy = { createdAt: dir }; break;
    }

    const [total, users] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        orderBy,
        skip,
        take: pageSize,
        select: {
          id: true,
          email: true,
          displayName: true,
          role: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: { properties: true, leads: true },
          },
        },
      }),
    ]);

    // Last session per user — single query, in the page set only.
    // Indexed on (userId, expiresAt). Returning a Map for O(1) lookup.
    const sessions = users.length
      ? await prisma.session.groupBy({
          by: ['userId'],
          where: { userId: { in: users.map((u) => u.id) } },
          _max: { createdAt: true },
        })
      : [];
    const lastByUser = new Map<string, Date | null>(
      sessions.map((s) => [s.userId, s._max.createdAt ?? null]),
    );

    const items = users.map((u) => ({
      id: u.id,
      name: u.displayName || u.email,
      email: u.email,
      role: u.role,
      assetsCount: u._count.properties,
      leadsCount:  u._count.leads,
      createdAt: u.createdAt.toISOString(),
      lastActiveAt: lastByUser.get(u.id)?.toISOString() ?? null,
    }));

    return { items, total, page, pageSize };
  });
};
