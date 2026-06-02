// PERF-007 / PERF-019 — server-computed dashboard summary + topbar
// counts. Replaces the four unbounded list calls Dashboard.jsx + Layout
// fan out today (listLeads / listProperties / listDeals / listReminders +
// listNotifications) with two narrow endpoints
// that return pre-shaped, ≤5-row payloads.
//
// Both endpoints are owner-scoped via JWT and return the exact response
// shape Commit B's frontend will consume; until Commit B lands the old
// endpoints stay live so this is purely additive.

import type { FastifyPluginAsync } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { requireUser } from '../middleware/auth.js';
import { createLru } from '../lib/lru.js';

// Per-user 30s LRU for /api/topbar-counts. The endpoint already sets
// Cache-Control: private, max-age=30 — this layer absorbs server-side
// re-computation under SPA navigation bursts (Layout mounts the topbar
// on every page change). Eviction is per-user so a notification-read
// for one agent doesn't stale another agent's cache.
const topbarCache = createLru<string, { unreadNotifications: number; hasOpenChat: boolean; cachedAt: number }>({
  max: 10_000,
  ttlMs: 30_000,
});

// 30s per-agent LRU for /api/dashboard/summary AND /api/dashboard/full.
// Both endpoints return the same shape (counts + 4 top-N tiles); the
// heavy-list block was dropped from /full as part of the 2026-05-01
// "split the dashboard fan-out" perf work — the FE now calls listLeads
// / listProperties / listDeals / listReminders separately AFTER the
// initial KPI paint, so the dashboard fast-path renders in <50ms on
// cache hits and the lists hydrate in the background.
const dashboardSummaryCache = createLru<string, any>({ max: 10_000, ttlMs: 30_000 });

// Anchor "today" to Asia/Jerusalem, not the container TZ. EC2 runs UTC,
// so `new Date(year, month, date)` would yield 00:00 UTC = 02:00/03:00
// IL — meetings scheduled before that line on a real Israeli day would
// silently fall outside the bucket. DST-aware via Intl.formatToParts.
function startOfJerusalemDay(now: Date): Date {
  const tz = 'Asia/Jerusalem';
  const dateParts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const dp: Record<string, string> = {};
  for (const p of dateParts) dp[p.type] = p.value;
  const y = Number(dp.year), m = Number(dp.month), d = Number(dp.day);
  // Probe: take UTC midnight of (y,m,d) and ask what IL clock shows
  // at that instant. That offset is what we subtract to get IL
  // midnight expressed in UTC ms.
  const utcMidnight = Date.UTC(y, m - 1, d);
  const probeParts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(utcMidnight);
  const pp: Record<string, string> = {};
  for (const p of probeParts) pp[p.type] = p.value;
  const offsetMs =
    Number(pp.hour) * 3_600_000 + Number(pp.minute) * 60_000;
  return new Date(utcMidnight - offsetMs);
}

