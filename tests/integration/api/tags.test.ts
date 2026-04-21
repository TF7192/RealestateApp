import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { build } from '../../../backend/src/server.js';
import { prisma } from '../../setup/integration.setup.js';
import { createAgent } from '../../factories/user.factory.js';
import { createProperty } from '../../factories/property.factory.js';
import { createLead } from '../../factories/lead.factory.js';
import { loginAs } from '../../helpers/auth.js';

let app: FastifyInstance;
beforeAll(async () => { app = await build(); await app.ready(); });
afterAll(async () => { await app.close(); });

describe('GET /api/tags', () => {
  it('H — returns agent-scoped tags, A→A only', async () => {
    const [a, b] = await Promise.all([createAgent(prisma), createAgent(prisma)]);
    await prisma.tag.create({ data: { agentId: a.id, name: 'Hot' } });
    await prisma.tag.create({ data: { agentId: b.id, name: 'Secret' } });
    const cookie = await loginAs(app, a.email, a._plainPassword);
    const res = await app.inject({ method: 'GET', url: '/api/tags', headers: { cookie } });
    expect(res.statusCode).toBe(200);
    const names = res.json().tags.map((t: any) => t.name);
    expect(names).toEqual(['Hot']);
  });

  it('H — scope=LEAD returns ALL-scoped + LEAD-scoped, excludes PROPERTY-only', async () => {
    const agent = await createAgent(prisma);
    await prisma.tag.create({ data: { agentId: agent.id, name: 'All', scope: 'ALL' } });
    await prisma.tag.create({ data: { agentId: agent.id, name: 'OnlyLead', scope: 'LEAD' } });
    await prisma.tag.create({ data: { agentId: agent.id, name: 'OnlyProp', scope: 'PROPERTY' } });
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'GET', url: '/api/tags?scope=LEAD', headers: { cookie },
    });
    const names = res.json().tags.map((t: any) => t.name).sort();
    expect(names).toEqual(['All', 'OnlyLead']);
  });

  it('A — 401 without cookie', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/tags' });
    expect(res.statusCode).toBe(401);
  });
});

