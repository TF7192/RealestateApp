import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { build } from '../../../backend/src/server.js';
import { prisma } from '../../setup/integration.setup.js';
import { createAgent } from '../../factories/user.factory.js';
import { loginAs } from '../../helpers/auth.js';

let app: FastifyInstance;

beforeAll(async () => {
  app = await build();
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

describe('POST /api/auth/login', () => {
  it('returns 200 + sets the session cookie on valid credentials (happy)', async () => {
    const agent = await createAgent(prisma);
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: agent.email, password: agent._plainPassword },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.user.email).toBe(agent.email);
    expect(body.user.role).toBe('AGENT');
    // Cookie header present + httpOnly
    const setCookie = res.headers['set-cookie'];
    expect(setCookie).toBeTruthy();
    expect(String(setCookie)).toMatch(/estia_token=/);
    expect(String(setCookie)).toMatch(/HttpOnly/i);
  });

  it('returns 401 on wrong password — error message does NOT leak whether email exists', async () => {
    const agent = await createAgent(prisma);
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: agent.email, password: 'WrongPassword!' },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.message).toBe('Invalid credentials');
  });

  it('returns 401 on unknown email — same message as wrong password', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'nobody@example.com', password: 'Whatever1!' },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.message).toBe('Invalid credentials');
  });

  it('returns 400 on malformed body (validation)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'not-an-email', password: 'x' },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('GET /api/me — auth boundary', () => {
  it('401s without a cookie', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/me' });
    expect(res.statusCode).toBe(401);
  });

  it('returns the authed user with a valid cookie', async () => {
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'GET',
      url: '/api/me',
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.user.id).toBe(agent.id);
    expect(body.user.email).toBe(agent.email);
  });
});

describe('POST /api/auth/signup', () => {
  it('H — creates a new AGENT + sets the session cookie', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/signup',
      payload: {
        email: 'new-agent@example.com',
        password: 'StrongPass1!',
        role: 'AGENT',
        displayName: 'חדש',
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.user.email).toBe('new-agent@example.com');
    expect(String(res.headers['set-cookie'])).toMatch(/estia_token=/);
  });

  it('V — 400 on weak password (< 8 chars)', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/auth/signup',
      payload: { email: 'x@y.com', password: 'short', role: 'AGENT' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('V — 400 on invalid email', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/auth/signup',
      payload: { email: 'not-an-email', password: 'StrongPass1!', role: 'AGENT' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('Idem — 409 when the email already exists', async () => {
    const existing = await createAgent(prisma, { email: 'already@example.com' });
    const res = await app.inject({
      method: 'POST', url: '/api/auth/signup',
      payload: {
        email: existing.email, password: 'StrongPass1!',
        role: 'AGENT', displayName: 'dup',
      },
    });
    expect(res.statusCode).toBe(409);
  });
});

describe('POST /api/auth/logout', () => {
  it('H — always 200 with a Set-Cookie that clears estia_token', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/auth/logout' });
    expect(res.statusCode).toBe(200);
    const c = String(res.headers['set-cookie'] || '');
    expect(c).toMatch(/estia_token=/);
    expect(c).toMatch(/Max-Age=0|Expires=/i);
  });

  it('A — works (200) without a cookie present (no-op signout)', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/auth/logout' });
    expect(res.statusCode).toBe(200);
    expect(res.json().ok).toBe(true);
  });
});

describe('Authorization (IDOR) — agent A cannot see agent B', () => {
  it("does not return another agent's leads", async () => {
    const [agentA, agentB] = await Promise.all([
      createAgent(prisma),
      createAgent(prisma),
    ]);
    // Agent B creates a lead
    await prisma.lead.create({
      data: {
        agentId: agentB.id,
        name: 'Agent B lead',
        phone: '0501234567',
      },
    });
    const cookie = await loginAs(app, agentA.email, agentA._plainPassword);
    const res = await app.inject({
      method: 'GET',
      url: '/api/leads',
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    const names = (body.items || body.leads || []).map((l: any) => l.name);
    expect(names).not.toContain('Agent B lead');
  });
});