export const registerDashboardRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/dashboard/summary
  //
  // Returns: { counts, hotLeads, todayMeetings, stuckDeals, staleProperties }
  // - counts: high-level KPIs via prisma.count() — no row scans.
  // - the four lists are tight selectors with `take: 5` each.
  app.get('/summary', { onRequest: [app.requireAgent] }, async (req, reply) => {
    const agentId = requireUser(req).id;
    // Browser-side cache match the in-process LRU TTL — second mount
    // within 30s is served from disk cache (zero network).
    reply.header('Cache-Control', 'private, max-age=30');
    return dashboardSummaryCache.wrap(agentId, async () => buildSummary(agentId));
  });

  // Internal builder — split out so /full can reuse it.
  async function buildSummary(agentId: string) {
    const now = new Date();
    const startOfDay = startOfJerusalemDay(now);
    const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // PERF — 2026-05-01 v3: Promise.all instead of $transaction. The
    // 10 queries here are all read-only count/findMany — they don't
    // need transactional consistency. $transaction runs them
    // sequentially over a single DB connection (each waits for the
    // previous query's RDS round-trip); Promise.all opens 10 pool
    // connections and runs them truly in parallel. Wall-clock drops
    // from ~70ms (sum of round-trips) to ~20ms (max single query).
    const [
      propertiesCount,
      leadsCount,
      dealsCount,
      remindersCount,
      hotLeadsCount,
      todayMeetingsCount,
      hotLeadsRows,
      todayMeetingsRows,
      stuckDealsRows,
      stalePropertiesRows,
    ] = await Promise.all([
      prisma.property.count({ where: { agentId } }),
      prisma.lead.count({ where: { agentId } }),
      prisma.deal.count({ where: { agentId } }),
      prisma.reminder.count({ where: { agentId, status: 'PENDING' } }),
      prisma.lead.count({ where: { agentId, status: 'HOT' } }),
      prisma.leadMeeting.count({
        where: { agentId, startsAt: { gte: startOfDay, lt: endOfDay } },
      }),
      // Top 5 hot leads, freshest first.
      prisma.lead.findMany({
        where: { agentId, status: 'HOT' },
        select: {
          id: true, name: true, status: true, city: true, lastContact: true,
        },
        orderBy: [{ lastContact: 'desc' }, { createdAt: 'desc' }],
        take: 5,
      }),
      // Today's meetings (by startsAt), earliest first.
      prisma.leadMeeting.findMany({
        where: { agentId, startsAt: { gte: startOfDay, lt: endOfDay } },
        select: {
          id: true, title: true, startsAt: true,
          lead:     { select: { name: true } },
          // Reuse the existing relation; meetings don't carry a property
          // FK directly but tests/UI may surface the lead's property
          // shortcut later. Keep the field for forward compat.
        },
        orderBy: { startsAt: 'asc' },
        take: 5,
      }),
      // Deals that have been sitting in NEGOTIATING for >7 days.
      prisma.deal.findMany({
        where: {
          agentId,
          status: 'NEGOTIATING',
          updatedAt: { lt: sevenDaysAgo },
        },
        select: {
          id: true, propertyStreet: true, city: true, status: true, updatedAt: true,
        },
        orderBy: { updatedAt: 'asc' },
        take: 5,
      }),
      // Active properties not touched in 14 days.
      prisma.property.findMany({
        where: {
          agentId,
          status: 'ACTIVE',
          updatedAt: { lt: fourteenDaysAgo },
        },
        select: {
          id: true, street: true, city: true, updatedAt: true,
        },
        orderBy: { updatedAt: 'asc' },
        take: 5,
      }),
    ]);

    const msPerDay = 24 * 60 * 60 * 1000;
    const ts = now.getTime();
    return {
      counts: {
        properties:    propertiesCount,
        leads:         leadsCount,
        deals:         dealsCount,
        reminders:     remindersCount,
        hotLeadsCount,
        todayMeetings: todayMeetingsCount,
      },
      hotLeads: hotLeadsRows.map((l) => ({
        id:            l.id,
        name:          l.name,
        status:        l.status,
        city:          l.city,
        lastContactAt: l.lastContact ? l.lastContact.toISOString() : null,
      })),
      todayMeetings: todayMeetingsRows.map((m) => ({
        id:            m.id,
        leadName:      m.lead?.name ?? null,
        // No direct meeting → property link in the schema today; surface
        // the title so the FE can render "פגישה: …" without a fallback.
        propertyTitle: m.title,
        time:          m.startsAt.toISOString(),
      })),
      stuckDeals: stuckDealsRows.map((d) => ({
        id:        d.id,
        address:   [d.propertyStreet, d.city].filter(Boolean).join(', ') || d.propertyStreet || '',
        daysStuck: Math.max(0, Math.floor((ts - d.updatedAt.getTime()) / msPerDay)),
        stage:     d.status,
      })),
      staleProperties: stalePropertiesRows.map((p) => ({
        id:                  p.id,
        street:              p.street,
        city:                p.city,
        daysSinceLastTouch:  Math.max(0, Math.floor((ts - p.updatedAt.getTime()) / msPerDay)),
      })),
    };
  } // end buildSummary

  // PERF — 2026-05-01 v2: /api/dashboard/full now returns the SAME
  // thin shape as /summary (counts + 4 top-N tiles). The heavy-list
  // block (200-row leads/properties/deals/reminders) was dropped —
  // bundling all that into the critical-path dashboard call made the
  // KPI paint wait on 14 DB queries × 200 rows. The FE's Dashboard.jsx
  // now lazy-fetches the lists after first paint (parallel listLeads
  // + listProperties + listDeals + listReminders), so KPIs render at
  // ~50ms on cache hits and pipeline/AI priorities fill in ~200ms
  // later. Endpoint kept (not deleted) so older FE builds still work.
  app.get('/full', { onRequest: [app.requireAgent] }, async (req, reply) => {
    const agentId = requireUser(req).id;
    reply.header('Cache-Control', 'private, max-age=30');
    return dashboardSummaryCache.wrap(agentId, async () => buildSummary(agentId));
  });

};

// PERF-019 — combined topbar counts (notifications + hasOpenChat flag).
// Layout.jsx today fires two separate calls every page mount; this
// collapses them into one round-trip. The existing endpoints stay live
// (additive change) so the legacy FE keeps working until Commit B
// switches over.
export const registerTopbarRoutes: FastifyPluginAsync = async (app) => {
  app.get('/topbar-counts', { onRequest: [app.requireAgent] }, async (req, reply) => {
    const u = requireUser(req);

    const payload = await topbarCache.wrap(u.id, async () => {
      // PERF — 2026-05-01 v3: Promise.all over $transaction (read-only,
      // no need for atomicity). Round-trips run in parallel.
      const [unreadNotifications, openChat] = await Promise.all([
        prisma.notification.count({
          where: { userId: u.id, readAt: null },
        }),
        // hasOpenChat: viewer has any conversation with at least one
        // unread admin-side message. Cheap because Conversation has the
        // userId @unique constraint and Message has (conversationId,
        // createdAt) covering the per-convo scan.
        prisma.message.findFirst({
          where: {
            conversation: { userId: u.id },
            senderRole: 'admin',
            readAt: null,
          },
          select: { id: true },
        }),
      ]);
      return {
        unreadNotifications,
        hasOpenChat: !!openChat,
        cachedAt: Date.now(),
      };
    });

    // Cache for 30s — the topbar polls on every Layout mount today; a
    // short private cache absorbs SPA-route bounces without staling
    // the badge for too long.
    reply.header('Cache-Control', 'private, max-age=30');
    const { cachedAt: _cachedAt, ...rest } = payload;
    return rest;
  });
};

// Test/diagnostic helper: invalidate a user's topbar cache (e.g. on
// notification-mark-read). Not currently wired but exported for the
// notifications route to call when a user reads a notification.
export function invalidateTopbarCache(userId: string): void {
  topbarCache.delete(userId);
}
