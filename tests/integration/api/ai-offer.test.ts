import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createAgent } from '../../factories/user.factory.js';
import { createProperty } from '../../factories/property.factory.js';
import { loginAs } from '../../helpers/auth.js';
import { prisma } from '../../setup/integration.setup.js';

const mockCreate = vi.fn();
vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    messages = { create: mockCreate };
    constructor(_opts: unknown) {}
  },
}));

const { build } = await import('../../../backend/src/server.js');

let app: FastifyInstance;

beforeAll(async () => {
  process.env.ANTHROPIC_API_KEY = 'test-key';
  process.env.RATE_LIMIT_MAX_PER_MIN = '10000';
  app = await build();
  await app.ready();
});

afterAll(async () => {
  await app.close();
  delete process.env.ANTHROPIC_API_KEY;
});

beforeEach(() => {
  mockCreate.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

async function seedDeal(agentId: string, propertyId: string | null = null) {
  return prisma.deal.create({
    data: {
      agentId,
      propertyId,
      propertyStreet: 'הרצל 20',
      city: 'תל אביב',
      assetClass: 'RESIDENTIAL',
      category: 'SALE',
      marketingPrice: 3_000_000,
      status: 'NEGOTIATING',
    },
  });
}

describe('POST /api/ai/offer-review', () => {
  it('A — 401 without a signed-in cookie', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/ai/offer-review',
      payload: { dealId: 'some-id', offerAmount: 2_800_000 },
    });
    expect(res.statusCode).toBe(401);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('404 — deal belongs to another agent / deal missing', async () => {
    const [agentA, agentB] = await Promise.all([
      createAgent(prisma),
      createAgent(prisma),
    ]);
    const deal = await seedDeal(agentB.id);
    const cookie = await loginAs(app, agentA.email, agentA._plainPassword);

    const res = await app.inject({
      method: 'POST',
      url: '/api/ai/offer-review',
      headers: { cookie },
      payload: { dealId: deal.id, offerAmount: 2_700_000 },
    });
    expect(res.statusCode).toBe(404);
    expect(mockCreate).not.toHaveBeenCalled();

    const res2 = await app.inject({
      method: 'POST',
      url: '/api/ai/offer-review',
      headers: { cookie },
      payload: { dealId: 'deal-nope', offerAmount: 2_700_000 },
    });
    expect(res2.statusCode).toBe(404);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('H — happy path: returns recommendedCounter + confidence + reasoning', async () => {
    const agent = await createAgent(prisma);
    const property = await createProperty(prisma, {
      agentId: agent.id,
      city: 'תל אביב',
      marketingPrice: 3_000_000,
      rooms: 4,
    });
    const deal = await prisma.deal.create({
      data: {
        agentId: agent.id,
        propertyId: property.id,
        propertyStreet: property.street,
        city: property.city,
        assetClass: 'RESIDENTIAL',
        category: 'SALE',
        marketingPrice: 3_000_000,
        status: 'NEGOTIATING',
      },
    });
    // Seed a couple of comparables in the same city so the prompt has
    // nearby context to work with.
    await Promise.all([
      createProperty(prisma, { agentId: agent.id, city: 'תל אביב', marketingPrice: 2_950_000 }),
      createProperty(prisma, { agentId: agent.id, city: 'תל אביב', marketingPrice: 3_100_000 }),
    ]);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);

    mockCreate.mockResolvedValueOnce({
      content: [{
        type: 'text',
        text:
          '<counter>2900000</counter>\n' +
          '<confidence>medium</confidence>\n' +
          '<reasoning>ההצעה נמוכה ב-10% ממחיר השיווק. נכסים דומים בעיר מתומחרים בטווח דומה, ולכן מחיר נגדי של 2.9M מתאים.</reasoning>',
      }],
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/ai/offer-review',
      headers: { cookie },
      payload: { dealId: deal.id, offerAmount: 2_700_000 },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.recommendedCounter).toBe(2_900_000);
    expect(body.confidence).toBe('medium');
    expect(body.reasoning).toContain('ההצעה');

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockCreate.mock.calls[0][0].model).toBe('claude-opus-4-7');
  });
});

describe('AI offer-review — ANTHROPIC_API_KEY missing', () => {
  const ORIGINAL_KEY = process.env.ANTHROPIC_API_KEY;
  beforeAll(() => { delete process.env.ANTHROPIC_API_KEY; });
  afterAll(() => {
    if (ORIGINAL_KEY !== undefined) process.env.ANTHROPIC_API_KEY = ORIGINAL_KEY;
  });

  it('503 — surfaces ai_not_configured when the key is absent', async () => {
    const agent = await createAgent(prisma);
    const deal = await seedDeal(agent.id);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);

    const res = await app.inject({
      method: 'POST',
      url: '/api/ai/offer-review',
      headers: { cookie },
      payload: { dealId: deal.id, offerAmount: 2_800_000 },
    });
    expect(res.statusCode).toBe(503);
    expect(res.json().error.code).toBe('ai_not_configured');
    expect(mockCreate).not.toHaveBeenCalled();
  });
});
