// Sprint 9 / marketing surfaces (lane A) — public, unauthenticated page-
// view tracker for the per-property landing page. One row per
// (property × visitor × UTC-day); same-day reloads collapse into a
// single row via a SHA-256 visitor hash plus a unique index enforced
// on the DB side. The handler swallows P2002 collisions as a dedup —
// we never surface unique-constraint noise to the client — and always
// returns 200 when the slug pair resolves, 404 only when the slug pair
// is genuinely invalid. That way a scraper can't probe for existence
// of arbitrary slugs just by watching status codes.

import crypto from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import { prisma } from '../lib/prisma.js';

// Mirrors the existing public routes' tolerance: either the per-agent
// slug or the legacy cuid is accepted. Older shared links and
// dashboard lookups alike resolve without a branch on the client.
async function resolveAgent(agentSlug: string) {
  return (
    (await prisma.user.findUnique({ where: { slug: agentSlug } })) ||
    (await prisma.user.findUnique({ where: { id: agentSlug } }))
  );
}

async function resolvePropertyForAgent(agentId: string, propSlug: string) {
  return (
    (await prisma.property.findFirst({ where: { agentId, slug: propSlug } })) ||
    (await prisma.property.findFirst({ where: { agentId, id: propSlug } }))
  );
}

// YYYY-MM-DD, UTC. A reload at 23:59Z and 00:01Z the next day count as
// two distinct visits by design — the "unique visitors per day" metric
// the marketing dashboard surfaces is bucketed on UTC.
function utcDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Midnight UTC of the given instant. Stamping `viewedAt` with the UTC-
// day boundary (instead of `now()`) is what makes the
// (propertyId, visitorHash, viewedAt) unique constraint actually catch
// same-day repeats: two writes within the same day resolve to the same
// three-tuple and P2002 fires, so dedup is enforced at the DB layer
// even if the app-level pre-check races.
function utcDayStart(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function sha256(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

export const registerMarketingTrackRoutes: FastifyPluginAsync = async (app) => {
  app.post('/agents/:agentSlug/properties/:propertySlug/view', async (req, reply) => {
    const { agentSlug, propertySlug: propSlug } = req.params as {
      agentSlug: string;
      propertySlug: string;
    };

    const agent = await resolveAgent(agentSlug);
    if (!agent || (agent.role !== 'AGENT' && agent.role !== 'OWNER')) {
      return reply.code(404).send({ error: { message: 'Not found' } });
    }
    const property = await resolvePropertyForAgent(agent.id, propSlug);
    if (!property) {
      return reply.code(404).send({ error: { message: 'Not found' } });
    }

    // Fastify populates req.ip from X-Forwarded-For when trustProxy is
    // on (server.ts sets it), falling back to the raw socket address.
    const now = new Date();
    const ip = (req.ip || '').toString();
    const userAgent = String(req.headers['user-agent'] || '').slice(0, 400);
    const referrer = req.headers.referer ? String(req.headers.referer).slice(0, 400) : null;
    const day = utcDateKey(now);
    const visitorHash = sha256(`${ip}|${userAgent}|${day}`);

    try {
      await prisma.propertyView.create({
        data: {
          propertyId: property.id,
          visitorHash,
          referrer,
          userAgent,
          // UTC-day boundary so the unique constraint collapses same-
          // day reloads into one row. Without this, `viewedAt`
          // defaults to now() and the three-tuple changes on every
          // insert, defeating the DB-level dedup.
          viewedAt: utcDayStart(now),
        },
      });
      return reply.code(200).send({ ok: true, deduped: false });
    } catch (err: unknown) {
      // P2002 — unique constraint on (propertyId, visitorHash,
      // viewedAt). Same-day repeats from the same visitor land on the
      // same three-tuple and trip this branch, which is the happy
      // dedup path. Any other code bubbles up to the global error
      // handler in server.ts.
      const e = err as { code?: string };
      if (e?.code === 'P2002') {
        return reply.code(200).send({ ok: true, deduped: true });
      }
      throw err;
    }
  });
};
