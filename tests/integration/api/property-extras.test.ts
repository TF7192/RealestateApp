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

// Sprint 3 / MLS parity — Tasks J4–J7. Property extras round-trip.
describe('PATCH /api/properties/:id — J4..J7 extras', () => {
  it('H — accepts condition + heatingTypes[] + extras flags and persists them', async () => {
    const agent = await createAgent(prisma);
    const prop = await createProperty(prisma, { agentId: agent.id });
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/properties/${prop.id}`,
      headers: { cookie },
      payload: {
        condition:    'RENOVATED',
        heatingTypes: ['GAS', 'FLOOR_HEATING'],
        halfRooms:    1,
        masterBedroom: true,
        bathrooms:    2,
        toilets:      2,
        furnished:    true,
        petFriendly:  true,
        doormenService: true,
        gym:          true,
        pool:         false,
        gatedCommunity: true,
        accessibility: true,
        utilityRoom:  true,
        listingSource: 'yad2',
      },
    });
    expect(res.statusCode).toBe(200);
    const after = await prisma.property.findUnique({ where: { id: prop.id } });
    expect(after?.condition).toBe('RENOVATED');
    expect(after?.heatingTypes).toEqual(['GAS', 'FLOOR_HEATING']);
    expect(after?.halfRooms).toBe(1);
    expect(after?.masterBedroom).toBe(true);
    expect(after?.bathrooms).toBe(2);
    expect(after?.furnished).toBe(true);
    expect(after?.gatedCommunity).toBe(true);
    expect(after?.listingSource).toBe('yad2');
  });

  it('V — 400 on invalid condition enum', async () => {
    const agent = await createAgent(prisma);
    const prop = await createProperty(prisma, { agentId: agent.id });
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/properties/${prop.id}`,
      headers: { cookie },
      payload: { condition: 'NOT_A_CONDITION' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('Edge — defaults on newly-created property (boolean flags false, heating empty)', async () => {
    const agent = await createAgent(prisma);
    const prop = await createProperty(prisma, { agentId: agent.id });
    const row = await prisma.property.findUnique({ where: { id: prop.id } });
    expect(row?.heatingTypes).toEqual([]);
    expect(row?.furnished).toBe(false);
    expect(row?.masterBedroom).toBe(false);
    expect(row?.doormenService).toBe(false);
    expect(row?.gym).toBe(false);
    expect(row?.pool).toBe(false);
    expect(row?.condition).toBeNull();
  });
});
