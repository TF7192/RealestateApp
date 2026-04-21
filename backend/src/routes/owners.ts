import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireUser } from '../middleware/auth.js';
import { track as phTrack } from '../lib/analytics.js';

/**
 * Owner routes — `/api/owners/*`. The Owner persona is distinct from Lead
 * (Lead = customer / prospective buyer). One physical human can be both,
 * but the records are kept separate so the agent's "ספר בעלים" stays clean
 * and so each property has a clean foreign key to its seller.
 */
export const registerOwnerRoutes: FastifyPluginAsync = async (app) => {
  // ── List all owners for the signed-in agent ───────────────────────────
  app.get('/', { onRequest: [app.requireAgent] }, async (req) => {
    const u = requireUser(req);
    const owners = await prisma.owner.findMany({
      where: { agentId: u.id },
      include: {
        _count: { select: { properties: true } },
        properties: {
          select: { id: true, slug: true, street: true, city: true, type: true, status: true, marketingPrice: true },
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
      },
      orderBy: { name: 'asc' },
    });
    return {
      items: owners.map((o) => ({
        id: o.id,
        name: o.name,
        phone: o.phone,
        email: o.email,
        notes: o.notes,
        relationship: o.relationship,
        propertyCount: o._count.properties,
        properties: o.properties,
        createdAt: o.createdAt,
      })),
    };
  });

  // ── Single owner with all of their properties ─────────────────────────
  app.get('/:id', { onRequest: [app.requireAgent] }, async (req, reply) => {
    const u = requireUser(req);
    const { id } = req.params as { id: string };
    const owner = await prisma.owner.findFirst({
      where: { id, agentId: u.id },
      include: {
        properties: {
          orderBy: { createdAt: 'desc' },
          include: { images: { orderBy: { sortOrder: 'asc' }, take: 1 } },
        },
      },
    });
    if (!owner) return reply.code(404).send({ error: { message: 'Owner not found' } });
    return { owner };
  });

  // ── Create ────────────────────────────────────────────────────────────
  const ownerInput = z.object({
    name: z.string().min(1).max(120),
    phone: z.string().min(5).max(40),
    email: z.string().email().optional().nullable().or(z.literal('')),
    notes: z.string().max(2000).optional().nullable(),
    relationship: z.string().max(120).optional().nullable(),
  });

  app.post('/', { onRequest: [app.requireAgent] }, async (req) => {
    const u = requireUser(req);
    const body = ownerInput.parse(req.body);
    const owner = await prisma.owner.create({
      data: {
        agentId: u.id,
        name: body.name.trim(),
        phone: body.phone.trim(),
        email: body.email?.trim() || null,
        notes: body.notes?.trim() || null,
        relationship: body.relationship?.trim() || null,
      },
    });
    phTrack('owner_created', u.id, { owner_id: owner.id });
    return { owner };
  });

  // ── Update ────────────────────────────────────────────────────────────
  app.patch('/:id', { onRequest: [app.requireAgent] }, async (req, reply) => {
    const u = requireUser(req);
    const { id } = req.params as { id: string };
    const body = ownerInput.partial().parse(req.body);
    const existing = await prisma.owner.findFirst({ where: { id, agentId: u.id } });
    if (!existing) return reply.code(404).send({ error: { message: 'Owner not found' } });

    const updated = await prisma.owner.update({
      where: { id },
      data: {
        ...(body.name        !== undefined ? { name: body.name.trim() } : {}),
        ...(body.phone       !== undefined ? { phone: body.phone.trim() } : {}),
        ...(body.email       !== undefined ? { email: body.email?.trim() || null } : {}),
        ...(body.notes       !== undefined ? { notes: body.notes?.trim() || null } : {}),
        ...(body.relationship !== undefined ? { relationship: body.relationship?.trim() || null } : {}),
      },
    });

    // Keep the denormalized inline columns on every linked property in sync
    if (body.name !== undefined || body.phone !== undefined || body.email !== undefined) {
      await prisma.property.updateMany({
        where: { propertyOwnerId: id, agentId: u.id },
        data: {
          ...(body.name  !== undefined ? { owner: updated.name } : {}),
          ...(body.phone !== undefined ? { ownerPhone: updated.phone } : {}),
          ...(body.email !== undefined ? { ownerEmail: updated.email } : {}),
        },
      });
    }
    return { owner: updated };
  });

  // ── Delete ────────────────────────────────────────────────────────────
  // SetNull is configured on the Property FK so deleting an owner doesn't
  // wipe out their properties — they just become "unassigned" and the
  // agent can re-link manually.
  app.delete('/:id', { onRequest: [app.requireAgent] }, async (req, reply) => {
    const u = requireUser(req);
    const { id } = req.params as { id: string };
    const existing = await prisma.owner.findFirst({ where: { id, agentId: u.id } });
    if (!existing) return reply.code(404).send({ error: { message: 'Owner not found' } });
    await prisma.owner.delete({ where: { id } });
    return { ok: true };
  });

  // ── J8 multi-phone: list an owner's phones ───────────────────────────
  // On first read, if no OwnerPhone rows exist yet but the legacy
  // Owner.phone column is populated, we lazily create a single
  // `kind: 'primary'` row so the UI has something to show without a
  // destructive migration-time backfill.
  app.get('/:id/phones', { onRequest: [app.requireAgent] }, async (req, reply) => {
    const u = requireUser(req);
    const { id } = req.params as { id: string };
    const owner = await prisma.owner.findFirst({ where: { id, agentId: u.id } });
    if (!owner) return reply.code(404).send({ error: { message: 'Owner not found' } });

    let items = await prisma.ownerPhone.findMany({
      where: { ownerId: id },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    if (items.length === 0 && owner.phone) {
      const seeded = await prisma.ownerPhone.create({
        data: { ownerId: id, phone: owner.phone, kind: 'primary', sortOrder: 0 },
      });
      items = [seeded];
    }
    return { items };
  });

  // ── J8 multi-phone: add a phone to an owner ──────────────────────────
  const phoneInput = z.object({
    phone: z.string().min(3).max(40),
    kind: z.enum(['primary', 'secondary', 'spouse', 'work', 'fax', 'other']).default('primary'),
    label: z.string().max(120).optional().nullable(),
    sortOrder: z.number().int().optional(),
  });
  app.post('/:id/phones', { onRequest: [app.requireAgent] }, async (req, reply) => {
    const u = requireUser(req);
    const { id } = req.params as { id: string };
    const owner = await prisma.owner.findFirst({ where: { id, agentId: u.id } });
    if (!owner) return reply.code(404).send({ error: { message: 'Owner not found' } });
    const body = phoneInput.parse(req.body);
    const phone = await prisma.ownerPhone.create({
      data: {
        ownerId: id,
        phone: body.phone.trim(),
        kind: body.kind,
        label: body.label?.trim() || null,
        sortOrder: body.sortOrder ?? 0,
      },
    });
    phTrack('owner_phone_added', u.id, { owner_id: id, kind: body.kind });
    return { phone };
  });

  // ── Quick-search by phone (used by NewProperty form to dedupe) ────────
  app.get('/search', { onRequest: [app.requireAgent] }, async (req) => {
    const u = requireUser(req);
    const { q = '' } = req.query as { q?: string };
    const term = q.trim();
    if (!term) return { items: [] };
    const items = await prisma.owner.findMany({
      where: {
        agentId: u.id,
        OR: [
          { name:  { contains: term, mode: 'insensitive' } },
          { phone: { contains: term.replace(/[^\d]/g, '') } },
        ],
      },
      select: {
        id: true, name: true, phone: true, email: true,
        _count: { select: { properties: true } },
      },
      take: 10,
    });
    return { items };
  });
};

/**
 * J8 multi-phone mutations that aren't scoped under `/owners/:id/*`.
 * Registered at the flat `/api/owner-phones/:id` path so the FE can
 * patch / delete a single phone without having to round-trip the
 * owner id in the URL.
 */
export const registerOwnerPhoneRoutes: FastifyPluginAsync = async (app) => {
  const patchInput = z.object({
    phone: z.string().min(3).max(40).optional(),
    kind: z.enum(['primary', 'secondary', 'spouse', 'work', 'fax', 'other']).optional(),
    label: z.string().max(120).optional().nullable(),
    sortOrder: z.number().int().optional(),
  });

  // Shared agent-scoping check so we never leak or mutate another
  // agent's owner phones.
  async function requirePhone(id: string, agentId: string) {
    const phone = await prisma.ownerPhone.findUnique({
      where: { id },
      include: { owner: true },
    });
    if (!phone || phone.owner.agentId !== agentId) return null;
    return phone;
  }

  app.patch('/owner-phones/:id', { onRequest: [app.requireAgent] }, async (req, reply) => {
    const u = requireUser(req);
    const { id } = req.params as { id: string };
    const existing = await requirePhone(id, u.id);
    if (!existing) return reply.code(404).send({ error: { message: 'Phone not found' } });
    const body = patchInput.parse(req.body);
    const updated = await prisma.ownerPhone.update({
      where: { id },
      data: {
        ...(body.phone !== undefined ? { phone: body.phone.trim() } : {}),
        ...(body.kind  !== undefined ? { kind: body.kind } : {}),
        ...(body.label !== undefined ? { label: body.label?.trim() || null } : {}),
        ...(body.sortOrder !== undefined ? { sortOrder: body.sortOrder } : {}),
      },
    });
    return { phone: updated };
  });

  app.delete('/owner-phones/:id', { onRequest: [app.requireAgent] }, async (req, reply) => {
    const u = requireUser(req);
    const { id } = req.params as { id: string };
    const existing = await requirePhone(id, u.id);
    if (!existing) return reply.code(404).send({ error: { message: 'Phone not found' } });
    await prisma.ownerPhone.delete({ where: { id } });
    return { ok: true };
  });
};
