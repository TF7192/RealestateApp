// OwnerActivity — the seller-side activity log for a listing.
//
// Captures the "second half" of the negotiation triangle: the agent's
// conversations with the property owner (commission talks, owner
// feedback on specific buyers, price discussions, marketing approvals,
// tour permissions, objections, contract talks). Distinct from
// PropertyInterest (buyer-side log).
//
// Endpoints:
//   GET    /api/properties/:id/owner-activity     — list rows for a property
//   POST   /api/properties/:id/owner-activity     — create a new entry
//   PATCH  /api/owner-activity/:id                — edit
//   DELETE /api/owner-activity/:id                — delete

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireUser } from '../middleware/auth.js';

const kindEnum = z.enum([
  'COMMISSION_TALK',
  'PRICE_TALK',
  'FEEDBACK_ON_LEAD',
  'TOUR_PERMISSION',
  'MARKETING_UPDATE',
  'OBJECTION',
  'CONTRACT_TALK',
  'GENERAL_UPDATE',
  'OTHER',
]);
const commissionRespEnum = z.enum(['PENDING', 'ACCEPTED', 'COUNTER', 'REJECTED']);

const createSchema = z.object({
  kind: kindEnum,
  title: z.string().min(1).max(200),
  notes: z.string().max(4000).nullable().optional(),
  commissionPct: z.number().min(0).max(100).nullable().optional(),
  commissionFlat: z.number().int().min(0).nullable().optional(),
  commissionResponse: commissionRespEnum.nullable().optional(),
  relatedLeadId: z.string().nullable().optional(),
  occurredAt: z.string().datetime().optional(),
});

const patchSchema = createSchema.partial();

export const registerOwnerActivityRoutes: FastifyPluginAsync = async (app) => {
  app.get('/properties/:id/owner-activity', { onRequest: [app.requireAgent] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const u = requireUser(req);
    const property = await prisma.property.findFirst({
      where: { id, agentId: u.id },
      select: { id: true },
    });
    if (!property) return reply.code(404).send({ error: { message: 'Property not found' } });
    const items = await prisma.ownerActivity.findMany({
      where: { propertyId: id, agentId: u.id },
      include: {
        relatedLead: { select: { id: true, name: true, phone: true, status: true } },
      },
      orderBy: { occurredAt: 'desc' },
    });
    return { items };
  });

  app.post('/properties/:id/owner-activity', { onRequest: [app.requireAgent] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const u = requireUser(req);
    const property = await prisma.property.findFirst({
      where: { id, agentId: u.id },
      select: { id: true },
    });
    if (!property) return reply.code(404).send({ error: { message: 'Property not found' } });
    const body = createSchema.parse(req.body);

    // If relatedLeadId provided, confirm it belongs to this agent.
    if (body.relatedLeadId) {
      const lead = await prisma.lead.findFirst({
        where: { id: body.relatedLeadId, agentId: u.id },
        select: { id: true },
      });
      if (!lead) return reply.code(400).send({ error: { message: 'Related lead not found' } });
    }

    const row = await prisma.ownerActivity.create({
      data: {
        agentId: u.id,
        propertyId: id,
        kind: body.kind,
        title: body.title.trim(),
        notes: body.notes?.trim() || null,
        commissionPct: body.commissionPct ?? null,
        commissionFlat: body.commissionFlat ?? null,
        commissionResponse: body.commissionResponse ?? null,
        relatedLeadId: body.relatedLeadId ?? null,
        occurredAt: body.occurredAt ? new Date(body.occurredAt) : new Date(),
      },
      include: {
        relatedLead: { select: { id: true, name: true, phone: true, status: true } },
      },
    });
    return reply.code(201).send(row);
  });

  app.patch('/owner-activity/:id', { onRequest: [app.requireAgent] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const u = requireUser(req);
    const existing = await prisma.ownerActivity.findFirst({
      where: { id, agentId: u.id },
      select: { id: true },
    });
    if (!existing) return reply.code(404).send({ error: { message: 'Activity not found' } });
    const body = patchSchema.parse(req.body);
    const data: Record<string, unknown> = { ...body };
    if (body.occurredAt) data.occurredAt = new Date(body.occurredAt);
    if (body.title !== undefined) data.title = body.title.trim();
    if (body.notes !== undefined) data.notes = body.notes?.trim() || null;
    const updated = await prisma.ownerActivity.update({
      where: { id },
      data,
      include: {
        relatedLead: { select: { id: true, name: true, phone: true, status: true } },
      },
    });
    return updated;
  });

  app.delete('/owner-activity/:id', { onRequest: [app.requireAgent] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const u = requireUser(req);
    const existing = await prisma.ownerActivity.findFirst({
      where: { id, agentId: u.id },
      select: { id: true },
    });
    if (!existing) return reply.code(404).send({ error: { message: 'Activity not found' } });
    await prisma.ownerActivity.delete({ where: { id } });
    return { ok: true };
  });
};