describe('POST /api/tags', () => {
  it('H — creates a tag with defaults', async () => {
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'POST', url: '/api/tags', headers: { cookie },
      payload: { name: 'VIP' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().tag).toMatchObject({ name: 'VIP', scope: 'ALL', color: '#C9A14B' });
  });

  it('V — 400 on empty name', async () => {
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'POST', url: '/api/tags', headers: { cookie },
      payload: { name: '' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('V — 400 on malformed color', async () => {
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'POST', url: '/api/tags', headers: { cookie },
      payload: { name: 'X', color: 'red' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('Idem — 409 on duplicate name for same agent', async () => {
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    await app.inject({
      method: 'POST', url: '/api/tags', headers: { cookie }, payload: { name: 'Dup' },
    });
    const res = await app.inject({
      method: 'POST', url: '/api/tags', headers: { cookie }, payload: { name: 'Dup' },
    });
    expect(res.statusCode).toBe(409);
  });
});

describe('PATCH + DELETE /api/tags/:id', () => {
  it('H — PATCH renames + recolors', async () => {
    const agent = await createAgent(prisma);
    const tag = await prisma.tag.create({ data: { agentId: agent.id, name: 'Old' } });
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'PATCH', url: `/api/tags/${tag.id}`, headers: { cookie },
      payload: { name: 'New', color: '#123456' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().tag.name).toBe('New');
    expect(res.json().tag.color).toBe('#123456');
  });

  it('Az — 404 when patching another agent\'s tag', async () => {
    const [a, b] = await Promise.all([createAgent(prisma), createAgent(prisma)]);
    const bTag = await prisma.tag.create({ data: { agentId: b.id, name: 'Theirs' } });
    const cookie = await loginAs(app, a.email, a._plainPassword);
    const res = await app.inject({
      method: 'PATCH', url: `/api/tags/${bTag.id}`, headers: { cookie },
      payload: { name: 'Hijacked' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('H — DELETE removes tag and cascades assignments', async () => {
    const agent = await createAgent(prisma);
    const tag = await prisma.tag.create({ data: { agentId: agent.id, name: 'X' } });
    await prisma.tagAssignment.create({
      data: { tagId: tag.id, entityType: 'LEAD', entityId: 'arbitrary' },
    });
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'DELETE', url: `/api/tags/${tag.id}`, headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(await prisma.tagAssignment.count({ where: { tagId: tag.id } })).toBe(0);
  });
});

describe('POST /api/tags/:id/assign', () => {
  it('H — attaches a tag to the agent\'s own property', async () => {
    const agent = await createAgent(prisma);
    const tag = await prisma.tag.create({ data: { agentId: agent.id, name: 'VIP' } });
    const prop = await createProperty(prisma, { agentId: agent.id });
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'POST', url: `/api/tags/${tag.id}/assign`, headers: { cookie },
      payload: { entityType: 'PROPERTY', entityId: prop.id },
    });
    expect(res.statusCode).toBe(200);
    const assignments = await prisma.tagAssignment.findMany({ where: { tagId: tag.id } });
    expect(assignments).toHaveLength(1);
  });

  it('Idem — double-assign is a no-op (upsert, no 409)', async () => {
    const agent = await createAgent(prisma);
    const tag = await prisma.tag.create({ data: { agentId: agent.id, name: 'VIP' } });
    const prop = await createProperty(prisma, { agentId: agent.id });
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    for (let i = 0; i < 2; i += 1) {
      await app.inject({
        method: 'POST', url: `/api/tags/${tag.id}/assign`, headers: { cookie },
        payload: { entityType: 'PROPERTY', entityId: prop.id },
      });
    }
    const assignments = await prisma.tagAssignment.count({ where: { tagId: tag.id } });
    expect(assignments).toBe(1);
  });

  it('V — 400 when scope mismatches entity (scope=PROPERTY, entity=LEAD)', async () => {
    const agent = await createAgent(prisma);
    const tag = await prisma.tag.create({
      data: { agentId: agent.id, name: 'PropOnly', scope: 'PROPERTY' },
    });
    const lead = await createLead(prisma, { agentId: agent.id });
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'POST', url: `/api/tags/${tag.id}/assign`, headers: { cookie },
      payload: { entityType: 'LEAD', entityId: lead.id },
    });
    expect(res.statusCode).toBe(400);
  });

  it('Az — 404 when trying to tag another agent\'s property', async () => {
    const [a, b] = await Promise.all([createAgent(prisma), createAgent(prisma)]);
    const aTag = await prisma.tag.create({ data: { agentId: a.id, name: 'VIP' } });
    const bProp = await createProperty(prisma, { agentId: b.id });
    const cookie = await loginAs(app, a.email, a._plainPassword);
    const res = await app.inject({
      method: 'POST', url: `/api/tags/${aTag.id}/assign`, headers: { cookie },
      payload: { entityType: 'PROPERTY', entityId: bProp.id },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('GET /api/tags/for', () => {
  it('H — returns tags attached to the given entity', async () => {
    const agent = await createAgent(prisma);
    const tag1 = await prisma.tag.create({ data: { agentId: agent.id, name: 'A' } });
    const tag2 = await prisma.tag.create({ data: { agentId: agent.id, name: 'B' } });
    const lead = await createLead(prisma, { agentId: agent.id });
    await prisma.tagAssignment.createMany({
      data: [
        { tagId: tag1.id, entityType: 'LEAD', entityId: lead.id },
        { tagId: tag2.id, entityType: 'LEAD', entityId: lead.id },
      ],
    });
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'GET',
      url: `/api/tags/for?entityType=LEAD&entityId=${lead.id}`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().tags.map((t: any) => t.name)).toEqual(['A', 'B']);
  });
});

describe('DELETE /api/tags/:id/assign/:entityType/:entityId', () => {
  it('H — detaches via URL params (no body)', async () => {
    const agent = await createAgent(prisma);
    const tag = await prisma.tag.create({ data: { agentId: agent.id, name: 'X' } });
    const lead = await createLead(prisma, { agentId: agent.id });
    await prisma.tagAssignment.create({
      data: { tagId: tag.id, entityType: 'LEAD', entityId: lead.id },
    });
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/tags/${tag.id}/assign/LEAD/${lead.id}`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(await prisma.tagAssignment.count({ where: { tagId: tag.id } })).toBe(0);
  });
});
