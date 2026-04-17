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
    if (u.role !== 'AGENT') {
      reply.code(403).send({ error: { message: 'Agent role required' } });
    }
  });
};

export const authPlugin = fp(plugin, { name: 'auth-plugin' });
