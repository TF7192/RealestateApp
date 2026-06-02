// 2026-06-02 — Market Discovery tagging surface.
//
// Per-agent Gmail-style labels on /market-discovery rows. Sibling to
// /api/tags (which only covers PROPERTY/LEAD/CUSTOMER) — kept separate
// so the market namespace stays independent of CRM labels.
//
// Mount: /api/market/tags
//
//   GET    /                          → this agent's tags
//   POST   /                          → create { name, color }
//   PATCH  /:id                       → rename / recolor
//   DELETE /:id                       → delete (cascades assignments)
//   POST   /:id/assign                → { advertId } — idempotent attach
//   DELETE /:id/assign/:advertId      → detach (idempotent)
//   POST   /assign-batch              → { tagIds[], advertIds[] }
//
// All routes are agent-scoped via req.user.id; cross-agent reads/writes
// return 404 (not 403) so we don't leak tag-id existence.

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireUser } from '../middleware/auth.js';

const HEX = /^#[0-9a-fA-F]{6}$/;
const MAX_NAME = 40;
const MAX_TAGS_PER_AGENT = 50;
const MAX_BATCH_TAGS = 50;
const MAX_BATCH_ADVERTS = 200;

const createSchema = z.object({
  name:  z.string().trim().min(1).max(MAX_NAME),
  color: z.string().regex(HEX).optional(),
});

const patchSchema = z.object({
  name:  z.string().trim().min(1).max(MAX_NAME).optional(),
  color: z.string().regex(HEX).optional(),
});

const assignBodySchema = z.object({
  // Use `advertId` per the API contract (matches what callers will pass
  // from the discovery feed even though the underlying model is
  // MarketListing.id — kept consistent with the public "advert" lingo).
  advertId: z.string().min(1),
});

const batchSchema = z.object({
  tagIds:    z.array(z.string().min(1)).min(1).max(MAX_BATCH_TAGS),
  advertIds: z.array(z.string().min(1)).min(1).max(MAX_BATCH_ADVERTS),
});

