// Sprint 6 / claude-design port — team scoreboard.
//
// Distinct from /api/office (which is the invite / admin surface).
// This endpoint aggregates *performance KPIs* across every agent in
// the caller's office for a given quarter, powering the /team page:
//   - closedDeals:       count of Deal rows with status IN (SIGNED, CLOSED)
//   - totalVolume:       sum of Deal.closedPrice for the same set
//   - avgRating:         placeholder (0) — we don't have reviews yet
//   - leadsOpen:         count of Lead rows still active for that agent
//   - propertiesActive:  count of Property rows with status=ACTIVE
//
// Scoping rules:
//   - Caller must belong to an office. Lone-agent users get 404.
//   - Results are scoped to { officeId, agent.officeId == caller.officeId }
//     so cross-office leakage is impossible even if someone crafts
//     a weird quarter.
//
// Quarter filter:
//   - ?quarter=Q1-2026 narrows closedDeals + totalVolume to deals
//     whose signedAt (or updateDate as fallback) falls in that quarter.
//   - When omitted, the quarter defaults to the CURRENT quarter.
//   - leadsOpen / propertiesActive are snapshot counts, not time-bound.
//
// No new tables — pure SQL aggregation via Prisma groupBy over the
// existing Deal / Lead / Property / User schema.

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireUser } from '../middleware/auth.js';

