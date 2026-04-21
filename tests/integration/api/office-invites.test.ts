import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { build } from '../../../backend/src/server.js';
import { prisma } from '../../setup/integration.setup.js';
import { createAgent, createCustomer } from '../../factories/user.factory.js';
import { loginAs } from '../../helpers/auth.js';

let app: FastifyInstance;
beforeAll(async () => { app = await build(); await app.ready(); });
afterAll(async () => { await app.close(); });

async function createOwner(email?: string) {
  const agent = await createAgent(prisma, { email });
  await prisma.user.update({ where: { id: agent.id }, data: { role: 'OWNER' } });
  return agent;
}

async function setupOwnerWithOffice() {
  const owner = await createOwner();
  const office = await prisma.office.create({
    data: { name: 'Acme Realty', members: { connect: { id: owner.id } } },
  });
  const cookie = await loginAs(app, owner.email, owner._plainPassword);
  return { owner, office, cookie };
}

describe('POST /api/office/invites', () => {
  it('Az — 403 when the caller is not OWNER', async () => {
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'POST', url: '/api/office/invites', headers: { cookie },
      payload: { email: 'target@example.com' },
    });
    expect([401, 403]).toContain(res.statusCode);
  });

  it('H — OWNER creates an invite and gets an inviteUrl', async () => {
    const { cookie } = await setupOwnerWithOffice();
    const res = await app.inject({
      method: 'POST', url: '/api/office/invites', headers: { cookie },
      payload: { email: 'newagent@example.com' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.invite.email).toBe('newagent@example.com');
    expect(body.invite.acceptedAt).toBeNull();
    expect(typeof body.invite.inviteUrl).toBe('string');
    expect(body.invite.inviteUrl).toContain(body.invite.id);
  });

  it('Idem — inviting the same email twice upserts (same id)', async () => {
    const { cookie } = await setupOwnerWithOffice();
    const r1 = await app.inject({
      method: 'POST', url: '/api/office/invites', headers: { cookie },
      payload: { email: 'repeat@example.com' },
    });
    const r2 = await app.inject({
      method: 'POST', url: '/api/office/invites', headers: { cookie },
      payload: { email: 'repeat@example.com' },
    });
    expect(r1.statusCode).toBe(200);
    expect(r2.statusCode).toBe(200);
    expect(r2.json().invite.id).toBe(r1.json().invite.id);
  });

  it('Idem — re-inviting a revoked email resets revokedAt', async () => {
    const { cookie, office } = await setupOwnerWithOffice();
    const r1 = await app.inject({
      method: 'POST', url: '/api/office/invites', headers: { cookie },
      payload: { email: 'bounceback@example.com' },
    });
    const id = r1.json().invite.id;
    await app.inject({
      method: 'DELETE', url: `/api/office/invites/${id}`, headers: { cookie },
    });
    const r2 = await app.inject({
      method: 'POST', url: '/api/office/invites', headers: { cookie },
      payload: { email: 'bounceback@example.com' },
    });
    expect(r2.statusCode).toBe(200);
    const after = await prisma.officeInvite.findUnique({ where: { id } });
    expect(after?.revokedAt).toBeNull();
    expect(after?.officeId).toBe(office.id);
  });

  it('Conflict — 409 when target user is already a member', async () => {
    const { cookie, office } = await setupOwnerWithOffice();
    const existingMember = await createAgent(prisma, { email: 'member@example.com' });
    await prisma.user.update({
      where: { id: existingMember.id },
      data: { officeId: office.id },
    });
    const res = await app.inject({
      method: 'POST', url: '/api/office/invites', headers: { cookie },
      payload: { email: 'member@example.com' },
    });
    expect(res.statusCode).toBe(409);
  });

  it('H — allowed to invite existing user who is NOT yet in the office', async () => {
    const { cookie } = await setupOwnerWithOffice();
    // Pre-create the target user with no officeId — claim-on-login path.
    await createAgent(prisma, { email: 'drifter@example.com' });
    const res = await app.inject({
      method: 'POST', url: '/api/office/invites', headers: { cookie },
      payload: { email: 'drifter@example.com' },
    });
    expect(res.statusCode).toBe(200);
  });

  it('V — 400 on missing / invalid email', async () => {
    const { cookie } = await setupOwnerWithOffice();
    const res = await app.inject({
      method: 'POST', url: '/api/office/invites', headers: { cookie },
      payload: { email: 'notanemail' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('404 — OWNER without an office', async () => {
    const owner = await createOwner();
    const cookie = await loginAs(app, owner.email, owner._plainPassword);
    const res = await app.inject({
      method: 'POST', url: '/api/office/invites', headers: { cookie },
      payload: { email: 'a@example.com' },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('GET /api/office/invites', () => {
  it('H — lists pending invites sorted by createdAt desc', async () => {
    const { cookie } = await setupOwnerWithOffice();
    await app.inject({
      method: 'POST', url: '/api/office/invites', headers: { cookie },
      payload: { email: 'first@example.com' },
    });
    // Small wait to ensure distinct createdAt.
    await new Promise((r) => setTimeout(r, 5));
    await app.inject({
      method: 'POST', url: '/api/office/invites', headers: { cookie },
      payload: { email: 'second@example.com' },
    });
    const res = await app.inject({
      method: 'GET', url: '/api/office/invites', headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const items = res.json().items;
    expect(items).toHaveLength(2);
    expect(items[0].email).toBe('second@example.com');
    expect(items[1].email).toBe('first@example.com');
    expect(items[0].inviteUrl).toContain(items[0].id);
  });

  it('H — filters out already-accepted invites', async () => {
    const { cookie, office } = await setupOwnerWithOffice();
    const r1 = await app.inject({
      method: 'POST', url: '/api/office/invites', headers: { cookie },
      payload: { email: 'gone@example.com' },
    });
    await prisma.officeInvite.update({
      where: { id: r1.json().invite.id },
      data: { acceptedAt: new Date() },
    });
    const res = await app.inject({
      method: 'GET', url: '/api/office/invites', headers: { cookie },
    });
    expect(res.json().items).toHaveLength(0);
    // Sanity: the row still exists in the DB.
    const rows = await prisma.officeInvite.findMany({ where: { officeId: office.id } });
    expect(rows).toHaveLength(1);
  });

  it('Az — 403 for non-OWNER', async () => {
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'GET', url: '/api/office/invites', headers: { cookie },
    });
    expect([401, 403]).toContain(res.statusCode);
  });
});

describe('DELETE /api/office/invites/:id', () => {
  it('H — revokes an invite (sets revokedAt)', async () => {
    const { cookie } = await setupOwnerWithOffice();
    const r1 = await app.inject({
      method: 'POST', url: '/api/office/invites', headers: { cookie },
      payload: { email: 'revoke@example.com' },
    });
    const id = r1.json().invite.id;
    const res = await app.inject({
      method: 'DELETE', url: `/api/office/invites/${id}`, headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const row = await prisma.officeInvite.findUnique({ where: { id } });
    expect(row?.revokedAt).toBeInstanceOf(Date);
  });

  it('Az — 404 when invite belongs to a different office', async () => {
    const { cookie: cookieA } = await setupOwnerWithOffice();
    const { owner: ownerB } = await setupOwnerWithOffice();
    // Create invite in B's office via a direct insert.
    const officeB = await prisma.user.findUnique({ where: { id: ownerB.id } });
    const inviteB = await prisma.officeInvite.create({
      data: { officeId: officeB!.officeId!, email: 'other@example.com', invitedById: ownerB.id },
    });
    const res = await app.inject({
      method: 'DELETE', url: `/api/office/invites/${inviteB.id}`, headers: { cookie: cookieA },
    });
    expect(res.statusCode).toBe(404);
  });
});

