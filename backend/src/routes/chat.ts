import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireUser, getUser } from '../middleware/auth.js';

// SEC-010 — admin gate is now role-based via `app.requireAdmin`. The
// previous ADMIN_EMAILS env allowlist is retired.
//
// `isAdminUser` stays exported as a no-op for one release so any stray
// caller doesn't crash the build before next deploy. New code must
// read `u.role === 'ADMIN'` directly. Marked deprecated; remove on
// the cleanup-after-deploy follow-up.
/** @deprecated SEC-010 — use `app.requireAdmin` or `u.role === 'ADMIN'`. */
export function isAdminUser(_email: string | null | undefined): boolean {
  return false;
}

// ─── Simple per-user send rate limit: 30 messages / minute ─────
const sendRateBuckets = new Map<string, number[]>();
function allowSend(userId: string): boolean {
  const now = Date.now();
  const win = 60_000;
  const bucket = (sendRateBuckets.get(userId) || []).filter((t) => now - t < win);
  if (bucket.length >= 30) return false;
  bucket.push(now);
  sendRateBuckets.set(userId, bucket);
  return true;
}

// ─── WebSocket broadcast hub ────────────────────────────────────
//
// Every connected socket registers a (userId, isAdmin, send) row. When
// a message is created we look up everyone who should receive it:
//   - the conversation's owner
//   - every admin socket
// and push a JSON event. This is a single-process hub; if we ever scale
// horizontally we switch to Redis pub/sub.
type Sub = { userId: string; isAdmin: boolean; send: (data: string) => void };
const subs = new Set<Sub>();
export function broadcastMessage(conversation: { id: string; userId: string }, messagePayload: any) {
  const event = JSON.stringify({ type: 'message:new', conversationId: conversation.id, message: messagePayload });
  for (const s of subs) {
    if (s.isAdmin || s.userId === conversation.userId) {
      try { s.send(event); } catch { /* dead socket */ }
    }
  }
}
function broadcastRead(conversation: { id: string; userId: string }, readerRole: 'user' | 'admin', at: Date) {
  const event = JSON.stringify({
    type: 'message:read',
    conversationId: conversation.id,
    readerRole,
    at: at.toISOString(),
  });
  for (const s of subs) {
    if (s.isAdmin || s.userId === conversation.userId) {
      try { s.send(event); } catch { /* dead */ }
    }
  }
}

