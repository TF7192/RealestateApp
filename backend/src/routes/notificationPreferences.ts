// Phase 3 — per-user notification preferences.
//
// GET    /api/notification-preferences      — current user's row (creates default if missing)
// PATCH  /api/notification-preferences      — update channel toggles + threshold
//
// Strict ownership: every operation uses req.user.id; client-supplied
// userId is never honored.

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { getUser } from '../middleware/auth.js';

const patchSchema = z.object({
  marketMatchInAppEnabled:          z.boolean().optional(),
  marketMatchEmailEnabled:          z.boolean().optional(),
  marketMatchSmsEnabled:            z.boolean().optional(),
  // null clears the override → falls back to user.email at delivery time.
  customDeliveryEmail:              z.union([z.string().trim().email(), z.null()]).optional(),
  minMatchScoreForExternalDelivery: z.number().int().min(0).max(100).optional(),
});

export const registerNotificationPreferencesRoutes: FastifyPluginAsync = async (app) => {
  // Auth gate — returns 401 (not 500) on missing/invalid cookies.
  app.addHook('onRequest', app.requireAuth);

  // Defaults match the model defaults — keep them in sync on changes.
  // The "auto-create on first GET" pattern keeps the API surface
  // simple: agents never see a 404 for a row that's their own.
  async function getOrCreatePref(userId: string) {
    return prisma.userNotificationPreference.upsert({
      where: { userId },
      update: {},
      create: { userId },
    });
  }

  app.get('/', async (req) => {
    const userId = getUser(req)!.id;
    const pref = await getOrCreatePref(userId);
    return pref;
  });

  app.patch('/', async (req, reply) => {
    const userId = getUser(req)!.id;
    const parse = patchSchema.safeParse(req.body);
    if (!parse.success) {
      return reply.code(400).send({ error: { message: 'Invalid input', issues: parse.error.flatten() } });
    }
    // Auto-create on first PATCH too — same UX as GET.
    await getOrCreatePref(userId);
    const pref = await prisma.userNotificationPreference.update({
      where: { userId },
      data: parse.data,
    });
    return pref;
  });
};
