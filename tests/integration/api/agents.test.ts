import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { build } from '../../../backend/src/server.js';
import { prisma } from '../../setup/integration.setup.js';
import { createAgent } from '../../factories/user.factory.js';
import { loginAs } from '../../helpers/auth.js';

let app: FastifyInstance;
beforeAll(async () => { app = await build(); await app.ready(); });
afterAll(async () => { await app.close(); });

// /api/agents/search — moved here from /api/transfers/agents/search
// when the transfers feature was removed. Still backs the assignee
// picker (PropertyAssigneesPanel) and the primary-agent picker
// (PropertyPipelineBlock).
describe('GET /api/agents/search', () => {
  it('H — finds another agent by email (exact match)', async () => {
    const [a, b] = await Promise.all([createAgent(prisma), createAgent(prisma)]);
    const cookie = await loginAs(app, a.email, a._plainPassword);
    const res = await app.inject({
      method: 'GET', url: `/api/agents/search?email=${encodeURIComponent(b.email)}`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().agent?.id).toBe(b.id);
  });

  it('Edge — returns {agent: null, self: true} when searching for yourself', async () => {
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'GET', url: `/api/agents/search?email=${encodeURIComponent(agent.email)}`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ agent: null, self: true });
  });

  it('Edge — returns {agent: null} for an unknown email', async () => {
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'GET', url: '/api/agents/search?email=nobody@example.com',
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ agent: null });
  });

  it('A — 401 without a cookie', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/agents/search?email=x@y.com',
    });
    expect(res.statusCode).toBe(401);
  });
});
