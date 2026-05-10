// PropertyInterest — per-(lead, property) activity log routes.
//
// Endpoints:
//   GET    /api/properties/:id/interests      — list interests on a property
//   POST   /api/properties/:id/interests      — bulk attach { leadIds }
//   GET    /api/leads/:id/interests           — list interests for a lead
//   GET    /api/interests/:id                 — one interest + counts + timeline anchor
//   GET    /api/interests/:id/timeline        — merged events (viewings/offers/agreements/contracts/meetings)
//   PATCH  /api/interests/:id                 — status / notes / lostReason
//   DELETE /api/interests/:id                 — detach
//
// All routes scope to the calling agent's interests only.

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireUser } from '../middleware/auth.js';

const statusEnum = z.enum(['IN_PROGRESS', 'CLOSED', 'FELL', 'PAUSED']);

// Server-side helper — bumps lastActionAt every time a child row that
// references this interest is created. Exposed so the existing
// PropertyViewing / PropertyOffer / Agreement / Contract / LeadMeeting
// route handlers can call it inline after creating a row.
export async function bumpInterestActivity(interestId: string): Promise<void> {
  try {
    await prisma.propertyInterest.update({
      where: { id: interestId },
      data: { lastActionAt: new Date() },
    });
  } catch {
    // Interest could've been deleted between fetch and bump — ignore.
  }
}

// 2026-05-10 — Phase 3: auto-attach helper. Called from any existing
// creation route (PropertyOffer / PropertyViewing / Agreement / Contract /
// LeadMeeting) that already has both leadId + propertyId at hand.
// Ensures there's an interest row for the pair; returns its id.
// Idempotent — if a row already exists, returns its id and bumps
// lastActionAt; otherwise creates the row at IN_PROGRESS.
export async function ensureInterest(
  agentId: string,
  propertyId: string,
  leadId: string,
): Promise<string | null> {
  if (!propertyId || !leadId) return null;
  try {
    const existing = await prisma.propertyInterest.findUnique({
      where: { propertyId_leadId: { propertyId, leadId } },
      select: { id: true, agentId: true },
    });
    if (existing && existing.agentId === agentId) {
      await prisma.propertyInterest.update({
        where: { id: existing.id },
        data: { lastActionAt: new Date() },
      });
      return existing.id;
    }
    if (existing) return null; // owned by a different agent — don't link
    const created = await prisma.propertyInterest.create({
      data: {
        agentId, propertyId, leadId,
        lastActionAt: new Date(),
      },
      select: { id: true },
    });
    return created.id;
  } catch {
    return null;
  }
}

// ── Stat summary attached to each listed interest ─────────────────
// Aggregates the counts the panel renders as quick chips. One pair of
// SELECTs per interest is fine at the current scale (~dozens per agent);
// can switch to a single grouped query if it gets hot later.
async function statsFor(interestId: string) {
  const [tours, offers, agreements, meetings] = await Promise.all([
    prisma.propertyViewing.count({ where: { interestId } }),
    prisma.propertyOffer.count({ where: { interestId } }),
    prisma.agreement.count({ where: { interestId } }),
    prisma.leadMeeting.count({ where: { interestId } }),
  ]);
  const topOffer = await prisma.propertyOffer.findFirst({
    where: { interestId },
    orderBy: { amount: 'desc' },
    select: { amount: true },
  });
  return {
    tours,
    offers,
    agreements,
    meetings,
    topOfferAmount: topOffer?.amount ?? null,
  };
}

// Compose a brief Hebrew "what was the latest" string for the row
// header. Picks whichever child row has the most-recent timestamp.
async function lastActionLabel(interestId: string): Promise<string | null> {
  const queries = await Promise.all([
    prisma.propertyViewing.findFirst({
      where: { interestId },
      orderBy: { viewedAt: 'desc' },
      select: { viewedAt: true },
    }),
    prisma.propertyOffer.findFirst({
      where: { interestId },
      orderBy: { receivedAt: 'desc' },
      select: { receivedAt: true, amount: true },
    }),
    prisma.agreement.findFirst({
      where: { interestId },
      orderBy: { sentAt: 'desc' },
      select: { sentAt: true, status: true },
    }),
    prisma.leadMeeting.findFirst({
      where: { interestId },
      orderBy: { startsAt: 'desc' },
      select: { startsAt: true, title: true },
    }),
  ]);
  const candidates: Array<{ at: Date; label: string }> = [];
  if (queries[0]) candidates.push({ at: queries[0].viewedAt, label: 'סיור' });
  if (queries[1]) candidates.push({ at: queries[1].receivedAt, label: `הצעה ₪${(queries[1].amount / 1000).toFixed(0)}K` });
  if (queries[2]) candidates.push({ at: queries[2].sentAt, label: 'הסכם' });
  if (queries[3]) candidates.push({ at: queries[3].startsAt, label: queries[3].title || 'פגישה' });
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.at.getTime() - a.at.getTime());
  return candidates[0].label;
}

