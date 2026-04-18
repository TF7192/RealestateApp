import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import path from 'node:path';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { requireUser } from '../middleware/auth.js';
import { propertySlug, ensureUniqueSlug } from '../lib/slug.js';
import { putUpload, deleteUpload, urlToKey } from '../lib/storage.js';

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
  agentId: z.string().optional(),
  mine: z.string().optional(),
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
  // New: link this property to an existing Owner record (the canonical
  // persona table). When omitted, an Owner row is created/looked up from
  // the inline `owner` + `ownerPhone` fields.
  propertyOwnerId: z.string().nullable().optional(),
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
    if (q.agentId) where.agentId = q.agentId;
    // `mine=1` returns only the current agent's properties (requires auth)
    if (q.mine === '1' || q.mine === 'true') {
      const user = (req as any)[Symbol.for('estia.user')];
      if (!user) return { items: [] };
      where.agentId = user.id;
    }
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
        videos: { orderBy: { sortOrder: 'asc' } },
        propertyOwner: true,
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
        videos: { orderBy: { sortOrder: 'asc' } },
        propertyOwner: true,
      },
    });
    if (!property) return reply.code(404).send({ error: { message: 'Not found' } });
    return { property: serialize(property) };
  });

  // Resolve or create the Owner row for this property.
  // - If `propertyOwnerId` is supplied, verify it belongs to the agent.
  // - Else, look for an existing Owner with the same name+phone for this
  //   agent (dedupe). Else create a fresh Owner row.
  async function resolveOwnerId(
    agentId: string,
    body: { propertyOwnerId?: string | null; owner?: string; ownerPhone?: string; ownerEmail?: string | null }
  ): Promise<string | null> {
    if (body.propertyOwnerId) {
      const o = await prisma.owner.findFirst({
        where: { id: body.propertyOwnerId, agentId },
        select: { id: true },
      });
      return o?.id || null;
    }
    const name = (body.owner || '').trim();
    const phone = (body.ownerPhone || '').trim();
    if (!name && !phone) return null;
    const phoneDigits = phone.replace(/[^\d]/g, '');
    if (phoneDigits) {
      const existing = await prisma.owner.findFirst({
        where: {
          agentId,
          OR: [
            { phone },
            { phone: { contains: phoneDigits.slice(-9) } }, // last-9-digit fuzzy match
          ],
        },
        select: { id: true },
      });
      if (existing) return existing.id;
    }
    const created = await prisma.owner.create({
      data: {
        agentId,
        name: name || 'בעל לא מזוהה',
        phone,
        email: body.ownerEmail || null,
      },
      select: { id: true },
    });
    return created.id;
  }

  app.post('/', { onRequest: [app.requireAgent] }, async (req) => {
    const body = propertyInput.parse(req.body);
    const agentId = requireUser(req).id;
    const data = normalize(body);
    const propertyOwnerId = await resolveOwnerId(agentId, body);
    const slugBase = propertySlug(data);
    const slug = await ensureUniqueSlug(slugBase, async (cand) => {
      const x = await prisma.property.findFirst({ where: { agentId, slug: cand } });
      return !!x;
    });
    const created = await prisma.property.create({
      data: {
        agentId,
        slug,
        propertyOwnerId,
        ...data,
        marketingActions: {
          create: DEFAULT_ACTION_KEYS.map((key) => ({ actionKey: key })),
        },
        images: body.images
          ? { create: body.images.map((url, i) => ({ url, sortOrder: i })) }
          : undefined,
      },
      include: { images: true, marketingActions: true, propertyOwner: true },
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
    // If owner fields changed (name/phone/email) AND no explicit
    // propertyOwnerId was sent, fall back to dedupe-or-create.
    let propertyOwnerId: string | null | undefined;
    if (body.propertyOwnerId !== undefined) {
      propertyOwnerId = await resolveOwnerId(existing.agentId, body);
    } else if (body.owner !== undefined || body.ownerPhone !== undefined) {
      propertyOwnerId = await resolveOwnerId(existing.agentId, {
        owner: body.owner ?? existing.owner,
        ownerPhone: body.ownerPhone ?? existing.ownerPhone,
        ownerEmail: body.ownerEmail !== undefined ? body.ownerEmail : existing.ownerEmail,
      });
    }
    const updated = await prisma.property.update({
      where: { id },
      data: {
        ...normalize(body),
        ...(propertyOwnerId !== undefined ? { propertyOwnerId } : {}),
      },
      include: { images: true, marketingActions: true, propertyOwner: true },
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
    link: z.string().max(500).nullable().optional(),
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
        link: body.link ?? undefined,
      },
      update: {
        done: body.done,
        doneAt: body.done ? new Date() : null,
        notes: body.notes ?? undefined,
        link: body.link ?? undefined,
      },
    });
    return { action };
  });

  // Delete a property image
  app.delete('/:id/images/:imageId', { onRequest: [app.requireAgent] }, async (req, reply) => {
    const { id, imageId } = req.params as { id: string; imageId: string };
    const property = await prisma.property.findUnique({ where: { id } });
    if (!property || property.agentId !== requireUser(req).id) {
      return reply.code(404).send({ error: { message: 'Not found' } });
    }
    const img = await prisma.propertyImage.findUnique({ where: { id: imageId } });
    if (!img || img.propertyId !== id) {
      return reply.code(404).send({ error: { message: 'Image not found' } });
    }
    // Best-effort: remove the underlying file (S3 or disk) — DB row is
    // dropped either way so a stale storage object is harmless.
    const key = urlToKey(img.url);
    if (key) { try { await deleteUpload(key); } catch { /* noop */ } }
    await prisma.propertyImage.delete({ where: { id: imageId } });
    return { ok: true };
  });

  // Reorder — accepts {order: [imageId, imageId, ...]}; images not listed keep
  // their current sortOrder. Useful for drag-reorder and set-as-cover flows.
  const reorderInput = z.object({ order: z.array(z.string()).min(1) });
  app.put('/:id/images/reorder', { onRequest: [app.requireAgent] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = reorderInput.parse(req.body);
    const property = await prisma.property.findUnique({
      where: { id },
      include: { images: true },
    });
    if (!property || property.agentId !== requireUser(req).id) {
      return reply.code(404).send({ error: { message: 'Not found' } });
    }
    const owned = new Set(property.images.map((i) => i.id));
    const ops = body.order
      .filter((imgId) => owned.has(imgId))
      .map((imgId, idx) => prisma.propertyImage.update({
        where: { id: imgId },
        data: { sortOrder: idx },
      }));
    await prisma.$transaction(ops);
    const updated = await prisma.propertyImage.findMany({
      where: { propertyId: id },
      orderBy: { sortOrder: 'asc' },
    });
    return { images: updated };
  });

  // ─── Videos ───────────────────────────────────────────────
  // List videos for a property (public so customer view can watch them)
  app.get('/:id/videos', async (req) => {
    const { id } = req.params as { id: string };
    const videos = await prisma.propertyVideo.findMany({
      where: { propertyId: id },
      orderBy: { sortOrder: 'asc' },
    });
    return { videos };
  });

  // Upload a video (multipart, field: file)
  app.post('/:id/videos', { onRequest: [app.requireAgent] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const property = await prisma.property.findUnique({ where: { id } });
    if (!property || property.agentId !== requireUser(req).id) {
      return reply.code(404).send({ error: { message: 'Not found' } });
    }
    const file = await req.file();
    if (!file) return reply.code(400).send({ error: { message: 'No file' } });
    if (!file.mimetype.startsWith('video/')) {
      return reply.code(400).send({ error: { message: 'רק קבצי וידאו' } });
    }
    const ext = path.extname(file.filename) || '.mp4';
    const name = `${crypto.randomUUID()}${ext}`;
    const key = `videos/${id}/${name}`;
    const buffer = await file.toBuffer();
    const url = await putUpload(key, buffer, file.mimetype);
    const existing = await prisma.propertyVideo.count({ where: { propertyId: id } });
    const video = await prisma.propertyVideo.create({
      data: {
        propertyId: id,
        url,
        kind: 'upload',
        title: file.filename,
        mimeType: file.mimetype,
        sizeBytes: buffer.byteLength,
        sortOrder: existing,
      },
    });
    return { video };
  });

  // Attach an external URL (YouTube / Vimeo / Drive)
  const externalSchema = z.object({
    url: z.string().url(),
    title: z.string().max(200).nullable().optional(),
  });
  app.post('/:id/videos/external', { onRequest: [app.requireAgent] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = externalSchema.parse(req.body);
    const property = await prisma.property.findUnique({ where: { id } });
    if (!property || property.agentId !== requireUser(req).id) {
      return reply.code(404).send({ error: { message: 'Not found' } });
    }
    const existing = await prisma.propertyVideo.count({ where: { propertyId: id } });
    const video = await prisma.propertyVideo.create({
      data: {
        propertyId: id,
        url: body.url,
        kind: 'external',
        title: body.title ?? null,
        sortOrder: existing,
      },
    });
    return { video };
  });

  // Delete a video (owner only)
  app.delete('/:id/videos/:videoId', { onRequest: [app.requireAgent] }, async (req, reply) => {
    const { id, videoId } = req.params as { id: string; videoId: string };
    const property = await prisma.property.findUnique({ where: { id } });
    if (!property || property.agentId !== requireUser(req).id) {
      return reply.code(404).send({ error: { message: 'Not found' } });
    }
    const video = await prisma.propertyVideo.findUnique({ where: { id: videoId } });
    if (!video || video.propertyId !== id) {
      return reply.code(404).send({ error: { message: 'Video not found' } });
    }
    if (video.kind === 'upload' && video.url.startsWith('/uploads/')) {
      try {
        const uploadsDir = path.resolve(process.env.UPLOADS_DIR || './uploads');
        const rel = video.url.replace(/^\/uploads\//, '');
        await fs.unlink(path.join(uploadsDir, rel));
      } catch { /* ignore missing */ }
    }
    await prisma.propertyVideo.delete({ where: { id: videoId } });
    return { ok: true };
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
    const ext = path.extname(file.filename) || '.bin';
    const name = `${crypto.randomUUID()}${ext}`;
    const key = `properties/${id}/${name}`;
    const url = await putUpload(key, await file.toBuffer(), file.mimetype);
    const image = await prisma.propertyImage.create({
      data: { propertyId: id, url, sortOrder: 9999 },
    });
    return { image };
  });
};

function normalize(body: Partial<z.infer<typeof propertyInput>>) {
  const data: any = { ...body };
  delete data.images;
  // propertyOwnerId is handled separately in the route — strip it from the
  // raw update payload so it doesn't bypass the resolveOwnerId() pathway.
  delete data.propertyOwnerId;
  if (data.exclusiveStart) data.exclusiveStart = new Date(data.exclusiveStart);
  if (data.exclusiveEnd) data.exclusiveEnd = new Date(data.exclusiveEnd);
  return data;
}

function serialize(prop: any) {
  const actionsMap: Record<string, boolean> = {};
  const actionsDetail: Record<string, any> = {};
  for (const key of DEFAULT_ACTION_KEYS) {
    actionsMap[key] = false;
    actionsDetail[key] = { done: false, notes: null, link: null, doneAt: null };
  }
  for (const a of prop.marketingActions || []) {
    actionsMap[a.actionKey] = a.done;
    actionsDetail[a.actionKey] = {
      done: a.done,
      notes: a.notes,
      link: a.link,
      doneAt: a.doneAt,
    };
  }
  return {
    ...prop,
    // Back-compat: `images` is the list of URLs (what most UI uses today).
    // `imageList` is the full [{id, url, sortOrder}] for the photo manager.
    images: (prop.images || []).map((i: any) => i.url),
    imageList: (prop.images || []).map((i: any) => ({
      id: i.id, url: i.url, sortOrder: i.sortOrder,
    })),
    videos: prop.videos || [],
    marketingActions: actionsMap,
    marketingActionsDetail: actionsDetail,
  };
}
