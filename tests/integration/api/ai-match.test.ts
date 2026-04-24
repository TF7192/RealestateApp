import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createAgent } from '../../factories/user.factory.js';
import { createProperty } from '../../factories/property.factory.js';
import { createLead } from '../../factories/lead.factory.js';
import { loginAs } from '../../helpers/auth.js';
import { prisma } from '../../setup/integration.setup.js';

// Mock the Anthropic SDK *before* importing the server so the routes'
// `new Anthropic(...)` call (via backend/src/lib/anthropic.ts) picks up
// our fake. Vitest hoists vi.mock() above imports at transform time.
const mockCreate = vi.fn();
vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: class MockAnthropic {
      messages = { create: mockCreate };
      constructor(_opts: unknown) {}
    },
  };
});

const { build } = await import('../../../backend/src/server.js');

let app: FastifyInstance;

beforeAll(async () => {
  // A set key routes through the mock; the missing-key case lives in
  // its own describe block that deletes it at runtime.
  process.env.ANTHROPIC_API_KEY = 'test-key';
  process.env.RATE_LIMIT_MAX_PER_MIN = '10000';
  app = await build();
  await app.ready();
});

afterAll(async () => {
  await app.close();
  delete process.env.ANTHROPIC_API_KEY;
});

/**
 * Build a mock Anthropic `messages.create` response that returns an
 * XML <matches>...</matches> block keyed on the ids we want to rank.
 * The route parses this regex-wise, so it tolerates the extra
 * whitespace / emoji that a real Claude response might add.
 */
function matchesText(picks: { id: string; score: number; reason: string }[]) {
  return (
    '<matches>\n' +
    picks.map((p) => `<match id="${p.id}" score="${p.score}">${p.reason}</match>`).join('\n') +
    '\n</matches>'
  );
}

beforeEach(() => {
  mockCreate.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/ai/match-leads', () => {
  it('A — 401 without a signed-in cookie', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/ai/match-leads?propertyId=anything',
    });
    expect(res.statusCode).toBe(401);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('404 — property not found / cross-agent (no existence leak)', async () => {
    // Two agents; property owned by B, signed in as A.
    const [agentA, agentB] = await Promise.all([
      createAgent(prisma),
      createAgent(prisma),
    ]);
    const property = await createProperty(prisma, { agentId: agentB.id });
    const cookie = await loginAs(app, agentA.email, agentA._plainPassword);

    const res = await app.inject({
      method: 'GET',
      url: `/api/ai/match-leads?propertyId=${property.id}`,
      headers: { cookie },
    });
    // Per the house pattern, same 404 for missing + wrong-owner so the
    // response doesn't reveal that another agent holds this property.
    expect(res.statusCode).toBe(404);
    expect(mockCreate).not.toHaveBeenCalled();

    // Also a genuinely missing id returns 404.
    const res2 = await app.inject({
      method: 'GET',
      url: '/api/ai/match-leads?propertyId=prop-nope',
      headers: { cookie },
    });
    expect(res2.statusCode).toBe(404);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('H — happy path: top-5 leads returned with score + reason, SDK hit once with opus-4-7', async () => {
    const agent = await createAgent(prisma);
    const property = await createProperty(prisma, {
      agentId: agent.id,
      city: 'תל אביב',
      marketingPrice: 3_000_000,
      rooms: 4,
    });
    // Three leads — the mock will pick two as top matches.
    const [lead1, lead2, lead3] = await Promise.all([
      createLead(prisma, { agentId: agent.id, name: 'אבי כהן',  city: 'תל אביב' }),
      createLead(prisma, { agentId: agent.id, name: 'רונית לוי', city: 'תל אביב' }),
      createLead(prisma, { agentId: agent.id, name: 'דן ישראלי', city: 'חיפה' }),
    ]);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);

    mockCreate.mockResolvedValueOnce({
      content: [
        {
          type: 'text',
          text: matchesText([
            { id: lead1.id, score: 92, reason: 'תקציב תואם, באותה עיר' },
            { id: lead2.id, score: 78, reason: 'עיר תואמת, מחיר קצת גבוה' },
            // Also include an id that's not in the candidate list — the
            // route should filter it out instead of blowing up.
            { id: 'bogus-id',  score: 50, reason: 'לא אמור להופיע' },
          ]),
        },
      ],
    });

    const res = await app.inject({
      method: 'GET',
      url: `/api/ai/match-leads?propertyId=${property.id}`,
      headers: { cookie },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body.matches)).toBe(true);
    expect(body.matches).toHaveLength(2); // bogus-id filtered out
    expect(body.matches[0].lead.id).toBe(lead1.id);
    expect(body.matches[0].lead.name).toBe('אבי כהן');
    expect(body.matches[0].score).toBe(92);
    expect(body.matches[0].reason).toContain('תקציב');
    expect(body.matches[1].lead.id).toBe(lead2.id);

    // Off-city lead wasn't in the mock's picks → shouldn't leak into the
    // response. Also validates score 50 (the bogus one) didn't sneak in.
    expect(body.matches.find((m: any) => m.lead.id === lead3.id)).toBeUndefined();

    // Guard against a silent model downgrade.
    expect(mockCreate).toHaveBeenCalledTimes(1);
    const [callArgs] = mockCreate.mock.calls[0];
    expect(callArgs.model).toBe('claude-opus-4-7');
    // The prompt must ship the candidate inventory so Claude can pick.
    const userMessage = callArgs.messages?.[0]?.content ?? '';
    expect(userMessage).toContain(lead1.id);
    expect(userMessage).toContain(lead2.id);
    expect(userMessage).toContain(lead3.id);
  });
});

