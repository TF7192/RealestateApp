import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createAgent } from '../../factories/user.factory.js';
import { createProperty } from '../../factories/property.factory.js';
import { loginAs } from '../../helpers/auth.js';
import { prisma } from '../../setup/integration.setup.js';

// Mock the Anthropic SDK *before* importing the server so the route's
// `new Anthropic({...})` call picks up our fake. Vitest hoists this
// above the import statements at transform time.
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
  // Set the key so the route builds the client and hits the mock. The
  // explicit 503-when-missing path is exercised by leaving this unset
  // in the dedicated test (see the describe block below).
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
  // Default happy-path response — individual tests override with
  // mockResolvedValueOnce / mockRejectedValueOnce.
  mockCreate.mockReset();
  mockCreate.mockResolvedValue({
    content: [
      {
        type: 'text',
        text:
          '<description>\n' +
          'דירת 4 חדרים מרווחת ברחוב הרצל בתל אביב. הנכס משתרע על פני 100 מ"ר ומתאים למשפחה. הקומה הגבוהה מעניקה פרטיות ונוף, והמעלית מקלה על הנגישות. המטבח המחודש והמרפסת הגדולה הופכים את הדירה לפנינה אמיתית במרכז העיר. קרוב לתחבורה ציבורית ולמרכזי קניות.\n' +
          '</description>\n' +
          '<bullet>4 חדרים מרווחים</bullet>\n' +
          '<bullet>קומה גבוהה עם נוף פתוח</bullet>\n' +
          '<bullet>מעלית ומרפסת</bullet>\n' +
          '<bullet>מיקום מרכזי</bullet>\n' +
          '<bullet>מטבח מחודש</bullet>',
      },
    ],
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/ai/describe-property', () => {
  it('A — 401 without a signed-in cookie', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/ai/describe-property',
      payload: { propertyId: 'anything' },
    });
    expect(res.statusCode).toBe(401);
    // Mock must not have been called — auth gates first.
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('404 — property not found', async () => {
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'POST',
      url: '/api/ai/describe-property',
      headers: { cookie },
      payload: { propertyId: 'prop-nope-does-not-exist' },
    });
    expect(res.statusCode).toBe(404);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('404 — property belongs to another agent (cross-agent isolation)', async () => {
    const [agentA, agentB] = await Promise.all([
      createAgent(prisma),
      createAgent(prisma),
    ]);
    // Property owned by agentB.
    const property = await createProperty(prisma, { agentId: agentB.id });
    // Signed in as agentA.
    const cookie = await loginAs(app, agentA.email, agentA._plainPassword);
    const res = await app.inject({
      method: 'POST',
      url: '/api/ai/describe-property',
      headers: { cookie },
      payload: { propertyId: property.id },
    });
    // House pattern: 404 for both "not found" and "wrong owner" so we
    // don't leak the existence of another agent's property.
    expect(res.statusCode).toBe(404);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('H — happy path: returns description + 5 highlights, calls SDK once with claude-opus-4-7', async () => {
    const agent = await createAgent(prisma);
    const property = await createProperty(prisma, {
      agentId: agent.id,
      street: 'הרצל',
      city: 'תל אביב',
      rooms: 4,
      sqm: 100,
    });
    const cookie = await loginAs(app, agent.email, agent._plainPassword);

    const res = await app.inject({
      method: 'POST',
      url: '/api/ai/describe-property',
      headers: { cookie },
      payload: { propertyId: property.id },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(typeof body.description).toBe('string');
    expect(body.description.length).toBeGreaterThan(30);
    expect(body.description).toContain('דירת');
    expect(Array.isArray(body.highlights)).toBe(true);
    expect(body.highlights).toHaveLength(5);
    expect(body.highlights[0]).toBe('4 חדרים מרווחים');

    // Assert we actually reached for the right model. Guards against a
    // future refactor that silently downgrades to sonnet/haiku.
    expect(mockCreate).toHaveBeenCalledTimes(1);
    const [callArgs] = mockCreate.mock.calls[0];
    expect(callArgs.model).toBe('claude-opus-4-7');
    // Prompt must carry the property's address so the model can anchor
    // on real facts rather than hallucinating.
    const userMessage = callArgs.messages?.[0]?.content ?? '';
    expect(userMessage).toContain('הרצל');
    expect(userMessage).toContain('תל אביב');
  });
});

describe('POST /api/ai/describe-property — ANTHROPIC_API_KEY missing', () => {
  // Rebuild a fresh app with the env var cleared so the "not configured"
  // branch fires. buildAnthropic() reads process.env on each call, so
  // unsetting at test-time is sufficient — no app restart needed.
  const ORIGINAL_KEY = process.env.ANTHROPIC_API_KEY;

  beforeAll(() => {
    delete process.env.ANTHROPIC_API_KEY;
  });

  afterAll(() => {
    if (ORIGINAL_KEY !== undefined) process.env.ANTHROPIC_API_KEY = ORIGINAL_KEY;
  });

  it('503 — clean error envelope when the key is absent', async () => {
    const agent = await createAgent(prisma);
    const property = await createProperty(prisma, { agentId: agent.id });
    const cookie = await loginAs(app, agent.email, agent._plainPassword);

    const res = await app.inject({
      method: 'POST',
      url: '/api/ai/describe-property',
      headers: { cookie },
      payload: { propertyId: property.id },
    });

    expect(res.statusCode).toBe(503);
    expect(res.json().error.code).toBe('ai_not_configured');
    // And the SDK wasn't called (we never reached the try/catch).
    expect(mockCreate).not.toHaveBeenCalled();
  });
});
