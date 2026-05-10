import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import path from 'node:path';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { requireUser } from '../middleware/auth.js';

// SEC-010 admin override — platform ADMIN bypasses agent-ownership
// filters so support/data-fix work doesn't require impersonating the
// agent. Mirrors the override pattern in `requireAdmin` middleware and
// chat.ts/ai.ts/aiQuota.ts. The audit log still records `actorId = u.id`
// so admin actions remain traceable. Trusts the role on the JWT —
// promoting an existing user to ADMIN requires them to re-login (or hit
// any route that uses `requireAdmin`, which re-checks the DB) before the
// override kicks in here.
function propertyOwnershipFilter(req: FastifyRequest, id: string) {
  const u = requireUser(req);
  return u.role === 'ADMIN' ? { id } : { id, agentId: u.id };
}
function canActOnProperty<T extends { agentId: string }>(
  req: FastifyRequest,
  prop: T | null | undefined,
): prop is T {
  if (!prop) return false;
  const u = requireUser(req);
  return u.id === prop.agentId || u.role === 'ADMIN';
}
import { tryServiceTokenAuth } from '../middleware/service-token.js';
import { ensureInterest } from './interests.js';
import { propertySlug, ensureUniqueSlug } from '../lib/slug.js';
import { putUpload, deleteUpload, urlToKey } from '../lib/storage.js';
import { processPropertyImage } from '../lib/imageVariants.js';
import { track as phTrack } from '../lib/analytics.js';
import { assertAllowedMime } from '../lib/uploadGuards.js';
import { evaluateLeadProperty } from '../lib/matching.js';
import { logActivity } from '../lib/activity.js';
import { normalizeAddress, normalizeCity } from '../lib/addressNormalize.js';
import { buildAnthropic } from '../lib/anthropic.js';
import { recordAnthropic } from '../lib/aiUsage.js';

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
  // PERF-002 — pagination. Default is 200 to keep the legacy frontend
  // (which doesn't paginate yet) working unchanged; Commit B lowers
  // this. `cursor` is the id of the last item from the previous page.
  take: z.coerce.number().int().min(1).max(200).optional(),
  cursor: z.string().min(1).max(40).optional(),
});

const propertyInput = z.object({
  assetClass: z.enum(['RESIDENTIAL', 'COMMERCIAL']),
  category: z.enum(['SALE', 'RENT']),
  // Sprint 1 / MLS parity — Task J9. Extended life-cycle values:
  // INACTIVE (לא אקטואלי), CANCELLED (מבוטל), IN_DEAL (עיסקה).
  status: z
    .enum(['ACTIVE', 'PAUSED', 'SOLD', 'RENTED', 'ARCHIVED', 'INACTIVE', 'CANCELLED', 'IN_DEAL'])
    .optional(),
  // Relaxed (2026-04-30): drop `.min(1)` so PATCH bodies that resend
  // every field don't fail on Yad2-imported rows whose `type`/`street`/
  // `city` came in empty. Same shape as the earlier `ownerPhone` fix.
  // Length caps stay; FE retains its own create-time guards.
  type: z.string().max(60),
  street: z.string().max(120),
  city: z.string().max(80),
  lat: z.number().nullable().optional(),
  lng: z.number().nullable().optional(),
  // Task 3 · validated structured-address metadata. Supplied by the client
  // when the agent picks from the AddressField typeahead; optional so
  // existing flows without the picker (legacy rows, admin tools) still
  // write.
  placeId: z.string().max(120).nullable().optional(),
  formattedAddress: z.string().max(400).nullable().optional(),
  // Accept empty strings: Yad2-imported properties land with an empty
  // owner phone (and sometimes an empty owner name when the listing
  // had no recoverable seller info). The form re-sends those values
  // verbatim on edit, so a strict min() blocks PATCHes on otherwise-
  // valid rows. Length caps stay; missing data is permitted.
  owner: z.string().max(120),
  ownerPhone: z.string().max(40),
  // Allow `''` defensively — current FE guards via `if (form.ownerEmail)`
  // but AI-edit / import paths can emit empty strings.
  ownerEmail: z.string().email().or(z.literal('')).nullable().optional(),
  // 2026-05-03 — optional national ID (תעודת זהות) for the property owner.
  // Free-form to allow passports / non-Israeli IDs.
  ownerNationalId: z.string().max(40).nullable().optional(),
  // New: link this property to an existing Owner record (the canonical
  // persona table). When omitted, an Owner row is created/looked up from
  // the inline `owner` + `ownerPhone` fields.
  propertyOwnerId: z.string().nullable().optional(),
  // `.or(z.literal(''))`: tolerate `""` from forms that haven't been
  // null-coerced yet. `normalize()` only runs `new Date(x)` when x is
  // truthy, so `''` falls through cleanly without producing Invalid Date.
  exclusiveStart: z.string().datetime().or(z.literal('')).nullable().optional(),
  exclusiveEnd: z.string().datetime().or(z.literal('')).nullable().optional(),
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
  // 2026-05-03 — commercial extras pricing.
  parkingPricePerSpot: z.number().int().nonnegative().nullable().optional(),
  // Storage
  storage: z.boolean().optional(),
  storageLocation: z.string().max(40).nullable().optional(),
  storageSize: z.number().int().nonnegative().nullable().optional(),
  storagePrice: z.number().int().nonnegative().nullable().optional(),
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
  marketingStartDate: z.string().datetime().or(z.literal('')).nullable().optional(),
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
  exclusivityExpire: z.string().datetime().or(z.literal('')).nullable().optional(),
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

  // 2026-04-26 — PR2 form additions.
  unitNumber:        z.string().max(40).nullable().optional(),
  enSuiteToilet:     z.boolean().optional(),
  residentsRoom:     z.boolean().optional(),
  bicycleRoom:       z.boolean().optional(),
  managementCompany: z.string().max(120).nullable().optional(),
  tenantSideOnly:    z.boolean().optional(),
  commissionTerms:   z.string().max(200).nullable().optional(),
  landlordCommission: z.string().max(200).nullable().optional(),

  // 2026-04-30 — true when the listing was handed over by another
  // brokerage. Default false (agent's own mandate). Surfaces a distinct
  // outline colour on Properties cards + the detail header.
  coBrokered: z.boolean().optional(),
  // 2026-04-30 — agent-set ranking; higher floats to top of /properties.
  priority: z.number().int().min(-1000).max(1000).optional(),

  images: z.array(z.string().url()).optional(),
});

