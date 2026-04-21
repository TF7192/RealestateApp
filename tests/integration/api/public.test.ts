import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { build } from '../../../backend/src/server.js';
import { prisma } from '../../setup/integration.setup.js';
import { createAgent } from '../../factories/user.factory.js';
import { createProperty } from '../../factories/property.factory.js';

let app: FastifyInstance;
beforeAll(async () => { app = await build(); await app.ready(); });
afterAll(async () => { await app.close(); });

/**
 * Public portal — /api/public/*. Unauthenticated reads used to power
 * the customer-facing agent portal and the single-property pages.
 */

describe('GET /api/public/agents/:slug', () => {
  it('H — returns the agent + their active properties, no auth required', async () => {
    const agent = await createAgent(prisma);
    await prisma.user.update({ where: { id: agent.id }, data: { slug: 'slug-a' } });
    await createProperty(prisma, { agentId: agent.id, city: 'ת״א', street: 'רוטשילד' });
    const res = await app.inject({
      method: 'GET', url: '/api/public/agents/slug-a',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.agent.id).toBe(agent.id);
    expect(body.properties.length).toBeGreaterThan(0);
  });

  it('H — resolves by cuid fallback when the path segment is an id', async () => {
    const agent = await createAgent(prisma);
    await prisma.user.update({ where: { id: agent.id }, data: { slug: 'slug-b' } });
    const res = await app.inject({
      method: 'GET', url: `/api/public/agents/${agent.id}`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().agent.id).toBe(agent.id);
  });

  it('404 — unknown slug', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/public/agents/not-a-real-slug',
    });
    expect(res.statusCode).toBe(404);
  });

  it('Edge — excludes properties that are not ACTIVE', async () => {
    const agent = await createAgent(prisma);
    await prisma.user.update({ where: { id: agent.id }, data: { slug: 'slug-c' } });
    const active = await createProperty(prisma, { agentId: agent.id });
    const hidden = await createProperty(prisma, { agentId: agent.id });
    await prisma.property.update({ where: { id: hidden.id }, data: { status: 'SOLD' } });
    const res = await app.inject({
      method: 'GET', url: '/api/public/agents/slug-c',
    });
    expect(res.statusCode).toBe(200);
    const ids = res.json().properties.map((p: any) => p.id);
    expect(ids).toContain(active.id);
    expect(ids).not.toContain(hidden.id);
  });
});

describe('GET /api/public/agents/:agentSlug/properties/:propertySlug', () => {
  it('H — returns a single property for the agent', async () => {
    const agent = await createAgent(prisma);
    await prisma.user.update({ where: { id: agent.id }, data: { slug: 'slug-d' } });
    const prop = await createProperty(prisma, { agentId: agent.id });
    await prisma.property.update({ where: { id: prop.id }, data: { slug: 'rothschild-45' } });
    const res = await app.inject({
      method: 'GET', url: '/api/public/agents/slug-d/properties/rothschild-45',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().property.id).toBe(prop.id);
  });

  it('404 — unknown agent slug', async () => {
    const res = await app.inject({
      method: 'GET', url: '/api/public/agents/nope/properties/whatever',
    });
    expect(res.statusCode).toBe(404);
  });

  it('404 — agent exists but the property slug doesn\'t', async () => {
    const agent = await createAgent(prisma);
    await prisma.user.update({ where: { id: agent.id }, data: { slug: 'slug-e' } });
    const res = await app.inject({
      method: 'GET', url: '/api/public/agents/slug-e/properties/nope',
    });
    expect(res.statusCode).toBe(404);
  });

  it('Edge — agent A\'s property is not visible under agent B\'s slug', async () => {
    const [a, b] = await Promise.all([createAgent(prisma), createAgent(prisma)]);
    await prisma.user.update({ where: { id: a.id }, data: { slug: 'slug-f' } });
    await prisma.user.update({ where: { id: b.id }, data: { slug: 'slug-g' } });
    const aProp = await createProperty(prisma, { agentId: a.id });
    await prisma.property.update({ where: { id: aProp.id }, data: { slug: 'shared-slug' } });
    const res = await app.inject({
      method: 'GET', url: '/api/public/agents/slug-g/properties/shared-slug',
    });
    expect(res.statusCode).toBe(404);
  });
});
