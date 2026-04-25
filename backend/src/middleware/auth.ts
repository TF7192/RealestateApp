import fp from 'fastify-plugin';
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import type { UserRole } from '@prisma/client';

export type EstiaUser = { id: string; role: UserRole; email: string };

// Internal symbol — we stash the authenticated user here to avoid colliding
// with @fastify/jwt's own `req.user` decorator (which has a wider type).
const USER_KEY = Symbol.for('estia.user');

export function setUser(req: FastifyRequest, user: EstiaUser) {
  (req as unknown as Record<symbol, EstiaUser>)[USER_KEY] = user;
}

export function getUser(req: FastifyRequest): EstiaUser | undefined {
  return (req as unknown as Record<symbol, EstiaUser | undefined>)[USER_KEY];
}

export function requireUser(req: FastifyRequest): EstiaUser {
  const u = getUser(req);
  if (!u) throw new Error('expected authenticated user');
  return u;
}

declare module 'fastify' {
  interface FastifyInstance {
    requireAuth: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireAgent: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    // Sprint 1 / MLS parity — Task A1. `requireOwner` gates routes that
    // only an office owner can use (e.g. listing every agent in the
    // office). AGENT-role users are rejected with 403.
    requireOwner: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    // SEC-010 — platform-wide admin gate. Reads `role === 'ADMIN'` off
    // the JWT (set on login from the User row). Replaces the legacy
    // ADMIN_EMAILS allowlist; OWNER and AGENT roles are not admins.
    requireAdmin: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

const plugin: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', async (req) => {
    try {
      const token =
        req.cookies?.estia_token ||
        (req.headers.authorization?.startsWith('Bearer ')
          ? req.headers.authorization.slice(7)
          : undefined);
      if (!token) return;
      const decoded = app.jwt.verify<{ sub: string; role: UserRole; email: string }>(token);
      // SEC-014 — soft-deleted accounts must lose access immediately,
      // not when their 30-day JWT expires. The cookie is cleared on
      // delete-account, but the in-flight token in a running iOS app
      // / open browser tab / leaked exfil still authenticates without
      // this re-check. One row read per authed request is the simplest
      // correct fix; do NOT cache this naively in a future perf-pass —
      // a stale cache here means a deleted user keeps their access.
      const { prisma } = await import('../lib/prisma.js');
      const stillActive = await prisma.user.findFirst({
        where: { id: decoded.sub, deletedAt: null },
        select: { id: true },
      });
      if (!stillActive) return; // leaves req unauthenticated; downstream requireX returns 401
      setUser(req, { id: decoded.sub, role: decoded.role, email: decoded.email });
    } catch {
      // ignore — unauthenticated requests hit requireAuth below
    }
  });

  app.decorate('requireAuth', async (req: FastifyRequest, reply: FastifyReply) => {
    if (!getUser(req)) {
      reply.code(401).send({ error: { message: 'Unauthorized' } });
    }
  });

  app.decorate('requireAgent', async (req: FastifyRequest, reply: FastifyReply) => {
    const u = getUser(req);
    if (!u) {
      return reply.code(401).send({ error: { message: 'Unauthorized' } });
    }
    // OWNER is a superset of AGENT for the purpose of accessing the
    // agent-facing CRM.
    if (u.role !== 'AGENT' && u.role !== 'OWNER') {
      reply.code(403).send({ error: { message: 'Agent role required' } });
    }
  });

  app.decorate('requireOwner', async (req: FastifyRequest, reply: FastifyReply) => {
    const u = getUser(req);
    if (!u) {
      return reply.code(401).send({ error: { message: 'Unauthorized' } });
    }
    if (u.role !== 'OWNER') {
      reply.code(403).send({ error: { message: 'Office owner role required' } });
    }
  });

  // SEC-010 — admin gate. The JWT carries `role` from the User row at
  // login time, so a re-login is required for a freshly-promoted user
  // to gain access. The previous email-allowlist gate relied on the
  // (mutable) `email` claim, which produced surprises when an agent
  // changed their primary email.
  app.decorate('requireAdmin', async (req: FastifyRequest, reply: FastifyReply) => {
    const u = getUser(req);
    if (!u) {
      return reply.code(401).send({ error: { message: 'Unauthorized' } });
    }
    if (u.role !== 'ADMIN') {
      reply.code(403).send({ error: { message: 'Admin only' } });
    }
  });
};

export const authPlugin = fp(plugin, { name: 'auth-plugin' });
