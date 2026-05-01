// /api/chat/ws — WebSocket broadcast hub.
//
// Contracts pinned here:
//   - Authenticated user receives a {type:'hello'} packet on connect.
//   - The 6th simultaneous connection from the same user is closed
//     with code 1013 (SEC-016 — per-user cap of 5 sockets).
//   - When a user POSTs to /me/messages, every admin socket receives
//     a {type:'message:new'} packet for that conversation.
//   - When the user POSTs to /me/read, every admin socket receives a
//     {type:'message:read', readerRole:'user'} packet.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import WebSocket from 'ws';
import { build } from '../../../backend/src/server.js';
import { prisma } from '../../setup/integration.setup.js';
import { createAgent, createUser } from '../../factories/user.factory.js';
import { loginAs } from '../../helpers/auth.js';

let app: FastifyInstance;
let baseUrl: string;

beforeAll(async () => {
  app = await build();
  await app.ready();
  // Bind to a random port so we can drive a real WS handshake (Fastify's
  // app.inject() can't upgrade an HTTP request to WebSocket).
  await app.listen({ host: '127.0.0.1', port: 0 });
  const addr = app.server.address();
  if (!addr || typeof addr === 'string') throw new Error('no addr');
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

afterAll(async () => {
  await app.close();
});

// Wrap a WebSocket with an inbox queue so messages that arrive
// between handshake completion and the next nextMessage() call
// don't get dropped. The `ws` package fires 'message' synchronously,
// so without this the server's "hello" frame can race ahead of the
// test's first listener attachment.
type Bagged = { ws: WebSocket; inbox: string[]; waiters: Array<(s: string) => void> };

function openSocket(cookie: string): Promise<Bagged> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(baseUrl.replace('http', 'ws') + '/api/chat/ws', {
      headers: { cookie },
    });
    const bag: Bagged = { ws, inbox: [], waiters: [] };
    ws.on('message', (data) => {
      const s = data.toString();
      const w = bag.waiters.shift();
      if (w) w(s);
      else bag.inbox.push(s);
    });
    ws.once('open', () => resolve(bag));
    ws.once('error', reject);
  });
}

function nextMessage(bag: Bagged, timeoutMs = 2000): Promise<string> {
  if (bag.inbox.length) return Promise.resolve(bag.inbox.shift()!);
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('ws message timeout')), timeoutMs);
    bag.waiters.push((s) => { clearTimeout(t); resolve(s); });
  });
}

function nextClose(ws: WebSocket, timeoutMs = 2000): Promise<{ code: number }> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('ws close timeout')), timeoutMs);
    ws.once('close', (code) => {
      clearTimeout(t);
      resolve({ code });
    });
  });
}

describe('GET /api/chat/ws', () => {
  it('authenticated agent receives a {type:"hello"} packet on connect', async () => {
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const bag = await openSocket(cookie);
    const first = await nextMessage(bag);
    const event = JSON.parse(first);
    expect(event.type).toBe('hello');
    expect(event.isAdmin).toBe(false);
    bag.ws.close();
  });

  it('closes with code 1013 on the 6th simultaneous connection (per-user cap)', async () => {
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const sockets: Bagged[] = [];
    try {
      for (let i = 0; i < 5; i += 1) {
        const bag = await openSocket(cookie);
        await nextMessage(bag); // drain hello
        sockets.push(bag);
      }
      // 6th connection should be closed by the server with 1013.
      const sixth = new WebSocket(baseUrl.replace('http', 'ws') + '/api/chat/ws', {
        headers: { cookie },
      });
      const closed = await nextClose(sixth);
      expect(closed.code).toBe(1013);
    } finally {
      for (const s of sockets) s.ws.close();
    }
  });

  it('admin socket receives a {type:"message:new"} when a user POSTs', async () => {
    const user = await createAgent(prisma);
    const admin = await createUser(prisma, { role: 'ADMIN' as any, email: 'ws-admin@example.com' });
    const userCookie = await loginAs(app, user.email, user._plainPassword);
    const adminCookie = await loginAs(app, admin.email, admin._plainPassword);

    const adminBag = await openSocket(adminCookie);
    await nextMessage(adminBag); // hello

    const postResp = await fetch(`${baseUrl}/api/chat/me/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: userCookie,
      },
      body: JSON.stringify({ body: 'hello support' }),
    });
    expect(postResp.status).toBe(200);

    const event = JSON.parse(await nextMessage(adminBag));
    expect(event.type).toBe('message:new');
    expect(event.message).toMatchObject({ body: 'hello support' });

    adminBag.ws.close();
  });

  it('admin sees {type:"message:read", readerRole:"user"} when the user marks read', async () => {
    const user = await createAgent(prisma);
    const admin = await createUser(prisma, { role: 'ADMIN' as any, email: 'ws-admin-read@example.com' });
    const userCookie = await loginAs(app, user.email, user._plainPassword);
    const adminCookie = await loginAs(app, admin.email, admin._plainPassword);

    // /me/read only broadcasts if a conversation exists; create one
    // by sending a message first. Drain both events from the admin's
    // socket (the message:new from the post + the hello it received
    // when the connection opened).
    const adminBag = await openSocket(adminCookie);
    await nextMessage(adminBag); // hello

    const post = await fetch(`${baseUrl}/api/chat/me/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: userCookie },
      body: JSON.stringify({ body: 'first message' }),
    });
    expect(post.status).toBe(200);
    const messageEvent = JSON.parse(await nextMessage(adminBag));
    expect(messageEvent.type).toBe('message:new');

    const r = await fetch(`${baseUrl}/api/chat/me/read`, {
      method: 'POST',
      headers: { cookie: userCookie },
    });
    expect(r.status).toBe(200);

    const event = JSON.parse(await nextMessage(adminBag));
    expect(event.type).toBe('message:read');
    expect(event.readerRole).toBe('user');

    adminBag.ws.close();
  });
});
