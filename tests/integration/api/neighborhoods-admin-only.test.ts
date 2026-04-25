// SEC-035 — Neighborhood + NeighborhoodGroup write paths must be
// admin-only, not OWNER-only. The underlying tables are platform-
// global (no agentId/officeId), so any OWNER could otherwise poison
// every other office's autocomplete dropdown. This test pins the
// admin-allowlist gate; SEC-010 will replace it with a real role.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { UserRole } from '@prisma/client';
import { build } from '../../../backend/src/server.js';
import { prisma } from '../../setup/integration.setup.js';
import { createUser } from '../../factories/user.factory.js';
import { loginAs } from '../../helpers/auth.js';

let app: FastifyInstance;
beforeAll(async () => { app = await build(); await app.ready(); });
afterAll(async () => { await app.close(); });

// Default ADMIN_EMAILS includes 'talfuks1234@gmail.com' (see chat.ts).
const ADMIN_EMAIL = 'talfuks1234@gmail.com';

describe('SEC-035 — Neighborhoods POST is admin-only', () => {
  it('Az — non-admin OWNER (e.g. office.demo-style) gets 403', async () => {
    const owner = await createUser(prisma, {
      role: UserRole.OWNER,
      email: 'office.demo@estia.app',
    });
    const cookie = await loginAs(app, owner.email, owner._plainPassword);
    const res = await app.inject({
      method: 'POST', url: '/api/neighborhoods', headers: { cookie },
      payload: { city: 'תל אביב', name: 'מהשכונה הזרה' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('H — admin email creates a neighborhood (200)', async () => {
    const admin = await createUser(prisma, {
      role: UserRole.OWNER,
      email: ADMIN_EMAIL,
    });
    const cookie = await loginAs(app, admin.email, admin._plainPassword);
    const res = await app.inject({
      method: 'POST', url: '/api/neighborhoods', headers: { cookie },
      payload: { city: 'תל אביב', name: 'יד אליהו' },
    });
    expect(res.statusCode).toBe(200);
    const created = res.json().neighborhood;
    expect(created.name).toBe('יד אליהו');
  });

  it('A — unauthenticated POST returns 401', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/neighborhoods',
      payload: { city: 'תל אביב', name: 'אקראי' },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('SEC-035 — NeighborhoodGroup POST/PATCH/DELETE are admin-only', () => {
  it('Az — non-admin OWNER gets 403 on POST', async () => {
    const owner = await createUser(prisma, { role: UserRole.OWNER });
    const cookie = await loginAs(app, owner.email, owner._plainPassword);
    const res = await app.inject({
      method: 'POST', url: '/api/neighborhood-groups', headers: { cookie },
      payload: { city: 'תל אביב', name: 'נסיון לא-אדמין' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('Az — non-admin OWNER gets 403 on PATCH', async () => {
    const owner = await createUser(prisma, { role: UserRole.OWNER });
    const cookie = await loginAs(app, owner.email, owner._plainPassword);
    const group = await prisma.neighborhoodGroup.create({
      data: { city: 'תל אביב', name: 'קיים' },
    });
    const res = await app.inject({
      method: 'PATCH', url: `/api/neighborhood-groups/${group.id}`, headers: { cookie },
      payload: { name: 'hijack' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('Az — non-admin OWNER gets 403 on DELETE', async () => {
    const owner = await createUser(prisma, { role: UserRole.OWNER });
    const cookie = await loginAs(app, owner.email, owner._plainPassword);
    const group = await prisma.neighborhoodGroup.create({
      data: { city: 'תל אביב', name: 'גם זה קיים' },
    });
    const res = await app.inject({
      method: 'DELETE', url: `/api/neighborhood-groups/${group.id}`, headers: { cookie },
    });
    expect(res.statusCode).toBe(403);
  });

  it('H — admin email POSTs / PATCHes / DELETEs cleanly', async () => {
    const admin = await createUser(prisma, {
      role: UserRole.OWNER,
      email: ADMIN_EMAIL,
    });
    const cookie = await loginAs(app, admin.email, admin._plainPassword);
    const post = await app.inject({
      method: 'POST', url: '/api/neighborhood-groups', headers: { cookie },
      payload: { city: 'תל אביב', name: 'אזור צפוני' },
    });
    expect(post.statusCode).toBe(200);
    const groupId = post.json().group.id;

    const patch = await app.inject({
      method: 'PATCH', url: `/api/neighborhood-groups/${groupId}`, headers: { cookie },
      payload: { name: 'אזור צפוני מורחב' },
    });
    expect(patch.statusCode).toBe(200);

    const del = await app.inject({
      method: 'DELETE', url: `/api/neighborhood-groups/${groupId}`, headers: { cookie },
    });
    expect(del.statusCode).toBe(200);
  });

  it('Public — GET stays open (autocomplete needs it)', async () => {
    await prisma.neighborhoodGroup.create({
      data: { city: 'תל אביב', name: 'פאבליק טסט' },
    });
    const res = await app.inject({
      method: 'GET', url: '/api/neighborhood-groups',
    });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json().items)).toBe(true);
  });
});