describe('GET /api/ai/match-properties', () => {
  it('404 — lead belongs to another agent', async () => {
    const [agentA, agentB] = await Promise.all([
      createAgent(prisma),
      createAgent(prisma),
    ]);
    const lead = await createLead(prisma, { agentId: agentB.id });
    const cookie = await loginAs(app, agentA.email, agentA._plainPassword);

    const res = await app.inject({
      method: 'GET',
      url: `/api/ai/match-properties?leadId=${lead.id}`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(404);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('H — happy path: top-5 properties with score + reason', async () => {
    const agent = await createAgent(prisma);
    const lead = await createLead(prisma, {
      agentId: agent.id,
      city: 'תל אביב',
    });
    const [p1, p2] = await Promise.all([
      createProperty(prisma, { agentId: agent.id, city: 'תל אביב', rooms: 4 }),
      createProperty(prisma, { agentId: agent.id, city: 'תל אביב', rooms: 3 }),
    ]);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);

    mockCreate.mockResolvedValueOnce({
      content: [
        {
          type: 'text',
          text: matchesText([
            { id: p1.id, score: 88, reason: 'מתאים לתקציב וחדרים' },
            { id: p2.id, score: 65, reason: 'עיר תואמת, חדר אחד פחות' },
          ]),
        },
      ],
    });

    const res = await app.inject({
      method: 'GET',
      url: `/api/ai/match-properties?leadId=${lead.id}`,
      headers: { cookie },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.matches).toHaveLength(2);
    expect(body.matches[0].property.id).toBe(p1.id);
    expect(body.matches[0].score).toBe(88);
    expect(body.matches[0].reason).toContain('תקציב');
    expect(body.matches[1].property.id).toBe(p2.id);

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockCreate.mock.calls[0][0].model).toBe('claude-opus-4-7');
  });
});

describe('AI matcher — ANTHROPIC_API_KEY missing', () => {
  // buildAnthropic() re-reads process.env on every call, so unsetting
  // at runtime is sufficient to flip the route onto its 503 branch.
  const ORIGINAL_KEY = process.env.ANTHROPIC_API_KEY;
  beforeAll(() => {
    delete process.env.ANTHROPIC_API_KEY;
  });
  afterAll(() => {
    if (ORIGINAL_KEY !== undefined) process.env.ANTHROPIC_API_KEY = ORIGINAL_KEY;
  });

  it('503 — both endpoints surface ai_not_configured when the key is absent', async () => {
    const agent = await createAgent(prisma);
    const [property, lead] = await Promise.all([
      createProperty(prisma, { agentId: agent.id }),
      createLead(prisma, { agentId: agent.id }),
    ]);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);

    const resLeads = await app.inject({
      method: 'GET',
      url: `/api/ai/match-leads?propertyId=${property.id}`,
      headers: { cookie },
    });
    expect(resLeads.statusCode).toBe(503);
    expect(resLeads.json().error.code).toBe('ai_not_configured');

    const resProps = await app.inject({
      method: 'GET',
      url: `/api/ai/match-properties?leadId=${lead.id}`,
      headers: { cookie },
    });
    expect(resProps.statusCode).toBe(503);
    expect(resProps.json().error.code).toBe('ai_not_configured');

    // The SDK mock must not have been invoked on either call — the
    // route short-circuits before reaching the client.
    expect(mockCreate).not.toHaveBeenCalled();
  });
});
