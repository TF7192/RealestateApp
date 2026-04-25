import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { Readable } from 'node:stream';
import { prisma } from '../lib/prisma.js';
import { requireUser } from '../middleware/auth.js';

// Sprint 4 / MLS parity — Task E1 + B5. Range parser for date-bounded
// reports and CSV exports. ISO strings; missing = no bound on that end.
const rangeSchema = z.object({
  from: z.string().datetime().optional(),
  to:   z.string().datetime().optional(),
});

// CSV escape: wrap values that contain comma/quote/newline in quotes,
// and double any embedded quotes. Hebrew is UTF-8 safe so nothing
// special needed there — only the structural characters.
//
// SEC-013 — CSV / formula injection. Excel, Numbers, LibreOffice all
// interpret cells starting with `=`, `+`, `-`, `@`, `\t`, or `\r` as
// formulas at import time. A malicious lead-form submission of
// `=cmd|'/c calc'!A1` would silently execute when the agent later
// opened the export. Prefix-escape with an apostrophe (a long-standing
// OWASP recommendation — Excel hides the apostrophe but renders the
// rest of the cell literally). Exported so the unit test can pin the
// behavior in isolation.
export function csvCell(v: unknown): string {
  if (v == null) return '';
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
function csvRow(cells: unknown[]): string {
  return cells.map(csvCell).join(',');
}

export const registerReportRoutes: FastifyPluginAsync = async (app) => {
  // Weekly-report stats for a property — used by the "send report to owner" card
  app.get('/property/:id/weekly', { onRequest: [app.requireAgent] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const property = await prisma.property.findUnique({
      where: { id },
      include: {
        marketingActions: true,
        viewings: true,
        inquiries: true,
      },
    });
    if (!property || property.agentId !== requireUser(req).id) {
      return reply.code(404).send({ error: { message: 'Not found' } });
    }
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const inquiries = property.inquiries.filter((i) => i.createdAt >= weekAgo).length;
    const viewings = property.viewings.filter((v) => v.viewedAt >= weekAgo).length;
    const done = property.marketingActions.filter((a) => a.done).length;
    return {
      stats: {
        inquiries,
        viewings,
        views: inquiries + viewings * 3 + 4,
        offers: property.offer ? 1 : 0,
        completedActions: done,
        totalActions: property.marketingActions.length,
        doneActionKeys: property.marketingActions.filter((a) => a.done).map((a) => a.actionKey),
        pendingActionKeys: property.marketingActions.filter((a) => !a.done).map((a) => a.actionKey),
      },
    };
  });

  // Dashboard summary
  //
  // PERF-006 — rewrite to a single $transaction of count() aggregates +
  // one tiny sum aggregate. Previously this loaded every property/lead/
  // deal row just to call .filter().length on it; for an active agent
  // that's hundreds of KB of unused row data marshaled out of Postgres.
  // Response shape is byte-for-byte identical to the previous version
  // so the frontend doesn't need to change.
  app.get('/dashboard', { onRequest: [app.requireAgent] }, async (req) => {
    const agentId = requireUser(req).id;
    const propertyWhere = (extra: Record<string, unknown>) => ({
      agentId, status: 'ACTIVE' as const, ...extra,
    });
    const [
      resTotal, resSale, resRent,
      comTotal, comSale, comRent,
      leadsTotal, leadsHot, leadsWarm, leadsCold,
      dealsTotal, dealsSigned, signedCommissionAgg,
    ] = await prisma.$transaction([
      prisma.property.count({ where: propertyWhere({ assetClass: 'RESIDENTIAL' }) }),
      prisma.property.count({ where: propertyWhere({ assetClass: 'RESIDENTIAL', category: 'SALE' }) }),
      prisma.property.count({ where: propertyWhere({ assetClass: 'RESIDENTIAL', category: 'RENT' }) }),
      prisma.property.count({ where: propertyWhere({ assetClass: 'COMMERCIAL' }) }),
      prisma.property.count({ where: propertyWhere({ assetClass: 'COMMERCIAL', category: 'SALE' }) }),
      prisma.property.count({ where: propertyWhere({ assetClass: 'COMMERCIAL', category: 'RENT' }) }),
      prisma.lead.count({ where: { agentId } }),
      prisma.lead.count({ where: { agentId, status: 'HOT' } }),
      prisma.lead.count({ where: { agentId, status: 'WARM' } }),
      prisma.lead.count({ where: { agentId, status: 'COLD' } }),
      prisma.deal.count({ where: { agentId } }),
      prisma.deal.count({ where: { agentId, status: 'SIGNED' } }),
      prisma.deal.aggregate({
        where: { agentId, status: 'SIGNED' },
        _sum: { commission: true },
      }),
    ]);
    return {
      properties: {
        residential: { total: resTotal, sale: resSale, rent: resRent },
        commercial: { total: comTotal, sale: comSale, rent: comRent },
      },
      leads: {
        total: leadsTotal,
        hot:   leadsHot,
        warm:  leadsWarm,
        cold:  leadsCold,
      },
      deals: {
        total:           dealsTotal,
        active:          dealsTotal - dealsSigned,
        signed:          dealsSigned,
        totalCommission: signedCommissionAgg._sum.commission || 0,
      },
    };
  });

  // Sprint 4 / MLS parity — Task E1. Five date-bounded reports mirroring
  // Nadlan One's report set. Each one is owner-scoped (agentId) so reports
  // never cross office boundaries, and each supports optional from/to
  // timestamps so the UI can pick a range (E2 DateRangePicker).

  // 1. New properties added in range.
  app.get('/new-properties', { onRequest: [app.requireAgent] }, async (req) => {
    const { from, to } = rangeSchema.parse(req.query);
    const uid = requireUser(req).id;
    const where: any = { agentId: uid };
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to)   where.createdAt.lte = new Date(to);
    }
    const items = await prisma.property.findMany({
      where,
      select: {
        id: true, type: true, city: true, street: true,
        marketingPrice: true, status: true, stage: true, createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    return { items, count: items.length };
  });

  // 2. New customers (leads) added in range.
  app.get('/new-customers', { onRequest: [app.requireAgent] }, async (req) => {
    const { from, to } = rangeSchema.parse(req.query);
    const uid = requireUser(req).id;
    const where: any = { agentId: uid };
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to)   where.createdAt.lte = new Date(to);
    }
    const items = await prisma.lead.findMany({
      where,
      select: {
        id: true, name: true, phone: true, city: true,
        interestType: true, lookingFor: true, status: true,
        leadStatus: true, customerStatus: true, createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    return { items, count: items.length };
  });

  // 3. Deals in range (aggregation by status).
  app.get('/deals', { onRequest: [app.requireAgent] }, async (req) => {
    const { from, to } = rangeSchema.parse(req.query);
    const uid = requireUser(req).id;
    const where: any = { agentId: uid };
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to)   where.createdAt.lte = new Date(to);
    }
    const items = await prisma.deal.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
    const totalCommission = items
      .filter((d) => d.status === 'SIGNED')
      .reduce((s, d) => s + (d.commission || 0), 0);
    return {
      items,
      count: items.length,
      totalCommission,
      byStatus: items.reduce<Record<string, number>>((acc, d) => {
        acc[d.status] = (acc[d.status] || 0) + 1;
        return acc;
      }, {}),
    };
  });

  // 4. Viewings log in range.
  app.get('/viewings', { onRequest: [app.requireAgent] }, async (req) => {
    const { from, to } = rangeSchema.parse(req.query);
    const uid = requireUser(req).id;
    const where: any = { property: { agentId: uid } };
    if (from || to) {
      where.viewedAt = {};
      if (from) where.viewedAt.gte = new Date(from);
      if (to)   where.viewedAt.lte = new Date(to);
    }
    const items = await prisma.propertyViewing.findMany({
      where,
      include: {
        property: { select: { id: true, street: true, city: true, type: true } },
        lead:     { select: { id: true, name: true, phone: true } },
      },
      orderBy: { viewedAt: 'desc' },
    });
    return { items, count: items.length };
  });

  // 5. Marketing actions completed in range — useful to show the owner
  // what's been done on their listing.
  app.get('/marketing-actions', { onRequest: [app.requireAgent] }, async (req) => {
    const { from, to } = rangeSchema.parse(req.query);
    const uid = requireUser(req).id;
    const where: any = { done: true, property: { agentId: uid } };
    if (from || to) {
      where.doneAt = {};
      if (from) where.doneAt.gte = new Date(from);
      if (to)   where.doneAt.lte = new Date(to);
    }
    const items = await prisma.marketingAction.findMany({
      where,
      include: {
        property: { select: { id: true, street: true, city: true, type: true } },
      },
      orderBy: { doneAt: 'desc' },
    });
    return { items, count: items.length };
  });

  // Sprint 4 / MLS parity — Task B5. CSV export endpoints. Always
  // owner-scoped. BOM prefix so Excel detects UTF-8 and renders Hebrew
  // correctly.
  //
  // PERF-008 — stream rows out of a Prisma cursor loop instead of
  // buffering the whole table. Previously a 10,000-row export OOM'd
  // the Fastify process; now we walk the table in pages of 500 with
  // `setImmediate` between pages so the event loop yields. Hard cap
  // 50,000 rows; over that we 413 (export tools should split).
  const BOM = '﻿';
  const PAGE_SIZE = 500;
  const MAX_ROWS = 50_000;

  // Yield control to the event loop between cursor pages so the export
  // doesn't starve other handlers on the same Node process.
  function tick(): Promise<void> {
    return new Promise((resolve) => setImmediate(resolve));
  }

  // PERF-008 — async generator-backed Readable that yields one chunk
  // per Prisma cursor page. Fastify pipes the stream through
  // `reply.send()` so headers + the response lifecycle stay in
  // Fastify's hands (and `app.inject()` keeps capturing the body for
  // tests). `setImmediate` between pages lets the event loop service
  // other requests during a long export.
  async function* csvPages<T extends { id: string }>(
    fetchPage: (cursor: string | null) => Promise<T[]>,
    headerRow: string[],
    rowMap: (row: T) => unknown[],
  ) {
    yield BOM + csvRow(headerRow) + '\n';
    let cursor: string | null = null;
    let written = 0;
    while (true) {
      const page = await fetchPage(cursor);
      if (!page.length) return;
      let chunk = '';
      for (const row of page) {
        chunk += csvRow(rowMap(row)) + '\n';
        written += 1;
        if (written >= MAX_ROWS) break;
      }
      yield chunk;
      cursor = page[page.length - 1].id;
      if (page.length < PAGE_SIZE || written >= MAX_ROWS) return;
      // Yield to the event loop between pages so the export doesn't
      // starve other requests on the same Node process.
      await tick();
    }
  }

  function streamCsv<T extends { id: string }>(
    fetchPage: (cursor: string | null) => Promise<T[]>,
    headerRow: string[],
    rowMap: (row: T) => unknown[],
  ): NodeJS.ReadableStream {
    return Readable.from(csvPages(fetchPage, headerRow, rowMap));
  }

  app.get('/export/properties.csv', { onRequest: [app.requireAgent] }, async (req, reply) => {
    const uid = requireUser(req).id;
    // Check the row count up-front so we can 413 cleanly before we
    // start streaming. count() is cheap; the heavy cost is the row scan.
    const total = await prisma.property.count({ where: { agentId: uid } });
    if (total > MAX_ROWS) {
      return reply.code(413).send({
        error: { message: `Too many rows for a single export (${total}). Filter the range and retry.` },
      });
    }
    const stream = streamCsv(
      (cursor) => prisma.property.findMany({
        where: { agentId: uid },
        orderBy: { createdAt: 'desc' },
        take: PAGE_SIZE,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      }),
      [
        'id', 'type', 'city', 'street', 'marketingPrice', 'status', 'stage',
        'assetClass', 'category', 'rooms', 'sqm', 'floor', 'createdAt',
      ],
      (p: any) => [
        p.id, p.type, p.city, p.street, p.marketingPrice, p.status, p.stage,
        p.assetClass, p.category, p.rooms, p.sqm, p.floor, p.createdAt.toISOString(),
      ],
    );
    return reply
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', 'attachment; filename="properties.csv"')
      .send(stream);
  });

  app.get('/export/leads.csv', { onRequest: [app.requireAgent] }, async (req, reply) => {
    const uid = requireUser(req).id;
    const total = await prisma.lead.count({ where: { agentId: uid } });
    if (total > MAX_ROWS) {
      return reply.code(413).send({
        error: { message: `Too many rows for a single export (${total}). Filter the range and retry.` },
      });
    }
    const stream = streamCsv(
      (cursor) => prisma.lead.findMany({
        where: { agentId: uid },
        orderBy: { createdAt: 'desc' },
        take: PAGE_SIZE,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      }),
      [
        'id', 'name', 'phone', 'email', 'city', 'interestType', 'lookingFor',
        'status', 'leadStatus', 'customerStatus', 'budget', 'rooms', 'createdAt',
      ],
      (l: any) => [
        l.id, l.name, l.phone, l.email, l.city, l.interestType, l.lookingFor,
        l.status, l.leadStatus, l.customerStatus, l.budget, l.rooms, l.createdAt.toISOString(),
      ],
    );
    return reply
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', 'attachment; filename="leads.csv"')
      .send(stream);
  });

  app.get('/export/deals.csv', { onRequest: [app.requireAgent] }, async (req, reply) => {
    const uid = requireUser(req).id;
    const total = await prisma.deal.count({ where: { agentId: uid } });
    if (total > MAX_ROWS) {
      return reply.code(413).send({
        error: { message: `Too many rows for a single export (${total}). Filter the range and retry.` },
      });
    }
    const stream = streamCsv(
      (cursor) => prisma.deal.findMany({
        where: { agentId: uid },
        orderBy: { createdAt: 'desc' },
        take: PAGE_SIZE,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      }),
      ['id', 'propertyId', 'propertyStreet', 'city', 'status', 'closedPrice', 'commission', 'signedAt', 'createdAt'],
      (d: any) => [
        d.id, d.propertyId, d.propertyStreet, d.city, d.status, d.closedPrice, d.commission,
        d.signedAt ? d.signedAt.toISOString() : '', d.createdAt.toISOString(),
      ],
    );
    return reply
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', 'attachment; filename="deals.csv"')
      .send(stream);
  });
};
