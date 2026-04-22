import type { FastifyPluginAsync } from 'fastify';
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
//   Fires Playwright, pulls from nadlan.gov.il, upserts the row, returns
//   the fresh payload. This is an on-demand action (the UI has a
//   "רענן נתוני שוק" button) so the user expects a 5–20s wait.
//
// TTL semantics:
//   - GET returns whatever's in the DB regardless of age, plus a
//     `fetchedAt` so the frontend can label it "לפני 3 ימים" etc.
//   - If cached row is <24h old, POST short-circuits and returns the
//     cached row without re-hitting Playwright. Agents get instant
//     response for repeat clicks; honest to nadlan.gov.il.

const MAX_AGE_MS = 24 * 60 * 60 * 1000;

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

export const registerMarketRoutes: FastifyPluginAsync = async (app) => {
  // GET cached market context for one of agent's properties.
  app.get('/property/:id', { onRequest: [app.requireAgent] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const kind = parseKind((req.query as any)?.kind);
    const user = requireUser(req);

    const prop = await prisma.property.findUnique({
      where: { id },
      select: { id: true, agentId: true, street: true, city: true },
    });
    if (!prop || prop.agentId !== user.id) {
      return reply.code(404).send({ error: { message: 'Not found' } });
    }
    if (!prop.street || !prop.city) {
      return reply.code(400).send({ error: { message: 'Property missing street or city' } });
    }

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

  // POST on-demand refresh — runs Playwright against nadlan.gov.il.
  app.post('/property/:id/refresh', { onRequest: [app.requireAgent] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const kind = parseKind((req.query as any)?.kind);
    const user = requireUser(req);

    const prop = await prisma.property.findUnique({
      where: { id },
      select: { id: true, agentId: true, street: true, city: true },
    });
    if (!prop || prop.agentId !== user.id) {
      return reply.code(404).send({ error: { message: 'Not found' } });
    }
    if (!prop.street || !prop.city) {
      return reply.code(400).send({ error: { message: 'Property missing street or city' } });
    }

    const cityKey = normKey(prop.city);
    const streetKey = normKey(prop.street);

    // Short-circuit if fresh.
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

    // Live fetch. Playwright takes 5–20s; the client shows a spinner.
    let result;
    try {
      result = await fetchNadlanMarket({
        city: prop.city,
        street: prop.street,
        kind,
        log: (m) => req.log.info({ marketCrawl: true }, m),
      });
    } catch (e) {
      req.log.error({ err: e }, 'nadlan crawl threw');
      return reply.code(502).send({ error: { message: 'שליפת נתוני השוק נכשלה — נסה/י שוב בעוד מספר דקות' } });
    }

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
  });
};
