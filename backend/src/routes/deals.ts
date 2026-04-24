import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireUser } from '../middleware/auth.js';
import { logActivity } from '../lib/activity.js';

const dealInput = z.object({
  propertyId: z.string().nullable().optional(),
  propertyStreet: z.string().min(1).max(120),
  city: z.string().min(1).max(80),
  assetClass: z.enum(['RESIDENTIAL', 'COMMERCIAL']),
  category: z.enum(['SALE', 'RENT']),
  // E-1 — CLOSED + CANCELLED added per the Discovery spec; existing
  // granular stages stay for back-compat.
  status: z.enum([
    'NEGOTIATING',
    'WAITING_MORTGAGE',
    'PENDING_CONTRACT',
    'SIGNED',
    'FELL_THROUGH',
    'CLOSED',
    'CANCELLED',
  ]).optional(),
  marketingPrice: z.number().int().nonnegative(),
  offer: z.number().int().nonnegative().nullable().optional(),
  closedPrice: z.number().int().nonnegative().nullable().optional(),
  commission: z.number().int().nonnegative().nullable().optional(),
  buyerAgent: z.string().max(120).nullable().optional(),
  sellerAgent: z.string().max(120).nullable().optional(),
  lawyer: z.string().max(120).nullable().optional(),
  signedAt: z.string().nullable().optional(),
  // E-1 — structured parties + target close date.
  buyerId: z.string().nullable().optional(),
  sellerId: z.string().nullable().optional(),
  closeDate: z.string().nullable().optional(),
});

export const registerDealRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', { onRequest: [app.requireAgent] }, async (req) => {
    const q = req.query as any;
    const where: any = { agentId: requireUser(req).id };
    if (q.status) where.status = q.status;
    if (q.assetClass) where.assetClass = q.assetClass;
    if (q.category) where.category = q.category;
    // E-1 — return lightweight buyer/seller slices so the list view can
    // render counterparties without a second round-trip. Falls back to
    // the legacy free-text `buyerAgent` / `sellerAgent` columns.
    const items = await prisma.deal.findMany({
      where,
      orderBy: { updateDate: 'desc' },
      include: {
        buyer: { select: { id: true, name: true, phone: true } },
        seller: { select: { id: true, name: true, phone: true } },
      },
    });
    return { items };
  });

  // Sprint 6 — detail fetch for the standalone /deals/:id page. Agent-
  // scoped (a deal belongs to one agent, cross-agent reads are 404).
  // Includes the structured buyer/seller slices so the page can link
  // through to /customers/:id and /owners/:id without a second round-
  // trip, plus a minimal property slice for the header card.
  app.get('/:id', { onRequest: [app.requireAgent] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const uid = requireUser(req).id;
    const deal = await prisma.deal.findFirst({
      where: { id, agentId: uid },
      include: {
        buyer:  { select: { id: true, name: true, phone: true, email: true } },
        seller: { select: { id: true, name: true, phone: true, email: true } },
        property: {
          select: {
            id: true, street: true, city: true, rooms: true, sqm: true,
            floor: true, totalFloors: true, type: true,
          },
        },
      },
    });
    if (!deal) return reply.code(404).send({ error: { message: 'Deal not found' } });
    return { deal };
  });

  app.post('/', { onRequest: [app.requireAgent] }, async (req, reply) => {
    const body = dealInput.parse(req.body);
    const uid = requireUser(req).id;
    // E-1 — agent-scoped FK validation: a buyer must be one of my
    // leads, a seller must be one of my owners, a property must be
    // one of mine. Prevents cross-agent data binding.
    if (body.buyerId) {
      const l = await prisma.lead.findUnique({ where: { id: body.buyerId } });
      if (!l || l.agentId !== uid) {
        return reply.code(400).send({ error: { message: 'ליד לא נמצא' } });
      }
    }
    if (body.sellerId) {
      const o = await prisma.owner.findUnique({ where: { id: body.sellerId } });
      if (!o || o.agentId !== uid) {
        return reply.code(400).send({ error: { message: 'בעלים לא נמצא' } });
      }
    }
    if (body.propertyId) {
      const p = await prisma.property.findUnique({ where: { id: body.propertyId } });
      if (!p || p.agentId !== uid) {
        return reply.code(400).send({ error: { message: 'נכס לא נמצא' } });
      }
    }
    const deal = await prisma.deal.create({
      data: { agentId: uid, ...normalize(body) },
    });
    await logActivity({
      agentId: uid, actorId: uid,
      verb: 'created', entityType: 'Deal', entityId: deal.id,
      summary: `נוצרה עסקה: ${deal.propertyStreet}, ${deal.city}`,
      metadata: { status: deal.status },
    });
    return { deal };
  });

  app.patch('/:id', { onRequest: [app.requireAgent] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = dealInput.partial().parse(req.body);
    const existing = await prisma.deal.findUnique({ where: { id } });
    if (!existing || existing.agentId !== requireUser(req).id) {
      return reply.code(404).send({ error: { message: 'Not found' } });
    }
    const deal = await prisma.deal.update({
      where: { id },
      data: { ...normalize(body), updateDate: new Date() },
    });
    await logActivity({
      agentId: existing.agentId, actorId: requireUser(req).id,
      verb: 'updated', entityType: 'Deal', entityId: deal.id,
      summary: `עודכנה עסקה: ${deal.propertyStreet}, ${deal.city}`,
      metadata: { status: deal.status },
    });
    return { deal };
  });

  app.delete('/:id', { onRequest: [app.requireAgent] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const existing = await prisma.deal.findUnique({ where: { id } });
    if (!existing || existing.agentId !== requireUser(req).id) {
      return reply.code(404).send({ error: { message: 'Not found' } });
    }
    await prisma.deal.delete({ where: { id } });
    return { ok: true };
  });
};

function normalize(body: Partial<z.infer<typeof dealInput>>) {
  const data: any = { ...body };
  if (data.signedAt) data.signedAt = new Date(data.signedAt);
  if (data.closeDate) data.closeDate = new Date(data.closeDate);
  return data;
}
