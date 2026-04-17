import '@fastify/jwt';
import type { UserRole } from '@prisma/client';

// @fastify/jwt exposes FastifyJWT inside a namespace. The plugin's own docs
// claim module augmentation works; the namespace variant is the one the
// compiler actually honours for this codebase.
declare module '@fastify/jwt' {
  namespace fastifyJwt {
    interface FastifyJWT {
      payload: { sub: string; role: UserRole; email: string };
      user: { id: string; role: UserRole; email: string };
    }
  }
}
