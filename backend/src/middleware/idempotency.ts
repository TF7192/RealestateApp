// F-IDP — server-side idempotency. Pairs with frontend `withIdempotency`
// in lib/api.js. Each create endpoint that the frontend wraps sends an
// `Idempotency-Key` header (a UUID generated per submit click). If the
// same (agentId, key) pair is seen again within the dedup window, we
// return the cached response instead of creating a second row.
//
// This is intentionally per-process and short-lived (60s) — the goal
// is to absorb double-submit / network-retry duplicates, not to be a
// distributed dedup ledger. A duplicate that crosses processes (e.g.
// rolling deploy mid-submit) will still create a duplicate row; that's
// a known and accepted limit.

import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { createLruTtlCache } from '../lib/lruTtlCache.js';
import { getUser } from './auth.js';

interface CachedResponse {
  status: number;
  body: any;
  contentType: string;
}

const cache = createLruTtlCache<CachedResponse>({ max: 1000, ttlMs: 60_000 });

// Limited to the create endpoints that the frontend marks. We don't
// blanket every POST so an opt-out is just "don't send the header".
const IDEMPOTENT_PATHS = new Set([
  '/api/leads',
  '/api/properties',
  '/api/deals',
  '/api/owners',
]);

function shouldCheck(req: FastifyRequest): boolean {
  if (req.method !== 'POST') return false;
  // Strip query string for the match (fastify's url includes it).
  const path = (req.url || '').split('?')[0];
  return IDEMPOTENT_PATHS.has(path);
}

function readKey(req: FastifyRequest): string | null {
  const h = req.headers['idempotency-key'];
  if (typeof h !== 'string') return null;
  const trimmed = h.trim();
  if (!trimmed || trimmed.length > 200) return null;
  return trimmed;
}

export const idempotencyPlugin: FastifyPluginAsync = async (app) => {
  // preHandler runs after auth so we know the agentId. If the cache
  // hits, short-circuit with the cached body.
  app.addHook('preHandler', async (req: FastifyRequest, reply: FastifyReply) => {
    if (!shouldCheck(req)) return;
    const key = readKey(req);
    if (!key) return;
    const u = getUser(req);
    if (!u?.id) return; // unauthenticated — let the route 401 normally
    const cacheKey = `${u.id}:${key}`;
    const hit = cache.get(cacheKey);
    if (hit) {
      reply.code(hit.status);
      if (hit.contentType) reply.header('Content-Type', hit.contentType);
      reply.header('X-Idempotent-Replay', '1');
      return reply.send(hit.body);
    }
    // Stash the cache key on the request so onSend can store the response.
    (req as any).__idempotencyKey = cacheKey;
  });

  // Capture the response body and cache it before it goes out the wire.
  // Only cache 2xx — caching 4xx/5xx would lock the user into a failure.
  app.addHook('onSend', async (req: FastifyRequest, reply: FastifyReply, payload: any) => {
    const cacheKey = (req as any).__idempotencyKey as string | undefined;
    if (!cacheKey) return payload;
    if (reply.statusCode < 200 || reply.statusCode >= 300) return payload;
    let body: any = payload;
    if (typeof payload === 'string') {
      try { body = JSON.parse(payload); } catch { /* keep string */ }
    }
    cache.set(cacheKey, {
      status: reply.statusCode,
      body,
      contentType: (reply.getHeader('content-type') as string) || 'application/json',
    });
    return payload;
  });
};