export const registerChatRoutes: FastifyPluginAsync = async (app) => {
  // ── user-facing routes ───────────────────────────────────────
  // Get-or-create the current user's conversation + last 50 messages.
  app.get('/me', { onRequest: [app.requireAuth] }, async (req) => {
    const u = requireUser(req);
    const convo = await prisma.conversation.upsert({
      where: { userId: u.id },
      create: { userId: u.id, lastMessageAt: new Date() },
      update: {},
    });
    const messages = await prisma.message.findMany({
      where: { conversationId: convo.id },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });
    const unread = messages.filter((m) => m.senderRole === 'admin' && !m.readAt).length;
    return { conversation: convo, messages, unread };
  });

  const sendSchema = z.object({ body: z.string().min(1).max(4000) });
  // User sends a message to support.
  app.post('/me/messages', { onRequest: [app.requireAuth] }, async (req, reply) => {
    const u = requireUser(req);
    if (!allowSend(u.id)) return reply.code(429).send({ error: { message: 'יותר מדי הודעות — חכה רגע' } });
    const { body } = sendSchema.parse(req.body);
    const convo = await prisma.conversation.upsert({
      where: { userId: u.id },
      create: { userId: u.id },
      update: {},
    });
    const message = await prisma.message.create({
      data: { conversationId: convo.id, senderId: u.id, senderRole: 'user', body },
    });
    await prisma.conversation.update({
      where: { id: convo.id },
      data: { lastMessageAt: message.createdAt, status: 'OPEN' },
    });
    broadcastMessage(convo, message);
    return { message };
  });

  // Mark admin-sent messages as read by the user.
  app.post('/me/read', { onRequest: [app.requireAuth] }, async (req) => {
    const u = requireUser(req);
    const convo = await prisma.conversation.findUnique({ where: { userId: u.id } });
    if (!convo) return { ok: true };
    const now = new Date();
    await prisma.message.updateMany({
      where: { conversationId: convo.id, senderRole: 'admin', readAt: null },
      data: { readAt: now },
    });
    broadcastRead(convo, 'user', now);
    return { ok: true };
  });

  // ── admin routes ─────────────────────────────────────────────
  // SEC-010 — gate on app.requireAdmin (role=ADMIN check on JWT).
  app.get('/admin/conversations', { onRequest: [app.requireAdmin] }, async (req) => {
    const { filter = 'open', search } = req.query as { filter?: string; search?: string };
    const where: any = {};
    if (filter === 'open')     where.status = 'OPEN';
    if (filter === 'archived') where.status = 'ARCHIVED';
    // "all" = no filter
    const convos = await prisma.conversation.findMany({
      where,
      orderBy: { lastMessageAt: 'desc' },
      include: {
        user: { select: { id: true, displayName: true, email: true, avatarUrl: true, role: true } },
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
      take: 400,
    });
    const unreadByConvo = await prisma.message.groupBy({
      by: ['conversationId'],
      where: { senderRole: 'user', readAt: null },
      _count: { _all: true },
    });
    const unreadMap = new Map(unreadByConvo.map((r) => [r.conversationId, r._count._all]));
    let items = convos.map((c) => ({
      id: c.id,
      userId: c.userId,
      user: c.user,
      status: c.status,
      lastMessageAt: c.lastMessageAt,
      lastMessage: c.messages[0] || null,
      unread: unreadMap.get(c.id) || 0,
    }));
    if (search && search.trim()) {
      const s = search.trim().toLowerCase();
      items = items.filter((it) =>
        (it.user?.displayName || '').toLowerCase().includes(s) ||
        (it.user?.email       || '').toLowerCase().includes(s) ||
        (it.lastMessage?.body || '').toLowerCase().includes(s)
      );
    }
    return { items };
  });

  app.get('/admin/conversations/:id', { onRequest: [app.requireAdmin] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const convo = await prisma.conversation.findUnique({
      where: { id },
      include: { user: { select: { id: true, displayName: true, email: true, avatarUrl: true } } },
    });
    if (!convo) return reply.code(404).send({ error: { message: 'Not found' } });
    const messages = await prisma.message.findMany({
      where: { conversationId: id },
      orderBy: { createdAt: 'asc' },
      take: 500,
    });
    return { conversation: convo, messages };
  });

  app.post('/admin/conversations/:id/messages', { onRequest: [app.requireAdmin] }, async (req) => {
    const { id } = req.params as { id: string };
    const { body } = sendSchema.parse(req.body);
    const admin = requireUser(req);
    const convo = await prisma.conversation.findUnique({ where: { id } });
    if (!convo) return { error: 'not found' };
    const message = await prisma.message.create({
      data: { conversationId: id, senderId: admin.id, senderRole: 'admin', body },
    });
    await prisma.conversation.update({
      where: { id },
      data: { lastMessageAt: message.createdAt, status: 'OPEN' },
    });
    broadcastMessage(convo, message);
    return { message };
  });

  app.post('/admin/conversations/:id/read', { onRequest: [app.requireAdmin] }, async (req) => {
    const { id } = req.params as { id: string };
    const convo = await prisma.conversation.findUnique({ where: { id } });
    if (!convo) return { ok: false };
    const now = new Date();
    await prisma.message.updateMany({
      where: { conversationId: id, senderRole: 'user', readAt: null },
      data: { readAt: now },
    });
    broadcastRead(convo, 'admin', now);
    return { ok: true };
  });

  app.post('/admin/conversations/:id/archive', { onRequest: [app.requireAdmin] }, async (req) => {
    const { id } = req.params as { id: string };
    await prisma.conversation.update({ where: { id }, data: { status: 'ARCHIVED' } });
    return { ok: true };
  });
  app.post('/admin/conversations/:id/unarchive', { onRequest: [app.requireAdmin] }, async (req) => {
    const { id } = req.params as { id: string };
    await prisma.conversation.update({ where: { id }, data: { status: 'OPEN' } });
    return { ok: true };
  });

  // ── WebSocket handler ─────────────────────────────────────────
  // Authenticated via the same JWT cookie used for REST (the auth
  // plugin's onRequest hook already ran). Agents get events for their
  // own conversation only; admins receive everything.
  app.get('/ws', { websocket: true, onRequest: [app.requireAuth] }, (socket, req) => {
    const u = getUser(req);
    if (!u) { socket.close(); return; }
    const sub: Sub = {
      userId: u.id,
      // SEC-010 — admin bucket reads role off the JWT, not email.
      isAdmin: u.role === 'ADMIN',
      send: (data) => socket.send(data),
    };
    subs.add(sub);
    socket.on('close', () => subs.delete(sub));
    socket.on('error', () => subs.delete(sub));
    // Sanity ping so the client knows the socket is alive
    try { socket.send(JSON.stringify({ type: 'hello', isAdmin: sub.isAdmin })); } catch { /* ignore */ }
  });
};
