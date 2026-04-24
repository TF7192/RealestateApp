// Sprint 5.1 — Universal premium gate.
//
// Fastify pre-handler factory: returns a function that can be wired
// into any route's `onRequest` (or `preHandler`) chain. It hydrates
// the authenticated user's `isPremium` column and responds
//   402 { error: 'PREMIUM_REQUIRED', feature }
// for non-premium callers. The feature label is passed through to
// the frontend's global interceptor, which uses it to populate the
// "שדרגו כדי להשתמש ב-{feature}" dialog.
//
// Assumes the caller already ran `requireAuth` / `requireAgent` in
// the onRequest chain — we only look at `getUser(req)`. If the user
// isn't attached the middleware falls through with 401; the auth
// hook it runs behind normally owns that case.

import type { FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { getUser } from './auth.js';

export interface RequirePremiumOpts {
  // Human-readable feature name — rendered verbatim in the frontend
  // premium dialog. Keep it short ("Estia AI", "סיכום פגישות") and
  // customer-facing; devs write the labels, product doesn't need an
  // i18n table for them.
  feature: string;
}

export function requirePremium(opts: RequirePremiumOpts) {
  return async function premiumHook(req: FastifyRequest, reply: FastifyReply) {
    const u = getUser(req);
    if (!u) {
      return reply.code(401).send({ error: { message: 'Unauthorized' } });
    }
    // Pull only the one boolean — we don't need to rehydrate the row.
    const row = await prisma.user.findUnique({
      where: { id: u.id },
      select: { isPremium: true },
    });
    if (!row?.isPremium) {
      return reply.code(402).send({
        error: 'PREMIUM_REQUIRED',
        feature: opts.feature,
      });
    }
  };
}