export const registerMarketTagRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', app.requireAuth);

  // GET / — this agent's tags. Surfaces an `assignmentCount` per tag so
  // the manager UI can show "12 מודעות" next to each row without a
  // second round-trip.
  app.get('/', async (req) => {
    const u = requireUser(req);
    const tags = await prisma.marketTag.findMany({
      where: { agentId: u.id },
      orderBy: { name: 'asc' },
      include: { _count: { select: { assignments: true } } },
    });
    return {
      tags: tags.map((t) => ({
        id: t.id,
        name: t.name,
        color: t.color,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
        assignmentCount: t._count.assignments,
      })),
    };
  });

  // POST / — create. 50-tag-per-agent cap; 409 on duplicate name.
  app.post('/', async (req, reply) => {
    const u = requireUser(req);
    const parse = createSchema.safeParse(req.body);
    if (!parse.success) {
      const msg = parse.error.errors[0]?.message || 'נתונים לא תקינים';
      return reply.code(400).send({ error: { message: msg } });
    }
    const existing = await prisma.marketTag.count({ where: { agentId: u.id } });
    if (existing >= MAX_TAGS_PER_AGENT) {
      return reply.code(400).send({
        error: { message: `ניתן ליצור עד ${MAX_TAGS_PER_AGENT} תגיות` },
      });
    }
    try {
      const tag = await prisma.marketTag.create({
        data: {
          agentId: u.id,
          name:    parse.data.name.trim(),
          color:   parse.data.color ?? '#b48b4c',
        },
      });
      return { tag };
    } catch (e: any) {
      if (e?.code === 'P2002') {
        return reply.code(409).send({ error: { message: 'שם תגית כבר קיים' } });
      }
      throw e;
    }
  });

  // PATCH /:id — rename / recolor. Cross-agent guard: returns 404.
  app.patch<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const u = requireUser(req);
    const parse = patchSchema.safeParse(req.body);
    if (!parse.success) {
      const msg = parse.error.errors[0]?.message || 'נתונים לא תקינים';
      return reply.code(400).send({ error: { message: msg } });
    }
    const existing = await prisma.marketTag.findFirst({
      where: { id: req.params.id, agentId: u.id },
    });
    if (!existing) {
      return reply.code(404).send({ error: { message: 'תגית לא נמצאה' } });
    }
    try {
      const tag = await prisma.marketTag.update({
        where: { id: existing.id },
        data: {
          ...(parse.data.name  !== undefined ? { name:  parse.data.name.trim() } : {}),
          ...(parse.data.color !== undefined ? { color: parse.data.color } : {}),
        },
      });
      return { tag };
    } catch (e: any) {
      if (e?.code === 'P2002') {
        return reply.code(409).send({ error: { message: 'שם תגית כבר קיים' } });
      }
      throw e;
    }
  });

  // DELETE /:id — cascades assignments via the schema FK.
  app.delete<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const u = requireUser(req);
    const existing = await prisma.marketTag.findFirst({
      where: { id: req.params.id, agentId: u.id },
    });
    if (!existing) {
      return reply.code(404).send({ error: { message: 'תגית לא נמצאה' } });
    }
    await prisma.marketTag.delete({ where: { id: existing.id } });
    return { ok: true };
  });

  // POST /:id/assign — idempotent attach. `advertId` resolves to a
  // MarketListing.id. 404 on missing tag OR missing listing — we don't
  // distinguish so existence can't be probed by id-guessing.
  app.post<{ Params: { id: string } }>('/:id/assign', async (req, reply) => {
    const u = requireUser(req);
    const parse = assignBodySchema.safeParse(req.body);
    if (!parse.success) {
      return reply.code(400).send({ error: { message: 'נתונים לא תקינים' } });
    }
    const tag = await prisma.marketTag.findFirst({
      where: { id: req.params.id, agentId: u.id },
    });
    if (!tag) {
      return reply.code(404).send({ error: { message: 'תגית לא נמצאה' } });
    }
    const listing = await prisma.marketListing.findUnique({
      where: { id: parse.data.advertId },
      select: { id: true },
    });
    if (!listing) {
      return reply.code(404).send({ error: { message: 'מודעה לא נמצאה' } });
    }
    const assignment = await prisma.marketTagAssignment.upsert({
      where: {
        tagId_marketListingId: { tagId: tag.id, marketListingId: listing.id },
      },
      create: { tagId: tag.id, marketListingId: listing.id },
      update: {},
    });
    return { assignment };
  });

  // DELETE /:id/assign/:advertId — idempotent detach. We use deleteMany
  // (rather than delete-by-id) so calling on a non-existent assignment
  // returns 200 without surfacing a 404 — caller doesn't need to track
  // assignment ids.
  app.delete<{ Params: { id: string; advertId: string } }>(
    '/:id/assign/:advertId',
    async (req, reply) => {
      const u = requireUser(req);
      const tag = await prisma.marketTag.findFirst({
        where: { id: req.params.id, agentId: u.id },
      });
      if (!tag) {
        return reply.code(404).send({ error: { message: 'תגית לא נמצאה' } });
      }
      await prisma.marketTagAssignment.deleteMany({
        where: { tagId: tag.id, marketListingId: req.params.advertId },
      });
      return { ok: true };
    },
  );

  // POST /assign-batch — bulk-attach a set of tags to a set of adverts.
  // Used by the multi-select bulk-tagging flow. All-or-nothing: if any
  // tagId belongs to a different agent we 404 before mutating anything.
  app.post('/assign-batch', async (req, reply) => {
    const u = requireUser(req);
    const parse = batchSchema.safeParse(req.body);
    if (!parse.success) {
      const msg = parse.error.errors[0]?.message || 'נתונים לא תקינים';
      return reply.code(400).send({ error: { message: msg } });
    }
    const { tagIds, advertIds } = parse.data;

    // Verify every tag belongs to this agent.
    const myTags = await prisma.marketTag.findMany({
      where: { id: { in: tagIds }, agentId: u.id },
      select: { id: true },
    });
    if (myTags.length !== new Set(tagIds).size) {
      return reply.code(404).send({ error: { message: 'תגית לא נמצאה' } });
    }

    // Verify every advert exists. We intentionally allow tagging any
    // listing in the catalogue — agents can tag listings they haven't
    // duplicated, since the discovery feed is global by design.
    const known = await prisma.marketListing.findMany({
      where: { id: { in: advertIds } },
      select: { id: true },
    });
    if (known.length !== new Set(advertIds).size) {
      return reply.code(404).send({ error: { message: 'מודעה לא נמצאה' } });
    }

    // Build the full cross-product then dedupe via skipDuplicates.
    // Worst-case size = 50 × 200 = 10k rows; a single createMany call
    // handles that comfortably and stays well under Postgres' parameter
    // cap because the unique key fits in two columns.
    const rows = [];
    for (const tagId of tagIds) {
      for (const advertId of advertIds) {
        rows.push({ tagId, marketListingId: advertId });
      }
    }
    const result = await prisma.marketTagAssignment.createMany({
      data: rows,
      skipDuplicates: true,
    });
    return { ok: true, attached: result.count };
  });
};
