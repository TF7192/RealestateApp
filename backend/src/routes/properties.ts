import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import path from 'node:path';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { requireUser } from '../middleware/auth.js';

const DEFAULT_ACTION_KEYS = [
  'tabuExtract', 'photography', 'buildingPhoto', 'dronePhoto', 'virtualTour',
  'sign', 'iList', 'yad2', 'facebook', 'marketplace', 'onMap', 'madlan',
  'whatsappGroup', 'officeWhatsapp', 'externalCoop', 'video', 'neighborLetters',
  'coupons', 'flyers', 'newspaper', 'agentTour', 'openHouse',
];

const listQuery = z.object({
  assetClass: z.enum(['RESIDENTIAL', 'COMMERCIAL']).optional(),
  category: z.enum(['SALE', 'RENT']).optional(),
  status: z.enum(['ACTIVE', 'PAUSED', 'SOLD', 'RENTED', 'ARCHIVED']).optional(),
  city: z.string().optional(),
  search: z.string().optional(),
});

const propertyInput = z.object({
  assetClass: z.enum(['RESIDENTIAL', 'COMMERCIAL']),
  category: z.enum(['SALE', 'RENT']),
  status: z.enum(['ACTIVE', 'PAUSED', 'SOLD', 'RENTED', 'ARCHIVED']).optional(),
  type: z.string().min(1).max(60),
  street: z.string().min(1).max(120),
  city: z.string().min(1).max(80),
  lat: z.number().nullable().optional(),
  lng: z.number().nullable().optional(),
  owner: z.string().min(1).max(120),
  ownerPhone: z.string().min(3).max(40),
  ownerEmail: z.string().email().nullable().optional(),
  exclusiveStart: z.string().datetime().nullable().optional(),
  exclusiveEnd: z.string().datetime().nullable().optional(),
  marketingPrice: z.number().int().nonnegative(),
  closingPrice: z.number().int().nonnegative().nullable().optional(),
  offer: z.number().int().nonnegative().nullable().optional(),
  sqm: z.number().int().nonnegative(),
  sqmArnona: z.number().int().nonnegative().nullable().optional(),
  rooms: z.number().nullable().optional(),
  floor: z.number().int().nullable().optional(),
  totalFloors: z.number().int().nullable().optional(),
  elevator: z.boolean().optional(),
  renovated: z.string().max(60).nullable().optional(),
  vacancyDate: z.string().max(60).nullable().optional(),
  parking: z.boolean().optional(),
  storage: z.boolean().optional(),
  balconySize: z.number().int().nonnegative().optional(),
  airDirections: z.string().max(120).nullable().optional(),
  ac: z.boolean().optional(),
  safeRoom: z.boolean().optional(),
  buildingAge: z.number().int().nullable().optional(),
  sector: z.string().max(60).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  marketingReminderFrequency: z.enum(['DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY']).optional(),
  images: z.array(z.string().url()).optional(),
});

