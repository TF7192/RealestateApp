// /api/import/* — CSV/Excel-driven bulk import for leads + properties.
// Async job pattern: POST /:entityType/start → { jobId, batchId };
// client polls GET /jobs/:id until status terminal.
//
// We exercise the route's contract: auth, mapping persistence,
// happy-path lead create, polling, agent-scoped job lookup, validation
// failure shape. The actual row-runner logic (de-duplication, phone
// normalisation, etc.) is covered by the lib's own unit tests.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { build } from '../../../backend/src/server.js';
import { prisma } from '../../setup/integration.setup.js';
import { createAgent } from '../../factories/user.factory.js';
import { loginAs } from '../../helpers/auth.js';

let app: FastifyInstance;
beforeAll(async () => { app = await build(); await app.ready(); });
afterAll(async () => { await app.close(); });

async function pollJob(cookie: string, jobId: string, maxTries = 20) {
  for (let i = 0; i < maxTries; i += 1) {
    const res = await app.inject({
      method: 'GET',
      url: `/api/import/jobs/${jobId}`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    if (body.status !== 'running') return body;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error('import job never settled');
}

describe('GET /api/import/mappings', () => {
  it('A — 401 without cookie', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/import/mappings?entityType=LEAD' });
    expect(res.statusCode).toBe(401);
  });

  it('returns an empty list when entityType is omitted', async () => {
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'GET',
      url: '/api/import/mappings',
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().items).toEqual([]);
  });
});

describe('PUT /api/import/mappings', () => {
  it('upserts a mapping and the GET surfaces it', async () => {
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const put = await app.inject({
      method: 'PUT',
      url: '/api/import/mappings',
      headers: { cookie },
      payload: {
        entityType: 'LEAD',
        headerSig: 'sha:test-import-x',
        mapping: { 'שם': 'name', 'טלפון': 'phone' },
      },
    });
    expect(put.statusCode).toBe(200);
    expect(put.json().mapping.entityType).toBe('LEAD');

    const get = await app.inject({
      method: 'GET',
      url: '/api/import/mappings?entityType=LEAD&headerSig=sha:test-import-x',
      headers: { cookie },
    });
    expect(get.statusCode).toBe(200);
    const items = get.json().items;
    expect(items.length).toBe(1);
    expect(items[0].mapping).toMatchObject({ שם: 'name', טלפון: 'phone' });
  });

  it('400 on invalid entityType', async () => {
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'PUT',
      url: '/api/import/mappings',
      headers: { cookie },
      payload: { entityType: 'NOT_A_THING', headerSig: 'x', mapping: {} },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('POST /api/import/:entityType/start + polling', () => {
  it('400 on unknown entity type', async () => {
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'POST',
      url: '/api/import/bogus/start',
      headers: { cookie },
      payload: { mapping: {}, rows: [{}] },
    });
    expect(res.statusCode).toBe(400);
  });

  it('400 on empty rows array', async () => {
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'POST',
      url: '/api/import/leads/start',
      headers: { cookie },
      payload: { mapping: {}, rows: [] },
    });
    expect(res.statusCode).toBe(400);
  });

  it('imports a single lead row end-to-end and the lead persists', async () => {
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const start = await app.inject({
      method: 'POST',
      url: '/api/import/leads/start',
      headers: { cookie },
      payload: {
        mapping: { 'שם': 'name', 'טלפון': 'phone', 'עיר': 'city' },
        rows: [
          { 'שם': 'אלי לוי', 'טלפון': '0501234567', 'עיר': 'תל אביב' },
        ],
      },
    });
    expect(start.statusCode).toBe(202);
    const { jobId, batchId } = start.json();
    expect(typeof jobId).toBe('string');
    expect(typeof batchId).toBe('string');

    const final = await pollJob(cookie, jobId);
    expect(final.status).toBe('done');
    expect(final.total).toBe(1);
    expect(final.created).toBe(1);
    expect(final.failed).toBe(0);

    const persisted = await prisma.lead.findFirst({
      where: { agentId: agent.id, name: 'אלי לוי' },
    });
    expect(persisted).toBeTruthy();
    // The lead-import row runner normalises Israeli phones to the
    // E.164 +972 form (drops the leading 0).
    expect(persisted?.phone).toMatch(/^\+972/);
    expect(persisted?.phone).toContain('501234567');
  });

  it('403 — another agent cannot poll this agent\'s job', async () => {
    const [a, b] = await Promise.all([createAgent(prisma), createAgent(prisma)]);
    const aCookie = await loginAs(app, a.email, a._plainPassword);
    const bCookie = await loginAs(app, b.email, b._plainPassword);
    const start = await app.inject({
      method: 'POST',
      url: '/api/import/leads/start',
      headers: { cookie: aCookie },
      payload: {
        mapping: { 'שם': 'name' },
        rows: [{ 'שם': 'cross-agent' }],
      },
    });
    const { jobId } = start.json();
    const res = await app.inject({
      method: 'GET',
      url: `/api/import/jobs/${jobId}`,
      headers: { cookie: bCookie },
    });
    expect(res.statusCode).toBe(403);
  });

  it('404 on unknown job id', async () => {
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'GET',
      url: '/api/import/jobs/never-existed',
      headers: { cookie },
    });
    expect(res.statusCode).toBe(404);
  });
});
