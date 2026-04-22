import type { FastifyPluginAsync } from 'fastify';
import { randomUUID } from 'node:crypto';
import { prisma } from '../lib/prisma.js';
import { requireUser } from '../middleware/auth.js';
import { fetchNadlanMarket, type NadlanKind } from '../lib/nadlan-crawler.js';

// Market-context routes.
//
// GET  /api/market/property/:id?kind=buy|rent
//   Returns the most-recent cached MarketContext for the property's
//   (cityKey, streetKey, kind) triple, or 204 no-content if we've never
//   fetched. Never triggers a live fetch — that's explicit via POST.
//
// POST /api/market/property/:id/refresh?kind=buy|rent
//   Synchronous Playwright crawl. Kept for back-compat / tests; prod
//   traffic uses the async start+poll pair below so Cloudflare's 100s
//   edge timeout can't kill the long crawl.
//
// POST /api/market/property/:id/refresh/start?kind=buy|rent
//   Returns { jobId } immediately (well under CF's 100s cap); the
//   crawl runs in the background. Poll /api/market/jobs/:id.
//
// GET /api/market/jobs/:id
//   Returns { status: 'running'|'done'|'error', result?, error? }.
//
// Rate limit:
//   - Coalescing: while a scan for (agentId, propertyId, kind) is in
//     flight, repeat clicks return the same jobId rather than spawning
//     duplicate Playwright instances. This solves the "user clicked
//     three times" UX problem without any external state.
//   - Sliding window: 10 distinct scans per rolling hour per agent.
//     Nadlan.gov.il itself is polite to scrape but Playwright is
//     expensive; the cap protects the container.

const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const QUOTA_LIMIT = 10;
const QUOTA_WINDOW_MS = 60 * 60 * 1000;