export const registerPropertyRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', async (req) => {
    const q = listQuery.parse(req.query);
    const where: any = {};
    if (q.assetClass) where.assetClass = q.assetClass;
    if (q.category) where.category = q.category;
    if (q.status) where.status = q.status;
    if (q.city) where.city = q.city;
    if (q.search) {
      where.OR = [
        { street: { contains: q.search, mode: 'insensitive' } },
        { city: { contains: q.search, mode: 'insensitive' } },
        { owner: { contains: q.search, mode: 'insensitive' } },
        { type: { contains: q.search, mode: 'insensitive' } },
      ];
    }
    const items = await prisma.property.findMany({
      where,
      include: {
        images: { orderBy: { sortOrder: 'asc' } },
        marketingActions: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    return { items: items.map(serialize) };
  });

  app.get('/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const property = await prisma.property.findUnique({
      where: { id },
      include: {
        images: { orderBy: { sortOrder: 'asc' } },
        marketingActions: true,
      },
    });
    if (!property) return reply.code(404).send({ error: { message: 'Not found' } });
    return { property: serialize(property) };
  });

  app.post('/', { onRequest: [app.requireAgent] }, async (req) => {
    const body = propertyInput.parse(req.body);
    const created = await prisma.property.create({
      data: {
        agentId: requireUser(req).id,
        ...normalize(body),
        marketingActions: {
          create: DEFAULT_ACTION_KEYS.map((key) => ({ actionKey: key })),
        },
        images: body.images
          ? { create: body.images.map((url, i) => ({ url, sortOrder: i })) }
          : undefined,
      },
      include: { images: true, marketingActions: true },
    });
    return { property: serialize(created) };
  });

  app.patch('/:id', { onRequest: [app.requireAgent] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = propertyInput.partial().parse(req.body);
    const existing = await prisma.property.findUnique({ where: { id } });
    if (!existing || existing.agentId !== requireUser(req).id) {
      return reply.code(404).send({ error: { message: 'Not found' } });
    }
    const updated = await prisma.property.update({
      where: { id },
      data: normalize(body),
      include: { images: true, marketingActions: true },
    });
    return { property: serialize(updated) };
  });

  app.delete('/:id', { onRequest: [app.requireAgent] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const existing = await prisma.property.findUnique({ where: { id } });
    if (!existing || existing.agentId !== requireUser(req).id) {
      return reply.code(404).send({ error: { message: 'Not found' } });
    }
    await prisma.property.delete({ where: { id } });
    return { ok: true };
  });

  // Toggle / set a marketing action
  const actionInput = z.object({
    actionKey: z.string().min(1).max(60),
    done: z.boolean(),
    notes: z.string().max(500).nullable().optional(),
  });

  app.put('/:id/marketing-actions', { onRequest: [app.requireAgent] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = actionInput.parse(req.body);
    const property = await prisma.property.findUnique({ where: { id } });
    if (!property || property.agentId !== requireUser(req).id) {
      return reply.code(404).send({ error: { message: 'Not found' } });
    }
    const action = await prisma.marketingAction.upsert({
      where: { propertyId_actionKey: { propertyId: id, actionKey: body.actionKey } },
      create: {
        propertyId: id,
        actionKey: body.actionKey,
        done: body.done,
        doneAt: body.done ? new Date() : null,
        notes: body.notes ?? undefined,
      },
      update: {
        done: body.done,
        doneAt: body.done ? new Date() : null,
        notes: body.notes ?? undefined,
      },
    });
    return { action };
  });

  // Upload a property image
  app.post('/:id/images', { onRequest: [app.requireAgent] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const property = await prisma.property.findUnique({ where: { id } });
    if (!property || property.agentId !== requireUser(req).id) {
      return reply.code(404).send({ error: { message: 'Not found' } });
    }
    const file = await req.file();
    if (!file) return reply.code(400).send({ error: { message: 'No file' } });
    const uploadsDir = path.resolve(process.env.UPLOADS_DIR || './uploads');
    const subDir = path.join(uploadsDir, 'properties', id);
    await fs.mkdir(subDir, { recursive: true });
    const ext = path.extname(file.filename) || '.bin';
    const name = `${crypto.randomUUID()}${ext}`;
    const filePath = path.join(subDir, name);
    await fs.writeFile(filePath, await file.toBuffer());
    const relative = path.relative(uploadsDir, filePath);
    const url = `/uploads/${relative.replaceAll(path.sep, '/')}`;
    const image = await prisma.propertyImage.create({
      data: { propertyId: id, url, sortOrder: 9999 },
    });
    return { image };
  });
};

function normalize(body: Partial<z.infer<typeof propertyInput>>) {
  const data: any = { ...body };
  delete data.images;
  if (data.exclusiveStart) data.exclusiveStart = new Date(data.exclusiveStart);
  if (data.exclusiveEnd) data.exclusiveEnd = new Date(data.exclusiveEnd);
  return data;
}

function serialize(prop: any) {
  const actionsMap: Record<string, boolean> = {};
  for (const key of DEFAULT_ACTION_KEYS) actionsMap[key] = false;
  for (const a of prop.marketingActions || []) actionsMap[a.actionKey] = a.done;
  return {
    ...prop,
    images: (prop.images || []).map((i: any) => i.url),
    marketingActions: actionsMap,
  };
}
