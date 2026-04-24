// Sprint 4 / Calendar — flat meetings list endpoint.
//
// POST / PATCH / DELETE already live on calendar.ts (nested under a
// specific lead). The Calendar page needs a cross-lead view, so we
// expose a minimal read-only LIST endpoint here:
//
//   GET /api/meetings?from=<ISO>&to=<ISO>  → { items: LeadMeeting[] }
//
// Scoped to the signed-in agent via JWT. Ordered ascending by startsAt
// so the frontend can render a month grid without re-sorting.

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireUser } from '../middleware/auth.js';

const querySchema = z.object({
  from: z.string().datetime().optional(),
  to:   z.string().datetime().optional(),
});

export const registerMeetingRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', { onRequest: [app.requireAgent] }, async (req, reply) => {
    const q = querySchema.safeParse(req.query);
    if (!q.success) {
      return reply.code(400).send({
        error: { message: q.error.issues[0]?.message || 'Invalid query' },
      });
    }
    const u = requireUser(req);
    const where: any = { agentId: u.id };
    if (q.data.from || q.data.to) {
      where.startsAt = {};
      if (q.data.from) where.startsAt.gte = new Date(q.data.from);
      if (q.data.to)   where.startsAt.lt  = new Date(q.data.to);
    }
    const items = await prisma.leadMeeting.findMany({
      where,
      orderBy: { startsAt: 'asc' },
      include: {
        lead: { select: { id: true, name: true, phone: true } },
      },
    });
    return { items };
  });
};
