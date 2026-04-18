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