// Parse a "Qx-yyyy" string into the [start, endExclusive) UTC window
// bounding the quarter. Returns null if the format is bad so the
// handler can fall back to the current quarter rather than erroring
// — a malformed ?quarter= shouldn't break the page.
function parseQuarter(input: string | undefined): { start: Date; end: Date; label: string } {
  const now = new Date();
  let q: number;
  let y: number;
  const m = input?.match(/^Q([1-4])-(\d{4})$/);
  if (m) {
    q = Number(m[1]);
    y = Number(m[2]);
  } else {
    // Fall back to current quarter.
    const month = now.getUTCMonth(); // 0-11
    q = Math.floor(month / 3) + 1;
    y = now.getUTCFullYear();
  }
  const startMonth = (q - 1) * 3;
  const start = new Date(Date.UTC(y, startMonth, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(y, startMonth + 3, 1, 0, 0, 0, 0));
  return { start, end, label: `Q${q}-${y}` };
}

const querySchema = z.object({
  quarter: z.string().optional(),
});

export const registerTeamRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/team/scoreboard?quarter=Q1-2026
  //
  // Returns { agents: [...] } scoped to the caller's office. Every
  // office member appears — even with zero closed deals — so the table
  // surfaces the full roster (helpful for "who has room for more leads?").
  app.get('/scoreboard', { onRequest: [app.requireAuth] }, async (req, reply) => {
    const { quarter: quarterInput } = querySchema.parse(req.query);
    const u = requireUser(req);
    const me = await prisma.user.findUnique({
      where: { id: u.id },
      select: { officeId: true },
    });
    if (!me?.officeId) {
      return reply.code(404).send({ error: { message: 'אינך משויך למשרד' } });
    }
    const { start, end, label } = parseQuarter(quarterInput);

    // Roster — all agents/owners in this office.
    const members = await prisma.user.findMany({
      where: { officeId: me.officeId },
      select: {
        id: true, displayName: true, email: true, avatarUrl: true, role: true,
      },
      orderBy: { displayName: 'asc' },
    });
    const memberIds = members.map((m) => m.id);
    if (memberIds.length === 0) {
      return { agents: [], quarter: label };
    }

    // Deals grouped by agent, windowed to the quarter. We key off
    // signedAt when present, falling back to updateDate for deals that
    // moved into CLOSED without a separate signed timestamp.
    // Prisma's groupBy can't do COALESCE so we run two passes and merge
    // — one signedAt-in-window, one signedAt-null + updateDate-in-window
    // — then sum per agent in JS. Tiny dataset per office (usually <200
    // deals/quarter) so the memory cost is nothing.
    const signedInWindow = await prisma.deal.groupBy({
      by: ['agentId'],
      where: {
        agentId: { in: memberIds },
        status: { in: ['SIGNED', 'CLOSED'] },
        signedAt: { gte: start, lt: end },
      },
      _count: { _all: true },
      _sum: { closedPrice: true },
    });
    const unsignedInWindow = await prisma.deal.groupBy({
      by: ['agentId'],
      where: {
        agentId: { in: memberIds },
        status: { in: ['SIGNED', 'CLOSED'] },
        signedAt: null,
        updateDate: { gte: start, lt: end },
      },
      _count: { _all: true },
      _sum: { closedPrice: true },
    });
    type Agg = { closedDeals: number; totalVolume: number };
    const dealsByAgent = new Map<string, Agg>();
    for (const row of [...signedInWindow, ...unsignedInWindow]) {
      const prev = dealsByAgent.get(row.agentId) || { closedDeals: 0, totalVolume: 0 };
      dealsByAgent.set(row.agentId, {
        closedDeals: prev.closedDeals + (row._count._all || 0),
        totalVolume: prev.totalVolume + (row._sum.closedPrice || 0),
      });
    }

    // Active-leads snapshot (not time-bound). "Open" = any lead that's
    // not explicitly closed. Customer status INACTIVE / CANCELLED count
    // as closed-out for this KPI.
    const leadsGrouped = await prisma.lead.groupBy({
      by: ['agentId'],
      where: {
        agentId: { in: memberIds },
        OR: [
          { customerStatus: null },
          {
            customerStatus: {
              notIn: ['INACTIVE', 'CANCELLED', 'BOUGHT', 'RENTED'],
            },
          },
        ],
      },
      _count: { _all: true },
    });
    const leadsByAgent = new Map<string, number>(
      leadsGrouped.map((r) => [r.agentId, r._count._all || 0]),
    );

    // Active listings snapshot.
    const propsGrouped = await prisma.property.groupBy({
      by: ['agentId'],
      where: {
        agentId: { in: memberIds },
        status: 'ACTIVE',
      },
      _count: { _all: true },
    });
    const propsByAgent = new Map<string, number>(
      propsGrouped.map((r) => [r.agentId, r._count._all || 0]),
    );

    const agents = members.map((m) => {
      const d = dealsByAgent.get(m.id) || { closedDeals: 0, totalVolume: 0 };
      return {
        agentId: m.id,
        displayName: m.displayName || m.email,
        avatarUrl: m.avatarUrl || null,
        role: m.role,
        closedDeals: d.closedDeals,
        totalVolume: d.totalVolume,
        // No review system yet — shipped as 0 so the UI column is
        // stable once we add ratings without needing another API rev.
        avgRating: 0,
        leadsOpen: leadsByAgent.get(m.id) || 0,
        propertiesActive: propsByAgent.get(m.id) || 0,
      };
    });

    return { agents, quarter: label };
  });

  // GET /api/team/agents/:id — full intel on one agent in the caller's
  // office. Returns the agent profile + active property inventory +
  // active leads + recent deals so the /team/:agentId detail page can
  // render everything in one round-trip.
  app.get('/agents/:id', { onRequest: [app.requireAuth] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const u = requireUser(req);
    const caller = await prisma.user.findUnique({ where: { id: u.id } });
    if (!caller?.officeId) {
      return reply.code(404).send({ error: { message: 'No office' } });
    }
    const agent = await prisma.user.findFirst({
      where: { id, officeId: caller.officeId },
      select: {
        id: true, displayName: true, email: true, phone: true,
        avatarUrl: true, role: true, officeId: true, createdAt: true,
        agentProfile: {
          select: { agency: true, title: true, license: true, bio: true },
        },
      },
    });
    if (!agent) {
      return reply.code(404).send({ error: { message: 'Agent not found in your office' } });
    }
    const [properties, leads, deals] = await Promise.all([
      prisma.property.findMany({
        where: { agentId: id },
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true, street: true, city: true, assetClass: true, category: true,
          type: true, marketingPrice: true, status: true, sqm: true, rooms: true,
          updatedAt: true,
        },
      }),
      prisma.lead.findMany({
        where: { agentId: id },
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true, name: true, phone: true, email: true, status: true,
          city: true, lookingFor: true, budget: true, updatedAt: true,
        },
      }),
      prisma.deal.findMany({
        where: { agentId: id },
        orderBy: { updateDate: 'desc' },
        take: 20,
        select: {
          id: true, propertyStreet: true, city: true, status: true,
          assetClass: true, category: true,
          marketingPrice: true, closedPrice: true, commission: true,
          signedAt: true, updateDate: true,
        },
      }),
    ]);
    const totals = deals.reduce((acc, d) => {
      if (d.status === 'SIGNED' || d.status === 'CLOSED') {
        acc.closedCount++;
        acc.volume += d.closedPrice || 0;
        acc.commissions += d.commission || 0;
      }
      return acc;
    }, { closedCount: 0, volume: 0, commissions: 0 });
    return { agent, properties, leads, deals, totals };
  });
};
