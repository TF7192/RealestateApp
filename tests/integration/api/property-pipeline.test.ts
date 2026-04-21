import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { build } from '../../../backend/src/server.js';
import { prisma } from '../../setup/integration.setup.js';
import { createAgent } from '../../factories/user.factory.js';
import { createProperty } from '../../factories/property.factory.js';
import { loginAs } from '../../helpers/auth.js';

let app: FastifyInstance;
beforeAll(async () => { app = await build(); await app.ready(); });
afterAll(async () => { await app.close(); });

// Sprint 1 / MLS parity — Task J9. Extended PropertyStatus values
// (INACTIVE/CANCELLED/IN_DEAL) + new PropertyStage pipeline + admin
// fields on the property record.
describe('Property pipeline + admin block (J9)', () => {
  it('H — new rows default to stage=IN_PROGRESS', async () => {
    const agent = await createAgent(prisma);
    const prop = await createProperty(prisma, { agentId: agent.id });
    const fresh = await prisma.property.findUnique({ where: { id: prop.id } });
    expect(fresh?.stage).toBe('IN_PROGRESS');
  });

  it('H — PATCH can set stage + agentCommissionPct + exclusivityExpire + sellerSeriousness', async () => {
    const agent = await createAgent(prisma);
    const prop = await createProperty(prisma, { agentId: agent.id });
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'PATCH', url: `/api/properties/${prop.id}`, headers: { cookie },
      payload: {
        stage: 'SIGNED_EXCLUSIVE',
        agentCommissionPct: 2.5,
        exclusivityExpire: '2026-10-01T00:00:00.000Z',
        sellerSeriousness: 'VERY',
        brokerNotes: 'מוכן לסגירה מיידית',
      },
    });
    expect(res.statusCode).toBe(200);
    const after = await prisma.property.findUnique({ where: { id: prop.id } });
    expect(after?.stage).toBe('SIGNED_EXCLUSIVE');
    expect(after?.agentCommissionPct).toBe(2.5);
    expect(after?.exclusivityExpire?.toISOString()).toBe('2026-10-01T00:00:00.000Z');
    expect(after?.sellerSeriousness).toBe('VERY');
    expect(after?.brokerNotes).toBe('מוכן לסגירה מיידית');
  });

  it('V — 400 on unknown stage value', async () => {
    const agent = await createAgent(prisma);
    const prop = await createProperty(prisma, { agentId: agent.id });
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'PATCH', url: `/api/properties/${prop.id}`, headers: { cookie },
      payload: { stage: 'NOT_A_STAGE' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('H — extended PropertyStatus values round-trip (INACTIVE / CANCELLED / IN_DEAL)', async () => {
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    for (const status of ['INACTIVE', 'CANCELLED', 'IN_DEAL'] as const) {
      const prop = await createProperty(prisma, { agentId: agent.id });
      const res = await app.inject({
        method: 'PATCH', url: `/api/properties/${prop.id}`, headers: { cookie },
        payload: { status },
      });
      expect(res.statusCode).toBe(200);
      const after = await prisma.property.findUnique({ where: { id: prop.id } });
      expect(after?.status).toBe(status);
    }
  });

  it('H — PATCH sets primaryAgentId (reassign within office)', async () => {
    const [a, b] = await Promise.all([createAgent(prisma), createAgent(prisma)]);
    const prop = await createProperty(prisma, { agentId: a.id });
    const cookie = await loginAs(app, a.email, a._plainPassword);
    const res = await app.inject({
      method: 'PATCH', url: `/api/properties/${prop.id}`, headers: { cookie },
      payload: { primaryAgentId: b.id },
    });
    expect(res.statusCode).toBe(200);
    const after = await prisma.property.findUnique({ where: { id: prop.id } });
    expect(after?.primaryAgentId).toBe(b.id);
    // Ownership unchanged — agentId stays on A.
    expect(after?.agentId).toBe(a.id);
  });

  it('Az — 404 when someone else tries to tweak pipeline fields', async () => {
    const [a, b] = await Promise.all([createAgent(prisma), createAgent(prisma)]);
    const bProp = await createProperty(prisma, { agentId: b.id });
    const cookie = await loginAs(app, a.email, a._plainPassword);
    const res = await app.inject({
      method: 'PATCH', url: `/api/properties/${bProp.id}`, headers: { cookie },
      payload: { stage: 'REMOVED' },
    });
    expect(res.statusCode).toBe(404);
    const after = await prisma.property.findUnique({ where: { id: bProp.id } });
    expect(after?.stage).toBe('IN_PROGRESS');
  });

  it('V — 400 on commission over 100%', async () => {
    const agent = await createAgent(prisma);
    const prop = await createProperty(prisma, { agentId: agent.id });
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'PATCH', url: `/api/properties/${prop.id}`, headers: { cookie },
      payload: { agentCommissionPct: 120 },
    });
    expect(res.statusCode).toBe(400);
  });
});
