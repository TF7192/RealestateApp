import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createAgent } from '../../factories/user.factory.js';
import { createLead } from '../../factories/lead.factory.js';
import { loginAs } from '../../helpers/auth.js';
import { prisma } from '../../setup/integration.setup.js';

// Mock the Anthropic SDK *before* importing the server so the route's
// `new Anthropic({...})` picks up our fake. Vitest hoists vi.mock()
// above imports at transform time — same pattern as ai-match.test.ts.
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

async function seedMeeting(agentId: string, leadId: string) {
  return prisma.leadMeeting.create({
    data: {
      agentId,
      leadId,
      title: 'פגישת היכרות',
      startsAt: new Date('2026-05-10T09:00:00Z'),
      endsAt:   new Date('2026-05-10T09:30:00Z'),
    },
  });
}

describe('POST /api/ai/meeting-brief', () => {
  it('A — 401 without a signed-in cookie', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/ai/meeting-brief',
      payload: { meetingId: 'some-id' },
    });
    expect(res.statusCode).toBe(401);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('404 — meeting missing / cross-agent (no existence leak)', async () => {
    const [agentA, agentB] = await Promise.all([
      createAgent(prisma),
      createAgent(prisma),
    ]);
    const leadB = await createLead(prisma, { agentId: agentB.id });
    const meeting = await seedMeeting(agentB.id, leadB.id);
    const cookie = await loginAs(app, agentA.email, agentA._plainPassword);

    const res = await app.inject({
      method: 'POST',
      url: '/api/ai/meeting-brief',
      headers: { cookie },
      payload: { meetingId: meeting.id },
    });
    expect(res.statusCode).toBe(404);
    expect(mockCreate).not.toHaveBeenCalled();

    const res2 = await app.inject({
      method: 'POST',
      url: '/api/ai/meeting-brief',
      headers: { cookie },
      payload: { meetingId: 'meeting-nope' },
    });
    expect(res2.statusCode).toBe(404);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('H — happy path: returns brief + checklist + talkingPoints, SDK hit once with opus-4-7', async () => {
    const agent = await createAgent(prisma);
    const lead = await createLead(prisma, {
      agentId: agent.id,
      name: 'דני לוי',
      city: 'תל אביב',
    });
    const meeting = await seedMeeting(agent.id, lead.id);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);

    mockCreate.mockResolvedValueOnce({
      content: [{
        type: 'text',
        text:
          '<brief>דני מגיע לפגישת היכרות ראשונה — מחפש דירת 4 חדרים בתל אביב. המטרה היא להבין את הצרכים ולהציג 2-3 נכסים רלוונטיים.</brief>\n' +
          '<check>להביא פרטי שלושה נכסים רלוונטיים</check>\n' +
          '<check>לוודא אישור משכנתא</check>\n' +
          '<check>להכין חוזה בלעדיות</check>\n' +
          '<check>מים/קפה לפגישה</check>\n' +
          '<point>שאלת פתיחה על לוחות הזמנים</point>\n' +
          '<point>מה חשוב לו מעבר למיקום</point>\n' +
          '<point>האם יש מגבלת תקציב אמיתית</point>\n' +
          '<point>מי עוד מעורב בהחלטה</point>',
      }],
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/ai/meeting-brief',
      headers: { cookie },
      payload: { meetingId: meeting.id },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(typeof body.brief).toBe('string');
    expect(body.brief.length).toBeGreaterThan(0);
    expect(body.brief).toContain('דני');
    expect(Array.isArray(body.checklist)).toBe(true);
    expect(body.checklist).toHaveLength(4);
    expect(body.checklist[0]).toContain('נכסים');
    expect(Array.isArray(body.talkingPoints)).toBe(true);
    expect(body.talkingPoints).toHaveLength(4);

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockCreate.mock.calls[0][0].model).toBe('claude-opus-4-7');
  });
});

describe('AI meeting-brief — ANTHROPIC_API_KEY missing', () => {
  const ORIGINAL_KEY = process.env.ANTHROPIC_API_KEY;
  beforeAll(() => {
    delete process.env.ANTHROPIC_API_KEY;
  });
  afterAll(() => {
    if (ORIGINAL_KEY !== undefined) process.env.ANTHROPIC_API_KEY = ORIGINAL_KEY;
  });

  it('503 — surfaces ai_not_configured when the key is absent', async () => {
    const agent = await createAgent(prisma);
    const lead = await createLead(prisma, { agentId: agent.id });
    const meeting = await seedMeeting(agent.id, lead.id);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);

    const res = await app.inject({
      method: 'POST',
      url: '/api/ai/meeting-brief',
      headers: { cookie },
      payload: { meetingId: meeting.id },
    });
    expect(res.statusCode).toBe(503);
    expect(res.json().error.code).toBe('ai_not_configured');
    expect(mockCreate).not.toHaveBeenCalled();
  });
});
