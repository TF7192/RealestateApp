import type { FastifyPluginAsync } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { z } from 'zod';
import path from 'node:path';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { requireUser } from '../middleware/auth.js';
import { putUpload } from '../lib/storage.js';
import { assertAllowedMime } from '../lib/uploadGuards.js';
import { normalizeCity } from '../lib/addressNormalize.js';

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
  // 2026-04-27 — DSR (Data Subject Right) export. PPL §13 access right;
  // GDPR Art. 15 + 20. Returns a JSON bundle of every row scoped to
  // this user. We deliberately don't stream binary blobs (photos /
  // videos / signed PDFs) — those are linked by URL so the user can
  // pull them via the same authenticated cookie afterwards. Rate-limit
  // is the global default (a user dumping their own catalogue isn't
  // an attack vector worth a tighter cap).
  app.get('/export', { onRequest: [app.requireAuth] }, async (req, reply) => {
    const uid = requireUser(req).id;
    const [
      user, properties, leads, owners, deals, prospects,
      reminders, meetings, contracts, agreements, documents, activity,
    ] = await Promise.all([
      prisma.user.findUnique({
        where: { id: uid },
        include: { agentProfile: true, customerProfile: true },
      }),
      prisma.property.findMany({ where: { agentId: uid }, include: { images: true, videos: true, marketingActions: true, priceOffers: true } }),
      prisma.lead.findMany({ where: { agentId: uid }, include: { searchProfiles: true, viewings: true } }),
      prisma.owner.findMany({ where: { agentId: uid } }),
      prisma.deal.findMany({ where: { agentId: uid } }),
      prisma.prospect.findMany({ where: { agentId: uid } }),
      prisma.reminder.findMany({ where: { agentId: uid } }),
      prisma.leadMeeting.findMany({ where: { agentId: uid } }),
      prisma.contract.findMany({ where: { agentId: uid } }),
      prisma.agreement.findMany({ where: { property: { agentId: uid } } }),
      prisma.uploadedFile.findMany({ where: { ownerId: uid } }),
      prisma.activityLog.findMany({ where: { agentId: uid }, orderBy: { createdAt: 'desc' }, take: 5000 }),
    ]);
    if (!user || user.deletedAt) {
      return reply.code(404).send({ error: { message: 'Not found' } });
    }
    const fileBase = `estia-export-${user.email.replace(/[^a-z0-9]+/gi, '_')}-${new Date().toISOString().slice(0, 10)}.json`;
    reply.header('Content-Type', 'application/json; charset=utf-8');
    reply.header('Content-Disposition', `attachment; filename="${fileBase}"`);
    return {
      meta: {
        generatedAt: new Date().toISOString(),
        about: 'Personal data export per PPL §13 / GDPR Art. 15. Files (photos / videos / PDFs) are referenced by URL — fetch them with the same cookie.',
      },
      user, properties, leads, owners, deals, prospects,
      reminders, meetings, contracts, agreements, documents, activity,
    };
  });

  // 2026-05-06 — per-agent specialty cities. Drives the
  // "מודעות חדשות בשוק" feed filter. The feed only restricts results
  // when the list is non-empty; an empty list keeps the legacy
  // "show everything" behavior so existing users see no regression.
  //
  // Validation:
  //   • each entry trimmed, max 80 chars (matches onboarding city)
  //   • cap at 20 entries per agent — beyond that the filter
  //     stops being meaningful and the UI becomes unwieldy
  //   • duplicates collapsed (case-insensitive on the canonical name)
  //   • empty / whitespace-only entries dropped silently
  app.get('/specialty-cities', { onRequest: [app.requireAuth] }, async (req) => {
    const uid = requireUser(req).id;
    const u = await prisma.user.findUnique({
      where: { id: uid },
      select: { specialtyCities: true },
    });
    return { cities: u?.specialtyCities ?? [] };
  });

  const specialtyCitiesSchema = z.object({
    cities: z.array(z.string().trim().min(1).max(80)).max(20),
  });

  app.patch('/specialty-cities', { onRequest: [app.requireAuth] }, async (req, reply) => {
    const parse = specialtyCitiesSchema.safeParse(req.body);
    if (!parse.success) {
      const msg = parse.error.errors[0]?.message || 'רשימה לא תקינה';
      return reply.code(400).send({ error: { message: msg } });
    }
    const uid = requireUser(req).id;
    // Dedupe by canonical city name where possible — fall through to
    // the raw trimmed value when the city isn't in the dictionary so
    // agents can still type freeform names.
    const seen = new Set<string>();
    const cleaned: string[] = [];
    for (const raw of parse.data.cities) {
      const canon = normalizeCity(raw)?.value || raw.trim();
      if (!canon) continue;
      const key = canon.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      cleaned.push(canon);
    }
    await prisma.user.update({
      where: { id: uid },
      data: { specialtyCities: cleaned },
    });
    return { cities: cleaned };
  });

  // 2026-04-27 — analytics consent. Frontend writes here when the user
  // accepts/declines the cookie banner. Tri-state: true / false / null
  // (never decided). The banner only re-prompts when null.
  app.post('/analytics-consent', { onRequest: [app.requireAuth] }, async (req, reply) => {
    const uid = requireUser(req).id;
    const body = z.object({ consent: z.boolean() }).parse(req.body);
    await prisma.user.update({
      where: { id: uid },
      data: { analyticsConsent: body.consent, analyticsConsentAt: new Date() },
    });
    return reply.send({ ok: true });
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
    // 2026-04-27 — privacy / consent state. The frontend uses these to
    // decide whether to mount the cookie banner (`analyticsConsent ===
    // null`) and whether to fire PostHog (`analyticsConsent === true`).
    termsAcceptedAt: user.termsAcceptedAt || null,
    analyticsConsent: user.analyticsConsent ?? null,
  };
}
