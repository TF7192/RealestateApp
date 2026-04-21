// Sprint 6 / MLS parity — Task F1. Per-channel marketing adverts.
// Nested under /properties/:propertyId/adverts so scope + ownership
// are trivial to enforce (the property's agentId is the gate).
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireUser } from '../middleware/auth.js';
import { logActivity } from '../lib/activity.js';

const advertInput = z.object({
  channel: z.enum([
    'YAD2', 'ONMAP', 'MADLAN', 'FACEBOOK',
    'WHATSAPP', 'INSTAGRAM', 'WEBSITE', 'OTHER',
  ]),
  status: z.enum(['DRAFT', 'PUBLISHED', 'PAUSED', 'EXPIRED', 'REMOVED']).optional(),
  title:  z.string().max(200).nullable().optional(),
  body:   z.string().max(4000).nullable().optional(),
  publishedPrice: z.number().int().nonnegative().nullable().optional(),
  externalUrl: z.string().url().nullable().optional(),
  externalId:  z.string().max(120).nullable().optional(),
  publishedAt: z.string().datetime().nullable().optional(),
  expiresAt:   z.string().datetime().nullable().optional(),
});

async function ensureOwnsProperty(propertyId: string, agentId: string) {
  const row = await prisma.property.findFirst({
    where: { id: propertyId, agentId },
    select: { id: true },
  });
  return !!row;
}

function normalize(body: Partial<z.infer<typeof advertInput>>) {
  const data: any = { ...body };
  if (data.publishedAt) data.publishedAt = new Date(data.publishedAt);
  if (data.expiresAt)   data.expiresAt   = new Date(data.expiresAt);
  return data;
}

export const registerAdvertRoutes: FastifyPluginAsync = async (app) => {
  app.get('/properties/:propertyId/adverts', { onRequest: [app.requireAgent] }, async (req, reply) => {
    const { propertyId } = req.params as { propertyId: string };
    const uid = requireUser(req).id;
    if (!(await ensureOwnsProperty(propertyId, uid))) {
      return reply.code(404).send({ error: { message: 'Property not found' } });
    }
    const items = await prisma.advert.findMany({
      where: { propertyId, agentId: uid },
      orderBy: { createdAt: 'desc' },
    });
    return { items };
  });

  app.post('/properties/:propertyId/adverts', { onRequest: [app.requireAgent] }, async (req, reply) => {
    const { propertyId } = req.params as { propertyId: string };
    const uid = requireUser(req).id;
    if (!(await ensureOwnsProperty(propertyId, uid))) {
      return reply.code(404).send({ error: { message: 'Property not found' } });
    }
    const body = advertInput.parse(req.body);
    const created = await prisma.advert.create({
      data: { agentId: uid, propertyId, ...normalize(body) },
    });
    await logActivity({
      agentId: uid, actorId: uid,
      verb: 'created', entityType: 'Advert', entityId: created.id,
      summary: `נוצר פרסום: ${created.channel}`,
      metadata: { channel: created.channel, status: created.status },
    });
    return { advert: created };
  });

  app.patch('/adverts/:id', { onRequest: [app.requireAgent] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const uid = requireUser(req).id;
    const existing = await prisma.advert.findFirst({ where: { id, agentId: uid } });
    if (!existing) return reply.code(404).send({ error: { message: 'Advert not found' } });
    const body = advertInput.partial().parse(req.body);
    const updated = await prisma.advert.update({
      where: { id },
      data: normalize(body),
    });
    await logActivity({
      agentId: uid, actorId: uid,
      verb: 'updated', entityType: 'Advert', entityId: updated.id,
      summary: `עודכן פרסום: ${updated.channel}`,
      metadata: { channel: updated.channel, status: updated.status },
    });
    return { advert: updated };
  });

  app.delete('/adverts/:id', { onRequest: [app.requireAgent] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const uid = requireUser(req).id;
    const existing = await prisma.advert.findFirst({ where: { id, agentId: uid } });
    if (!existing) return reply.code(404).send({ error: { message: 'Advert not found' } });
    await prisma.advert.delete({ where: { id } });
    await logActivity({
      agentId: uid, actorId: uid,
      verb: 'deleted', entityType: 'Advert', entityId: id,
      summary: `נמחק פרסום: ${existing.channel}`,
      metadata: { channel: existing.channel, status: existing.status },
    });
    return { ok: true };
  });
};
