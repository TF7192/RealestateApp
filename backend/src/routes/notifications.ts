// Sprint 4 — in-app notifications.
//
// Read-side endpoints for the top-bar bell + /notifications list
// page. Writes (creating notifications) happen from other code paths
// — the existing event emitters (reminder-due cron, lead-assigned
// handler, etc.) will drop rows into this table directly. This file
// deliberately exposes no POST/create endpoint; notifications are
// authored by the system, not the user.

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireUser } from '../middleware/auth.js';

const listQuery = z.object({
  // Ceiling on the per-request slice. The top-bar popover wants 10;
  // the /notifications page wants the full list. 200 is the hard cap.
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

export const registerNotificationRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/notifications — list the authed user's notifications, newest
  // first. Returns { items, unreadCount } so the caller can render the
  // bell badge without a second round-trip. `unreadCount` is the total
  // unread count for this user (not the length of `items`), so the UI
  // shows the real badge even when the list is paginated below it.
  app.get('/', { onRequest: [app.requireAuth] }, async (req) => {
    const u = requireUser(req);
    const q = listQuery.parse(req.query);
    const [items, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: { userId: u.id },
        orderBy: { createdAt: 'desc' },
        take: q.limit ?? 50,
      }),
      prisma.notification.count({
        where: { userId: u.id, readAt: null },
      }),
    ]);
    return { items, unreadCount };
  });

  // POST /api/notifications/:id/read — mark a single row read. 404 when
  // the row doesn't exist OR belongs to another user (don't leak
  // whether the id is valid).
  app.post('/:id/read', { onRequest: [app.requireAuth] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const u = requireUser(req);
    const existing = await prisma.notification.findFirst({
      where: { id, userId: u.id },
    });
    if (!existing) return reply.code(404).send({ error: { message: 'Notification not found' } });
    // Idempotent — a second call just leaves the timestamp alone.
    if (existing.readAt) return { notification: existing };
    const notification = await prisma.notification.update({
      where: { id },
      data: { readAt: new Date() },
    });
    return { notification };
  });

  // POST /api/notifications/read-all — flip every unread row for this
  // user. Scoped by userId so a compromised user can only clear their
  // own inbox.
  app.post('/read-all', { onRequest: [app.requireAuth] }, async (req) => {
    const u = requireUser(req);
    const result = await prisma.notification.updateMany({
      where: { userId: u.id, readAt: null },
      data: { readAt: new Date() },
    });
    return { ok: true, updated: result.count };
  });
};
