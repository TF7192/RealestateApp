import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import path from 'node:path';
import fs from 'node:fs';
import { registerAuthRoutes } from './routes/auth.js';
import { registerGoogleOAuthRoutes } from './routes/oauth-google.js';
import { registerAppleOAuthRoutes } from './routes/oauth-apple.js';
import { registerPropertyRoutes } from './routes/properties.js';
import { registerLeadRoutes } from './routes/leads.js';
import { registerDealRoutes } from './routes/deals.js';
import { registerAgreementRoutes } from './routes/agreements.js';
import { registerLookupRoutes } from './routes/lookups.js';
import { registerReportRoutes } from './routes/reports.js';
import { registerMeRoutes } from './routes/me.js';
import { registerChatRoutes } from './routes/chat.js';
import { registerAdminRoutes } from './routes/admin.js';
import { registerYad2Routes } from './routes/yad2.js';
import { registerMarketRoutes } from './routes/market.js';
import { registerProspectRoutes } from './routes/prospects.js';
import { registerProspectPdfRoutes } from './routes/prospect-pdf.js';
import { registerCalendarRoutes } from './routes/calendar.js';
import fastifyWebsocket from '@fastify/websocket';
import { registerAgentRoutes } from './routes/agents.js';
import { registerTransferRoutes } from './routes/transfers.js';
import { registerTemplateRoutes } from './routes/templates.js';
import { registerGeoRoutes } from './routes/geo.js';
import { registerPublicRoutes } from './routes/public.js';
import { registerOwnerRoutes, registerOwnerPhoneRoutes } from './routes/owners.js';
import { registerOfficeRoutes } from './routes/office.js';
import { registerTagRoutes } from './routes/tags.js';
import { registerReminderRoutes } from './routes/reminders.js';
import { registerLeadSearchProfileRoutes } from './routes/leadSearchProfiles.js';
import { registerSearchRoutes } from './routes/search.js';
import { registerActivityRoutes } from './routes/activity.js';
import { registerAdvertRoutes } from './routes/adverts.js';
import { registerAiRoutes } from './routes/ai.js';
import {
  registerNeighborhoodRoutes,
  registerSavedSearchRoutes,
  registerFavoriteRoutes,
} from './routes/mlsSprint7.js';
import { registerNeighborhoodGroupRoutes } from './routes/neighborhoodGroups.js';
import { storageBackend, resolveUpload } from './lib/storage.js';
import { track as phTrack, captureException as phCapture, shutdownAnalytics } from './lib/analytics.js';
import { getUser } from './middleware/auth.js';
import crypto from 'node:crypto';
import { authPlugin } from './middleware/auth.js';

const PORT = Number(process.env.PORT || 4000);
const HOST = process.env.HOST || '0.0.0.0';
const NODE_ENV = process.env.NODE_ENV || 'development';

