import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { UserRole } from '@prisma/client';
import { build } from '../../../backend/src/server.js';
import { prisma } from '../../setup/integration.setup.js';
import { createAgent, createUser } from '../../factories/user.factory.js';
import { loginAs } from '../../helpers/auth.js';

let app: FastifyInstance;
beforeAll(async () => { app = await build(); await app.ready(); });
afterAll(async () => { await app.close(); });

// Sprint 7 / MLS parity — Task G2. NeighborhoodGroup (marketable-area)
// admin. Public read, admin-only mutations (SEC-035 — the table is
// platform-global, so OWNER alone is too permissive). Members cascade
// from the FK ON DELETE CASCADE — the tests lock that behaviour in so
// a future migration doesn't drop the cascade silently.
//
// Default ADMIN_EMAILS includes 'talfuks1234@gmail.com' (see chat.ts).
const ADMIN_EMAIL = 'talfuks1234@gmail.com';

describe('NeighborhoodGroup admin', () => {
  it('H — admin can create a group with members; GET includes them', async () => {
    const owner = await createUser(prisma, {
      role: UserRole.OWNER,
      email: ADMIN_EMAIL,
    });
    const ramat = await prisma.neighborhood.create({
      data: { city: 'תל אביב', name: 'רמת אביב' },
    });
    const neveSharet = await prisma.neighborhood.create({
      data: { city: 'תל אביב', name: 'נווה שרת' },
    });
    const cookie = await loginAs(app, owner.email, owner._plainPassword);
    const create = await app.inject({
      method: 'POST', url: '/api/neighborhood-groups', headers: { cookie },
      payload: {
        city: 'תל אביב',
        name: 'צפון ישן תל אביב',
        description: 'אזור שיווקי מוכר',
        memberIds: [ramat.id, neveSharet.id],
      },
    });
    expect(create.statusCode).toBe(200);
    const created = create.json().group;
    expect(created.name).toBe('צפון ישן תל אביב');
    expect(created.members).toHaveLength(2);

    // Public GET — no cookie needed, matches the G1 stance.
    const list = await app.inject({
      method: 'GET', url: '/api/neighborhood-groups?city=' + encodeURIComponent('תל אביב'),
    });
    expect(list.statusCode).toBe(200);
    const items = list.json().items;
    expect(items).toHaveLength(1);
    expect(items[0].members.map((m: any) => m.neighborhood.name)).toEqual([
      'רמת אביב', 'נווה שרת',
    ]);
  });

  it('Az — plain AGENT (non-admin email) is rejected on POST / PATCH / DELETE', async () => {
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const post = await app.inject({
      method: 'POST', url: '/api/neighborhood-groups', headers: { cookie },
      payload: { city: 'תל אביב', name: 'נסיון' },
    });
    expect(post.statusCode).toBe(403);

    // Seed a group to patch/delete.
    const group = await prisma.neighborhoodGroup.create({
      data: { city: 'תל אביב', name: 'קיים' },
    });
    const patch = await app.inject({
      method: 'PATCH', url: `/api/neighborhood-groups/${group.id}`, headers: { cookie },
      payload: { name: 'hijack' },
    });
    expect(patch.statusCode).toBe(403);

    const del = await app.inject({
      method: 'DELETE', url: `/api/neighborhood-groups/${group.id}`, headers: { cookie },
    });
    expect(del.statusCode).toBe(403);
  });

  it('V — 400 when city is empty', async () => {
    const owner = await createUser(prisma, {
      role: UserRole.OWNER,
      email: ADMIN_EMAIL,
    });
    const cookie = await loginAs(app, owner.email, owner._plainPassword);
    const res = await app.inject({
      method: 'POST', url: '/api/neighborhood-groups', headers: { cookie },
      payload: { city: '', name: 'שם' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('Edge — deleting the group cascades membership rows (Neighborhoods survive)', async () => {
    const owner = await createUser(prisma, {
      role: UserRole.OWNER,
      email: ADMIN_EMAIL,
    });
    const n1 = await prisma.neighborhood.create({
      data: { city: 'חיפה', name: 'הדר' },
    });
    const group = await prisma.neighborhoodGroup.create({
      data: {
        city: 'חיפה', name: 'מרכז חיפה',
        members: { create: [{ neighborhoodId: n1.id, sortOrder: 0 }] },
      },
    });
    const cookie = await loginAs(app, owner.email, owner._plainPassword);
    const del = await app.inject({
      method: 'DELETE', url: `/api/neighborhood-groups/${group.id}`, headers: { cookie },
    });
    expect(del.statusCode).toBe(200);

    expect(
      await prisma.neighborhoodGroupMember.count({ where: { groupId: group.id } })
    ).toBe(0);
    // The source Neighborhood must survive the cascade.
    expect(await prisma.neighborhood.findUnique({ where: { id: n1.id } })).not.toBeNull();
  });

  it('PATCH replaces member set when memberIds is provided', async () => {
    const owner = await createUser(prisma, {
      role: UserRole.OWNER,
      email: ADMIN_EMAIL,
    });
    const [a, b, c] = await Promise.all([
      prisma.neighborhood.create({ data: { city: 'תל אביב', name: 'א' } }),
      prisma.neighborhood.create({ data: { city: 'תל אביב', name: 'ב' } }),
      prisma.neighborhood.create({ data: { city: 'תל אביב', name: 'ג' } }),
    ]);
    const group = await prisma.neighborhoodGroup.create({
      data: {
        city: 'תל אביב', name: 'test',
        members: {
          create: [
            { neighborhoodId: a.id, sortOrder: 0 },
            { neighborhoodId: b.id, sortOrder: 1 },
          ],
        },
      },
    });
    const cookie = await loginAs(app, owner.email, owner._plainPassword);
    const res = await app.inject({
      method: 'PATCH', url: `/api/neighborhood-groups/${group.id}`, headers: { cookie },
      payload: { memberIds: [c.id] },
    });
    expect(res.statusCode).toBe(200);
    const membersAfter = await prisma.neighborhoodGroupMember.findMany({
      where: { groupId: group.id },
    });
    expect(membersAfter.map((m) => m.neighborhoodId)).toEqual([c.id]);
  });
});
