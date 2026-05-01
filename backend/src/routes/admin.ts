import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { getUser } from '../middleware/auth.js';
import { logActivity } from '../lib/activity.js';

/**
 * Admin-only routes. SEC-010 — every route gates on the role-based
 * `app.requireAdmin` decorator (defined in middleware/auth.ts). The
 * previous email-allowlist gate is gone.
 *
 * Mounted at /api/admin in server.ts.
 */
export const registerAdminRoutes: FastifyPluginAsync = async (app) => {
  // 2026-04-27 — PPL Reg. 4(b) requires audit logs of access to
  // "high"-classified data. Every admin route hit writes a row to
  // ActivityLog so we have a 24-month-retained trail of who looked
  // at what.
  app.addHook('onResponse', async (req, reply) => {
    const url = (req as any).routeOptions?.url || req.url;
    if (typeof url !== 'string' || !url.startsWith('/admin/')) return;
    const u = getUser(req);
    if (!u) return;
    if (reply.statusCode >= 400) return;
    try {
      await logActivity({
        agentId: u.id, actorId: u.id,
        verb: 'admin_access', entityType: 'AdminRoute', entityId: url,
        summary: `${req.method} ${url}`,
        metadata: { method: req.method, status: reply.statusCode },
      });
    } catch { /* never let audit logging break the response */ }
  });
  // Market Discovery (Phase 4) — admin observability.
  // GET /api/admin/market-watcher/runs — last 50 watcher runs, newest
  // first. Used by /admin/market-watcher to surface success/failure
  // history, ingestion counts, and error messages.
  app.get('/market-watcher/runs', { onRequest: [app.requireAdmin] }, async () => {
    const runs = await prisma.marketWatcherRun.findMany({
      orderBy: { startedAt: 'desc' },
      take: 50,
      select: {
        id: true, startedAt: true, finishedAt: true, status: true, source: true,
        listingsSeen: true, listingsCreated: true, listingsUpdated: true,
        snapshotsCreated: true, matchesCreated: true, notificationsCreated: true,
        errorMessage: true,
      },
    });
    return { runs };
  });



  // ── GET /api/admin/users ────────────────────────────────────────
  // Single round-trip: every user with their owned-property count and
  // owned-lead count, plus their last session activity. No N+1 — counts
  // come from Prisma's _count relation aggregation, which Prisma
  // compiles to a single LEFT JOIN ... GROUP BY in SQL.
  const ListQ = z.object({
    page:    z.coerce.number().int().min(1).optional(),
    pageSize:z.coerce.number().int().min(1).max(200).optional(),
    sort:    z.enum(['name', 'createdAt', 'assetsCount', 'leadsCount', 'lastActiveAt']).optional(),
    dir:     z.enum(['asc', 'desc']).optional(),
    search:  z.string().trim().max(120).optional(),
    role:    z.enum(['AGENT', 'ADMIN', 'CUSTOMER']).optional(),
  });

  app.get('/users', { onRequest: [app.requireAdmin] }, async (req) => {
    const q = ListQ.parse(req.query);
    const page     = q.page     ?? 1;
    const pageSize = q.pageSize ?? 50;
    const sort     = q.sort     ?? 'createdAt';
    const dir      = q.dir      ?? 'desc';
    const skip     = (page - 1) * pageSize;

    // Build a Prisma where clause from search + role.
    const where: any = {};
    if (q.role) where.role = q.role;
    if (q.search) {
      where.OR = [
        { email:       { contains: q.search, mode: 'insensitive' } },
        { displayName: { contains: q.search, mode: 'insensitive' } },
      ];
    }

    // Counts come from the User._count relation on `properties` (assets
    // owned as agent) and `leads` (leads owned as agent). For non-agent
    // users both will be 0 — that's correct.
    //
    // For sorting on count columns we use Prisma's _count orderBy.
    let orderBy: any;
    switch (sort) {
      case 'name':         orderBy = { displayName: dir }; break;
      case 'assetsCount':  orderBy = { properties: { _count: dir } }; break;
      case 'leadsCount':   orderBy = { leads:      { _count: dir } }; break;
      // lastActiveAt is the MAX(Session.createdAt) per user; Prisma
      // can't orderBy aggregate-of-relation directly, so we sort by
      // updatedAt as a close proxy (it bumps on user-driven writes).
      case 'lastActiveAt': orderBy = { updatedAt: dir }; break;
      case 'createdAt':
      default:             orderBy = { createdAt: dir }; break;
    }

    const [total, users] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        orderBy,
        skip,
        take: pageSize,
        select: {
          id: true,
          email: true,
          displayName: true,
          role: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: { properties: true, leads: true },
          },
        },
      }),
    ]);

    // Last session per user — single query, in the page set only.
    // Indexed on (userId, expiresAt). Returning a Map for O(1) lookup.
    const sessions = users.length
      ? await prisma.session.groupBy({
          by: ['userId'],
          where: { userId: { in: users.map((u) => u.id) } },
          _max: { createdAt: true },
        })
      : [];
    const lastByUser = new Map<string, Date | null>(
      sessions.map((s) => [s.userId, s._max.createdAt ?? null]),
    );

    const items = users.map((u) => ({
      id: u.id,
      name: u.displayName || u.email,
      email: u.email,
      role: u.role,
      assetsCount: u._count.properties,
      leadsCount:  u._count.leads,
      createdAt: u.createdAt.toISOString(),
      lastActiveAt: lastByUser.get(u.id)?.toISOString() ?? null,
    }));

    return { items, total, page, pageSize };
  });

  // ── GET /api/admin/overview ─────────────────────────────────────
  // Platform-wide counts + month-to-date AI spend. Single endpoint
  // so the /admin page lands in one round-trip.
  app.get('/overview', { onRequest: [app.requireAdmin] }, async () => {
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [
      users, agents, owners, premiumAgents,
      properties, leads, deals, offices,
      reminders, aiRowsAll, aiRowsMonth,
      newUsersWeek, newPropertiesWeek, newLeadsWeek,
      activeOfficesMonth,
    ] = await Promise.all([
      prisma.user.count({ where: { deletedAt: null } }),
      prisma.user.count({ where: { deletedAt: null, role: 'AGENT' } }),
      prisma.user.count({ where: { deletedAt: null, role: 'OWNER' } }),
      prisma.user.count({ where: { deletedAt: null, isPremium: true } }),
      prisma.property.count(),
      prisma.lead.count(),
      prisma.deal.count(),
      prisma.office.count(),
      prisma.reminder.count(),
      prisma.aiUsage.aggregate({ _sum: { costUsd: true }, _count: true }),
      prisma.aiUsage.aggregate({ where: { createdAt: { gte: monthStart } }, _sum: { costUsd: true }, _count: true }),
      prisma.user.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
      prisma.property.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
      prisma.lead.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
      prisma.aiUsage.findMany({
        where: { createdAt: { gte: monthStart } },
        select: { user: { select: { officeId: true } } },
      }),
    ]);
    const officesWithSpend = new Set<string>();
    for (const r of activeOfficesMonth) {
      if (r.user?.officeId) officesWithSpend.add(r.user.officeId);
    }
    return {
      users: { total: users, agents, owners, premium: premiumAgents },
      properties, leads, deals, reminders, offices,
      newThisWeek: { users: newUsersWeek, properties: newPropertiesWeek, leads: newLeadsWeek },
      ai: {
        allTime: {
          callCount: aiRowsAll._count,
          costUsd: Number((aiRowsAll._sum.costUsd || 0).toFixed(4)),
        },
        thisMonth: {
          callCount: aiRowsMonth._count,
          costUsd: Number((aiRowsMonth._sum.costUsd || 0).toFixed(4)),
          activeOffices: officesWithSpend.size,
        },
      },
    };
  });

  // ── GET /api/admin/users-summary ────────────────────────────────
  // Per-user roll-up — assets, leads, deals, AI spend MTD. Used by
  // the admin dashboard's user table. Bigger than /users (which is
  // paginated for the existing AdminUsers page); this one gives a
  // small fixed slice (top 50 by recent activity).
  app.get('/users-summary', { onRequest: [app.requireAdmin] }, async () => {
    const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
    const users = await prisma.user.findMany({
      where: { deletedAt: null },
      orderBy: { updatedAt: 'desc' },
      take: 100,
      select: {
        id: true, email: true, displayName: true, role: true,
        isPremium: true, createdAt: true, updatedAt: true,
        office: { select: { name: true } },
        _count: {
          select: { properties: true, leads: true, deals: true, reminders: true },
        },
      },
    });
    const aiSums = users.length
      ? await prisma.aiUsage.groupBy({
          by: ['userId'],
          where: { userId: { in: users.map((u) => u.id) }, createdAt: { gte: monthStart } },
          _sum: { costUsd: true },
          _count: true,
        })
      : [];
    const spendByUser = new Map<string, { costUsd: number; calls: number }>();
    for (const r of aiSums) {
      spendByUser.set(r.userId, {
        costUsd: Number((r._sum.costUsd || 0).toFixed(4)),
        calls: r._count,
      });
    }
    return {
      items: users.map((u) => ({
        id: u.id,
        email: u.email,
        displayName: u.displayName,
        role: u.role,
        isPremium: !!u.isPremium,
        officeName: u.office?.name ?? null,
        properties: u._count.properties,
        leads: u._count.leads,
        deals: u._count.deals,
        reminders: u._count.reminders,
        aiCostUsd: spendByUser.get(u.id)?.costUsd || 0,
        aiCalls: spendByUser.get(u.id)?.calls || 0,
        createdAt: u.createdAt.toISOString(),
        updatedAt: u.updatedAt.toISOString(),
      })),
    };
  });

  // GET /api/admin/monitoring — live snapshot for the /admin/monitoring
  // page. Reads pg_stat_activity / pg_stat_database directly via
  // Prisma raw queries (the same source postgres_exporter scrapes), so
  // it works even if the Prometheus stack is down. If PROMETHEUS_URL is
  // set in env, it also pulls active firing alerts.
  app.get('/monitoring', { onRequest: [app.requireAdmin] }, async () => {
    const rows = await prisma.$queryRawUnsafe<Array<{ state: string | null; count: bigint }>>(
      `SELECT state, count(*)::bigint AS count
         FROM pg_stat_activity
         WHERE datname = current_database()
         GROUP BY state`,
    );
    const conn: Record<string, number> = {};
    for (const r of rows) {
      const k = (r.state || 'unknown').replace(/\s+/g, '_');
      conn[k] = Number(r.count);
    }

    const longRow = await prisma.$queryRawUnsafe<Array<{ longest_seconds: number | null }>>(
      `SELECT COALESCE(EXTRACT(EPOCH FROM max(now() - xact_start)), 0)::float AS longest_seconds
         FROM pg_stat_activity
         WHERE datname = current_database()
           AND state IN ('active', 'idle in transaction')`,
    );
    const longestSec = Number(longRow[0]?.longest_seconds ?? 0);

    const deadlocksRow = await prisma.$queryRawUnsafe<Array<{ deadlocks: bigint }>>(
      `SELECT deadlocks::bigint AS deadlocks FROM pg_stat_database WHERE datname = current_database()`,
    );
    const deadlocksTotal = Number(deadlocksRow[0]?.deadlocks ?? 0);

    const maxConnRow = await prisma.$queryRawUnsafe<Array<{ setting: string }>>(
      `SHOW max_connections`,
    );
    const maxConnections = Number(maxConnRow[0]?.setting ?? 0);

    let firingAlerts: Array<{ name: string; severity: string; summary: string; activeAt: string }> = [];
    let promReachable = false;
    if (process.env.PROMETHEUS_URL) {
      try {
        const r = await fetch(`${process.env.PROMETHEUS_URL.replace(/\/$/, '')}/api/v1/alerts`, {
          signal: AbortSignal.timeout(2000),
        });
        if (r.ok) {
          promReachable = true;
          const j = (await r.json()) as { data?: { alerts?: Array<{ state: string; labels: Record<string, string>; annotations: Record<string, string>; activeAt?: string }> } };
          firingAlerts = (j.data?.alerts || [])
            .filter((a) => a.state === 'firing')
            .map((a) => ({
              name: a.labels?.alertname ?? '?',
              severity: a.labels?.severity ?? 'unknown',
              summary: a.annotations?.summary ?? '',
              activeAt: a.activeAt ?? '',
            }));
        }
      } catch { /* prometheus unreachable; degrade gracefully */ }
    }

    return {
      capturedAt: new Date().toISOString(),
      db: {
        connections: {
          total: Object.values(conn).reduce((a, b) => a + b, 0),
          active: conn.active ?? 0,
          idle: conn.idle ?? 0,
          idle_in_transaction: conn.idle_in_transaction ?? 0,
          waiting: conn.waiting ?? 0,
        },
        maxConnections,
        longestRunningTxSeconds: longestSec,
        deadlocksSinceBoot: deadlocksTotal,
      },
      alerts: {
        prometheus_reachable: promReachable,
        firing: firingAlerts,
      },
      links: {
        grafana_local: 'http://localhost:3000',
        prometheus_local: 'http://localhost:9090',
        grafana_proxied: '/admin/grafana',
      },
    };
  });

  // Grafana reverse-proxy. Forwards every request under /api/admin/grafana/*
  // to the Grafana container at http://grafana:3000/admin/grafana/* (Grafana
  // is configured with GF_SERVER_SERVE_FROM_SUB_PATH=true + ROOT_URL pointing
  // at /admin/grafana so its self-generated links resolve correctly).
  //
  // Estia's admin JWT gate is the only auth — Grafana itself runs anonymous-
  // Admin behind this proxy. Non-admin Estia users get 403 before traffic
  // ever reaches Grafana.
  //
  // The frontend nginx routes external `/admin/grafana/*` to the SPA, but
  // the SPA's <iframe src="/api/admin/grafana/..."> embeds this proxy
  // directly. We register on '/grafana' (mounted at /api/admin/grafana
  // by the parent prefix) and a wildcard for the rest.
  const GRAFANA_TARGET = process.env.GRAFANA_INTERNAL_URL || 'http://grafana:3000';
  const proxyHandler = async (req: any, reply: any) => {
    // Strip the /admin/grafana prefix the FE hits us on; Grafana
    // expects to see /admin/grafana/<rest> because it's configured to
    // serve from that sub-path. So we forward the original URL.
    const url = req.url; // '/admin/grafana/api/...' (relative to /api)
    // req.url under a route prefix is '/grafana/...' — we need to
    // rebuild the path Grafana sees. Since GF serves from /admin/grafana,
    // we rewrite '/grafana/...' → '/admin/grafana/...'.
    const downstreamPath = url.replace(/^\/grafana/, '/admin/grafana');
    const target = `${GRAFANA_TARGET}${downstreamPath}`;

    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(req.headers)) {
      // Pass through everything except hop-by-hop + Cookie (which
      // carries Estia's JWT — Grafana's running anonymous, doesn't
      // need it; passing it leaks a credential to a different service).
      if (['host', 'connection', 'cookie', 'content-length', 'transfer-encoding'].includes(k.toLowerCase())) continue;
      if (typeof v === 'string') headers[k] = v;
    }

    const init: RequestInit = {
      method: req.method,
      headers,
      // Pass body for non-GET. Fastify's req.body is parsed; for proxy
      // we want the raw stream — use req.raw.
      ...(req.method !== 'GET' && req.method !== 'HEAD'
        ? { body: req.body ? JSON.stringify(req.body) : undefined }
        : {}),
      redirect: 'manual',
    };

    let upstream: Response;
    try {
      upstream = await fetch(target, init);
    } catch (e: any) {
      reply.code(502).send({ error: { message: `grafana upstream unreachable: ${e?.message ?? e}` } });
      return;
    }

    reply.code(upstream.status);
    upstream.headers.forEach((value, key) => {
      // Strip headers that interfere with our reverse proxy. CSP
      // can break iframe embedding so allow Grafana's own.
      if (['content-encoding', 'content-length', 'connection', 'transfer-encoding'].includes(key.toLowerCase())) return;
      reply.header(key, value);
    });
    // Override the global Helmet CSP (`frame-ancestors 'none'`) and
    // X-Frame-Options=DENY for THIS proxy only — without this the
    // iframe in /admin/grafana refuses to render. Same-origin embed
    // is fine because Estia controls the wrapper page.
    reply.removeHeader('content-security-policy');
    reply.header('content-security-policy', "frame-ancestors 'self' https://estia.co.il");
    reply.removeHeader('x-frame-options');
    reply.header('x-frame-options', 'SAMEORIGIN');

    if (!upstream.body) {
      reply.send();
      return;
    }
    const buf = Buffer.from(await upstream.arrayBuffer());
    reply.send(buf);
  };

  // Grafana's HTML + assets + API + WebSocket-fallback live across many
  // paths. Match all of them with a single wildcard. /grafana matches the
  // bare root; /grafana/* matches everything else.
  app.all('/grafana', { onRequest: [app.requireAdmin] }, proxyHandler);
  app.all('/grafana/*', { onRequest: [app.requireAdmin] }, proxyHandler);
};
