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
 * Sprint 9 / marketing — page-view tracker (lane A).
 *
 * POST /api/public/agents/:agentSlug/properties/:propertySlug/view
 *
 * Contract: always 200 when the slug pair resolves, 404 only when the
 * slug pair is invalid. Same (ip + UA + UTC-date) hashing within the
 * same day collapses to a single row via a unique constraint; later
 * inserts no-op and return `deduped: true`.
 */
describe('POST /api/public/agents/:agentSlug/properties/:propertySlug/view', () => {
  it('H — fresh slug + fresh visitor inserts a row and returns deduped:false', async () => {
    const agent = await createAgent(prisma);
    await prisma.user.update({ where: { id: agent.id }, data: { slug: 'slug-view-a' } });
    const prop = await createProperty(prisma, { agentId: agent.id });
    await prisma.property.update({ where: { id: prop.id }, data: { slug: 'p-view-a' } });

    const res = await app.inject({
      method: 'POST',
      url: '/api/public/agents/slug-view-a/properties/p-view-a/view',
      headers: { 'user-agent': 'UA/one', 'x-forwarded-for': '203.0.113.10' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.deduped).toBe(false);

    const rows = await prisma.propertyView.findMany({ where: { propertyId: prop.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0].userAgent).toBe('UA/one');
  });

  it('Dedup — same slug + same visitor on the same UTC day no-ops to deduped:true', async () => {
    const agent = await createAgent(prisma);
    await prisma.user.update({ where: { id: agent.id }, data: { slug: 'slug-view-b' } });
    const prop = await createProperty(prisma, { agentId: agent.id });
    await prisma.property.update({ where: { id: prop.id }, data: { slug: 'p-view-b' } });

    const common = {
      headers: { 'user-agent': 'UA/same', 'x-forwarded-for': '203.0.113.11' },
    };

    const first = await app.inject({
      method: 'POST',
      url: '/api/public/agents/slug-view-b/properties/p-view-b/view',
      ...common,
    });
    expect(first.statusCode).toBe(200);
    expect(first.json().deduped).toBe(false);

    const second = await app.inject({
      method: 'POST',
      url: '/api/public/agents/slug-view-b/properties/p-view-b/view',
      ...common,
    });
    expect(second.statusCode).toBe(200);
    expect(second.json().deduped).toBe(true);

    const rows = await prisma.propertyView.findMany({ where: { propertyId: prop.id } });
    expect(rows).toHaveLength(1);
  });

  it('Edge — same IP but different UA produces two distinct rows', async () => {
    const agent = await createAgent(prisma);
    await prisma.user.update({ where: { id: agent.id }, data: { slug: 'slug-view-c' } });
    const prop = await createProperty(prisma, { agentId: agent.id });
    await prisma.property.update({ where: { id: prop.id }, data: { slug: 'p-view-c' } });

    const ip = '203.0.113.12';

    const r1 = await app.inject({
      method: 'POST',
      url: '/api/public/agents/slug-view-c/properties/p-view-c/view',
      headers: { 'user-agent': 'UA/mobile', 'x-forwarded-for': ip },
    });
    expect(r1.statusCode).toBe(200);
    expect(r1.json().deduped).toBe(false);

    const r2 = await app.inject({
      method: 'POST',
      url: '/api/public/agents/slug-view-c/properties/p-view-c/view',
      headers: { 'user-agent': 'UA/desktop', 'x-forwarded-for': ip },
    });
    expect(r2.statusCode).toBe(200);
    expect(r2.json().deduped).toBe(false);

    const rows = await prisma.propertyView.findMany({ where: { propertyId: prop.id } });
    expect(rows).toHaveLength(2);
    const hashes = new Set(rows.map((r) => r.visitorHash));
    expect(hashes.size).toBe(2);
  });

  it('404 — invalid slug pair never leaks a row', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/public/agents/nope-agent/properties/nope-prop/view',
      headers: { 'user-agent': 'UA/any' },
    });
    expect(res.statusCode).toBe(404);
    const total = await prisma.propertyView.count();
    expect(total).toBe(0);
  });

  it('Edge — missing user-agent header falls back to "" and still inserts', async () => {
    const agent = await createAgent(prisma);
    await prisma.user.update({ where: { id: agent.id }, data: { slug: 'slug-view-d' } });
    const prop = await createProperty(prisma, { agentId: agent.id });
    await prisma.property.update({ where: { id: prop.id }, data: { slug: 'p-view-d' } });

    // light-my-request auto-fills 'user-agent: lightMyRequest' when the
    // header isn't provided, so we pass an explicit empty string to
    // simulate a UA-less client — the same shape the tracker would see
    // from a curl --no-header or a privacy-hardened browser.
    const res = await app.inject({
      method: 'POST',
      url: '/api/public/agents/slug-view-d/properties/p-view-d/view',
      headers: { 'user-agent': '', 'x-forwarded-for': '203.0.113.13' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.deduped).toBe(false);

    const rows = await prisma.propertyView.findMany({ where: { propertyId: prop.id } });
    expect(rows).toHaveLength(1);
    // Missing header → stored as empty string, not the literal
    // "undefined". Column is nullable but our route coerces via
    // String(…||'') so we get '' on the happy path.
    expect(rows[0].userAgent).toBe('');
  });
});