export const registerPropertyRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', { onRequest: [app.requireAgent] }, async (req) => {
    const q = listQuery.parse(req.query);
    const where: any = {};
    // Always scope to the signed-in agent — prior behavior let a caller
    // without `mine=1` / `agentId=` pull every property from every
    // agency, and `?agentId=X` let an agent pull anyone else's catalog.
    // The customer-facing share flow lives under /api/public/..., so
    // scoping this endpoint is safe for the agent app.
    where.agentId = requireUser(req).id;
    if (q.assetClass) where.assetClass = q.assetClass;
    if (q.category) where.category = q.category;
    if (q.status) where.status = q.status;
    if (q.city) {
      // Normalize the incoming city filter so "שיינקין..."-era rows
      // stored before the normalizer shipped still match queries
      // from dropdowns that carry the current canonical spelling.
      where.city = normalizeCity(q.city)?.value ?? q.city;
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
    //
    // PERF-002 — pagination. `take` defaults to 200 so the existing FE
    // (which doesn't pass it) continues to receive its full page-load
    // payload; Commit B will pass an explicit lower default plus the
    // returned `nextCursor` for "load more". `+1` overfetch lets us
    // detect "more rows exist" without a second count query.
    // PERF — 2026-05-01: convert the LIST endpoint from `include` to a
    // tight `select` of only the fields the FE actually reads. Audit
    // confirmed Properties.jsx, Dashboard.jsx, Customers.jsx, Map.jsx,
    // Deals.jsx and AgentCard.jsx never read >35 of the Property
    // columns — closingPrice, offer, floor, totalFloors, all the
    // *Required booleans, gush/helka, commercial-only flags, the
    // entire propertyOwner relation, etc. Dropping them shrinks
    // per-row payload from ~3.5 KB → ~600 bytes. The detail endpoint
    // (GET /:id below) still returns the full row with `include`.
    // 2026-05-01 v3 — default take 200 → 50. Properties.jsx uses
    // infinite-scroll + cursor; the FE doesn't pass `take`, so the
    // default determines the first-page payload size. 50 cards is
    // 2-3 viewport heights — plenty for first paint, and ~75% smaller
    // wire payload than the prior 200 default. The FE still calls
    // again with the returned nextCursor when the user scrolls.
    const take = q.take ?? 50;
    const items = await prisma.property.findMany({
      where,
      select: {
        id:               true,
        agentId:          true,
        slug:             true,
        street:           true,
        city:             true,
        unitNumber:       true,
        lat:              true,
        lng:              true,
        assetClass:       true,
        category:         true,
        type:             true,
        status:           true,
        marketingPrice:   true,
        rooms:            true,
        sqm:              true,
        owner:            true,
        ownerPhone:       true,
        priority:         true,
        coBrokered:       true,
        createdAt:        true,
        updatedAt:        true,
        images: {
          select: { id: true, url: true, urlThumb: true, urlCard: true, sortOrder: true },
          orderBy: { sortOrder: 'asc' },
          take: 1,
        },
        marketingActions: {
          select: { actionKey: true, done: true },
        },
      },
      // Priority floats to the top so an agent can surface the
       // listings they are actively pushing; createdAt is the secondary
       // sort so the rest of the catalog still shows newest-first.
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
      take: take + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    });
    const hasMore = items.length > take;
    const page = hasMore ? items.slice(0, take) : items;
    const nextCursor = hasMore ? page[page.length - 1].id : null;
    // List view uses only `marketingActions` (bool map) — the heavier
    // `marketingActionsDetail` block (done/notes/link/doneAt per action)
    // is ~1.4 KB per property and only consumed by PropertyDetail,
    // which has its own endpoint. Pass `{ compact: true }` to drop it.
    return {
      items: page.map((p) => serialize(p, { compact: true })),
      nextCursor,
    };
  });

  app.get('/:id', { onRequest: [app.requireAgent] }, async (req, reply) => {
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
    // 404 for both "doesn't exist" and "belongs to another agent" — no
    // leak about whether the id is valid. Customer-facing share flow
    // has its own endpoint under /api/public/agents/:slug/properties/:slug.
    if (!canActOnProperty(req, property)) {
      return reply.code(404).send({ error: { message: 'Not found' } });
    }
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
    if (!canActOnProperty(req, existing)) {
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
    // propertyOwnerId must go through the relation on Prisma's update
    // input — Prisma 5 rejects the raw FK scalar with
    // "Unknown argument `propertyOwnerId`. Did you mean `propertyOwner`?"
    // Same family of bug as the primaryAgentId fix from 2026-04-23.
    const ownerRel =
      propertyOwnerId === undefined
        ? {}
        : propertyOwnerId === null
        ? { propertyOwner: { disconnect: true } }
        : { propertyOwner: { connect: { id: propertyOwnerId } } };
    const updated = await prisma.property.update({
      where: { id },
      data: {
        ...normalize(body),
        ...ownerRel,
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
      // Strip relation FK scalars Prisma 5 rejects on create — reconnect
      // via relation form below where we want to inherit them. `agentId`
      // stays as a scalar; only `propertyOwnerId` and `primaryAgentId`
      // are gated behind their relations.
      propertyOwnerId: srcOwnerId,
      primaryAgentId: _pa,
      // Public-match metadata is per-listing and does not transfer.
      publicMatchSourceId: _pms, isPublicMatch: _ipm,
      publicMatchAt: _pma, publicMatchNote: _pmn,
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
    // Prisma 5 strictly distinguishes "checked" (relation form, e.g.
     // `agent: { connect: ... }`) from "unchecked" (FK scalar, e.g.
     // `agentId: "..."`) create inputs and rejects the mix. The duplicate
     // payload carries `agentId` from `...payload`, so we must use FK
     // scalars for ALL relations on this create — no `propertyOwner:
     // { connect }` form. Prior code mixed the two and 500'd in prod
     // (2026-05-03: "Unknown argument `propertyOwner`. Did you mean
     // `propertyOwnerId`?"). Re-passing `propertyOwnerId` directly keeps
     // us in the unchecked branch the rest of the data is already in.
    const created = await prisma.property.create({
      data: {
        ...payload,
        slug: newSlug,
        status: 'ACTIVE',
        ...(srcOwnerId ? { propertyOwnerId: srcOwnerId } : {}),
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

  // 2026-04-26 — AI edit. Takes a free-form Hebrew instruction (e.g.
  // "תשנה את המחיר ל-2.3 מיליון ותסמן שיש מעלית שבת") and uses Haiku to
  // extract a partial property patch, then applies it via the regular
  // PATCH path so all the existing validation + relation handling kicks
  // in. Errors return 422 with the model's reason so the UI can render
  // a friendly Hebrew message instead of a 500.
  app.post('/:id/ai-edit', { onRequest: [app.requireAgent] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const Body = z.object({ instruction: z.string().min(2).max(800) });
    const { instruction } = Body.parse(req.body);
    const agentId = requireUser(req).id;
    const existing = await prisma.property.findUnique({
      where: { id },
      include: { propertyOwner: true },
    });
    if (!existing || existing.agentId !== agentId) {
      return reply.code(404).send({ error: { message: 'Not found' } });
    }
    // Build a compact JSON snapshot for context — the model needs to know
    // current values to compute a delta. Strip relations + image arrays
    // (irrelevant for edits, would inflate the prompt).
    const snapshot: any = { ...existing };
    delete snapshot.propertyOwner;
    const fieldList = Object.keys(propertyInput.shape).join(', ');
    const sys = [
      'אתה עוזר עריכה לנתוני נכס נדל״ן בעברית. הסוכן מתאר בקצרה מה הוא רוצה לשנות.',
      'החזר אך ורק JSON תקין במבנה: {"updates":{<שדות שצריך לעדכן>},"summary":"<סיכום קצר בעברית>"}.',
      'שנה רק שדות שהמשתמש ביקש מפורשות לשנות. שמות שדות חייבים להיות מתוך הרשימה הבאה בלבד:',
      fieldList,
      'מספרים החזר כ-Number, בוליאנים כ-true/false. אל תכלול שדות שלא הוזכרו.',
      'אם הבקשה לא ברורה או לא ניתן לבצע אותה, החזר {"updates":{},"summary":"<הסיבה>"}.',
    ].join('\n');
    const user = [
      `נכס נוכחי: ${JSON.stringify(snapshot)}`,
      `בקשת המשתמש: "${instruction}"`,
    ].join('\n\n');
    let parsed: { updates: any; summary?: string };
    try {
      const client = buildAnthropic();
      if (!client) return reply.code(503).send({ error: { message: 'שירות ה-AI לא מוגדר בשרת' } });
      const response = await client.messages.create({
        model: 'claude-haiku-4-5',
        max_tokens: 800,
        system: sys,
        messages: [{ role: 'user', content: user }],
      });
      recordAnthropic({ userId: agentId, feature: 'property-ai-edit', model: 'claude-haiku-4-5', usage: response.usage as any });
      const text = response.content
        .filter((b: any) => b.type === 'text')
        .map((b: any) => b.text)
        .join('');
      const match = text.match(/\{[\s\S]*\}/);
      parsed = match ? JSON.parse(match[0]) : { updates: {} };
    } catch (e: any) {
      req.log.warn({ err: e }, 'ai-edit model call failed');
      return reply.code(502).send({ error: { message: 'שירות ה-AI לא זמין כרגע, נסו שוב' } });
    }
    const updates = parsed.updates && typeof parsed.updates === 'object' ? parsed.updates : {};
    if (!Object.keys(updates).length) {
      return reply.code(422).send({
        error: { message: parsed.summary || 'לא הצלחתי להבין מה לעדכן' },
      });
    }
    // Validate the model's proposed patch against propertyInput; unknown
    // fields are silently dropped by zod's default .strip() behaviour, so
    // the LLM can't sneak in a column that isn't whitelisted.
    const validated = propertyInput.partial().parse(updates);
    const updated = await prisma.property.update({
      where: { id },
      data: normalize(validated),
      include: { images: true, marketingActions: true, propertyOwner: true },
    });
    await logActivity({
      agentId, actorId: agentId,
      verb: 'updated', entityType: 'Property', entityId: id,
      summary: `AI עריכה: ${parsed.summary || instruction.slice(0, 60)}`,
      metadata: { fields: Object.keys(validated), instruction },
    });
    return {
      property: serialize(updated),
      summary: parsed.summary || null,
      changedFields: Object.keys(validated),
    };
  });

  // 2026-04-27 — Price offers received on a property. List, create,
  // update status / amount / notes, delete. All operations are owner-
  // scoped via the agentId on Property.
  const offerInput = z.object({
    leadId:     z.string().nullable().optional(),
    buyerName:  z.string().min(1).max(120),
    buyerPhone: z.string().max(40).nullable().optional(),
    amount:     z.number().int().nonnegative(),
    status:     z.enum(['NEW', 'NEGOTIATING', 'ACCEPTED', 'DECLINED', 'WITHDRAWN']).optional(),
    notes:      z.string().max(2000).nullable().optional(),
    receivedAt: z.string().datetime().or(z.literal('')).nullable().optional(),
    // Buyer↔seller dialog fields. `direction` flags which side proposed
    // this round; `replyToOfferId` threads counter-offers to their parent.
    direction:      z.enum(['BUYER_TO_SELLER', 'SELLER_TO_BUYER']).optional(),
    replyToOfferId: z.string().nullable().optional(),
    relayedAmount:  z.number().int().nonnegative().nullable().optional(),
    paymentTerms:   z.string().max(2000).nullable().optional(),
    handoverNotes:  z.string().max(1000).nullable().optional(),
  });

  app.get('/:id/offers', { onRequest: [app.requireAgent] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const owns = await prisma.property.findFirst({
      where: propertyOwnershipFilter(req, id),
      select: { id: true },
    });
    if (!owns) return reply.code(404).send({ error: { message: 'Not found' } });
    const offers = await prisma.propertyOffer.findMany({
      where: { propertyId: id },
      orderBy: { receivedAt: 'desc' },
    });
    return { offers };
  });

  app.post('/:id/offers', { onRequest: [app.requireAgent] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = offerInput.parse(req.body);
    const owns = await prisma.property.findFirst({
      where: propertyOwnershipFilter(req, id),
      select: { id: true, agentId: true },
    });
    if (!owns) return reply.code(404).send({ error: { message: 'Not found' } });
    if (body.leadId) {
      const lead = await prisma.lead.findFirst({
        where: { id: body.leadId, agentId: owns.agentId },
        select: { id: true },
      });
      if (!lead) return reply.code(403).send({ error: { message: 'הליד אינו של המשתמש' } });
    }
    // 2026-05-10 — auto-attach to the (lead, property) interest row
    // when both ids are present so PropertyInterestsPanel reflects
    // offers created via this legacy endpoint too.
    const interestId = body.leadId
      ? await ensureInterest(owns.agentId, id, body.leadId)
      : null;
    const created = await prisma.propertyOffer.create({
      data: {
        propertyId: id,
        leadId:     body.leadId || null,
        interestId,
        buyerName:  body.buyerName,
        buyerPhone: body.buyerPhone || null,
        amount:     body.amount,
        status:     body.status || 'NEW',
        notes:      body.notes || null,
        receivedAt: body.receivedAt ? new Date(body.receivedAt) : new Date(),
        direction:      body.direction || 'BUYER_TO_SELLER',
        replyToOfferId: body.replyToOfferId ?? null,
        relayedAmount:  body.relayedAmount ?? null,
        paymentTerms:   body.paymentTerms ?? null,
        handoverNotes:  body.handoverNotes ?? null,
      },
    });
    await logActivity({
      agentId: owns.agentId, actorId: requireUser(req).id,
      verb: 'created', entityType: 'PropertyOffer', entityId: created.id,
      summary: `התקבלה הצעה מ${created.buyerName}: ₪${created.amount.toLocaleString('he-IL')}`,
      metadata: { propertyId: id, status: created.status, amount: created.amount },
    });
    return { offer: created };
  });

  app.patch('/:id/offers/:offerId', { onRequest: [app.requireAgent] }, async (req, reply) => {
    const { id, offerId } = req.params as { id: string; offerId: string };
    const body = offerInput.partial().parse(req.body);
    const u = requireUser(req);
    const offer = await prisma.propertyOffer.findFirst({
      where: u.role === 'ADMIN'
        ? { id: offerId, propertyId: id }
        : { id: offerId, propertyId: id, property: { agentId: u.id } },
    });
    if (!offer) return reply.code(404).send({ error: { message: 'Not found' } });
    const updated = await prisma.propertyOffer.update({
      where: { id: offerId },
      data: {
        ...body,
        receivedAt: body.receivedAt ? new Date(body.receivedAt) : undefined,
      },
    });
    return { offer: updated };
  });

  app.delete('/:id/offers/:offerId', { onRequest: [app.requireAgent] }, async (req, reply) => {
    const { id, offerId } = req.params as { id: string; offerId: string };
    const u = requireUser(req);
    const offer = await prisma.propertyOffer.findFirst({
      where: u.role === 'ADMIN'
        ? { id: offerId, propertyId: id }
        : { id: offerId, propertyId: id, property: { agentId: u.id } },
      select: { id: true },
    });
    if (!offer) return reply.code(404).send({ error: { message: 'Not found' } });
    await prisma.propertyOffer.delete({ where: { id: offerId } });
    return { ok: true };
  });

  app.delete('/:id', { onRequest: [app.requireAgent] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const existing = await prisma.property.findUnique({ where: { id } });
    if (!canActOnProperty(req, existing)) {
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
    const prop = await prisma.property.findFirst({ where: propertyOwnershipFilter(req, id) });
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
    const prop = await prisma.property.findFirst({ where: propertyOwnershipFilter(req, id) });
    if (!prop) return reply.code(404).send({ error: { message: 'Not found' } });
    const body = assigneeInput.parse(req.body);
    // Assignee must belong to the same office (if any) so cross-office
    // leakage is impossible. For ADMIN bypass we compare against the
    // property agent's office rather than the admin's, because the
    // admin themselves usually lives outside the customer agency.
    const officeRefId = requireUser(req).role === 'ADMIN' ? prop.agentId : uid;
    const me = await prisma.user.findUnique({ where: { id: officeRefId }, select: { officeId: true } });
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
    const prop = await prisma.property.findFirst({ where: propertyOwnershipFilter(req, id) });
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

  // 2026-05-03 — per-property external broker contacts. Distinct from
  // /assignees (Estia agents who share the listing): /brokers is for
  // *outside* colleagues the agent is coordinating with on this listing.
  // Owned by the agent — cross-agent reads return 404 via the ownership
  // filter on the parent property.
  const brokerInput = z.object({
    name:      z.string().min(1).max(120),
    phone:     z.string().max(40).nullable().optional(),
    email:     z.string().email().max(200).nullable().optional().or(z.literal('')),
    agency:    z.string().max(120).nullable().optional(),
    expertise: z.string().max(120).nullable().optional(),
    notes:     z.string().max(2000).nullable().optional(),
  });
  app.get('/:id/brokers', { onRequest: [app.requireAgent] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const prop = await prisma.property.findFirst({ where: propertyOwnershipFilter(req, id) });
    if (!prop) return reply.code(404).send({ error: { message: 'Not found' } });
    const items = await prisma.propertyBroker.findMany({
      where: { propertyId: id },
      orderBy: { createdAt: 'asc' },
    });
    return { items };
  });
  app.post('/:id/brokers', { onRequest: [app.requireAgent] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const uid = requireUser(req).id;
    const prop = await prisma.property.findFirst({ where: propertyOwnershipFilter(req, id) });
    if (!prop) return reply.code(404).send({ error: { message: 'Not found' } });
    const body = brokerInput.parse(req.body);
    const broker = await prisma.propertyBroker.create({
      data: {
        propertyId: id,
        agentId:    prop.agentId,
        name:       body.name.trim(),
        phone:      body.phone?.trim() || null,
        email:      body.email?.trim() || null,
        agency:     body.agency?.trim() || null,
        expertise:  body.expertise?.trim() || null,
        notes:      body.notes?.trim() || null,
      },
    });
    await logActivity({
      agentId: prop.agentId, actorId: uid,
      verb: 'added_broker', entityType: 'Property', entityId: id,
      summary: `נוסף מתווך שותף: ${broker.name}`,
      metadata: { brokerId: broker.id },
    });
    return { broker };
  });
  app.patch('/:id/brokers/:brokerId', { onRequest: [app.requireAgent] }, async (req, reply) => {
    const { id, brokerId } = req.params as { id: string; brokerId: string };
    const prop = await prisma.property.findFirst({ where: propertyOwnershipFilter(req, id) });
    if (!prop) return reply.code(404).send({ error: { message: 'Not found' } });
    const body = brokerInput.partial().parse(req.body);
    const existing = await prisma.propertyBroker.findUnique({ where: { id: brokerId } });
    if (!existing || existing.propertyId !== id) {
      return reply.code(404).send({ error: { message: 'Broker not found' } });
    }
    const broker = await prisma.propertyBroker.update({
      where: { id: brokerId },
      data: {
        ...(body.name      !== undefined ? { name:      body.name.trim() } : {}),
        ...(body.phone     !== undefined ? { phone:     body.phone?.trim() || null } : {}),
        ...(body.email     !== undefined ? { email:     body.email?.trim() || null } : {}),
        ...(body.agency    !== undefined ? { agency:    body.agency?.trim() || null } : {}),
        ...(body.expertise !== undefined ? { expertise: body.expertise?.trim() || null } : {}),
        ...(body.notes     !== undefined ? { notes:     body.notes?.trim() || null } : {}),
      },
    });
    return { broker };
  });
  app.delete('/:id/brokers/:brokerId', { onRequest: [app.requireAgent] }, async (req, reply) => {
    const { id, brokerId } = req.params as { id: string; brokerId: string };
    const uid = requireUser(req).id;
    const prop = await prisma.property.findFirst({ where: propertyOwnershipFilter(req, id) });
    if (!prop) return reply.code(404).send({ error: { message: 'Not found' } });
    const existing = await prisma.propertyBroker.findUnique({ where: { id: brokerId } });
    if (!existing || existing.propertyId !== id) {
      return reply.code(404).send({ error: { message: 'Broker not found' } });
    }
    await prisma.propertyBroker.delete({ where: { id: brokerId } });
    await logActivity({
      agentId: prop.agentId, actorId: uid,
      verb: 'removed_broker', entityType: 'Property', entityId: id,
      metadata: { brokerId, name: existing.name },
    });
    return { ok: true };
  });

  // Sprint 2 / MLS parity — Task C3. Reverse direction: leads from the
  // signed-in agent that match this property, sorted by match score.
  //
  // PERF-009 — push the obvious filters into the SQL `where` clause so
  // we don't pull every lead into Node just to discard most of them.
  // PERF-027 — also exclude terminal customer statuses (mirrors what
  // /public-matches/count already does). The soft scorer still runs in
  // JS on the narrowed set so the return shape and scoring output are
  // unchanged (FE renders `score` + `reasons` directly).
  app.get('/:id/matching-customers', { onRequest: [app.requireAgent] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const property = await prisma.property.findFirst({
      where: propertyOwnershipFilter(req, id),
    });
    if (!property) return reply.code(404).send({ error: { message: 'Property not found' } });

    // Build the SQL pre-filter. Each clause is an AND over the lead
    // columns; we use OR-wrapped `null OR matches` patterns for nullable
    // columns so leads that haven't filled in (say) a city aren't
    // dropped — the JS scorer handles those gracefully.
    // For ADMIN bypass: scope leads to the property's agent so we still
    // return the right inbox (admin viewing someone else's property
    // sees that agent's leads, not their own).
    const wantsLookingFor = property.category === 'SALE' ? 'BUY' : 'RENT';
    const interestType = property.assetClass === 'COMMERCIAL' ? 'COMMERCIAL' : 'PRIVATE';
    const where: any = {
      agentId: property.agentId,
      // PERF-027 — skip closed-out customers. Mirrors public-matches.
      OR: [
        { customerStatus: null },
        { customerStatus: { notIn: ['CANCELLED', 'BOUGHT', 'RENTED'] } },
      ],
      // category match — wantsLookingFor is BUY for SALE / RENT for RENT.
      // lookingFor + interestType are non-nullable enums in the schema;
      // dead `null` arms removed (Prisma 5.22 strict-rejects them).
      AND: [
        { lookingFor: wantsLookingFor },
        { interestType },
      ],
    };
    // City: leads with a city filter must match the property's city.
    if (property.city) {
      where.AND.push({ OR: [{ city: null }, { city: property.city }] });
    }
    // Price: 20% budget tolerance — lead.budget is a single nullable Int
    // ("preferred budget"). When set, narrow to ±20% of property price.
    if (property.marketingPrice) {
      const lo = Math.round(property.marketingPrice * 0.8);
      const hi = Math.round(property.marketingPrice * 1.2);
      where.AND.push({
        OR: [
          { budget: null },
          { budget: { gte: lo, lte: hi } },
        ],
      });
    }

    const leads = await prisma.lead.findMany({
      where,
      include: { searchProfiles: true },
    });

    // 2026-04-30 — neighborhood↔street join. For every lead with a
    // `neighborhood` preference, fetch the corresponding Neighborhood
    // row's `streetCodes` so the scorer can also accept properties
    // whose street falls inside that neighborhood (even when their
    // `neighborhood` field is empty / spelled differently).
    const hoodKeys = new Set<string>();
    for (const l of leads) {
      if (l.city && l.neighborhood) hoodKeys.add(`${l.city.trim()}|${l.neighborhood.trim()}`);
    }
    const hoodMap = new Map<string, number[]>();
    if (hoodKeys.size) {
      const rows = await prisma.neighborhood.findMany({
        where: {
          OR: [...hoodKeys].map((k) => {
            const [city, name] = k.split('|');
            return { city, name };
          }),
        },
        select: { city: true, name: true, streetCodes: true },
      });
      for (const r of rows) hoodMap.set(`${r.city}|${r.name}`, r.streetCodes);
    }

    // Pre-resolve the property's registry street code once — same code
    // path the lookups endpoint uses, no extra DB hit.
    const { resolveStreetCode } = await import('./lookups.js');
    const propStreetCode = property.city && property.street
      ? resolveStreetCode(property.city, property.street)
      : null;

    const scoreLead = (l: any) => {
      const key = l.city && l.neighborhood ? `${l.city.trim()}|${l.neighborhood.trim()}` : null;
      const codes = key ? hoodMap.get(key) : undefined;
      return evaluateLeadProperty(
        { ...l, neighborhoodStreetCodes: codes ?? null },
        { ...(property as any), streetCode: propStreetCode },
      );
    };

    // Rooms ±1 lives in JS — Lead.rooms is a free-form string ("3-4",
    // "3.5+") so a SQL range clause would miss legitimate matches. The
    // JS scorer already does the right thing.
    const scored = leads
      .map((l: any) => ({ l, sig: scoreLead(l) }))
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
    if (!canActOnProperty(req, property)) {
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
    if (!canActOnProperty(req, property)) {
      return reply.code(404).send({ error: { message: 'Not found' } });
    }
    const img = await prisma.propertyImage.findUnique({ where: { id: imageId } });
    if (!img || img.propertyId !== id) {
      return reply.code(404).send({ error: { message: 'Image not found' } });
    }
    // Best-effort: remove the underlying files (S3 or disk) — DB row
    // is dropped either way so stale storage objects are harmless.
    // PERF-005 — also clean up the new variants when present.
    for (const u of [img.url, img.urlCard, img.urlThumb]) {
      const key = u ? urlToKey(u) : null;
      if (key) { try { await deleteUpload(key); } catch { /* noop */ } }
    }
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
    if (!canActOnProperty(req, property)) {
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
  // SEC-009 — List videos for a property. Was registered with no
  // auth + no ownership check, leaking the video list for any property
  // by id. The public share page (/api/public/agents/:slug/properties/
  // :propSlug) already returns videos, so this agent-side route is
  // safe to gate behind requireAgent + an ownership check.
  app.get('/:id/videos', { onRequest: [app.requireAgent] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const property = await prisma.property.findFirst({
      where: propertyOwnershipFilter(req, id),
    });
    if (!property) return reply.code(404).send({ error: { message: 'Not found' } });
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
    if (!canActOnProperty(req, property)) {
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
    if (!canActOnProperty(req, property)) {
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
    if (!canActOnProperty(req, property)) {
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
    if (!canActOnProperty(req, property)) {
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
    if (!canActOnProperty(req, property)) {
      return reply.code(404).send({ error: { message: 'Not found' } });
    }
    await prisma.property.update({
      where: { id },
      data: { exclusivityAgreementUrl: null },
    });
    return { ok: true };
  });

  // Upload a property image
  // PERF-005 / PERF-016 — the upload pipeline now produces three
  // public S3 variants (thumb/card/full) on every image instead of
  // shipping the raw 2400 px JPEG to every list page. The thumb
  // variant powers list cards (48×36 CSS px → 256 px source) and
  // saves ~80% of the wire bytes vs the previous full-only column.
  // All three variants are public-read with `Cache-Control:
  // immutable` so the browser/CF can long-cache and skip the backend
  // entirely on repeat fetches.
  //
  // S5 (HEIC): iPhones shoot HEIC by default; browsers don't render
  // it. The variant pipeline decodes HEIC once via heic-convert and
  // emits JPEG variants, so the rest of the app never sees it.
  app.post('/:id/images', { onRequest: [app.requireAgent] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const property = await prisma.property.findUnique({ where: { id } });
    if (!canActOnProperty(req, property)) {
      return reply.code(404).send({ error: { message: 'Not found' } });
    }
    const file = await req.file();
    if (!file) return reply.code(400).send({ error: { message: 'No file' } });
    // F-11.7 — whitelist (was startsWith('image/') which accepts
    // SVG; SVG served from the same origin can execute script in the
    // app's auth context). jpg/png/webp/heic only.
    try { assertAllowedMime(file, 'image'); }
    catch { return reply.code(415).send({ error: { message: 'פורמט תמונה לא נתמך (jpg / png / webp / heic בלבד)' } }); }

    const buffer = await file.toBuffer();

    let variants;
    try {
      variants = await processPropertyImage(buffer, file.mimetype, file.filename, id);
    } catch (e) {
      req.log.warn({ err: e }, 'image variant processing failed');
      return reply.code(415).send({
        error: { message: 'לא הצלחנו לעבד את התמונה. נסו לשלוח JPEG או PNG.' },
      });
    }

    const image = await prisma.propertyImage.create({
      data: {
        propertyId: id,
        url: variants.url,
        urlCard: variants.urlCard,
        urlThumb: variants.urlThumb,
        sortOrder: 9999,
      },
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
  // primaryAgentId must go through the relation on Prisma's update
  // input — the generated type exposes `primaryAgent: { connect }` /
  // `{ disconnect }` but rejects the raw FK scalar, which was the
  // root cause of the "Unknown argument `primaryAgentId`" 500s on
  // every property save after the 2026-04-23 deploy.
  if (data.primaryAgentId !== undefined) {
    data.primaryAgent = data.primaryAgentId
      ? { connect: { id: data.primaryAgentId } }
      : { disconnect: true };
    delete data.primaryAgentId;
  }
  // 2026-04-30 — datetime fields now accept `''` at the zod layer to
  // tolerate FE bodies that haven't been null-coerced. Treat `''` as
  // null here so Prisma never sees an empty string for a DateTime?
  // column (Prisma would reject it with a P2009-ish error).
  for (const k of ['exclusiveStart', 'exclusiveEnd', 'exclusivityExpire', 'marketingStartDate'] as const) {
    if (data[k] === '') data[k] = null;
  }
  // Same for ownerEmail — column is `String?`, but `''` is semantically
  // "no email" and would clutter the DB. Keep nulls canonical.
  if (data.ownerEmail === '') data.ownerEmail = null;
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
  // Snap city + street to their government-registered canonical form so
  // rows stay comparable across spelling variants. See addressNormalize.ts.
  // We only want the string overlays — Property has no cityCode /
  // streetCode columns, so drop those before Prisma sees them.
  const addr = normalizeAddress({ city: data.city, street: data.street });
  if (addr.city)   data.city   = addr.city;
  if (addr.street) data.street = addr.street;
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
    // Back-compat: `images` is the list of full-size URLs (what most
    // UI uses today). PERF-005 — `imageThumbs` is a parallel array of
    // the small (256 px) variant URLs the FE list cards should
    // prefer. Falls back to the full URL when a legacy row is missing
    // a thumb. `imageList` carries every variant for the photo
    // manager + lightbox so the detail page can pick `urlCard` for
    // gallery thumbs and `url` for the lightbox.
    images: (prop.images || []).map((i: any) => i.url),
    imageThumbs: (prop.images || []).map((i: any) => i.urlThumb || i.urlCard || i.url),
    imageList: (prop.images || []).map((i: any) => ({
      id: i.id,
      url: i.url,
      urlCard: i.urlCard ?? null,
      urlThumb: i.urlThumb ?? null,
      sortOrder: i.sortOrder,
    })),
    videos: prop.videos || [],
    marketingActions: actionsMap,
  };
  if (actionsDetail) out.marketingActionsDetail = actionsDetail;
  return out;
}
