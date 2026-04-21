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
import { registerProspectRoutes } from './routes/prospects.js';
import { registerCalendarRoutes } from './routes/calendar.js';
import fastifyWebsocket from '@fastify/websocket';
import { registerAgentRoutes } from './routes/agents.js';
import { registerTransferRoutes } from './routes/transfers.js';
import { registerTemplateRoutes } from './routes/templates.js';
import { registerGeoRoutes } from './routes/geo.js';
import { registerPublicRoutes } from './routes/public.js';
import { registerOwnerRoutes } from './routes/owners.js';
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

async function build() {
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
        'https://estia.tripzio.xyz',
      ].filter(Boolean);
      if (!origin || allowed.includes(origin)) return cb(null, true);
      cb(null, false);
    },
    credentials: true,
  });
  await app.register(cookie);
  await app.register(jwt, {
    secret: process.env.JWT_SECRET || 'dev-only-change-me',
    cookie: { cookieName: 'estia_token', signed: false },
  });
  await app.register(rateLimit, {
    max: 300,
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
        if (r.kind === 'redirect') return reply.redirect(302, r.url);
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

  app.get('/api/health', async () => ({
    ok: true,
    service: 'estia-backend',
    time: new Date().toISOString(),
  }));

  await app.register(registerAuthRoutes, { prefix: '/api/auth' });
  await app.register(registerGoogleOAuthRoutes, { prefix: '/api/auth' });
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
  await app.register(registerChatRoutes, { prefix: '/api/chat' });
  await app.register(registerAdminRoutes, { prefix: '/api/admin' });
  await app.register(registerYad2Routes,  { prefix: '/api/integrations/yad2' });
  await app.register(registerProspectRoutes, { prefix: '/api' });
  await app.register(registerCalendarRoutes, { prefix: '/api/integrations/calendar' });

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

  app.setErrorHandler((err, req, reply) => {
    req.log.error({ err }, 'request failed');
    const status = (err as any).statusCode || 500;
    // Unhandled backend exceptions → PostHog
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
        message: status >= 500 ? 'Internal server error' : err.message,
        code: (err as any).code,
      },
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