const UPLOADS_DIR = path.resolve(process.env.UPLOADS_DIR || './uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// ── Fail-fast on missing secrets in production (audit F-11.1) ────
// If we ever deploy without JWT_SECRET set, every token in the world
// is signed with a publicly-knowable string and any attacker can
// forge sessions. Blow up loudly instead of silently shipping.
if (NODE_ENV === 'production') {
  const missing: string[] = [];
  if (!process.env.JWT_SECRET)    missing.push('JWT_SECRET');
  if (!process.env.COOKIE_SECRET) missing.push('COOKIE_SECRET');
  if (missing.length) {
    // eslint-disable-next-line no-console
    console.error(`[startup] missing required env vars: ${missing.join(', ')}`);
    process.exit(1);
  }
}
const JWT_SECRET    = process.env.JWT_SECRET    || 'dev-only-change-me';
const COOKIE_SECRET = process.env.COOKIE_SECRET || 'dev-only-cookie-secret';

// Exported so tests can build an isolated app instance without
// listening on a port — tests call app.inject() for integration cases.
export async function build() {
  const app = Fastify({
    logger:
      NODE_ENV === 'production'
        ? { level: 'info' }
        : {
            level: 'debug',
            transport: { target: 'pino-pretty', options: { colorize: true } },
          },
    trustProxy: true,
    bodyLimit: 10 * 1024 * 1024,
  });

  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, {
    origin: (origin, cb) => {
      // Allow same-origin (no origin), the configured public URL, and dev localhost
      const allowed = [
        process.env.PUBLIC_ORIGIN,
        'http://localhost:5173',
        'http://localhost:6001',
        'http://127.0.0.1:6001',
        'https://estia.co.il',
      ].filter(Boolean);
      if (!origin || allowed.includes(origin)) return cb(null, true);
      cb(null, false);
    },
    credentials: true,
  });
  // F-11.3 — signed cookies so tampering requires the COOKIE_SECRET too.
  // Split from JWT_SECRET so one leak doesn't compromise the other.
  await app.register(cookie, { secret: COOKIE_SECRET });
  await app.register(jwt, {
    secret: JWT_SECRET,
    cookie: { cookieName: 'estia_token', signed: false },
  });
  // E2E suites fan out across workers and can easily blow 300/min.
  // RATE_LIMIT_MAX_PER_MIN lets tests raise the ceiling without forking
  // the runtime; real deploys leave it unset and get the 300 default.
  const globalRateMax = Number(process.env.RATE_LIMIT_MAX_PER_MIN) || 300;
  await app.register(rateLimit, {
    max: globalRateMax,
    timeWindow: '1 minute',
    allowList: (req) => req.url.startsWith('/api/health'),
  });
  // 100MB cap covers property photos and short property video tours.
  await app.register(multipart, { limits: { fileSize: 100 * 1024 * 1024 } });
  // /uploads/* serving — exactly one of these mounts depending on backend:
  //   • s3:    a 302-redirect handler that signs a 1h presigned URL
  //   • local: fastifyStatic served from the on-disk uploads dir
  if (storageBackend === 's3') {
    app.get('/uploads/*', async (req, reply) => {
      const key = (req.params as any)['*'] as string;
      if (!key) return reply.code(404).send({ error: { message: 'Not found' } });
      try {
        const r = await resolveUpload(key);
        // Fastify 5: reply.redirect(url, code) — arg order flipped.
        if (r.kind === 'redirect') return reply.redirect(r.url, 302);
        return reply.sendFile(key);
      } catch (e: any) {
        return reply.code(404).send({ error: { message: 'Not found' } });
      }
    });
  } else {
    await app.register(fastifyStatic, {
      root: UPLOADS_DIR,
      prefix: '/uploads/',
      decorateReply: false,
    });
  }

  await app.register(fastifyWebsocket);
  await app.register(authPlugin);

  // F-12.2 — Liveness probe (is the process up?) vs readiness probe
  // (can it actually serve?). The readiness probe actually touches the
  // DB so rolling deploys wait until Prisma is reachable before flipping
  // traffic over; the liveness probe stays trivially cheap.
  app.get('/api/health', async () => ({
    ok: true,
    service: 'estia-backend',
    time: new Date().toISOString(),
  }));
  app.get('/api/health/ready', async (_req, reply) => {
    try {
      const { prisma } = await import('./lib/prisma.js');
      await prisma.$queryRaw`SELECT 1`;
      return { ok: true, service: 'estia-backend', time: new Date().toISOString() };
    } catch (e: any) {
      return reply.code(503).send({ ok: false, error: e?.message || 'db_unreachable' });
    }
  });

  // Install the error handler BEFORE routes so Fastify's encapsulation
  // pins it as the handler-of-record for every downstream route. If
  // registered after, routes inside registered plugins fall back to the
  // framework default and we lose the zod→400 mapping.
  app.setErrorHandler((err: any, req, reply) => {
    req.log.error({ err }, 'request failed');
    const zod =
      (err?.name === 'ZodError' && err) ||
      (Array.isArray(err?.issues) && err) ||
      (err?.cause?.name === 'ZodError' && err.cause) ||
      (Array.isArray(err?.cause?.issues) && err.cause);
    if (zod) {
      return reply.code(400).send({
        error: {
          message: 'Invalid request body',
          code: 'invalid_request',
          issues: (zod.issues || []).map((i: any) => ({
            path: i.path, message: i.message, code: i.code,
          })),
        },
      });
    }
    const status = err?.statusCode || 500;
    if (status >= 500) {
      const u = getUser(req);
      const anonId = (req.headers['x-posthog-distinct-id'] as string | undefined)?.slice(0, 200);
      phCapture(err, u?.id || anonId || null, {
        method: req.method,
        route: (req as any).routeOptions?.url || req.url,
        request_id: (req as any).__reqId,
      });
    }
    reply.code(status).send({
      error: {
        message: status >= 500 ? 'Internal server error' : (err?.message || 'Error'),
        code: err?.code,
      },
    });
  });

  await app.register(registerAuthRoutes, { prefix: '/api/auth' });
  await app.register(registerGoogleOAuthRoutes, { prefix: '/api/auth' });
  await app.register(registerAppleOAuthRoutes, { prefix: '/api/auth' });
  await app.register(registerMeRoutes, { prefix: '/api/me' });
  await app.register(registerPropertyRoutes, { prefix: '/api/properties' });
  await app.register(registerLeadRoutes, { prefix: '/api/leads' });
  await app.register(registerDealRoutes, { prefix: '/api/deals' });
  await app.register(registerAgreementRoutes, { prefix: '/api/agreements' });
  await app.register(registerLookupRoutes, { prefix: '/api/lookups' });
  await app.register(registerReportRoutes, { prefix: '/api/reports' });
  await app.register(registerAgentRoutes, { prefix: '/api/agents' });
  await app.register(registerTransferRoutes, { prefix: '/api' });
  await app.register(registerTemplateRoutes, { prefix: '/api/templates' });
  await app.register(registerGeoRoutes, { prefix: '/api/geo' });
  await app.register(registerPublicRoutes, { prefix: '/api/public' });
  await app.register(registerOwnerRoutes, { prefix: '/api/owners' });
  await app.register(registerOwnerPhoneRoutes, { prefix: '/api' });
  await app.register(registerChatRoutes, { prefix: '/api/chat' });
  await app.register(registerAdminRoutes, { prefix: '/api/admin' });
  await app.register(registerYad2Routes,  { prefix: '/api/integrations/yad2' });
  await app.register(registerMarketRoutes, { prefix: '/api/market' });
  await app.register(registerProspectRoutes, { prefix: '/api' });
  // P-3 — prospect agreement PDF + lead-link endpoints. Same /api prefix
  // so the routes sit next to /api/prospects/* from registerProspectRoutes.
  await app.register(registerProspectPdfRoutes, { prefix: '/api' });
  await app.register(registerCalendarRoutes, { prefix: '/api/integrations/calendar' });
  await app.register(registerOfficeRoutes, { prefix: '/api/office' });
  await app.register(registerTagRoutes, { prefix: '/api/tags' });
  await app.register(registerReminderRoutes, { prefix: '/api/reminders' });
  await app.register(registerLeadSearchProfileRoutes, { prefix: '/api' });
  await app.register(registerSearchRoutes, { prefix: '/api/search' });
  await app.register(registerActivityRoutes, { prefix: '/api/activity' });
  await app.register(registerAdvertRoutes, { prefix: '/api' });
  await app.register(registerAiRoutes, { prefix: '/api/ai' });
  await app.register(registerNeighborhoodRoutes, { prefix: '/api/neighborhoods' });
  await app.register(registerNeighborhoodGroupRoutes, { prefix: '/api/neighborhood-groups' });
  await app.register(registerSavedSearchRoutes, { prefix: '/api/saved-searches' });
  await app.register(registerFavoriteRoutes, { prefix: '/api/favorites' });

  // Request lifecycle observability — assigns a request_id, logs
  // method/route/status/duration, and sends an api_request event to
  // PostHog with the user id when known.
  app.addHook('onRequest', async (req) => {
    (req as any).__t0 = Date.now();
    (req as any).__reqId = crypto.randomUUID();
  });
  app.addHook('onResponse', async (req, reply) => {
    const t0 = (req as any).__t0 || Date.now();
    const duration = Date.now() - t0;
    const reqId = (req as any).__reqId;
    // The auth plugin stashes the decoded JWT under a Symbol key via
    // setUser/getUser — NOT on `req.user`. Reading `req.user.id` always
    // returned undefined, so every authenticated request used to get a
    // fresh random `anon-*` distinctId in PostHog. Use getUser() so
    // logged-in traffic attributes to the real person.
    const u = getUser(req);
    // Anonymous-request fallback: clients (posthog-js) can forward their
    // stable browser distinct-id via a header so repeat anonymous traffic
    // clusters into one person instead of thousands of one-hit ghosts.
    const anonId = (req.headers['x-posthog-distinct-id'] as string | undefined)?.slice(0, 200);
    const userId = u?.id || anonId || null;
    const route = (req as any).routeOptions?.url || req.url;
    // Skip health, static uploads, and the chat WebSocket route to keep
    // event volume low. /api/chat/ws fires every time a tab reconnects
    // (including failure-retry loops) and was drowning the PostHog feed
    // — none of those events are useful for product analytics.
    if (
      req.url === '/api/health' ||
      req.url.startsWith('/uploads/') ||
      req.url === '/api/chat/ws' ||
      req.url.startsWith('/api/chat/ws?')
    ) return;
    phTrack('api_request', userId, {
      request_id: reqId,
      method: req.method,
      route,
      status_code: reply.statusCode,
      duration_ms: duration,
      authenticated: !!u,
    });
  });

  // Flush PostHog events before the process exits
  for (const sig of ['SIGTERM', 'SIGINT'] as const) {
    process.on(sig, async () => {
      try { await shutdownAnalytics(); } catch { /* noop */ }
      try { await app.close(); } catch { /* noop */ }
      process.exit(0);
    });
  }

  return app;
}

// Only auto-listen when run as the entrypoint (node dist/server.js /
// tsx src/server.ts). During tests we import { build } above and call
// app.inject() without binding a port.
const runAsMain = import.meta.url === `file://${process.argv[1]}`;
if (runAsMain) {
  build()
    .then((app) =>
      app.listen({ port: PORT, host: HOST }).then(() => {
        app.log.info(`Estia API listening on ${HOST}:${PORT}`);
      })
    )
    .catch((err) => {
      console.error('Failed to start', err);
      process.exit(1);
    });
}
