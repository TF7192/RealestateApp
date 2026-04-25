import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { build } from '../../backend/src/server.js';
import { prisma } from '../setup/integration.setup.js';
import { createAgent } from '../factories/user.factory.js';
import { createProperty } from '../factories/property.factory.js';
import { loginAs } from '../helpers/auth.js';

// SEC-009 — GET /api/properties/:id/videos was unauthenticated and
// performed no ownership check. Anyone with a property id could list
// the video rows. The customer-view rationale is wrong: the public
// share page (/api/public/agents/:slug/properties/:propSlug) already
// includes `videos` in its include block, so the agent-side route can
// safely become agent-scoped.
let app: FastifyInstance;
beforeAll(async () => { app = await build(); await app.ready(); });
afterAll(async () => { await app.close(); });

describe('SEC-009 — GET /api/properties/:id/videos requires auth + ownership', () => {
  it('A — anonymous request is rejected with 401', async () => {
    const agent = await createAgent(prisma);
    const prop = await createProperty(prisma, { agentId: agent.id });
    await prisma.propertyVideo.create({
      data: {
        propertyId: prop.id,
        url: '/uploads/videos/foo.mp4',
        kind: 'upload',
        title: 'walkthrough.mp4',
        mimeType: 'video/mp4',
        sortOrder: 0,
      },
    });
    const res = await app.inject({
      method: 'GET',
      url: `/api/properties/${prop.id}/videos`,
    });
    expect(res.statusCode).toBe(401);
  });

  it('Az — different agent gets 404 (cross-agent isolation)', async () => {
    const [a, b] = await Promise.all([createAgent(prisma), createAgent(prisma)]);
    const prop = await createProperty(prisma, { agentId: a.id });
    await prisma.propertyVideo.create({
      data: {
        propertyId: prop.id,
        url: '/uploads/videos/bar.mp4',
        kind: 'upload',
        title: 'private.mp4',
        mimeType: 'video/mp4',
        sortOrder: 0,
      },
    });
    const cookieB = await loginAs(app, b.email, b._plainPassword);
    const res = await app.inject({
      method: 'GET',
      url: `/api/properties/${prop.id}/videos`,
      headers: { cookie: cookieB },
    });
    expect(res.statusCode).toBe(404);
  });

  it('H — owning agent gets the videos list (200)', async () => {
    const agent = await createAgent(prisma);
    const prop = await createProperty(prisma, { agentId: agent.id });
    await prisma.propertyVideo.create({
      data: {
        propertyId: prop.id,
        url: '/uploads/videos/baz.mp4',
        kind: 'upload',
        title: 'tour.mp4',
        mimeType: 'video/mp4',
        sortOrder: 0,
      },
    });
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'GET',
      url: `/api/properties/${prop.id}/videos`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body.videos)).toBe(true);
    expect(body.videos).toHaveLength(1);
    expect(body.videos[0].title).toBe('tour.mp4');
  });
});
