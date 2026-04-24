// Sprint 1 / MLS parity — Task A1.
//
// Office-level endpoints. Owners see and edit their office + its
// members; agents see a read-only view of the office they belong to
// (so the profile page can show "משרד: Acme Realty").

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireUser } from '../middleware/auth.js';
import { logActivity } from '../lib/activity.js';

export const registerOfficeRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/office — the signed-in user's own office (or null).
  app.get('/', { onRequest: [app.requireAuth] }, async (req) => {
    const u = requireUser(req);
    const user = await prisma.user.findUnique({ where: { id: u.id } });
    if (!user?.officeId) return { office: null };
    const office = await prisma.office.findUnique({
      where: { id: user.officeId },
      include: {
        members: {
          select: {
            id: true, email: true, displayName: true, role: true,
            phone: true, avatarUrl: true, slug: true,
          },
          orderBy: { displayName: 'asc' },
        },
      },
    });
    return { office };
  });

  // PATCH /api/office — update the office's public details. Only OWNERs
  // may update, and only their own office.
  const updateSchema = z.object({
    name:    z.string().min(1).max(200).optional(),
    phone:   z.string().max(40).nullable().optional(),
    address: z.string().max(400).nullable().optional(),
    logoUrl: z.string().url().nullable().optional(),
  });

  app.patch('/', { onRequest: [app.requireAuth, app.requireOwner] }, async (req, reply) => {
    const body = updateSchema.parse(req.body);
    const u = requireUser(req);
    const user = await prisma.user.findUnique({ where: { id: u.id } });
    if (!user?.officeId) {
      return reply.code(404).send({ error: { message: 'No office attached to your user' } });
    }
    const office = await prisma.office.update({
      where: { id: user.officeId },
      data: {
        name:    body.name,
        phone:   body.phone    ?? undefined,
        address: body.address  ?? undefined,
        logoUrl: body.logoUrl  ?? undefined,
      },
    });
    return { office };
  });

  // POST /api/office — create an office and attach the caller. Any
  // authenticated user without an existing office may create one; on
  // success the caller's role is promoted to OWNER atomically. This
  // resolves the chicken-and-egg where the previous `requireOwner`
  // gate meant a fresh AGENT could never reach a state where they
  // own an office.
  const createSchema = z.object({
    name:    z.string().min(1).max(200),
    phone:   z.string().max(40).nullable().optional(),
    address: z.string().max(400).nullable().optional(),
    logoUrl: z.string().url().nullable().optional(),
  });
  app.post('/', { onRequest: [app.requireAuth] }, async (req, reply) => {
    const body = createSchema.parse(req.body);
    const u = requireUser(req);
    const existing = await prisma.user.findUnique({ where: { id: u.id } });
    if (existing?.officeId) {
      return reply.code(409).send({ error: { message: 'User already belongs to an office' } });
    }
    // Create the office + promote the creator to OWNER in a single
    // transaction so we never leave a half-created orphan row.
    const office = await prisma.$transaction(async (tx) => {
      const created = await tx.office.create({
        data: {
          name:    body.name,
          phone:   body.phone ?? null,
          address: body.address ?? null,
          logoUrl: body.logoUrl ?? null,
          members: { connect: { id: u.id } },
        },
      });
      await tx.user.update({
        where: { id: u.id },
        data:  { role: 'OWNER' },
      });
      return created;
    });
    await logActivity({
      agentId: u.id, actorId: u.id,
      verb: 'created', entityType: 'Office', entityId: office.id,
      summary: `נוצר משרד: ${office.name}`,
    });
    return { office };
  });

  // POST /api/office/members — add a user (by email) to this office.
  // Owner-only. The invited user keeps their current role (AGENT stays
  // AGENT) but now sees office-wide data where applicable.
  const addMemberSchema = z.object({ email: z.string().email() });
  app.post('/members', { onRequest: [app.requireAuth, app.requireOwner] }, async (req, reply) => {
    const body = addMemberSchema.parse(req.body);
    const u = requireUser(req);
    const me = await prisma.user.findUnique({ where: { id: u.id } });
    if (!me?.officeId) {
      return reply.code(404).send({ error: { message: 'No office attached to your user' } });
    }
    const target = await prisma.user.findUnique({ where: { email: body.email.toLowerCase() } });
    if (!target) return reply.code(404).send({ error: { message: 'User not found' } });
    if (target.role === 'CUSTOMER') {
      return reply.code(400).send({ error: { message: 'Only AGENT/OWNER users can join an office' } });
    }
    const updated = await prisma.user.update({
      where: { id: target.id },
      data: { officeId: me.officeId },
      select: { id: true, email: true, displayName: true, role: true, officeId: true },
    });
    await logActivity({
      agentId: u.id, actorId: u.id,
      verb: 'added_member', entityType: 'Office', entityId: me.officeId,
      summary: `נוסף חבר למשרד: ${updated.displayName ?? updated.email}`,
      metadata: { memberId: updated.id, memberEmail: updated.email },
    });
    return { user: updated };
  });

  // ── Invites (A1 fill-in) ────────────────────────────────────────
  // Email-based invites, for the common case where the OWNER wants to
  // onboard an agent who doesn't yet have an Estia login. No mail
  // provider is configured in prod — the endpoint returns a surrogate
  // `inviteUrl` which the OWNER copies and shares manually; when the
  // invitee logs in or signs up, auth.ts auto-attaches them to the
  // office and marks the invite accepted.
  function inviteUrl(inviteId: string): string {
    const origin = process.env.PUBLIC_ORIGIN || 'https://estia.co.il';
    return `${origin.replace(/\/$/, '')}/accept-invite?token=${inviteId}`;
  }

  const createInviteSchema = z.object({ email: z.string().email() });
  app.post('/invites', { onRequest: [app.requireAuth, app.requireOwner] }, async (req, reply) => {
    const body = createInviteSchema.parse(req.body);
    const u = requireUser(req);
    const me = await prisma.user.findUnique({ where: { id: u.id } });
    if (!me?.officeId) {
      return reply.code(404).send({ error: { message: 'No office attached to your user' } });
    }
    const email = body.email.toLowerCase();
    // If a user with this email is already a member of the same office
    // there's nothing to invite — reject with 409 so the UI can show a
    // useful toast.
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing?.officeId === me.officeId) {
      return reply.code(409).send({ error: { message: 'User already a member of this office' } });
    }
    // Upsert the invite. Inviting the same email twice resets
    // revokedAt/acceptedAt so a revoked invite can be re-issued.
    const invite = await prisma.officeInvite.upsert({
      where: { officeId_email: { officeId: me.officeId, email } },
      create: {
        officeId:    me.officeId,
        email,
        invitedById: u.id,
      },
      update: {
        invitedById: u.id,
        revokedAt:   null,
        acceptedAt:  null,
        acceptedById: null,
      },
    });
    return { invite: { ...invite, inviteUrl: inviteUrl(invite.id) } };
  });

  app.get('/invites', { onRequest: [app.requireAuth, app.requireOwner] }, async (req, reply) => {
    const u = requireUser(req);
    const me = await prisma.user.findUnique({ where: { id: u.id } });
    if (!me?.officeId) {
      return reply.code(404).send({ error: { message: 'No office attached to your user' } });
    }
    const rows = await prisma.officeInvite.findMany({
      where: { officeId: me.officeId, acceptedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    const items = rows.map((r) => ({ ...r, inviteUrl: inviteUrl(r.id) }));
    return { items };
  });

  app.delete('/invites/:id', { onRequest: [app.requireAuth, app.requireOwner] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const u = requireUser(req);
    const me = await prisma.user.findUnique({ where: { id: u.id } });
    if (!me?.officeId) {
      return reply.code(404).send({ error: { message: 'No office attached to your user' } });
    }
    const target = await prisma.officeInvite.findUnique({ where: { id } });
    if (!target || target.officeId !== me.officeId) {
      return reply.code(404).send({ error: { message: 'Invite not found' } });
    }
    await prisma.officeInvite.update({
      where: { id },
      data: { revokedAt: new Date() },
    });
    return { ok: true };
  });

  // DELETE /api/office/members/:id — remove a user from the office.
  // Owner-only, can't remove themselves (would leave the office
  // ownerless — POST back in if that's ever the intent).
  app.delete('/members/:id', { onRequest: [app.requireAuth, app.requireOwner] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const u = requireUser(req);
    if (id === u.id) {
      return reply.code(400).send({ error: { message: 'Cannot remove yourself' } });
    }
    const me = await prisma.user.findUnique({ where: { id: u.id } });
    if (!me?.officeId) {
      return reply.code(404).send({ error: { message: 'No office attached to your user' } });
    }
    const target = await prisma.user.findUnique({ where: { id } });
    if (!target || target.officeId !== me.officeId) {
      return reply.code(404).send({ error: { message: 'User not in your office' } });
    }
    await prisma.user.update({ where: { id }, data: { officeId: null } });
    await logActivity({
      agentId: u.id, actorId: u.id,
      verb: 'removed_member', entityType: 'Office', entityId: me.officeId,
      summary: `הוסר חבר מהמשרד: ${target.displayName ?? target.email}`,
      metadata: { memberId: target.id, memberEmail: target.email },
    });
    return { ok: true };
  });
};
