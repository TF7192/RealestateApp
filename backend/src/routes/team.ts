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

  // GET /api/team/stats — Sprint 10 team-intel expansion.
  //
  // One round-trip aggregate that powers every widget on the customisable
  // /team stats dashboard. Office-scoped (joins Property / Lead / Deal /
  // PropertyView via agentId IN (office members)); lone-agent callers
  // bounce with 404 just like /team/scoreboard.
  //
  // Most counts come from Prisma groupBy. Medians are computed in TS —
  // Postgres has percentile_cont but Prisma doesn't expose it, and
  // fetching marketingPrice for ≤ a few hundred properties per office
  // is comfortably cheap. weeklySignedDeals walks the last 12 ISO weeks
  // (Mon → Sun, UTC) so the sparkline anchors on a stable boundary even
  // around year-end.
  app.get('/stats', { onRequest: [app.requireAgent] }, async (req, reply) => {
    const u = requireUser(req);
    const me = await prisma.user.findUnique({
      where: { id: u.id },
      select: { officeId: true },
    });
    if (!me?.officeId) {
      return reply.code(404).send({ error: { message: 'אינך משויך למשרד' } });
    }
    const memberRows = await prisma.user.findMany({
      where: { officeId: me.officeId },
      select: { id: true },
    });
    const memberIds = memberRows.map((m) => m.id);

    // Time anchors. ISO-week Monday for "this week" / "last week", and
    // a 12-week window for the sparkline. Year-to-date for commissions.
    const now = new Date();
    const startOfYear = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
    const dayOfWeek = now.getUTCDay(); // 0 = Sun … 6 = Sat
    const daysSinceMonday = (dayOfWeek + 6) % 7;
    const thisWeekStart = new Date(Date.UTC(
      now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysSinceMonday,
    ));
    const lastWeekStart = new Date(thisWeekStart.getTime() - 7 * 24 * 3600 * 1000);
    const twelveWeeksAgo = new Date(thisWeekStart.getTime() - 11 * 7 * 24 * 3600 * 1000);

    // ── Properties: city counts, rooms, price bands, asset split, all rows ──
    const properties = await prisma.property.findMany({
      where: { agentId: { in: memberIds } },
      select: {
        city: true, marketingPrice: true, rooms: true, category: true,
        assetClass: true, createdAt: true,
      },
    });

    const cityCount = new Map<string, number>();
    const roomBuckets = new Map<string, number>();
    const priceBandCount = new Map<string, number>();
    const saleByCity = new Map<string, number[]>();
    const rentByCity = new Map<string, number[]>();
    let residential = 0;
    let commercial = 0;
    let propertiesNewThisWeek = 0;
    let propertiesNewLastWeek = 0;
    const PRICE_BANDS: Array<[string, number, number]> = [
      ['0-1M', 0, 1_000_000],
      ['1-2M', 1_000_000, 2_000_000],
      ['2-3M', 2_000_000, 3_000_000],
      ['3-5M', 3_000_000, 5_000_000],
      ['5-7M', 5_000_000, 7_000_000],
      ['7-10M', 7_000_000, 10_000_000],
      ['10M+', 10_000_000, Number.POSITIVE_INFINITY],
    ];
    for (const p of properties) {
      const city = (p.city || '').trim();
      if (city) cityCount.set(city, (cityCount.get(city) || 0) + 1);
      const roomsKey = roomKeyOf(p.rooms);
      roomBuckets.set(roomsKey, (roomBuckets.get(roomsKey) || 0) + 1);
      const band = PRICE_BANDS.find(
        ([, lo, hi]) => p.marketingPrice >= lo && p.marketingPrice < hi,
      );
      if (band) priceBandCount.set(band[0], (priceBandCount.get(band[0]) || 0) + 1);
      if (p.assetClass === 'RESIDENTIAL') residential++;
      else if (p.assetClass === 'COMMERCIAL') commercial++;
      if (p.category === 'SALE' && city) {
        const arr = saleByCity.get(city) || [];
        arr.push(p.marketingPrice);
        saleByCity.set(city, arr);
      } else if (p.category === 'RENT' && city) {
        const arr = rentByCity.get(city) || [];
        arr.push(p.marketingPrice);
        rentByCity.set(city, arr);
      }
      if (p.createdAt >= thisWeekStart) propertiesNewThisWeek++;
      else if (p.createdAt >= lastWeekStart && p.createdAt < thisWeekStart) {
        propertiesNewLastWeek++;
      }
    }

    const propertiesByCity = Array.from(cityCount.entries())
      .map(([city, count]) => ({ city, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 15);

    // 1, 2, 3, 4, 5, 6+ — fixed shape so the bar chart axis is stable.
    const ROOM_KEYS = ['1', '2', '3', '4', '5', '6+'];
    const roomsDistribution = ROOM_KEYS.map((rooms) => ({
      rooms, count: roomBuckets.get(rooms) || 0,
    }));
    const priceBands = PRICE_BANDS.map(([band]) => ({
      band, count: priceBandCount.get(band) || 0,
    }));
    const medianSalePriceByCity = medianBuckets(saleByCity);
    const medianRentPriceByCity = medianBuckets(rentByCity);

    // ── Leads: temperature, source, conversion, weekly counts ──
    const leads = await prisma.lead.findMany({
      where: { agentId: { in: memberIds } },
      select: { status: true, source: true, createdAt: true },
    });
    const leadTemperature = { HOT: 0, WARM: 0, COLD: 0, unspecified: 0 };
    const sourceCount = new Map<string, number>();
    let leadsNewThisWeek = 0;
    let leadsNewLastWeek = 0;
    for (const l of leads) {
      if (l.status === 'HOT') leadTemperature.HOT++;
      else if (l.status === 'WARM') leadTemperature.WARM++;
      else if (l.status === 'COLD') leadTemperature.COLD++;
      else leadTemperature.unspecified++;
      // Empty / null source rolls up under "אחר" so the chart legend
      // stays clean (Hebrew label instead of "" or "null").
      const src = (l.source || '').trim() || 'אחר';
      sourceCount.set(src, (sourceCount.get(src) || 0) + 1);
      if (l.createdAt >= thisWeekStart) leadsNewThisWeek++;
      else if (l.createdAt >= lastWeekStart && l.createdAt < thisWeekStart) {
        leadsNewLastWeek++;
      }
    }
    const leadSources = Array.from(sourceCount.entries())
      .map(([source, count]) => ({ source, count }))
      .sort((a, b) => b.count - a.count);

    // ── Deals: weekly sparkline, YTD commissions, avg days to sign ──
    const deals = await prisma.deal.findMany({
      where: { agentId: { in: memberIds } },
      select: {
        status: true, signedAt: true, createdAt: true, updateDate: true,
        commission: true, closedPrice: true,
      },
    });

    // Pre-compute the 12-week buckets so empty weeks still render at 0.
    const weeklySignedDeals: { weekStart: string; count: number; volume: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const weekStart = new Date(thisWeekStart.getTime() - i * 7 * 24 * 3600 * 1000);
      weeklySignedDeals.push({
        weekStart: weekStart.toISOString().slice(0, 10),
        count: 0,
        volume: 0,
      });
    }
    let totalCommissionsYtd = 0;
    const daysToSign: number[] = [];
    for (const d of deals) {
      const signed = d.signedAt;
      const isClosed = d.status === 'SIGNED' || d.status === 'CLOSED';
      if (isClosed && signed && signed >= startOfYear) {
        totalCommissionsYtd += d.commission || 0;
      }
      if (isClosed && signed && signed >= twelveWeeksAgo) {
        const dow = signed.getUTCDay();
        const offset = (dow + 6) % 7;
        const weekMonday = new Date(Date.UTC(
          signed.getUTCFullYear(), signed.getUTCMonth(), signed.getUTCDate() - offset,
        )).toISOString().slice(0, 10);
        const bucket = weeklySignedDeals.find((w) => w.weekStart === weekMonday);
        if (bucket) {
          bucket.count++;
          bucket.volume += d.closedPrice || 0;
        }
      }
      if (isClosed && signed && d.createdAt) {
        const ms = signed.getTime() - d.createdAt.getTime();
        if (ms >= 0) daysToSign.push(ms / (24 * 3600 * 1000));
      }
    }
    const avgDaysToSign = daysToSign.length
      ? Math.round(daysToSign.reduce((s, n) => s + n, 0) / daysToSign.length)
      : null;

    // ── PropertyView referrers — top 5 hostnames ──
    const recentViews = await prisma.propertyView.findMany({
      where: {
        property: { agentId: { in: memberIds } },
        referrer: { not: null },
      },
      select: { referrer: true },
      take: 5000, // cap so a viral property can't blow up the JSON
    });
    const hostCount = new Map<string, number>();
    for (const v of recentViews) {
      const ref = v.referrer;
      if (!ref) continue;
      try {
        const host = new URL(ref).hostname;
        if (host) hostCount.set(host, (hostCount.get(host) || 0) + 1);
      } catch {
        // Malformed referrer — skip rather than 500.
      }
    }
    const topReferrers = Array.from(hostCount.entries())
      .map(([host, count]) => ({ host, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // ── Inquiry → lead conversion ratio ──
    // Office's total inquiries vs. total leads. Avoids divide-by-zero
    // by returning 0 when there were no inquiries.
    const [inquiryCount, leadCount] = await Promise.all([
      prisma.propertyInquiry.count({
        where: { property: { agentId: { in: memberIds } } },
      }),
      prisma.lead.count({ where: { agentId: { in: memberIds } } }),
    ]);
    const inquiryToLeadConvRate = inquiryCount > 0
      ? Math.min(1, leadCount / inquiryCount)
      : 0;

    return {
      propertiesByCity,
      medianSalePriceByCity,
      medianRentPriceByCity,
      leadTemperature,
      leadSources,
      roomsDistribution,
      priceBands,
      weeklySignedDeals,
      totalCommissionsYtd,
      topReferrers,
      inquiryToLeadConvRate,
      avgDaysToSign,
      assetClassSplit: { residential, commercial },
      newThisWeek: { leads: leadsNewThisWeek, properties: propertiesNewThisWeek },
      newLastWeek: { leads: leadsNewLastWeek, properties: propertiesNewLastWeek },
    };
  });
};

// Numeric room counts (Lead.rooms is a free-form string but
// Property.rooms is Float?) → "1" / "2" / "3" / "4" / "5" / "6+"
// bucket. Anything missing or below 1 falls into "1" so the histogram
// keeps a single entry per row.
function roomKeyOf(rooms: number | null | undefined): string {
  if (rooms == null) return '1';
  const rounded = Math.round(rooms);
  if (rounded <= 1) return '1';
  if (rounded >= 6) return '6+';
  return String(rounded);
}

// Median per { city → number[] } map. Bucket only included when it
// has count ≥ 2 — single-property cities aren't a real "median" and
// would clutter the table. Even-length sets average the two middle
// values, matching the standard statistical definition.
function medianBuckets(byCity: Map<string, number[]>): Array<{ city: string; median: number; count: number }> {
  const out: Array<{ city: string; median: number; count: number }> = [];
  for (const [city, prices] of byCity.entries()) {
    if (prices.length < 2) continue;
    const sorted = prices.slice().sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 === 1
      ? sorted[mid]
      : (sorted[mid - 1] + sorted[mid]) / 2;
    out.push({ city, median, count: sorted.length });
  }
  out.sort((a, b) => b.count - a.count);
  return out;
}
