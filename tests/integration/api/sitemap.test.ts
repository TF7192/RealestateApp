// GET /sitemap.xml — public dynamic sitemap.
//
// Three URL categories:
//   1. Hard-coded marketing/public routes.
//   2. Every public agent slug.
//   3. Every published property page (slug + agent slug both present).
//
// We seed one of each into the test DB and assert the response carries
// well-formed XML, the cache headers Googlebot needs, and the seeded
// rows.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { build } from '../../../backend/src/server.js';
import { prisma } from '../../setup/integration.setup.js';
import { createAgent } from '../../factories/user.factory.js';
import { createProperty } from '../../factories/property.factory.js';

let app: FastifyInstance;

beforeAll(async () => {
  app = await build();
  await app.ready();
});
afterAll(async () => {
  await app.close();
});

describe('GET /sitemap.xml', () => {
  it('returns valid XML with the three URL categories + cache headers', async () => {
    // Seed one agent + one property, both with slugs so they should
    // surface in the sitemap.
    const agent = await createAgent(prisma);
    await prisma.user.update({ where: { id: agent.id }, data: { slug: 'agent-sitemap-x' } });
    const prop = await createProperty(prisma, { agentId: agent.id });
    await prisma.property.update({ where: { id: prop.id }, data: { slug: 'property-sitemap-x' } });

    const res = await app.inject({ method: 'GET', url: '/sitemap.xml' });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/xml/);
    // Edge cache for Googlebot's re-crawl schedule.
    expect(String(res.headers['cache-control'])).toMatch(/max-age=3600/);

    const body = res.body;
    // Well-formed XML preamble + urlset wrapper.
    expect(body).toMatch(/^<\?xml version="1\.0" encoding="UTF-8"\?>/);
    expect(body).toMatch(/<urlset xmlns="http:\/\/www\.sitemaps\.org/);
    expect(body).toMatch(/<\/urlset>/);

    // Static routes (1).
    expect(body).toMatch(/<loc>[^<]*\/login<\/loc>/);
    expect(body).toMatch(/<loc>[^<]*\/privacy<\/loc>/);

    // Agent slug (2).
    expect(body).toMatch(/<loc>[^<]*\/agents\/agent-sitemap-x<\/loc>/);

    // Property page (3) — needs both slugs joined.
    expect(body).toMatch(/<loc>[^<]*\/agents\/agent-sitemap-x\/property-sitemap-x<\/loc>/);
  });

  it('skips users + properties without a slug', async () => {
    const noSlugAgent = await createAgent(prisma);
    await prisma.user.update({
      where: { id: noSlugAgent.id },
      data: { slug: null, email: 'no-slug-sitemap@example.com', displayName: 'no-slug-agent-x' },
    });
    const res = await app.inject({ method: 'GET', url: '/sitemap.xml' });
    expect(res.statusCode).toBe(200);
    expect(res.body).not.toMatch(/no-slug-agent-x/);
    expect(res.body).not.toMatch(/no-slug-sitemap@example\.com/);
  });

  it('soft-deleted agents are not included', async () => {
    const goneAgent = await createAgent(prisma);
    await prisma.user.update({
      where: { id: goneAgent.id },
      data: {
        slug: 'gone-agent-sitemap',
        deletedAt: new Date(),
      },
    });
    const res = await app.inject({ method: 'GET', url: '/sitemap.xml' });
    expect(res.statusCode).toBe(200);
    expect(res.body).not.toMatch(/gone-agent-sitemap/);
  });
});
