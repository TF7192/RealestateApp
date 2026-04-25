import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { build } from '../../../backend/src/server.js';
import { prisma } from '../../setup/integration.setup.js';
import { createAgent } from '../../factories/user.factory.js';
import { loginAs } from '../../helpers/auth.js';

let app: FastifyInstance;
beforeAll(async () => { app = await build(); await app.ready(); });
afterAll(async () => { await app.close(); });

// SEC-010 — admin is now role-based. Helper promotes a User row to
// role='ADMIN' so the next login mints a JWT that satisfies
// app.requireAdmin.
async function promoteToAdmin(userId: string) {
  await prisma.$executeRaw`UPDATE "User" SET role = 'ADMIN' WHERE id = ${userId}`;
}

describe('GET /api/chat/me', () => {
  it('H — upserts a conversation for the authed user and returns it + empty messages', async () => {
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({ method: 'GET', url: '/api/chat/me', headers: { cookie } });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.conversation?.userId).toBe(agent.id);
    expect(Array.isArray(body.messages)).toBe(true);
  });

  it('A — 401 without cookie', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/chat/me' });
    expect(res.statusCode).toBe(401);
  });
});

describe('POST /api/chat/me/messages', () => {
  it('H — creates a message and marks the conversation OPEN', async () => {
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'POST', url: '/api/chat/me/messages', headers: { cookie },
      payload: { body: 'שלום, יש לי שאלה' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().message.body).toBe('שלום, יש לי שאלה');
    const convo = await prisma.conversation.findUnique({ where: { userId: agent.id } });
    expect(convo?.status).toBe('OPEN');
  });

  it('V — 400 on empty body', async () => {
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'POST', url: '/api/chat/me/messages', headers: { cookie },
      payload: { body: '' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('V — 400 on body over 4000 chars', async () => {
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'POST', url: '/api/chat/me/messages', headers: { cookie },
      payload: { body: 'x'.repeat(4001) },
    });
    expect(res.statusCode).toBe(400);
  });

  it('A — 401 without cookie', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/chat/me/messages',
      payload: { body: 'hi' },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('POST /api/chat/me/read', () => {
  it('H — marks admin-sent messages as read', async () => {
    const agent = await createAgent(prisma);
    // The admin user here only needs to exist as a sender; the test
    // doesn't pass through the admin gate so no role bump is needed.
    const admin = await createAgent(prisma);
    const convo = await prisma.conversation.create({
      data: { userId: agent.id, status: 'OPEN' },
    });
    await prisma.message.create({
      data: { conversationId: convo.id, senderId: admin.id, senderRole: 'admin', body: 'hi from admin' },
    });
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'POST', url: '/api/chat/me/read', headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const m = await prisma.message.findFirst({ where: { conversationId: convo.id } });
    expect(m?.readAt).not.toBeNull();
  });

  it('Idem — no-op 200 for users without a conversation', async () => {
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'POST', url: '/api/chat/me/read', headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
  });
});

describe('GET /api/chat/admin/conversations', () => {
  it('Az — 403 for a non-admin agent', async () => {
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'GET', url: '/api/chat/admin/conversations', headers: { cookie },
    });
    expect([401, 403]).toContain(res.statusCode);
  });

  it('H — admin sees OPEN conversations and unread counts', async () => {
    const admin = await createAgent(prisma);
    await promoteToAdmin(admin.id);
    const user = await createAgent(prisma);
    const convo = await prisma.conversation.create({
      data: { userId: user.id, status: 'OPEN', lastMessageAt: new Date() },
    });
    await prisma.message.create({
      data: { conversationId: convo.id, senderId: user.id, senderRole: 'user', body: 'help' },
    });
    const cookie = await loginAs(app, admin.email, admin._plainPassword);
    const res = await app.inject({
      method: 'GET', url: '/api/chat/admin/conversations?filter=open', headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const items = res.json().items;
    const found = items.find((x: any) => x.id === convo.id);
    expect(found).toBeTruthy();
    expect(found.unread).toBe(1);
  });

  it('A — 401 without cookie', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/chat/admin/conversations',
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('POST /api/chat/admin/conversations/:id/messages', () => {
  it('H — admin can send a message into a user\'s conversation', async () => {
    const admin = await createAgent(prisma);
    await promoteToAdmin(admin.id);
    const user = await createAgent(prisma);
    const convo = await prisma.conversation.create({
      data: { userId: user.id, status: 'OPEN' },
    });
    const cookie = await loginAs(app, admin.email, admin._plainPassword);
    const res = await app.inject({
      method: 'POST', url: `/api/chat/admin/conversations/${convo.id}/messages`,
      headers: { cookie }, payload: { body: 'בתהליך' },
    });
    expect(res.statusCode).toBe(200);
    const stored = await prisma.message.findFirst({
      where: { conversationId: convo.id, senderRole: 'admin' },
    });
    expect(stored?.body).toBe('בתהליך');
  });

  it('Az — 403 for non-admin', async () => {
    const agent = await createAgent(prisma);
    const user = await createAgent(prisma);
    const convo = await prisma.conversation.create({
      data: { userId: user.id, status: 'OPEN' },
    });
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'POST', url: `/api/chat/admin/conversations/${convo.id}/messages`,
      headers: { cookie }, payload: { body: 'hijack' },
    });
    expect([401, 403]).toContain(res.statusCode);
  });
});

describe('POST /api/chat/admin/conversations/:id/archive + unarchive', () => {
  it('H — archive then unarchive round-trip', async () => {
    const admin = await createAgent(prisma);
    await promoteToAdmin(admin.id);
    const user = await createAgent(prisma);
    const convo = await prisma.conversation.create({
      data: { userId: user.id, status: 'OPEN' },
    });
    const cookie = await loginAs(app, admin.email, admin._plainPassword);
    const a = await app.inject({
      method: 'POST', url: `/api/chat/admin/conversations/${convo.id}/archive`,
      headers: { cookie },
    });
    expect(a.statusCode).toBe(200);
    expect((await prisma.conversation.findUnique({ where: { id: convo.id } }))?.status).toBe('ARCHIVED');
    const u = await app.inject({
      method: 'POST', url: `/api/chat/admin/conversations/${convo.id}/unarchive`,
      headers: { cookie },
    });
    expect(u.statusCode).toBe(200);
    expect((await prisma.conversation.findUnique({ where: { id: convo.id } }))?.status).toBe('OPEN');
  });
});
