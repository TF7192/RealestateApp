import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import path from 'node:path';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { requireUser } from '../middleware/auth.js';
import { tryServiceTokenAuth } from '../middleware/service-token.js';
import { propertySlug, ensureUniqueSlug } from '../lib/slug.js';
import { putUpload, deleteUpload, urlToKey } from '../lib/storage.js';
import { track as phTrack } from '../lib/analytics.js';
import { assertAllowedMime } from '../lib/uploadGuards.js';
import { evaluateLeadProperty } from '../lib/matching.js';
import { logActivity } from '../lib/activity.js';

// Canonical action keys for newly-created properties. `externalCoop` is
// kept in existing rows but new keys use the renamed `brokerCoop`.
const DEFAULT_ACTION_KEYS = [
  'tabuExtract', 'photography', 'buildingPhoto', 'dronePhoto', 'virtualTour',
  'sign', 'iList', 'yad2', 'facebook', 'marketplace', 'onMap', 'madlan',
  'whatsappGroup', 'officeWhatsapp', 'brokerCoop', 'video', 'neighborLetters',
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
  // Sprint 1 / MLS parity — Task J9. Extended life-cycle values:
  // INACTIVE (לא אקטואלי), CANCELLED (מבוטל), IN_DEAL (עיסקה).
  status: z
    .enum(['ACTIVE', 'PAUSED', 'SOLD', 'RENTED', 'ARCHIVED', 'INACTIVE', 'CANCELLED', 'IN_DEAL'])
    .optional(),
  type: z.string().min(1).max(60),
  street: z.string().min(1).max(120),
  city: z.string().min(1).max(80),
  lat: z.number().nullable().optional(),
  lng: z.number().nullable().optional(),
  // Task 3 · validated structured-address metadata. Supplied by the client
  // when the agent picks from the AddressField typeahead; optional so
  // existing flows without the picker (legacy rows, admin tools) still
  // write.
  placeId: z.string().max(120).nullable().optional(),
  formattedAddress: z.string().max(400).nullable().optional(),
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
  sqmTabu: z.number().int().nonnegative().nullable().optional(),
  sqmGross: z.number().int().nonnegative().nullable().optional(),
  sqmNet: z.number().int().nonnegative().nullable().optional(),
  rooms: z.number().nullable().optional(),
  floor: z.number().int().nullable().optional(),
  totalFloors: z.number().int().nullable().optional(),
  // Elevator
  elevator: z.boolean().optional(),
  elevatorCount: z.number().int().nonnegative().nullable().optional(),
  shabbatElevator: z.boolean().optional(),
  // State
  renovated: z.string().max(60).nullable().optional(),
  buildState: z.string().max(60).nullable().optional(),
  // Vacancy
  vacancyDate: z.string().max(60).nullable().optional(),
  vacancyFlexible: z.boolean().optional(),
  // Parking
  parking: z.boolean().optional(),
  parkingType: z.string().max(40).nullable().optional(),
  parkingCount: z.number().int().nonnegative().nullable().optional(),
  parkingCovered: z.boolean().optional(),
  parkingCoupled: z.boolean().optional(),
  parkingTandem: z.boolean().optional(),
  parkingEvCharger: z.boolean().optional(),
  nearbyParking: z.boolean().optional(),
  // Storage
  storage: z.boolean().optional(),
  storageLocation: z.string().max(40).nullable().optional(),
  storageSize: z.number().int().nonnegative().nullable().optional(),
  // Shelters & amenities
  balconySize: z.number().int().nonnegative().optional(),
  // 1.1 Balcony type sub-option — "SUNNY" (שמש) / "COVERED" (מקורה).
  balconyType: z.enum(['SUNNY', 'COVERED']).nullable().optional(),
  airDirections: z.string().max(120).nullable().optional(),
  ac: z.boolean().optional(),
  safeRoom: z.boolean().optional(),
  floorShelter: z.boolean().optional(),
  shelter: z.boolean().optional(),
  buildingAge: z.number().int().nullable().optional(),
  sector: z.string().max(60).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  // Registry / fees
  neighborhood: z.string().max(80).nullable().optional(),
  gush: z.string().max(40).nullable().optional(),
  helka: z.string().max(40).nullable().optional(),
  arnonaAmount: z.number().int().nonnegative().nullable().optional(),
  buildingCommittee: z.number().int().nonnegative().nullable().optional(),
  // Commercial-specific amenities
  kitchenette: z.boolean().optional(),
  meetingRoom: z.boolean().optional(),
  workstations: z.number().int().nonnegative().nullable().optional(),
  lobbySecurity: z.boolean().optional(),
  // 3.2 Commercial zone tag (e.g. "איזור תעשיה"). Residential rows keep NULL.
  commercialZone: z.string().max(60).nullable().optional(),
  // 1.3 Explicit listing-on-market date. When NULL the UI falls back to createdAt.
  marketingStartDate: z.string().datetime().nullable().optional(),
  // Exclusivity agreement is set via its own upload endpoint, not here.
  marketingReminderFrequency: z.enum(['DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY']).optional(),
  // Sprint 1 / MLS parity — Task J9. Pipeline admin block.
  stage: z
    .enum([
      'WATCHING', 'PRE_ACQUISITION', 'IN_PROGRESS',
      'SIGNED_NON_EXCLUSIVE', 'SIGNED_EXCLUSIVE',
      'EXCLUSIVITY_ENDED', 'REFUSED_BROKERAGE', 'REMOVED',
    ])
    .nullable()
    .optional(),
  // Accepts percentages (e.g. 2, 2.5). Commission is opt-in so leaving
  // it off doesn't force a value on legacy rows.
  agentCommissionPct: z.number().min(0).max(100).nullable().optional(),
  primaryAgentId: z.string().nullable().optional(),
  exclusivityExpire: z.string().datetime().nullable().optional(),
  sellerSeriousness: z.enum(['NONE', 'SORT_OF', 'MEDIUM', 'VERY']).nullable().optional(),
  brokerNotes: z.string().max(4000).nullable().optional(),

  // Sprint 3 / MLS parity — Tasks J4–J7. Extras for Nadlan parity.
  condition: z
    .enum(['NEW', 'AS_NEW', 'RENOVATED', 'PRESERVED', 'NEEDS_RENOVATION', 'NEEDS_TLC', 'RAW'])
    .nullable()
    .optional(),
  heatingTypes:     z.array(z.string().max(40)).optional(),
  halfRooms:        z.number().int().min(0).max(10).nullable().optional(),
  masterBedroom:    z.boolean().optional(),
  bathrooms:        z.number().int().min(0).max(20).nullable().optional(),
  toilets:          z.number().int().min(0).max(20).nullable().optional(),
  furnished:        z.boolean().optional(),
  petFriendly:      z.boolean().optional(),
  doormenService:   z.boolean().optional(),
  gym:              z.boolean().optional(),
  pool:             z.boolean().optional(),
  gatedCommunity:   z.boolean().optional(),
  accessibility:    z.boolean().optional(),
  utilityRoom:      z.boolean().optional(),
  listingSource:    z.string().max(40).nullable().optional(),

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
    // Perf (2026-04-22): this endpoint was pulling *every* image, every
    // video, and every marketing-action row for every property in the
    // agent's catalog. The list views (Properties, Customers, Dashboard)
    // only consume `images[0]` (the cover) + the marketing-action bool
    // map — not videos, not the full image gallery. For an agent with
    // 50 properties × ~10 images each that was 500+ image rows pulled
    // and serialized per request, blowing p95 to ~500 ms on a single
    // round-trip regardless of concurrency. See perf/SUMMARY.md F-1.
    //
    // Cover-only is safe: `serialize()` still emits `images: string[]`
    // and `imageList: {id,url,sortOrder}[]` — just of length 1 — so
    // callers that do `prop.images?.[0]` continue to work unchanged.
    // The detail endpoint (`GET /:id` below) still returns the full set.
    const items = await prisma.property.findMany({
      where,
      include: {
        images: { orderBy: { sortOrder: 'asc' }, take: 1 },
        marketingActions: true,
        propertyOwner: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    // List view uses only `marketingActions` (bool map) — the heavier
    // `marketingActionsDetail` block (done/notes/link/doneAt per action)
    // is ~1.4 KB per property and only consumed by PropertyDetail,
    // which has its own endpoint. Pass `{ compact: true }` to drop it.
    return { items: items.map((p) => serialize(p, { compact: true })) };
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
        // 1.4 — surface real counts so the UI can render the combined
        // "עמוד הנכס נצפה N פעמים · M פניות" tile without a second query.
        _count: { select: { viewings: true, inquiries: true, prospects: true } },
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

  app.post('/', { onRequest: [tryServiceTokenAuth, app.requireAgent] }, async (req) => {
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
        // 1.3 — default marketingStartDate to now so "Days on Market" is
        // accurate from the moment the property is listed, not from
        // whatever row-insert time that happens to be the same here but
        // could diverge on future bulk imports.
        marketingStartDate: data.marketingStartDate ?? new Date(),
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
    phTrack('property_created', agentId, {
      property_id: created.id,
      asset_class: created.assetClass,
      category: created.category,
      city: created.city,
      has_photos: (body.images?.length || 0) > 0,
    });
    await logActivity({
      agentId, actorId: agentId,
      verb: 'created', entityType: 'Property', entityId: created.id,
      summary: `נכס חדש: ${created.street}, ${created.city}`,
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
    await logActivity({
      agentId: existing.agentId, actorId: requireUser(req).id,
      verb: 'updated', entityType: 'Property', entityId: id,
      summary: `עודכן נכס: ${updated.street}, ${updated.city}`,
      metadata: { fields: Object.keys(body) },
    });
    return { property: serialize(updated) };
  });

  // 5.1 — Duplicate. Clones the property *definition* (address, specs,
  // price, owner, photos) into a fresh draft; intentionally does NOT
  // copy marketing activities, viewings/inquiries/prospects, or deal
  // history — those belong to the original listing.
  app.post('/:id/duplicate', { onRequest: [app.requireAgent] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const agentId = requireUser(req).id;
    const source = await prisma.property.findUnique({
      where: { id },
      include: { images: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!source || source.agentId !== agentId) {
      return reply.code(404).send({ error: { message: 'Not found' } });
    }
    const {
      id: _, createdAt: __, updatedAt: ___, slug: ____,
      // Don't inherit exclusivity, deal, status — fresh draft starts
      // with ACTIVE status and no dates.
      exclusiveStart: _es, exclusiveEnd: _ee, exclusivityAgreementUrl: _ea,
      closingPrice: _cp, lastContact: _lc, lastContactNotes: _lcn,
      marketingStartDate: _msd,
      status: _st,
      images: sourceImages,
      ...payload
    } = source as any;
    const dupSlugBase = propertySlug({
      ...payload,
      street: payload.street,
      city: payload.city,
    });
    const newSlug = await ensureUniqueSlug(dupSlugBase, async (cand) => {
      const x = await prisma.property.findFirst({ where: { agentId, slug: cand } });
      return !!x;
    });
    const created = await prisma.property.create({
      data: {
        ...payload,
        slug: newSlug,
        status: 'ACTIVE',
        // Mark the copy so agents eyeballing the list see it instantly.
        notes: payload.notes ? `${payload.notes}\n\n(עותק)` : '(עותק)',
        marketingStartDate: new Date(),
        // Re-seed the marketing checklist — every new listing gets its own.
        marketingActions: {
          create: DEFAULT_ACTION_KEYS.map((key) => ({ actionKey: key })),
        },
        // Photos — copy the URLs only (point at the same S3 objects); the
        // agent can delete them or re-upload per listing if needed.
        images: sourceImages?.length
          ? { create: sourceImages.map((img: any, i: number) => ({ url: img.url, sortOrder: i })) }
          : undefined,
      },
      include: { images: true, marketingActions: true, propertyOwner: true },
    });
    return { property: serialize(created) };
  });

  app.delete('/:id', { onRequest: [app.requireAgent] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const existing = await prisma.property.findUnique({ where: { id } });
    if (!existing || existing.agentId !== requireUser(req).id) {
      return reply.code(404).send({ error: { message: 'Not found' } });
    }
    await prisma.property.delete({ where: { id } });
    await logActivity({
      agentId: existing.agentId, actorId: requireUser(req).id,
      verb: 'deleted', entityType: 'Property', entityId: id,
      summary: `נמחק נכס: ${existing.street}, ${existing.city}`,
    });
    return { ok: true };
  });

  // Sprint 5 / MLS parity — Task J10. Secondary assignee management.
  app.get('/:id/assignees', { onRequest: [app.requireAgent] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const uid = requireUser(req).id;
    const prop = await prisma.property.findFirst({ where: { id, agentId: uid } });
    if (!prop) return reply.code(404).send({ error: { message: 'Not found' } });
    const items = await prisma.propertyAssignee.findMany({
      where: { propertyId: id },
      include: { user: { select: { id: true, displayName: true, email: true, role: true } } },
      orderBy: { assignedAt: 'asc' },
    });
    return { items };
  });

  const assigneeInput = z.object({
    userId: z.string().min(1).max(40),
    role:   z.enum(['CO_AGENT', 'OBSERVER']).optional(),
  });
  app.post('/:id/assignees', { onRequest: [app.requireAgent] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const uid = requireUser(req).id;
    const prop = await prisma.property.findFirst({ where: { id, agentId: uid } });
    if (!prop) return reply.code(404).send({ error: { message: 'Not found' } });
    const body = assigneeInput.parse(req.body);
    // Assignee must belong to the same office (if any) so cross-office
    // leakage is impossible.
    const me = await prisma.user.findUnique({ where: { id: uid }, select: { officeId: true } });
    const target = await prisma.user.findUnique({
      where: { id: body.userId },
      select: { id: true, officeId: true },
    });
    if (!target) return reply.code(404).send({ error: { message: 'User not found' } });
    if (me?.officeId && target.officeId !== me.officeId) {
      return reply.code(403).send({ error: { message: 'אפשר לשייך רק סוכנים מאותו משרד' } });
    }
    const row = await prisma.propertyAssignee.upsert({
      where: { propertyId_userId: { propertyId: id, userId: body.userId } },
      create: { propertyId: id, userId: body.userId, role: body.role ?? 'CO_AGENT' },
      update: { role: body.role ?? 'CO_AGENT' },
    });
    await logActivity({
      agentId: prop.agentId, actorId: uid,
      verb: 'assigned', entityType: 'Property', entityId: id,
      summary: `סוכן שותף נוסף לנכס`,
      metadata: { userId: body.userId, role: row.role },
    });
    return { assignee: row };
  });

  app.delete('/:id/assignees/:userId', { onRequest: [app.requireAgent] }, async (req, reply) => {
    const { id, userId } = req.params as { id: string; userId: string };
    const uid = requireUser(req).id;
    const prop = await prisma.property.findFirst({ where: { id, agentId: uid } });
    if (!prop) return reply.code(404).send({ error: { message: 'Not found' } });
    await prisma.propertyAssignee.deleteMany({
      where: { propertyId: id, userId },
    });
    await logActivity({
      agentId: prop.agentId, actorId: uid,
      verb: 'unassigned', entityType: 'Property', entityId: id,
      metadata: { userId },
    });
    return { ok: true };
  });

  // Sprint 2 / MLS parity — Task C3. Reverse direction: leads from the
  // signed-in agent that match this property, sorted by match score.
  app.get('/:id/matching-customers', { onRequest: [app.requireAgent] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const uid = requireUser(req).id;
    const property = await prisma.property.findFirst({
      where: { id, agentId: uid },
    });
    if (!property) return reply.code(404).send({ error: { message: 'Property not found' } });
    const leads = await prisma.lead.findMany({
      where: { agentId: uid },
      include: { searchProfiles: true },
    });
    const scored = leads
      .map((l: any) => ({ l, sig: evaluateLeadProperty(l, property as any) }))
      .filter((r) => r.sig.matches)
      .sort((a, b) => b.sig.score - a.sig.score)
      .map((r) => ({
        lead: {
          id:            r.l.id,
          name:          r.l.name,
          phone:         r.l.phone,
          email:         r.l.email,
          city:          r.l.city,
          budget:        r.l.budget,
          rooms:         r.l.rooms,
          lookingFor:    r.l.lookingFor,
          interestType:  r.l.interestType,
          status:        r.l.status,
          customerStatus: r.l.customerStatus,
          leadStatus:    r.l.leadStatus,
        },
        score:   r.sig.score,
        reasons: r.sig.reasons,
      }));
    return { items: scored };
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
    // F-11.7 — whitelist (was startsWith('video/') which accepts
    // obscure types; restrict to mp4 + quicktime).
    try { assertAllowedMime(file, 'video'); }
    catch { return reply.code(415).send({ error: { message: 'פורמט וידאו לא נתמך (mp4 / mov בלבד)' } }); }
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

  // Upload the signed exclusivity-agreement PDF (required for Yad2).
  // Single file, replaces any existing agreement. Stored in S3 (or local
  // fallback in dev) under agreements/<propertyId>/<uuid>.pdf.
  app.post('/:id/agreement', { onRequest: [app.requireAgent] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const property = await prisma.property.findUnique({ where: { id } });
    if (!property || property.agentId !== requireUser(req).id) {
      return reply.code(404).send({ error: { message: 'Not found' } });
    }
    const file = await req.file();
    if (!file) return reply.code(400).send({ error: { message: 'No file' } });
    try { assertAllowedMime(file, 'pdf'); }
    catch { return reply.code(415).send({ error: { message: 'רק קבצי PDF' } }); }
    const key = `agreements/${id}/${crypto.randomUUID()}.pdf`;
    const url = await putUpload(key, await file.toBuffer(), file.mimetype);
    const updated = await prisma.property.update({
      where: { id },
      data: { exclusivityAgreementUrl: url },
    });
    return { exclusivityAgreementUrl: updated.exclusivityAgreementUrl };
  });

  // Clear the exclusivity agreement pointer (does not delete the S3 object —
  // kept for audit / re-activation).
  app.delete('/:id/agreement', { onRequest: [app.requireAgent] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const property = await prisma.property.findUnique({ where: { id } });
    if (!property || property.agentId !== requireUser(req).id) {
      return reply.code(404).send({ error: { message: 'Not found' } });
    }
    await prisma.property.update({
      where: { id },
      data: { exclusivityAgreementUrl: null },
    });
    return { ok: true };
  });

  // Upload a property image
  // S5: iPhones shoot HEIC by default. Browsers (Chrome, Firefox,
  // Android WhatsApp previews) don't render HEIC, so an agent uploading
  // straight from camera-roll ships photos their customers can't see.
  // Detect HEIC/HEIF and transcode to JPEG before writing to S3. The
  // rest of the pipeline never sees the HEIC.
  app.post('/:id/images', { onRequest: [app.requireAgent] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const property = await prisma.property.findUnique({ where: { id } });
    if (!property || property.agentId !== requireUser(req).id) {
      return reply.code(404).send({ error: { message: 'Not found' } });
    }
    const file = await req.file();
    if (!file) return reply.code(400).send({ error: { message: 'No file' } });
    // F-11.7 — whitelist (was startsWith('image/') which accepts
    // SVG; SVG served from the same origin can execute script in the
    // app's auth context). jpg/png/webp/heic only.
    try { assertAllowedMime(file, 'image'); }
    catch { return reply.code(415).send({ error: { message: 'פורמט תמונה לא נתמך (jpg / png / webp / heic בלבד)' } }); }

    let buffer = await file.toBuffer();
    let mimetype = file.mimetype;
    let ext = path.extname(file.filename) || '.jpg';

    const isHeic =
      mimetype === 'image/heic' ||
      mimetype === 'image/heif' ||
      /\.(heic|heif)$/i.test(file.filename || '');

    if (isHeic) {
      try {
        // heic-convert handles the container; sharp then normalizes the
        // decoded buffer (orientation, reasonable size) and re-encodes
        // as quality-82 JPEG (visually lossless for property photos).
        const heicConvert = (await import('heic-convert')).default;
        const sharp = (await import('sharp')).default;
        const jpegIntermediate = await heicConvert({
          buffer,
          format: 'JPEG',
          quality: 0.9,
        });
        buffer = await sharp(Buffer.from(jpegIntermediate))
          .rotate() // honor EXIF orientation
          .resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 82, mozjpeg: true })
          .toBuffer();
        mimetype = 'image/jpeg';
        ext = '.jpg';
      } catch (e) {
        req.log.warn({ err: e }, 'heic conversion failed, aborting upload');
        return reply.code(415).send({
          error: { message: 'לא הצלחנו לעבד את התמונה. נסו לשלוח JPEG או PNG.' },
        });
      }
    }

    const name = `${crypto.randomUUID()}${ext}`;
    const key = `properties/${id}/${name}`;
    const url = await putUpload(key, buffer, mimetype);
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
  // Sprint 1 / MLS parity — Task J9. `exclusivityExpire` is orthogonal
  // to `exclusiveStart/End` (the latter is the mid-deal exclusivity
  // window; the former is the broader broker-exclusivity expiry).
  if (data.exclusivityExpire) data.exclusivityExpire = new Date(data.exclusivityExpire);
  // 1.3 marketingStartDate arrives as an ISO string; materialize it to a
  // Date so Prisma accepts it. `null` stays null (explicitly wipe).
  if (data.marketingStartDate) data.marketingStartDate = new Date(data.marketingStartDate);
  // 1.1 Guard-rail: if balconySize is 0 the type tag is meaningless —
  // clear it so the DB doesn't carry orphan "SUNNY" labels.
  if (data.balconySize === 0 && data.balconyType !== undefined) {
    data.balconyType = null;
  }
  return data;
}

function serialize(prop: any, opts: { compact?: boolean } = {}) {
  const actionsMap: Record<string, boolean> = {};
  const actionsDetail: Record<string, any> | null = opts.compact ? null : {};
  for (const key of DEFAULT_ACTION_KEYS) {
    actionsMap[key] = false;
    if (actionsDetail) actionsDetail[key] = { done: false, notes: null, link: null, doneAt: null };
  }
  for (const a of prop.marketingActions || []) {
    actionsMap[a.actionKey] = a.done;
    if (actionsDetail) {
      actionsDetail[a.actionKey] = {
        done: a.done,
        notes: a.notes,
        link: a.link,
        doneAt: a.doneAt,
      };
    }
  }
  const out: any = {
    ...prop,
    // Back-compat: `images` is the list of URLs (what most UI uses today).
    // `imageList` is the full [{id, url, sortOrder}] for the photo manager.
    images: (prop.images || []).map((i: any) => i.url),
    imageList: (prop.images || []).map((i: any) => ({
      id: i.id, url: i.url, sortOrder: i.sortOrder,
    })),
    videos: prop.videos || [],
    marketingActions: actionsMap,
  };
  if (actionsDetail) out.marketingActionsDetail = actionsDetail;
  return out;
}
