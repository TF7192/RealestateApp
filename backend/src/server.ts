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
import { registerPropertyRoutes } from './routes/properties.js';
import { registerLeadRoutes } from './routes/leads.js';
import { registerDealRoutes } from './routes/deals.js';
import { registerAgreementRoutes } from './routes/agreements.js';
import { registerLookupRoutes } from './routes/lookups.js';
import { registerReportRoutes } from './routes/reports.js';
import { registerMeRoutes } from './routes/me.js';
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
  await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024 } });
  await app.register(fastifyStatic, {
    root: UPLOADS_DIR,
    prefix: '/uploads/',
    decorateReply: false,
  });

  await app.register(authPlugin);

  app.get('/api/health', async () => ({
    ok: true,
    service: 'estia-backend',
    time: new Date().toISOString(),
  }));

  await app.register(registerAuthRoutes, { prefix: '/api/auth' });
  await app.register(registerMeRoutes, { prefix: '/api/me' });
  await app.register(registerPropertyRoutes, { prefix: '/api/properties' });
  await app.register(registerLeadRoutes, { prefix: '/api/leads' });
  await app.register(registerDealRoutes, { prefix: '/api/deals' });
  await app.register(registerAgreementRoutes, { prefix: '/api/agreements' });
  await app.register(registerLookupRoutes, { prefix: '/api/lookups' });
  await app.register(registerReportRoutes, { prefix: '/api/reports' });

  app.setErrorHandler((err, req, reply) => {
    req.log.error({ err }, 'request failed');
    const status = err.statusCode || 500;
    reply.code(status).send({
      error: {
        message: status >= 500 ? 'Internal server error' : err.message,
        code: err.code,
      },
    });
  });

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
