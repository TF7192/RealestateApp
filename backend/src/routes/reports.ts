import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
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
function csvCell(v: unknown): string {
  if (v == null) return '';
  const s = String(v);
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
  app.get('/dashboard', { onRequest: [app.requireAgent] }, async (req) => {
    const agentId = requireUser(req).id;
    const [properties, leads, deals] = await Promise.all([
      prisma.property.findMany({ where: { agentId } }),
      prisma.lead.findMany({ where: { agentId } }),
      prisma.deal.findMany({ where: { agentId } }),
    ]);
    const active = properties.filter((p) => p.status === 'ACTIVE');
    const residential = active.filter((p) => p.assetClass === 'RESIDENTIAL');
    const commercial = active.filter((p) => p.assetClass === 'COMMERCIAL');
    return {
      properties: {
        residential: {
          total: residential.length,
          sale: residential.filter((p) => p.category === 'SALE').length,
          rent: residential.filter((p) => p.category === 'RENT').length,
        },
        commercial: {
          total: commercial.length,
          sale: commercial.filter((p) => p.category === 'SALE').length,
          rent: commercial.filter((p) => p.category === 'RENT').length,
        },
      },
      leads: {
        total: leads.length,
        hot: leads.filter((l) => l.status === 'HOT').length,
        warm: leads.filter((l) => l.status === 'WARM').length,
        cold: leads.filter((l) => l.status === 'COLD').length,
      },
      deals: {
        total: deals.length,
        active: deals.filter((d) => d.status !== 'SIGNED').length,
        signed: deals.filter((d) => d.status === 'SIGNED').length,
        totalCommission: deals
          .filter((d) => d.status === 'SIGNED')
          .reduce((s, d) => s + (d.commission || 0), 0),
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
  // owner-scoped; never paginated (agents have < 10k rows each so a
  // single-shot download is fine and simpler than streaming). BOM
  // prefix so Excel detects UTF-8 and renders Hebrew correctly.
  const BOM = '﻿';

  app.get('/export/properties.csv', { onRequest: [app.requireAgent] }, async (req, reply) => {
    const uid = requireUser(req).id;
    const rows = await prisma.property.findMany({
      where: { agentId: uid },
      orderBy: { createdAt: 'desc' },
    });
    const header = [
      'id', 'type', 'city', 'street', 'marketingPrice', 'status', 'stage',
      'assetClass', 'category', 'rooms', 'sqm', 'floor', 'createdAt',
    ];
    const body = rows.map((p) => csvRow([
      p.id, p.type, p.city, p.street, p.marketingPrice, p.status, p.stage,
      p.assetClass, p.category, p.rooms, p.sqm, p.floor, p.createdAt.toISOString(),
    ]));
    reply
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', 'attachment; filename="properties.csv"');
    return BOM + [csvRow(header), ...body].join('\n');
  });

  app.get('/export/leads.csv', { onRequest: [app.requireAgent] }, async (req, reply) => {
    const uid = requireUser(req).id;
    const rows = await prisma.lead.findMany({
      where: { agentId: uid },
      orderBy: { createdAt: 'desc' },
    });
    const header = [
      'id', 'name', 'phone', 'email', 'city', 'interestType', 'lookingFor',
      'status', 'leadStatus', 'customerStatus', 'budget', 'rooms', 'createdAt',
    ];
    const body = rows.map((l) => csvRow([
      l.id, l.name, l.phone, l.email, l.city, l.interestType, l.lookingFor,
      l.status, l.leadStatus, l.customerStatus, l.budget, l.rooms, l.createdAt.toISOString(),
    ]));
    reply
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', 'attachment; filename="leads.csv"');
    return BOM + [csvRow(header), ...body].join('\n');
  });

  app.get('/export/deals.csv', { onRequest: [app.requireAgent] }, async (req, reply) => {
    const uid = requireUser(req).id;
    const rows = await prisma.deal.findMany({
      where: { agentId: uid },
      orderBy: { createdAt: 'desc' },
    });
    const header = ['id', 'propertyId', 'propertyStreet', 'city', 'status', 'closedPrice', 'commission', 'signedAt', 'createdAt'];
    const body = rows.map((d) => csvRow([
      d.id, d.propertyId, d.propertyStreet, d.city, d.status, d.closedPrice, d.commission,
      d.signedAt ? d.signedAt.toISOString() : '', d.createdAt.toISOString(),
    ]));
    reply
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', 'attachment; filename="deals.csv"');
    return BOM + [csvRow(header), ...body].join('\n');
  });
};
