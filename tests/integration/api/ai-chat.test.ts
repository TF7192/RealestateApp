import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createAgent } from '../../factories/user.factory.js';
import { loginAs } from '../../helpers/auth.js';

const mockCreate = vi.fn();
vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    messages = { create: mockCreate };
    constructor(_opts: unknown) {}
  },
}));

const { build } = await import('../../../backend/src/server.js');
const { prisma } = await import('../../setup/integration.setup.js');

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

describe('POST /api/ai/chat', () => {
  it('A — 401 without a signed-in cookie', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/ai/chat',
      payload: { messages: [{ role: 'user', content: 'שלום' }] },
    });
    expect(res.statusCode).toBe(401);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('H — happy path: forwards conversation to Claude, returns reply', async () => {
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);

    mockCreate.mockResolvedValueOnce({
      content: [{
        type: 'text',
        text: 'שלום! כיצד אוכל לעזור לך היום?',
      }],
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/ai/chat',
      headers: { cookie },
      payload: {
        messages: [{ role: 'user', content: 'היי, אני צריך עזרה עם ניסוח הודעה.' }],
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(typeof body.reply).toBe('string');
    expect(body.reply).toContain('שלום');

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const [callArgs] = mockCreate.mock.calls[0];
    expect(callArgs.model).toBe('claude-opus-4-7');
    expect(callArgs.messages).toHaveLength(1);
    expect(callArgs.messages[0].role).toBe('user');
  });
});
