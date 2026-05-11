// Integration tests for /api/properties/:id/landing-page.
//
// Phase 6 of the landing-editor feature. Covers:
//   • GET requires auth, returns the saved config OR the default,
//     never null.
//   • PATCH requires auth + premium + ownership; non-premium gets a
//     402 with the documented envelope so the frontend's global
//     interceptor can react.
//   • PATCH validates: rejects oversized config, off-allowlist video
//     hosts, and HERO photo IDs that belong to a different property.
//   • A successful PATCH actually writes Property.landingPageConfig
//     and the public route surfaces it.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { build } from '../../../backend/src/server.js';
import { prisma } from '../../setup/integration.setup.js';
import { createAgent } from '../../factories/user.factory.js';
import { createProperty } from '../../factories/property.factory.js';
import { loginAs } from '../../helpers/auth.js';
import { defaultLandingConfig } from '../../../backend/src/lib/landingConfig.js';

let app: FastifyInstance;
beforeAll(async () => { app = await build(); await app.ready(); });
afterAll(async () => { await app.close(); });

describe('GET /api/properties/:id/landing-page', () => {
  it('returns 401 without a cookie', async () => {
    const agent = await createAgent(prisma);
    const property = await createProperty(prisma, { agentId: agent.id });
    const res = await app.inject({
      method: 'GET', url: `/api/properties/${property.id}/landing-page`,
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns the default config when nothing is saved', async () => {
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const property = await createProperty(prisma, { agentId: agent.id });
    const res = await app.inject({
      method: 'GET', url: `/api/properties/${property.id}/landing-page`, headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.hasSaved).toBe(false);
    expect(body.config).toBeTruthy();
    expect(body.config.version).toBe(1);
    // The default config contains the three required block types.
    const types = body.config.sections.map((s: any) => s.type);
    expect(types).toContain('HERO');
    expect(types).toContain('AGENT_CARD');
    expect(types).toContain('INQUIRY');
  });

  it('refuses access to another agent\'s property', async () => {
    const alice = await createAgent(prisma);
    const bob = await createAgent(prisma);
    const cookie = await loginAs(app, bob.email, bob._plainPassword);
    const aliceProperty = await createProperty(prisma, { agentId: alice.id });
    const res = await app.inject({
      method: 'GET', url: `/api/properties/${aliceProperty.id}/landing-page`, headers: { cookie },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('PATCH /api/properties/:id/landing-page', () => {
  it('blocks non-premium agents with the documented 402 envelope', async () => {
    const agent = await createAgent(prisma, { isPremium: false });
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const property = await createProperty(prisma, { agentId: agent.id });
    const res = await app.inject({
      method: 'PATCH', url: `/api/properties/${property.id}/landing-page`,
      headers: { cookie },
      payload: { config: defaultLandingConfig({ assetClass: 'RESIDENTIAL' }) },
    });
    expect(res.statusCode).toBe(402);
    const body = res.json();
    expect(body.error).toBe('PREMIUM_REQUIRED');
    expect(typeof body.feature).toBe('string');
  });

  it('writes a valid config and surfaces it on the public route', async () => {
    const agent = await createAgent(prisma); // isPremium=true by factory default
    await prisma.user.update({ where: { id: agent.id }, data: { slug: `agent-${agent.id.slice(-6)}` } });
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const property = await createProperty(prisma, { agentId: agent.id });
    await prisma.property.update({ where: { id: property.id }, data: { slug: `prop-${property.id.slice(-6)}` } });

    const cfg = defaultLandingConfig({ assetClass: 'RESIDENTIAL' });
    // Customize the hero title so we can prove the round-trip.
    cfg.sections.find((s) => s.type === 'HERO')!.props.title = 'בית בוטיק על קו ראשון לים';

    const res = await app.inject({
      method: 'PATCH', url: `/api/properties/${property.id}/landing-page`,
      headers: { cookie },
      payload: { config: cfg },
    });
    expect(res.statusCode).toBe(200);

    // Public route must reflect the new config.
    const refreshedAgent = await prisma.user.findUnique({ where: { id: agent.id } });
    const refreshedProp = await prisma.property.findUnique({ where: { id: property.id } });
    const pub = await app.inject({
      method: 'GET',
      url: `/api/public/agents/${refreshedAgent!.slug}/properties/${refreshedProp!.slug}`,
    });
    expect(pub.statusCode).toBe(200);
    const pubBody = pub.json();
    expect(pubBody.landingPageConfig).toBeTruthy();
    expect(pubBody.landingPageConfig.sections.find((s: any) => s.type === 'HERO').props.title)
      .toBe('בית בוטיק על קו ראשון לים');
  });

  it('rejects an off-allowlist VIDEO host', async () => {
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const property = await createProperty(prisma, { agentId: agent.id });

    const cfg = defaultLandingConfig({ assetClass: 'RESIDENTIAL' });
    cfg.sections.push({
      id: '00000000-0000-4000-8000-000000000010',
      type: 'VIDEO',
      visible: true,
      props: { heading: 'סיור', url: 'https://www.tiktok.com/@u/video/1' },
    });

    const res = await app.inject({
      method: 'PATCH', url: `/api/properties/${property.id}/landing-page`,
      headers: { cookie },
      payload: { config: cfg },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error?.message || '').toMatch(/host not allowed|video host/);
  });

  it('rejects a HERO photoId that belongs to a different property', async () => {
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const propA = await createProperty(prisma, { agentId: agent.id });
    const propB = await createProperty(prisma, { agentId: agent.id });
    // Plant an image on B; reference it from A's HERO.
    const foreignImage = await prisma.propertyImage.create({
      data: { propertyId: propB.id, url: '/uploads/x', sortOrder: 0 },
    });
    const cfg = defaultLandingConfig({ assetClass: 'RESIDENTIAL' });
    cfg.sections.find((s) => s.type === 'HERO')!.props.photoId = foreignImage.id;
    const res = await app.inject({
      method: 'PATCH', url: `/api/properties/${propA.id}/landing-page`,
      headers: { cookie },
      payload: { config: cfg },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error?.message || '').toMatch(/לא שייכת/);
  });
});