export const registerInterestRoutes: FastifyPluginAsync = async (app) => {
  // ── PROPERTY-SCOPED: list / create ─────────────────────────────
  app.get('/properties/:id/interests', { onRequest: [app.requireAgent] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const u = requireUser(req);
    // Confirm the property is the agent's (404 otherwise so we don't
    // leak existence to other tenants).
    const property = await prisma.property.findFirst({
      where: { id, agentId: u.id },
      select: { id: true },
    });
    if (!property) return reply.code(404).send({ error: { message: 'Property not found' } });

    const rows = await prisma.propertyInterest.findMany({
      where: { propertyId: id, agentId: u.id },
      include: {
        lead: {
          select: {
            id: true, name: true, phone: true, email: true,
            status: true, city: true, budget: true,
            lookingFor: true, interestType: true,
          },
        },
      },
      orderBy: [{ lastActionAt: 'desc' }, { createdAt: 'desc' }],
    });

    // Decorate each row with stats + last-action label. Done sequentially
    // (Promise.all) to keep the response time reasonable on small lists.
    const items = await Promise.all(rows.map(async (r) => ({
      ...r,
      stats: await statsFor(r.id),
      lastActionLabel: await lastActionLabel(r.id),
    })));
    return { items };
  });

  app.post('/properties/:id/interests', { onRequest: [app.requireAgent] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const u = requireUser(req);
    const body = z.object({
      leadIds: z.array(z.string().min(1)).min(1).max(50),
    }).parse(req.body);

    const property = await prisma.property.findFirst({
      where: { id, agentId: u.id },
      select: { id: true },
    });
    if (!property) return reply.code(404).send({ error: { message: 'Property not found' } });

    // Validate every lead belongs to this agent in one query.
    const leads = await prisma.lead.findMany({
      where: { id: { in: body.leadIds }, agentId: u.id },
      select: { id: true },
    });
    const validIds = leads.map((l) => l.id);
    if (validIds.length === 0) {
      return reply.code(400).send({ error: { message: 'No matching leads' } });
    }

    // createMany + skipDuplicates respects the unique index so re-attaching
    // an already-attached lead is a no-op.
    await prisma.propertyInterest.createMany({
      data: validIds.map((leadId) => ({
        agentId: u.id, propertyId: id, leadId,
      })),
      skipDuplicates: true,
    });
    const created = await prisma.propertyInterest.findMany({
      where: { propertyId: id, leadId: { in: validIds }, agentId: u.id },
      include: { lead: true },
    });
    return reply.code(201).send({ items: created });
  });

  // ── LEAD-SCOPED: list ──────────────────────────────────────────
  app.get('/leads/:id/interests', { onRequest: [app.requireAgent] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const u = requireUser(req);
    const lead = await prisma.lead.findFirst({
      where: { id, agentId: u.id },
      select: { id: true },
    });
    if (!lead) return reply.code(404).send({ error: { message: 'Lead not found' } });

    const rows = await prisma.propertyInterest.findMany({
      where: { leadId: id, agentId: u.id },
      include: {
        property: {
          select: {
            id: true, street: true, city: true,
            marketingPrice: true, rooms: true, sqm: true,
            category: true, assetClass: true, status: true,
            images: {
              orderBy: { sortOrder: 'asc' },
              take: 1,
              select: { urlCard: true, url: true },
            },
          },
        },
      },
      orderBy: [{ lastActionAt: 'desc' }, { createdAt: 'desc' }],
    });
    const items = await Promise.all(rows.map(async (r) => ({
      ...r,
      stats: await statsFor(r.id),
      lastActionLabel: await lastActionLabel(r.id),
    })));
    return { items };
  });

  // ── INTEREST-SCOPED: read / patch / delete / timeline ──────────
  app.get('/interests/:id', { onRequest: [app.requireAgent] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const u = requireUser(req);
    const row = await prisma.propertyInterest.findFirst({
      where: { id, agentId: u.id },
      include: {
        lead: true,
        property: {
          include: { images: { orderBy: { sortOrder: 'asc' }, take: 1 } },
        },
      },
    });
    if (!row) return reply.code(404).send({ error: { message: 'Interest not found' } });
    return {
      ...row,
      stats: await statsFor(row.id),
      lastActionLabel: await lastActionLabel(row.id),
    };
  });

  app.get('/interests/:id/timeline', { onRequest: [app.requireAgent] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const u = requireUser(req);
    const row = await prisma.propertyInterest.findFirst({
      where: { id, agentId: u.id },
      select: { id: true, propertyId: true, leadId: true },
    });
    if (!row) return reply.code(404).send({ error: { message: 'Interest not found' } });

    // Union all child rows. We match on either `interestId` OR
    // (propertyId, leadId) so legacy rows that pre-date this column
    // still show up — Phase 2 will backfill them.
    const where = {
      OR: [
        { interestId: row.id },
        { propertyId: row.propertyId, leadId: row.leadId },
      ],
    };
    const [viewings, offers, agreements, contracts, meetings] = await Promise.all([
      prisma.propertyViewing.findMany({ where, orderBy: { viewedAt: 'desc' } }),
      prisma.propertyOffer.findMany({ where, orderBy: { receivedAt: 'desc' } }),
      prisma.agreement.findMany({ where, orderBy: { sentAt: 'desc' } }),
      prisma.contract.findMany({ where, orderBy: { createdAt: 'desc' } }),
      prisma.leadMeeting.findMany({ where, orderBy: { startsAt: 'desc' } }),
    ]);
    type Event = { id: string; kind: string; at: string; payload: unknown };
    const events: Event[] = [
      ...viewings.map((r) => ({ id: r.id, kind: 'viewing',   at: r.viewedAt.toISOString(),   payload: r })),
      ...offers.map((r) => ({ id: r.id, kind: 'offer',     at: r.receivedAt.toISOString(), payload: r })),
      ...agreements.map((r) => ({ id: r.id, kind: 'agreement', at: r.sentAt.toISOString(),     payload: r })),
      ...contracts.map((r) => ({ id: r.id, kind: 'contract',  at: (r.signedAt || r.createdAt).toISOString(), payload: r })),
      ...meetings.map((r) => ({ id: r.id, kind: 'meeting',   at: r.startsAt.toISOString(),   payload: r })),
    ];
    events.sort((a, b) => b.at.localeCompare(a.at));
    return { items: events };
  });

  app.patch('/interests/:id', { onRequest: [app.requireAgent] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const u = requireUser(req);
    const body = z.object({
      status: statusEnum.optional(),
      notes: z.string().max(4000).nullable().optional(),
      lostReason: z.string().max(1000).nullable().optional(),
      // Buyer-side commission tracking. Israeli brokers charge each
      // side separately and at different terms; these fields capture
      // the buyer-facing arrangement (mirror of OwnerActivity for
      // seller-side).
      buyerCommissionPct: z.number().min(0).max(100).nullable().optional(),
      buyerCommissionBase: z.number().int().min(0).nullable().optional(),
      buyerCommissionFlat: z.number().int().min(0).nullable().optional(),
      buyerCommissionDiscount: z.number().int().min(0).nullable().optional(),
      buyerCommissionNotes: z.string().max(2000).nullable().optional(),
      // Agreed deal terms (payment schedule, handover date, anything
      // both parties are converging on).
      dealNotes: z.string().max(4000).nullable().optional(),
    }).parse(req.body);

    const existing = await prisma.propertyInterest.findFirst({
      where: { id, agentId: u.id },
      select: { id: true },
    });
    if (!existing) return reply.code(404).send({ error: { message: 'Interest not found' } });

    const updated = await prisma.propertyInterest.update({
      where: { id },
      data: body,
      include: { lead: true, property: { include: { images: { orderBy: { sortOrder: 'asc' }, take: 1 } } } },
    });
    return updated;
  });

  // POST /api/interests/:id/actions — single inline-action entry-point.
  // The panel's "+ סיור / + הצעה / + הסכם / + פגישה" buttons all post
  // here; this handler dispatches to the right Prisma model with the
  // interestId / propertyId / leadId wired automatically.
  app.post('/interests/:id/actions', { onRequest: [app.requireAgent] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const u = requireUser(req);
    const interest = await prisma.propertyInterest.findFirst({
      where: { id, agentId: u.id },
      include: { lead: { select: { name: true, phone: true, email: true } } },
    });
    if (!interest) return reply.code(404).send({ error: { message: 'Interest not found' } });

    const bodyBase = z.object({
      kind: z.enum(['viewing', 'offer', 'agreement', 'meeting']),
    }).passthrough().parse(req.body);

    let created;
    if (bodyBase.kind === 'viewing') {
      const b = z.object({
        viewedAt: z.string().datetime().optional(),
        notes: z.string().max(2000).nullable().optional(),
        source: z.string().max(60).nullable().optional(),
      }).parse(req.body);
      created = await prisma.propertyViewing.create({
        data: {
          propertyId: interest.propertyId,
          leadId: interest.leadId,
          interestId: interest.id,
          viewedAt: b.viewedAt ? new Date(b.viewedAt) : new Date(),
          notes: b.notes || null,
          source: b.source || null,
        },
      });
    } else if (bodyBase.kind === 'offer') {
      const b = z.object({
        amount: z.number().int().min(0),
        relayedAmount: z.number().int().min(0).nullable().optional(),
        direction: z.enum(['BUYER_TO_SELLER', 'SELLER_TO_BUYER']).optional(),
        replyToOfferId: z.string().nullable().optional(),
        paymentTerms: z.string().max(2000).nullable().optional(),
        handoverNotes: z.string().max(1000).nullable().optional(),
        status: z.enum(['NEW', 'NEGOTIATING', 'ACCEPTED', 'DECLINED', 'WITHDRAWN']).optional(),
        notes: z.string().max(2000).nullable().optional(),
      }).parse(req.body);
      created = await prisma.propertyOffer.create({
        data: {
          propertyId: interest.propertyId,
          leadId: interest.leadId,
          interestId: interest.id,
          buyerName: interest.lead?.name || 'מתעניין',
          buyerPhone: interest.lead?.phone || null,
          amount: b.amount,
          relayedAmount: b.relayedAmount ?? null,
          direction: b.direction || 'BUYER_TO_SELLER',
          replyToOfferId: b.replyToOfferId ?? null,
          paymentTerms: b.paymentTerms ?? null,
          handoverNotes: b.handoverNotes ?? null,
          status: b.status || 'NEW',
          notes: b.notes ?? null,
        },
      });
    } else if (bodyBase.kind === 'agreement') {
      const b = z.object({
        signerName: z.string().min(1).max(200).optional(),
        signerPhone: z.string().nullable().optional(),
        signerEmail: z.string().nullable().optional(),
        note: z.string().max(2000).nullable().optional(),
        status: z.enum(['SENT', 'SIGNED', 'CANCELLED']).optional(),
      }).parse(req.body);
      created = await prisma.agreement.create({
        data: {
          propertyId: interest.propertyId,
          leadId: interest.leadId,
          interestId: interest.id,
          signerName: b.signerName || interest.lead?.name || 'בעל הסכם',
          signerPhone: b.signerPhone ?? interest.lead?.phone ?? null,
          signerEmail: b.signerEmail ?? interest.lead?.email ?? null,
          note: b.note ?? null,
          status: b.status || 'SENT',
        },
      });
    } else if (bodyBase.kind === 'meeting') {
      const b = z.object({
        title: z.string().min(1).max(200),
        notes: z.string().max(2000).nullable().optional(),
        location: z.string().max(200).nullable().optional(),
        startsAt: z.string().datetime(),
        endsAt: z.string().datetime(),
      }).parse(req.body);
      created = await prisma.leadMeeting.create({
        data: {
          agentId: u.id,
          leadId: interest.leadId,
          propertyId: interest.propertyId,
          interestId: interest.id,
          title: b.title,
          notes: b.notes ?? null,
          location: b.location ?? null,
          startsAt: new Date(b.startsAt),
          endsAt: new Date(b.endsAt),
        },
      });
    }

    // Bump the interest's lastActionAt so the panel re-sorts to put
    // this lead at the top.
    await bumpInterestActivity(interest.id);
    return reply.code(201).send({ kind: bodyBase.kind, item: created });
  });

  app.delete('/interests/:id', { onRequest: [app.requireAgent] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const u = requireUser(req);
    const existing = await prisma.propertyInterest.findFirst({
      where: { id, agentId: u.id },
      select: { id: true },
    });
    if (!existing) return reply.code(404).send({ error: { message: 'Interest not found' } });
    await prisma.propertyInterest.delete({ where: { id } });
    return { ok: true };
  });
};
