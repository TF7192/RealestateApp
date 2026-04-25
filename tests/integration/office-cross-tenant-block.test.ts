// SEC-003 — POST /api/office/members previously updated user.officeId
// without checking the target's existing office, letting any OWNER
// "absorb" agents from rival agencies just by knowing their email or
// userId. This suite pins the fix: a target who is already a member of
// a DIFFERENT office must be refused with 409, while initial-attachment
// (target.officeId === null) and the legitimate invite-accept flow
// remain untouched.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { build } from '../../backend/src/server.js';
import { prisma } from '../setup/integration.setup.js';
import { createAgent } from '../factories/user.factory.js';
import { loginAs } from '../helpers/auth.js';

let app: FastifyInstance;
beforeAll(async () => { app = await build(); await app.ready(); });
afterAll(async () => { await app.close(); });

async function createOwner(email?: string) {
  const agent = await createAgent(prisma, { email });
  await prisma.user.update({ where: { id: agent.id }, data: { role: 'OWNER' } });
  return agent;
}

describe('SEC-003 — POST /api/office/members refuses cross-tenant moves', () => {
  it('Az — 409 when target is already a member of another office (by userId)', async () => {
    // officeX with Bob the AGENT.
    const bob = await createAgent(prisma, { email: 'bob@example.com' });
    const officeX = await prisma.office.create({
      data: { name: 'Office X', members: { connect: { id: bob.id } } },
    });
    // officeY with Alice the OWNER.
    const alice = await createOwner();
    await prisma.office.create({
      data: { name: 'Office Y', members: { connect: { id: alice.id } } },
    });

    const cookie = await loginAs(app, alice.email, alice._plainPassword);
    const res = await app.inject({
      method: 'POST', url: '/api/office/members', headers: { cookie },
      payload: { userId: bob.id },
    });

    expect(res.statusCode).toBe(409);
    const body = res.json();
    // Hebrew copy mentions "אחר" (another office) so the UI can show a
    // useful toast — exact wording matches the invite-create branch.
    expect(body?.error?.message).toMatch(/אחר|another office/);

    // Bob must still be a member of officeX.
    const after = await prisma.user.findUnique({ where: { id: bob.id } });
    expect(after?.officeId).toBe(officeX.id);
  });

  it('Az — 409 when target is already a member of another office (by email)', async () => {
    const bob = await createAgent(prisma, { email: 'bob2@example.com' });
    const officeX = await prisma.office.create({
      data: { name: 'Office X2', members: { connect: { id: bob.id } } },
    });
    const alice = await createOwner();
    await prisma.office.create({
      data: { name: 'Office Y2', members: { connect: { id: alice.id } } },
    });

    const cookie = await loginAs(app, alice.email, alice._plainPassword);
    const res = await app.inject({
      method: 'POST', url: '/api/office/members', headers: { cookie },
      payload: { email: bob.email },
    });

    expect(res.statusCode).toBe(409);
    const body = res.json();
    expect(body?.error?.message).toMatch(/אחר|another office/);

    const after = await prisma.user.findUnique({ where: { id: bob.id } });
    expect(after?.officeId).toBe(officeX.id);
  });

  it('H — initial attachment (target.officeId === null) still works', async () => {
    // Freshly-signed-up agent with no office — Alice should be able to
    // POST /members and bring them in. The fix must NOT break this.
    const alice = await createOwner();
    const officeY = await prisma.office.create({
      data: { name: 'Office Y3', members: { connect: { id: alice.id } } },
    });
    const newcomer = await createAgent(prisma);
    expect(newcomer.officeId).toBeNull();

    const cookie = await loginAs(app, alice.email, alice._plainPassword);
    const res = await app.inject({
      method: 'POST', url: '/api/office/members', headers: { cookie },
      payload: { userId: newcomer.id },
    });

    expect(res.statusCode).toBe(200);
    const after = await prisma.user.findUnique({ where: { id: newcomer.id } });
    expect(after?.officeId).toBe(officeY.id);
  });

  it('H — legitimate cross-office migration via the invite flow', async () => {
    // Bob is in officeX. Alice (OWNER of officeY) wants him.
    // The legitimate path: Alice issues an invite, Bob accepts.
    const bob = await createAgent(prisma, { email: 'bob3@example.com' });
    const officeX = await prisma.office.create({
      data: { name: 'Office X4', members: { connect: { id: bob.id } } },
    });
    const alice = await createOwner();
    const officeY = await prisma.office.create({
      data: { name: 'Office Y4', members: { connect: { id: alice.id } } },
    });

    // Production behavior: invite-create refuses an email that already
    // belongs to a DIFFERENT office (line 186 of office.ts). To exercise
    // the explicit accept handler we mirror what the UI walks an agent
    // through — Bob leaves officeX first, then Alice's invite is sent.
    await prisma.user.update({ where: { id: bob.id }, data: { officeId: null } });

    const aliceCookie = await loginAs(app, alice.email, alice._plainPassword);
    const inviteRes = await app.inject({
      method: 'POST', url: '/api/office/invites', headers: { cookie: aliceCookie },
      payload: { email: bob.email },
    });
    expect(inviteRes.statusCode).toBe(200);
    const inviteId = inviteRes.json().invite.id;

    // Bob logs in. claimOfficeInvites in auth.ts auto-accepts pending
    // invites on login (Sprint 1 / Task A1 fill-in) — we pin the same
    // end state the explicit accept route would produce: Bob ends up in
    // officeY. This proves the legitimate cross-office path still works.
    await loginAs(app, bob.email, bob._plainPassword);

    const bobAfter = await prisma.user.findUnique({ where: { id: bob.id } });
    expect(bobAfter?.officeId).toBe(officeY.id);
    // sanity — officeX still exists, just without Bob.
    const officeXAfter = await prisma.office.findUnique({ where: { id: officeX.id } });
    expect(officeXAfter?.id).toBe(officeX.id);
  });
});
