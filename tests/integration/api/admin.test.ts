import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { build } from '../../../backend/src/server.js';
import { prisma } from '../../setup/integration.setup.js';
import { createAgent, createCustomer } from '../../factories/user.factory.js';
import { loginAs } from '../../helpers/auth.js';

let app: FastifyInstance;
beforeAll(async () => { app = await build(); await app.ready(); });
afterAll(async () => { await app.close(); });

/**
 * Admin is gated by the hard-coded ADMIN_EMAILS list in the backend
 * (see /backend/src/routes/admin.ts). The default list contains
 * 'talfuks1234@gmail.com'; tests create a user with that email to
 * exercise the admin path, and a fresh random agent to verify the
 * deny path.
 */
const ADMIN_EMAIL = 'talfuks1234@gmail.com';

describe('GET /api/admin/users', () => {
  it('Az — 403 for a non-admin agent', async () => {
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'GET', url: '/api/admin/users', headers: { cookie },
    });
    expect([401, 403]).toContain(res.statusCode);
  });

  it('A — 401 without cookie', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/admin/users' });
    expect(res.statusCode).toBe(401);
  });

  it('Az — 403 for a CUSTOMER role even with a valid session', async () => {
    const customer = await createCustomer(prisma);
    const cookie = await loginAs(app, customer.email, customer._plainPassword);
    const res = await app.inject({
      method: 'GET', url: '/api/admin/users', headers: { cookie },
    });
    expect([401, 403]).toContain(res.statusCode);
  });

  it('H — admin email sees the users list', async () => {
    const admin = await createAgent(prisma, { email: ADMIN_EMAIL });
    // Seed a couple users so the list isn't just the admin
    await createAgent(prisma);
    await createAgent(prisma);
    const cookie = await loginAs(app, admin.email, admin._plainPassword);
    const res = await app.inject({
      method: 'GET', url: '/api/admin/users', headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    const items = body.users || body.items || [];
    expect(Array.isArray(items)).toBe(true);
    expect(items.length).toBeGreaterThanOrEqual(3);
  });
});
