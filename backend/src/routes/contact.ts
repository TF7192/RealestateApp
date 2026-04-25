// Sprint 5.1 — public contact-form endpoint.
//
// POST /api/contact { subject, body, fromName?, fromEmail? }
//   200: { ok: true }
//   400: invalid payload (empty subject/body, too long, etc.)
//   429: in-memory rate limit — 5 requests per rolling hour per IP
//
// The endpoint is **public** (no auth required) because the Contact
// page is reachable from the unauthenticated premium gate dialog and
// from the landing page footer. When the caller happens to have a
// session cookie we auto-append their auth display-name + email to
// the body so support can attribute the message even if the form
// fields were blank.
//
// Rate limit lives in-process (simple Map keyed by IP) rather than
// in @fastify/rate-limit because we want precise 5/hour semantics
// per IP for this one route — the global limiter is tuned around
// 300/min and won't cut hard enough for abuse of a public mailer.

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { sendContactEmail } from '../lib/email.js';
import { getUser } from '../middleware/auth.js';
import { prisma } from '../lib/prisma.js';

const contactBody = z.object({
  subject: z.string().min(1).max(200),
  body:    z.string().min(1).max(5_000),
  fromName:  z.string().max(120).optional().nullable(),
  fromEmail: z.string().email().max(200).optional().nullable(),
});

// Per-IP sliding window. Array of timestamps → prune on each lookup.
// SEC-033 — this Map is per-process. With multiple Fastify replicas
// behind a load balancer (we currently run a single instance, but the
// docker-compose is set up to fan out), an attacker can hit each
// replica's window separately — effectively multiplying their quota
// by replica count. Acceptable for now; a Redis-backed limiter is
// tracked under SEC-018.
const WINDOW_MS = 60 * 60 * 1_000; // 1 hour
const MAX_PER_WINDOW = 5;
const hits: Map<string, number[]> = new Map();

function rateLimitHit(ip: string): boolean {
  const now = Date.now();
  const cutoff = now - WINDOW_MS;
  const arr = (hits.get(ip) ?? []).filter((t) => t > cutoff);
  if (arr.length >= MAX_PER_WINDOW) {
    hits.set(ip, arr);
    return false; // rejected
  }
  arr.push(now);
  hits.set(ip, arr);
  return true; // accepted
}

// Exported for tests — clears the in-memory window so a fresh test
// doesn't carry state over from the previous describe block.
export function _resetContactRateLimit() {
  hits.clear();
}

export const registerContactRoutes: FastifyPluginAsync = async (app) => {
  app.post('/', async (req, reply) => {
    const parsed = contactBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: {
          message: 'שדה חסר או לא תקין',
          code: 'invalid_request',
          issues: parsed.error.issues.map((i) => ({ path: i.path, message: i.message })),
        },
      });
    }

    const ip = (req.ip || 'unknown').toString();
    if (!rateLimitHit(ip)) {
      return reply.code(429).send({
        error: {
          message: 'יותר מדי בקשות — נסו שוב בעוד שעה',
          code: 'rate_limited',
        },
      });
    }

    // If the caller is authenticated, load their display name + email
    // so support can attribute the message. requireUser isn't used
    // because this is an intentionally public endpoint — unauthed
    // traffic is expected.
    let authDisplayName: string | null = null;
    let authEmail: string | null = null;
    const u = getUser(req);
    if (u) {
      try {
        const row = await prisma.user.findUnique({
          where: { id: u.id },
          select: { displayName: true, email: true },
        });
        authDisplayName = row?.displayName ?? null;
        authEmail       = row?.email ?? null;
      } catch {
        // Swallow — a failed rehydration must not block the message
        // from going out. Worst case we send without attribution.
      }
    }

    try {
      await sendContactEmail({
        subject:  parsed.data.subject,
        body:     parsed.data.body,
        fromName:  parsed.data.fromName ?? null,
        fromEmail: parsed.data.fromEmail ?? null,
        authUserDisplayName: authDisplayName,
        authUserEmail:       authEmail,
      });
    } catch (e) {
      req.log.error({ err: e }, 'contact email send failed');
      return reply.code(502).send({
        error: {
          message: 'שליחת ההודעה נכשלה — נסו שוב',
          code: 'email_upstream_error',
        },
      });
    }
    return { ok: true };
  });
};
