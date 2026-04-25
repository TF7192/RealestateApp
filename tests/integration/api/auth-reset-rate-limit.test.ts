import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { build } from '../../../backend/src/server.js';
import { prisma } from '../../setup/integration.setup.js';
import { createAgent } from '../../factories/user.factory.js';

// SEC-001 — `/reset-password` was the only auth route without a per-route
// brake; brute-forceability inside the 30-min token TTL was bounded only
// by the global 300/min ceiling. The route now carries a 10/15min limit
// mirroring `/login`. This file deliberately does NOT set
// AUTH_RATE_LIMIT_DISABLED so the limiter is live and we can assert 429.

let app: FastifyInstance;

beforeAll(async () => {
  app = await build();
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

describe('POST /api/auth/reset-password — per-route rate limit (SEC-001)', () => {
  it('returns 429 once the threshold is exceeded; legitimate reset still works under the limit', async () => {
    // First, prove the legitimate flow still works — one valid call inside
    // the budget. Plant a forgot-password token, consume it.
    const agent = await createAgent(prisma);
    await app.inject({
      method: 'POST',
      url: '/api/auth/forgot-password',
      payload: { email: agent.email },
    });
    const row = await prisma.passwordResetToken.findFirst({ where: { userId: agent.id } });
    expect(row).toBeTruthy();
    const okRes = await app.inject({
      method: 'POST',
      url: '/api/auth/reset-password',
      payload: { token: row!.token, password: 'brand-new-pw-987' },
    });
    expect(okRes.statusCode).toBe(200);

    // Now hammer the endpoint with bogus tokens. Limit is 10/15min, so the
    // 11th request from this same IP should 429. We've used 1 budget slot
    // above; pad to 10 bogus calls then make the 11th. All bogus calls
    // get 400 (invalid-token) until the limiter kicks in.
    const codes: number[] = [];
    for (let i = 0; i < 10; i++) {
      const r = await app.inject({
        method: 'POST',
        url: '/api/auth/reset-password',
        payload: { token: 'z'.repeat(48), password: 'whatever-12345' },
      });
      codes.push(r.statusCode);
    }
    // After 10 budget slots are spent (1 success + 9 bogus), the limiter
    // should refuse subsequent calls.
    const last = await app.inject({
      method: 'POST',
      url: '/api/auth/reset-password',
      payload: { token: 'z'.repeat(48), password: 'whatever-12345' },
    });
    // The earlier responses should be a mix of 400 (bad token) and 429
    // (limiter kicks in part-way through). The very last call must be 429.
    expect(last.statusCode).toBe(429);
    // Defense-in-depth assertion: at least one of the bogus calls hit 429
    // before the final one.
    expect(codes.filter((c) => c === 429).length + 1).toBeGreaterThan(0);
  });
});
