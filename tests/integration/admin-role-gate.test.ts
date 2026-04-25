// SEC-010 — admin gates must read role off the JWT, not match against
// an env email allowlist. Setup-aware: this test does NOT seed the
// legacy `talfuks1234@gmail.com` magic email and instead promotes a
// fresh user to role=ADMIN. The legacy-email-as-AGENT sub-test below
// confirms that the email allowlist no longer escalates privileges.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { build } from '../../backend/src/server.js';
import { prisma } from '../setup/integration.setup.js';
import { createAgent, createCustomer, createUser } from '../factories/user.factory.js';
import { loginAs } from '../helpers/auth.js';

let app: FastifyInstance;
beforeAll(async () => { app = await build(); await app.ready(); });
afterAll(async () => { await app.close(); });

// Helper — promote a User row to role=ADMIN. We use a raw update so
// the test compiles before the Prisma client picks up the new enum
// value; once `prisma generate` runs, the literal string 'ADMIN' is
// also a valid TS-typed `UserRole`.
async function promoteToAdmin(userId: string) {
  await prisma.$executeRaw`UPDATE "User" SET role = 'ADMIN' WHERE id = ${userId}`;
}

describe('SEC-010 — admin role gate', () => {
  // ── /api/admin/users ────────────────────────────────────────────
  it('AGENT gets 403 from /api/admin/users', async () => {
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'GET', url: '/api/admin/users', headers: { cookie },
    });
    expect(res.statusCode).toBe(403);
  });

  it('OWNER gets 403 from /api/admin/users (OWNER is not ADMIN)', async () => {
    const owner = await createUser(prisma, { role: 'OWNER' as any });
    const cookie = await loginAs(app, owner.email, owner._plainPassword);
    const res = await app.inject({
      method: 'GET', url: '/api/admin/users', headers: { cookie },
    });
    expect(res.statusCode).toBe(403);
  });

  it('ADMIN with non-magic email gets 200 from /api/admin/users', async () => {
    const u = await createAgent(prisma, { email: 'x@example.com' });
    await promoteToAdmin(u.id);
    // Re-login so the JWT includes the new role.
    const cookie = await loginAs(app, u.email, u._plainPassword);
    const res = await app.inject({
      method: 'GET', url: '/api/admin/users', headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
  });

  // ── /api/chat/admin/conversations ───────────────────────────────
  it('AGENT gets 403 from /api/chat/admin/conversations', async () => {
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'GET', url: '/api/chat/admin/conversations', headers: { cookie },
    });
    expect(res.statusCode).toBe(403);
  });

  it('ADMIN with non-magic email gets 200 from /api/chat/admin/conversations', async () => {
    const u = await createAgent(prisma, { email: 'x2@example.com' });
    await promoteToAdmin(u.id);
    const cookie = await loginAs(app, u.email, u._plainPassword);
    const res = await app.inject({
      method: 'GET', url: '/api/chat/admin/conversations', headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
  });

  // ── /api/neighborhoods POST (G1 admin write path) ──────────────
  it('AGENT gets 403 from POST /api/neighborhoods', async () => {
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'POST', url: '/api/neighborhoods', headers: { cookie },
      payload: { city: 'תל אביב', name: 'נווה צדק' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('ADMIN with non-magic email gets 200 from POST /api/neighborhoods', async () => {
    const u = await createAgent(prisma, { email: 'x3@example.com' });
    await promoteToAdmin(u.id);
    const cookie = await loginAs(app, u.email, u._plainPassword);
    const res = await app.inject({
      method: 'POST', url: '/api/neighborhoods', headers: { cookie },
      payload: { city: 'תל אביב', name: 'נווה צדק' },
    });
    expect(res.statusCode).toBe(200);
  });

  // ── /api/office/ai-usage ───────────────────────────────────────
  it('AGENT gets 403 from /api/office/ai-usage', async () => {
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'GET', url: '/api/office/ai-usage', headers: { cookie },
    });
    expect(res.statusCode).toBe(403);
  });

  it('ADMIN with non-magic email gets 200 from /api/office/ai-usage', async () => {
    const u = await createAgent(prisma, { email: 'x4@example.com' });
    await promoteToAdmin(u.id);
    const cookie = await loginAs(app, u.email, u._plainPassword);
    const res = await app.inject({
      method: 'GET', url: '/api/office/ai-usage', headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
  });

  // ── Legacy-email-as-AGENT must NOT escalate to admin. ──────────
  it('AGENT whose email is talfuks1234@gmail.com but role=AGENT is NOT admin', async () => {
    // This is the SEC-010 acceptance criterion — the legacy email
    // allowlist must no longer escalate a non-ADMIN user.
    const legacyEmailAgent = await createAgent(prisma, { email: 'talfuks1234@gmail.com' });
    const cookie = await loginAs(app, legacyEmailAgent.email, legacyEmailAgent._plainPassword);
    const adminUsers = await app.inject({
      method: 'GET', url: '/api/admin/users', headers: { cookie },
    });
    expect(adminUsers.statusCode).toBe(403);
    const chats = await app.inject({
      method: 'GET', url: '/api/chat/admin/conversations', headers: { cookie },
    });
    expect(chats.statusCode).toBe(403);
    const aiUsage = await app.inject({
      method: 'GET', url: '/api/office/ai-usage', headers: { cookie },
    });
    expect(aiUsage.statusCode).toBe(403);
  });

  // ── CUSTOMER role rejected too. ────────────────────────────────
  it('CUSTOMER gets 403 from /api/admin/users', async () => {
    const customer = await createCustomer(prisma);
    const cookie = await loginAs(app, customer.email, customer._plainPassword);
    const res = await app.inject({
      method: 'GET', url: '/api/admin/users', headers: { cookie },
    });
    expect(res.statusCode).toBe(403);
  });
});