// Key normalization — agents enter addresses with inconsistent casing,
// niqqud, punctuation, trailing whitespace. Fold everything to a
// stable key so "רחוב הרצל 42 " and "הרצל 42" share a cache row.
function normKey(s: string): string {
  return (s || '')
    .normalize('NFKD')
    .replace(/[֑-ׇ]/g, '')         // Hebrew niqqud marks
    .replace(/רחוב\s+|רח'\s+|רח׳\s+/g, '')  // drop "רחוב" prefix
    .replace(/[.,'״"׳]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function parseKind(v: unknown): NadlanKind {
  return v === 'rent' ? 'rent' : 'buy';
}

// ── Async job infrastructure ──────────────────────────────────────
// Per-process in-memory — a restart loses in-flight crawls, which is
// fine (the client will time out and the user can retry). Jobs are GC'd
// 30min after completion so the map stays bounded.
interface MarketJob {
  id: string;
  agentId: string;
  propertyId: string;
  kind: NadlanKind;
  status: 'running' | 'done' | 'error';
  startedAt: number;
  finishedAt?: number;
  result?: unknown;
  error?: { message: string; status?: number };
}
const jobs = new Map<string, MarketJob>();
const JOB_TTL_MS = 30 * 60 * 1000;

const jobGc = setInterval(() => {
  const cutoff = Date.now() - JOB_TTL_MS;
  for (const [id, j] of jobs) {
    const stamp = j.finishedAt ?? j.startedAt;
    if (stamp < cutoff) jobs.delete(id);
  }
}, 5 * 60 * 1000);
jobGc.unref?.();

// Coalescing: while a scan is running for the same agent+property+kind,
// further starts return the existing jobId. Solves the 3-click case.
function findRunningJob(agentId: string, propertyId: string, kind: NadlanKind): MarketJob | null {
  for (const j of jobs.values()) {
    if (j.status === 'running' && j.agentId === agentId
        && j.propertyId === propertyId && j.kind === kind) {
      return j;
    }
  }
  return null;
}

// Sliding-window rate-limit per agent. In-memory; a restart resets the
// window, which is fine (the next Playwright spawn still has overhead
// but won't overwhelm the container since each crawl is single-flight
// per property).
const attempts = new Map<string, number[]>(); // agentId → timestamps (ms)
function checkAndRecordQuota(agentId: string): { ok: true } | { ok: false; retryAfterMs: number } {
  const now = Date.now();
  const cutoff = now - QUOTA_WINDOW_MS;
  const list = (attempts.get(agentId) || []).filter((t) => t > cutoff);
  if (list.length >= QUOTA_LIMIT) {
    return { ok: false, retryAfterMs: Math.max(0, list[0] + QUOTA_WINDOW_MS - now) };
  }
  list.push(now);
  attempts.set(agentId, list);
  return { ok: true };
}

type LoadPropertyResult =
  | { prop: { id: string; agentId: string; street: string; city: string } }
  | { error: { code: number; message: string } };

async function loadProperty(agentId: string, propertyId: string): Promise<LoadPropertyResult> {
  const prop = await prisma.property.findUnique({
    where: { id: propertyId },
    select: { id: true, agentId: true, street: true, city: true },
  });
  if (!prop || prop.agentId !== agentId) {
    return { error: { code: 404, message: 'Not found' } };
  }
  if (!prop.street || !prop.city) {
    return { error: { code: 400, message: 'Property missing street or city' } };
  }
  return { prop: { id: prop.id, agentId: prop.agentId, street: prop.street, city: prop.city } };
}

async function runRefresh(
  prop: { street: string; city: string },
  kind: NadlanKind,
  log: any,
) {
  const cityKey = normKey(prop.city);
  const streetKey = normKey(prop.street);

  // Short-circuit if fresh — same 24h TTL as the sync path.
  const existing = await prisma.marketContext.findUnique({
    where: { cityKey_streetKey_kind: { cityKey, streetKey, kind } },
  });
  if (existing && Date.now() - existing.fetchedAt.getTime() < MAX_AGE_MS) {
    return {
      kind: existing.kind,
      fetchedAt: existing.fetchedAt,
      dealCount: existing.dealCount,
      stale: false,
      cached: true,
      error: existing.error,
      payload: existing.payload,
    };
  }

  const result = await fetchNadlanMarket({
    city: prop.city,
    street: prop.street,
    kind,
    log: (m) => log.info({ marketCrawl: true }, m),
  });

  const row = await prisma.marketContext.upsert({
    where: { cityKey_streetKey_kind: { cityKey, streetKey, kind } },
    create: {
      cityKey,
      streetKey,
      kind,
      dealCount: result.deals.length,
      payload: result as unknown as object,
      error: result.error,
    },
    update: {
      fetchedAt: new Date(),
      dealCount: result.deals.length,
      payload: result as unknown as object,
      error: result.error,
    },
  });

  return {
    kind: row.kind,
    fetchedAt: row.fetchedAt,
    dealCount: row.dealCount,
    stale: false,
    cached: false,
    error: row.error,
    payload: row.payload,
  };
}

export const registerMarketRoutes: FastifyPluginAsync = async (app) => {
  // GET cached market context for one of agent's properties.
  app.get('/property/:id', { onRequest: [app.requireAgent] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const kind = parseKind((req.query as any)?.kind);
    const user = requireUser(req);

    const loaded = await loadProperty(user.id, id);
    if (!('prop' in loaded)) return reply.code(loaded.error.code).send({ error: { message: loaded.error.message } });
    const { prop } = loaded;

    const row = await prisma.marketContext.findUnique({
      where: {
        cityKey_streetKey_kind: {
          cityKey: normKey(prop.city),
          streetKey: normKey(prop.street),
          kind,
        },
      },
    });
    if (!row) return reply.code(204).send();
    return {
      kind: row.kind,
      fetchedAt: row.fetchedAt,
      dealCount: row.dealCount,
      stale: Date.now() - row.fetchedAt.getTime() > MAX_AGE_MS,
      error: row.error,
      payload: row.payload,
    };
  });

  // POST on-demand refresh — synchronous. Kept for back-compat and
  // integration tests; the frontend uses the async start+poll pair.
  app.post('/property/:id/refresh', { onRequest: [app.requireAgent] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const kind = parseKind((req.query as any)?.kind);
    const user = requireUser(req);

    const loaded = await loadProperty(user.id, id);
    if (!('prop' in loaded)) return reply.code(loaded.error.code).send({ error: { message: loaded.error.message } });
    const { prop } = loaded;

    try {
      return await runRefresh({ street: prop.street, city: prop.city }, kind, req.log);
    } catch (e) {
      req.log.error({ err: e }, 'nadlan crawl threw');
      return reply.code(502).send({ error: { message: 'שליפת נתוני השוק נכשלה — נסה/י שוב בעוד מספר דקות' } });
    }
  });

  // POST async refresh — returns { jobId } in <100ms. Client polls
  // /api/market/jobs/:id until status resolves.
  app.post('/property/:id/refresh/start', { onRequest: [app.requireAgent] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const kind = parseKind((req.query as any)?.kind);
    const user = requireUser(req);

    const loaded = await loadProperty(user.id, id);
    if (!('prop' in loaded)) return reply.code(loaded.error.code).send({ error: { message: loaded.error.message } });
    const { prop } = loaded;

    // Coalesce duplicate clicks — return the in-flight jobId rather
    // than spawning another Playwright instance.
    const existing = findRunningJob(user.id, id, kind);
    if (existing) {
      return reply.code(202).send({ jobId: existing.id, coalesced: true });
    }

    // Sliding-window quota: 10 scans per agent per rolling hour.
    const q = checkAndRecordQuota(user.id);
    if (!q.ok) {
      const minutesLeft = Math.ceil(q.retryAfterMs / 60_000);
      return reply.code(429).send({
        error: {
          message: `הגעת למכסה השעתית (${QUOTA_LIMIT} משיכות). מתחדש בעוד ${minutesLeft} דק׳.`,
          code: 'quota_exceeded',
        },
      });
    }

    const job: MarketJob = {
      id: randomUUID(),
      agentId: user.id,
      propertyId: id,
      kind,
      status: 'running',
      startedAt: Date.now(),
    };
    jobs.set(job.id, job);
    const log = req.log;
    // Fire-and-forget — client polls /jobs/:id for the outcome.
    Promise.resolve().then(async () => {
      try {
        job.result = await runRefresh({ street: prop.street, city: prop.city }, kind, log);
        job.status = 'done';
      } catch (err: any) {
        log.error({ err, propertyId: id, kind }, 'nadlan crawl threw (async)');
        job.error = { message: 'שליפת נתוני השוק נכשלה — נסה/י שוב בעוד מספר דקות', status: 502 };
        job.status = 'error';
      } finally {
        job.finishedAt = Date.now();
      }
    });
    return reply.code(202).send({ jobId: job.id });
  });

  // GET job status — polled by the client.
  app.get('/jobs/:id', { onRequest: [app.requireAgent] }, async (req, reply) => {
    const user = requireUser(req);
    const { id } = req.params as { id: string };
    const job = jobs.get(id);
    if (!job) return reply.code(404).send({ error: { message: 'Job not found or expired' } });
    if (job.agentId !== user.id) return reply.code(403).send({ error: { message: 'Forbidden' } });
    const body: any = {
      status: job.status,
      propertyId: job.propertyId,
      kind: job.kind,
      startedAt: job.startedAt,
    };
    if (job.finishedAt) body.finishedAt = job.finishedAt;
    if (job.status === 'done')  body.result = job.result;
    if (job.status === 'error') body.error  = job.error;
    return body;
  });
};
