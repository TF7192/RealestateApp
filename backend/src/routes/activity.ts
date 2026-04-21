// Sprint 5 / MLS parity — Task H3. Read-only activity-log endpoint.
// Writes happen via logActivity() from route handlers; this file just
// exposes the list for the UI's "recent activity" timeline.
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireUser } from '../middleware/auth.js';

const query = z.object({
  entityType: z.string().max(40).optional(),
  entityId:   z.string().max(40).optional(),
  limit:      z.coerce.number().int().min(1).max(200).optional(),
});

export const registerActivityRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', { onRequest: [app.requireAgent] }, async (req) => {
    const q   = query.parse(req.query);
    const uid = requireUser(req).id;
    const where: any = { agentId: uid };
    if (q.entityType) where.entityType = q.entityType;
    if (q.entityId)   where.entityId   = q.entityId;
    const items = await prisma.activityLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: q.limit ?? 50,
    });
    return { items };
  });
};
