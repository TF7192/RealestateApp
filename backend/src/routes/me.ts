import type { FastifyPluginAsync } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { z } from 'zod';
import path from 'node:path';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { requireUser } from '../middleware/auth.js';
import { putUpload } from '../lib/storage.js';
import { assertAllowedMime } from '../lib/uploadGuards.js';

export const registerMeRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', { onRequest: [app.requireAuth] }, async (req, reply) => {
    const uid = requireUser(req).id;

    // Opportunistically record the platform the agent first logged in on.
    // We only write when firstLoginPlatform is null so it stays stable
    // after the first call. Previously this `await`ed the updateMany
    // before the findUnique, adding ~30-50 ms to every /api/me call
    // (this endpoint fires on every authed page load). Fire-and-forget
    // instead — the write either succeeds or doesn't; the response
    // doesn't need to wait.
    const xPlatform = (req.headers['x-estia-platform'] as string | undefined)?.slice(0, 20);
    const platform = xPlatform && ['web', 'ios', 'android'].includes(xPlatform) ? xPlatform : null;
    if (platform) {
      prisma.user
        .updateMany({
          where: { id: uid, firstLoginPlatform: null },
          data: { firstLoginPlatform: platform },
        })
        .catch((err) => req.log.warn({ err }, 'me: firstLoginPlatform update failed'));
    }

    const user = await prisma.user.findUnique({
      where: { id: uid },
      include: { agentProfile: true, customerProfile: true },
    });
    if (!user) return { user: null };
    // A-1 — soft-deleted accounts must be treated as "no session" so
    // the SPA's 401 bounce clears the cookie and redirects to the
    // landing. Don't leak the deletion state — just 401.
    if (user.deletedAt) {
      return reply.code(401).send({ error: { message: 'Unauthorized' } });
    }
    return { user: toPublic(user) };
  });

  // End of tour (skip or finish). Idempotent — safe to call multiple times.
  app.post('/tutorial/complete', { onRequest: [app.requireAuth] }, async (req) => {
    const uid = requireUser(req).id;
    await prisma.user.update({
      where: { id: uid },
      data: { hasCompletedTutorial: true },
    });
    return { ok: true };
  });

  const updateSchema = z.object({
    displayName: z.string().min(1).max(120).optional(),
    phone: z.string().max(40).nullable().optional(),
    avatarUrl: z.string().url().nullable().optional(),
    agentProfile: z
      .object({
        agency: z.string().max(120).nullable().optional(),
        title: z.string().max(120).nullable().optional(),
        license: z.string().max(120).nullable().optional(),
        bio: z.string().max(2000).nullable().optional(),
      })
      .optional(),
  });

  app.patch('/', { onRequest: [app.requireAuth] }, async (req) => {
    const body = updateSchema.parse(req.body);
    await prisma.user.update({
      where: { id: requireUser(req).id },
      data: {
        displayName: body.displayName,
        phone: body.phone ?? undefined,
        avatarUrl: body.avatarUrl ?? undefined,
      },
    });
    if (body.agentProfile && requireUser(req).role === 'AGENT') {
      await prisma.agentProfile.update({
        where: { userId: requireUser(req).id },
        data: body.agentProfile,
      });
    }
    const user = await prisma.user.findUnique({
      where: { id: requireUser(req).id },
      include: { agentProfile: true, customerProfile: true },
    });
    return { user: user && toPublic(user) };
  });

  // A-4 — first-login onboarding submit. License is required + validated
  // as 6–8 digits (see Discovery §15 — the Nadlan regulator issues
  // license numbers in this range). Title / agency / phone are
  // optional; phone passes through as typed so the frontend's
  // `toE164` / `formatPhone` stays the source of truth for normalization.
  // Stamps `profileCompletedAt = NOW()` so the SPA route guard stops
  // redirecting to /onboarding.
  const onboardingSchema = z.object({
    license: z.string().regex(/^\d{6,8}$/, 'מספר רישיון חייב להיות 6 עד 8 ספרות'),
    title: z.string().max(120).nullable().optional(),
    agency: z.string().max(120).nullable().optional(),
    phone: z.string().max(40).nullable().optional(),
    // Primary activity city from the onboarding wizard. Stored on
    // agentProfile.businessAddress (the existing freeform field) so
    // we don't need a schema migration; downstream queries that read
    // it treat "city" and "address" interchangeably.
    city: z.string().max(80).nullable().optional(),
  });

  app.post('/profile', { onRequest: [app.requireAuth] }, async (req, reply) => {
    const parse = onboardingSchema.safeParse(req.body);
    if (!parse.success) {
      const msg = parse.error.errors[0]?.message || 'שדות לא תקינים';
      return reply.code(400).send({ error: { message: msg } });
    }
    const body = parse.data;
    const uid = requireUser(req).id;
    const u = await prisma.user.findUnique({ where: { id: uid } });
    if (!u) return reply.code(404).send({ error: { message: 'Not found' } });

    const nowIso = new Date();
    await prisma.user.update({
      where: { id: uid },
      data: {
        phone: body.phone ?? undefined,
        profileCompletedAt: nowIso,
      },
    });
    // Only agents have an agentProfile row; customers hitting this
    // endpoint still get `profileCompletedAt` stamped but we skip the
    // profile write.
    if (requireUser(req).role === 'AGENT') {
      const city = body.city?.trim() || undefined;
      await prisma.agentProfile.upsert({
        where: { userId: uid },
        update: {
          license: body.license,
          title: body.title ?? undefined,
          agency: body.agency ?? undefined,
          businessAddress: city,
        },
        create: {
          userId: uid,
          license: body.license,
          title: body.title ?? undefined,
          agency: body.agency ?? undefined,
          businessAddress: city,
        },
      });
    }
    const user = await prisma.user.findUnique({
      where: { id: uid },
      include: { agentProfile: true, customerProfile: true },
    });
    return { user: user && toPublic(user) };
  });

  // Avatar upload — stores image under /uploads/avatars/{userId}/{uuid}.{ext}
  // and updates the user.avatarUrl. Public read path is /uploads/avatars/...
  app.post('/avatar', { onRequest: [app.requireAuth] }, async (req, reply) => {
    const uid = requireUser(req).id;
    const file = await req.file();
    if (!file) return reply.code(400).send({ error: { message: 'No file' } });
    // SEC-007 — was `mimetype.startsWith('image/')` which let
    // image/svg+xml through; SVG served same-origin can run script in
    // the agent's auth context. Switch to the existing whitelist
    // helper (jpg / png / webp / heic / heif), same as property images.
    try { assertAllowedMime(file, 'image'); }
    catch { return reply.code(415).send({ error: { message: 'פורמט תמונה לא נתמך (jpg / png / webp / heic בלבד)' } }); }
    const ext = path.extname(file.filename) || '.png';
    const name = `${crypto.randomUUID()}${ext}`;
    const key = `avatars/${uid}/${name}`;
    const url = await putUpload(key, await file.toBuffer(), file.mimetype);
    await prisma.user.update({ where: { id: uid }, data: { avatarUrl: url } });
    const user = await prisma.user.findUnique({
      where: { id: uid },
      include: { agentProfile: true, customerProfile: true },
    });
    return { user: user && toPublic(user), url };
  });
};

function toPublic(user: any) {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    displayName: user.displayName,
    phone: user.phone,
    avatarUrl: user.avatarUrl,
    agentProfile: user.agentProfile,
    customerProfile: user.customerProfile,
    hasCompletedTutorial: !!user.hasCompletedTutorial,
    firstLoginPlatform: user.firstLoginPlatform || null,
    // A-4 — SPA route guard reads this. Null ⇒ bounce to /onboarding
    // until the first-login form is submitted and the server stamps
    // this column via POST /api/me/profile.
    profileCompletedAt: user.profileCompletedAt || null,
    // Same flag the auth-login response exposes. Clients read it to
    // skip the premium upsell modal when the row really is premium.
    isPremium: !!user.isPremium,
  };
}
