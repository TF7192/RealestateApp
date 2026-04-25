import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { build } from '../../backend/src/server.js';
import { prisma } from '../setup/integration.setup.js';
import { createAgent } from '../factories/user.factory.js';
import { loginAs } from '../helpers/auth.js';

// SEC-014 — soft-delete enforcement on every authed request.
//
// Scenario: a user calls POST /api/auth/delete-account. The server
// flips deletedAt and Set-Cookie clears their cookie. BUT the JWT in
// the cookie has 30d expiry — if it's been captured (e.g. by a
// running iOS app, a browser tab the user didn't refresh, or an
// attacker who already exfiltrated it), it should stop working
// immediately, not 30 days from now.
//
// The auth middleware previously trusted the JWT signature alone.
// With this fix, every authed request rechecks `User.deletedAt`.

let app: FastifyInstance;
beforeAll(async () => {
  app = await build();
  await app.ready();
});
afterAll(async () => {
  await app.close();
});

describe('SEC-014 — deleted users cannot use a previously-issued JWT', () => {
  it('captured cookie bounces a 401 on /api/properties after delete-account', async () => {
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);

    // Sanity: cookie works pre-delete.
    const okBefore = await app.inject({
      method: 'GET',
      url: '/api/properties',
      headers: { cookie },
    });
    expect(okBefore.statusCode).toBe(200);

    // Soft-delete the agent.
    const del = await app.inject({
      method: 'POST',
      url: '/api/auth/delete-account',
      headers: { cookie },
    });
    expect(del.statusCode).toBe(200);

    // The captured cookie's JWT is still cryptographically valid for
    // 30 days — but the middleware must now reject it.
    const after = await app.inject({
      method: 'GET',
      url: '/api/properties',
      headers: { cookie },
    });
    expect(after.statusCode).toBe(401);
  });

  it('captured cookie bounces a 401 on /api/me after delete-account (pin existing behavior)', async () => {
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);

    await app.inject({
      method: 'POST',
      url: '/api/auth/delete-account',
      headers: { cookie },
    });

    const me = await app.inject({
      method: 'GET',
      url: '/api/me',
      headers: { cookie },
    });
    expect(me.statusCode).toBe(401);
  });

  it('a fresh, non-deleted agent is unaffected (regression guard)', async () => {
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);

    const me = await app.inject({
      method: 'GET',
      url: '/api/me',
      headers: { cookie },
    });
    expect(me.statusCode).toBe(200);
  });
});
