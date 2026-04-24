import type { FastifyPluginAsync } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { requireUser } from '../middleware/auth.js';
import { logActivity } from '../lib/activity.js';

// Sprint 9 / marketing — lane B. Agent-scoped aggregation endpoints for
// the "ניהול שיווקי" dashboard. Reads PropertyView rows (tracker owned
// by lane A) and joins them with PropertyInquiry + Agreement to produce
// the funnel + per-property breakdown the dashboard renders.
//
// All endpoints are agent-scoped: `agentId = caller.id`. We never cross
// office boundaries here — the dashboard is strictly per-agent.

// How many days of daily trend data the frontend renders (sparkline +
// bar chart share the same 14-day window). Most-recent-first ordering
// is load-bearing for the chart axis — don't flip it.
const TREND_DAYS = 14;
const LAST_30_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

// Round to 1 decimal place. Avoids `-0` by collapsing it to 0.
function round1(n: number): number {
  const r = Math.round(n * 10) / 10;
  return r === 0 ? 0 : r;
}

// UTC day-start — the tracker writes `viewedAt` snapped to UTC midnight
// for dedup, so aggregating on the same boundary is consistent.
function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export const registerMarketingRoutes: FastifyPluginAsync = async (app) => {
  // ──────────────────────────────────────────────────────────────
  // GET /api/marketing/overview — funnel + topPerformers + byProperty
  // ──────────────────────────────────────────────────────────────
  app.get('/overview', { onRequest: [app.requireAgent] }, async (req) => {
    const agentId = requireUser(req).id;
    const now = new Date();
    const since30 = new Date(now.getTime() - LAST_30_DAYS_MS);
    // 14-day trend starts TREND_DAYS back at UTC midnight so each
    // bucket maps onto the tracker's day-snapped `viewedAt`.
    const trendStart = startOfUtcDay(
      new Date(now.getTime() - (TREND_DAYS - 1) * 24 * 60 * 60 * 1000),
    );

    // 1. All agent-owned properties — the spine of byProperty.
    const properties = await prisma.property.findMany({
      where: { agentId },
      select: {
        id: true,
        street: true,
        city: true,
        marketingPrice: true,
        status: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (properties.length === 0) {
      return {
        funnel: { viewsLast30d: 0, inquiriesLast30d: 0, agreementsSigned: 0 },
        topPerformers: [],
        byProperty: [],
      };
    }
    const propIds = properties.map((p) => p.id);

    // 2. PropertyView aggregates — 30-day totals + 14-day daily trend.
    // Two round-trips instead of one raw SQL bucketing: simpler, and the
    // row count is small (a hot listing accumulates ~50-200 views/mo).
    const viewsRecent = await prisma.propertyView.findMany({
      where: {
        propertyId: { in: propIds },
        viewedAt: { gte: trendStart },
      },
      select: { propertyId: true, viewedAt: true },
    });
    const viewsByProp = new Map<string, number>();
    const trendByProp = new Map<string, Map<string, number>>();
    for (const v of viewsRecent) {
      // 30-day totals — trendStart is always <= since30 so a view that
      // counts in the trend window may not count in the 30-day window.
      if (v.viewedAt >= since30) {
        viewsByProp.set(v.propertyId, (viewsByProp.get(v.propertyId) || 0) + 1);
      }
      // Daily bucket — ISO date key on UTC midnight.
      const key = startOfUtcDay(v.viewedAt).toISOString().slice(0, 10);
      let m = trendByProp.get(v.propertyId);
      if (!m) {
        m = new Map();
        trendByProp.set(v.propertyId, m);
      }
      m.set(key, (m.get(key) || 0) + 1);
    }

    // 3. PropertyInquiry aggregates — total + last30d per property.
    const inquiryCountsAll = await prisma.propertyInquiry.groupBy({
      by: ['propertyId'],
      where: { propertyId: { in: propIds } },
      _count: { _all: true },
    });
    const inquiriesTotalByProp = new Map<string, number>();
    for (const r of inquiryCountsAll) {
      inquiriesTotalByProp.set(r.propertyId, r._count._all);
    }

    const inquiryCounts30 = await prisma.propertyInquiry.groupBy({
      by: ['propertyId'],
      where: { propertyId: { in: propIds }, createdAt: { gte: since30 } },
      _count: { _all: true },
    });
    const inquiries30ByProp = new Map<string, number>();
    for (const r of inquiryCounts30) {
      inquiries30ByProp.set(r.propertyId, r._count._all);
    }

    // 4. Signed agreements per property. Agreement has no direct agent
    // FK, so scoping is via propertyId ∈ agent's properties.
    const agreementsSigned = await prisma.agreement.groupBy({
      by: ['propertyId'],
      where: {
        status: 'SIGNED',
        propertyId: { in: propIds },
      },
      _count: { _all: true },
    });
    const agreementsByProp = new Map<string, number>();
    for (const r of agreementsSigned) {
      if (r.propertyId) agreementsByProp.set(r.propertyId, r._count._all);
    }

    // Funnel totals — agent-wide.
    let viewsLast30d = 0;
    let inquiriesLast30d = 0;
    let agreementsSignedTotal = 0;
    for (const p of properties) {
      viewsLast30d += viewsByProp.get(p.id) || 0;
      inquiriesLast30d += inquiries30ByProp.get(p.id) || 0;
      agreementsSignedTotal += agreementsByProp.get(p.id) || 0;
    }

    // Build byProperty rows. For the trend, walk TREND_DAYS backwards
    // from today so the array is daily, most-recent-first.
    const today = startOfUtcDay(now);
    const byProperty = properties.map((p) => {
      const views30d = viewsByProp.get(p.id) || 0;
      const inquiries30d = inquiries30ByProp.get(p.id) || 0;
      const inquiriesTotal = inquiriesTotalByProp.get(p.id) || 0;
      const signed = agreementsByProp.get(p.id) || 0;
      const conversionPct = round1((inquiries30d / Math.max(1, views30d)) * 100);

      const dayMap = trendByProp.get(p.id);
      const viewsTrend: number[] = [];
      for (let i = 0; i < TREND_DAYS; i += 1) {
        const d = new Date(today.getTime() - i * 24 * 60 * 60 * 1000);
        const key = d.toISOString().slice(0, 10);
        viewsTrend.push(dayMap?.get(key) ?? 0);
      }

      return {
        propertyId: p.id,
        street: p.street,
        city: p.city,
        marketingPrice: p.marketingPrice,
        status: p.status,
        views30d,
        viewsTrend,
        inquiries30d,
        inquiriesTotal,
        agreementsSigned: signed,
        conversionPct,
      };
    });

    // topPerformers — top 5 by views30d, secondarily by inquiries30d.
    // Zero-view properties are filtered out so this list is only the
    // listings actually getting traffic.
    const topPerformers = [...byProperty]
      .filter((r) => r.views30d > 0)
      .sort((a, b) => {
        if (b.views30d !== a.views30d) return b.views30d - a.views30d;
        return b.inquiries30d - a.inquiries30d;
      })
      .slice(0, 5)
      .map((r) => ({
        propertyId: r.propertyId,
        street: r.street,
        city: r.city,
        views30d: r.views30d,
        inquiries30d: r.inquiries30d,
        conversionPct: r.conversionPct,
      }));

    return {
      funnel: {
        viewsLast30d,
        inquiriesLast30d,
        agreementsSigned: agreementsSignedTotal,
      },
      topPerformers,
      byProperty,
    };
  });

  // ──────────────────────────────────────────────────────────────
  // GET /api/marketing/inquiries — list landing-page submissions
  // ──────────────────────────────────────────────────────────────
  app.get('/inquiries', { onRequest: [app.requireAgent] }, async (req) => {
    const agentId = requireUser(req).id;
    const rows = await prisma.propertyInquiry.findMany({
      where: { property: { agentId } },
      include: {
        property: { select: { id: true, street: true, city: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    // promotedLeadId is surfaced as null for now — tracking which
    // inquiries have already been promoted needs a schema addition
    // (lane A's turf). Follow-up: add PropertyInquiry.promotedLeadId
    // and populate it here.
    const items = rows.map((r) => ({
      id: r.id,
      propertyId: r.propertyId,
      propertyStreet: r.property.street,
      propertyCity: r.property.city,
      contactName: r.contactName,
      contactPhone: r.contactPhone,
      contactEmail: r.contactEmail,
      message: r.message,
      createdAt: r.createdAt,
      promotedLeadId: null as string | null,
    }));
    return { items };
  });

  // ──────────────────────────────────────────────────────────────
  // POST /api/marketing/inquiries/:id/promote — inquiry → Lead
  // ──────────────────────────────────────────────────────────────
  app.post('/inquiries/:id/promote', { onRequest: [app.requireAgent] }, async (req, reply) => {
    const agentId = requireUser(req).id;
    const { id } = req.params as { id: string };

    const inquiry = await prisma.propertyInquiry.findUnique({
      where: { id },
      include: {
        property: {
          select: { id: true, agentId: true, city: true },
        },
      },
    });
    if (!inquiry || inquiry.property.agentId !== agentId) {
      // 404 (not 403) to avoid leaking existence of another agent's inquiry.
      return reply.code(404).send({ error: { message: 'Not found' } });
    }

    // Idempotency: if we've already promoted a landing-page lead with
    // this (agent, phone) tuple, return that lead rather than creating
    // a duplicate. A double-click on the button should be a no-op.
    const phoneForLookup = (inquiry.contactPhone || '').trim();
    if (phoneForLookup) {
      const existing = await prisma.lead.findFirst({
        where: {
          agentId,
          phone: phoneForLookup,
          source: 'landing-page',
        },
        select: { id: true },
      });
      if (existing) {
        return { leadId: existing.id };
      }
    }

    const created = await prisma.lead.create({
      data: {
        agentId,
        name: inquiry.contactName,
        phone: phoneForLookup || '—',
        email: inquiry.contactEmail,
        city: inquiry.property.city,
        notes: inquiry.message,
        source: 'landing-page',
        status: 'WARM',
      },
    });

    await logActivity({
      agentId,
      actorId: agentId,
      verb: 'promoted',
      entityType: 'Lead',
      entityId: created.id,
      summary: `ליד חדש מטופס נחיתה: ${created.name}`,
      metadata: { inquiryId: inquiry.id, propertyId: inquiry.propertyId },
    });

    return { leadId: created.id };
  });
};
