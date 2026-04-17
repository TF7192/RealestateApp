import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireUser } from '../middleware/auth.js';

const dealInput = z.object({
  propertyId: z.string().nullable().optional(),
  propertyStreet: z.string().min(1).max(120),
  city: z.string().min(1).max(80),
  assetClass: z.enum(['RESIDENTIAL', 'COMMERCIAL']),
  category: z.enum(['SALE', 'RENT']),
  status: z.enum(['NEGOTIATING', 'WAITING_MORTGAGE', 'PENDING_CONTRACT', 'SIGNED', 'FELL_THROUGH']).optional(),
  marketingPrice: z.number().int().nonnegative(),
  offer: z.number().int().nonnegative().nullable().optional(),
  closedPrice: z.number().int().nonnegative().nullable().optional(),
  commission: z.number().int().nonnegative().nullable().optional(),
  buyerAgent: z.string().max(120).nullable().optional(),
  sellerAgent: z.string().max(120).nullable().optional(),
  lawyer: z.string().max(120).nullable().optional(),
  signedAt: z.string().nullable().optional(),
});

export const registerDealRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', { onRequest: [app.requireAgent] }, async (req) => {
    const q = req.query as any;
    const where: any = { agentId: requireUser(req).id };
    if (q.status) where.status = q.status;
    if (q.assetClass) where.assetClass = q.assetClass;
    if (q.category) where.category = q.category;
    const items = await prisma.deal.findMany({
      where,
      orderBy: { updateDate: 'desc' },
    });
    return { items };
  });

  app.post('/', { onRequest: [app.requireAgent] }, async (req) => {
    const body = dealInput.parse(req.body);
    const deal = await prisma.deal.create({
      data: { agentId: requireUser(req).id, ...normalize(body) },
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
  return data;
}
