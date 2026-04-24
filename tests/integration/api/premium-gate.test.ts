// Sprint 5.1 — Universal premium gate.
//
// Every 3rd-party-integration feature sits behind `requirePremium`.
// These tests lock the contract:
//   - non-premium user → 402 { error: 'PREMIUM_REQUIRED', feature }
//   - premium user     → 200 happy-path
// One test per guarded endpoint: describe-property, match-leads,
// match-properties, meeting summarize. The SDK and S3 put are mocked
// the same way the existing ai-describe / meeting-summarize suites do
// (vi.hoisted so the refs exist before vi.mock's factory runs).

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createAgent } from '../../factories/user.factory.js';
import { createProperty } from '../../factories/property.factory.js';
import { createLead } from '../../factories/lead.factory.js';
import { loginAs } from '../../helpers/auth.js';
import { prisma } from '../../setup/integration.setup.js';

const { mockCreate, s3Put } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
  s3Put: vi.fn(),
}));

vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    messages = { create: mockCreate };
    constructor(_opts: unknown) {}
  },
}));

// The meeting route dispatches to putMeetingAudio; mock it so we
// don't need real AWS creds in the test env.
vi.mock('../../../backend/src/lib/meetingAudio.js', () => ({
  putMeetingAudio: s3Put,
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
  s3Put.mockReset();
  // Default happy-path responses.
  mockCreate.mockResolvedValue({
    content: [{
      type: 'text',
      text:
        '<description>\n' +
        'תיאור שיווקי לדוגמה לנכס לדוגמה. דירה נעימה במיקום מרכזי.\n' +
        '</description>\n' +
        '<bullet>חדרים מרווחים</bullet>\n' +
        '<bullet>קומה גבוהה</bullet>\n' +
        '<bullet>מעלית</bullet>\n' +
        '<bullet>מיקום מרכזי</bullet>\n' +
        '<bullet>מצב מעולה</bullet>',
    }],
  });
  s3Put.mockImplementation(async ({ key }: { key: string }) => key);
});

afterEach(() => {
  vi.clearAllMocks();
});

// Multipart body helper — identical to the one the meeting-summarize
// suite uses, duplicated here to keep this file self-contained.
function audioMultipart(bytes: Uint8Array) {
  const boundary = '----estia-premium-boundary';
  const pre = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="audio"; filename="m.webm"\r\nContent-Type: audio/webm\r\n\r\n`,
    'utf8',
  );
  const post = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');
  const payload = Buffer.concat([pre, Buffer.from(bytes), post]);
  return {
    payload,
    headers: {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': String(payload.length),
    },
  };
}

describe('Sprint 5.1 — premium gate', () => {
  it('POST /api/ai/describe-property → 402 PREMIUM_REQUIRED for non-premium user', async () => {
    const agent = await createAgent(prisma, { isPremium: false });
    const property = await createProperty(prisma, { agentId: agent.id });
    const cookie = await loginAs(app, agent.email, agent._plainPassword);

    const res = await app.inject({
      method: 'POST',
      url: '/api/ai/describe-property',
      headers: { cookie },
      payload: { propertyId: property.id },
    });

    expect(res.statusCode).toBe(402);
    expect(res.json()).toEqual({
      error: 'PREMIUM_REQUIRED',
      feature: 'Estia AI',
    });
    // Gate must bail *before* the Anthropic call so we don't burn tokens.
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('POST /api/ai/describe-property → 200 for premium user (gate passes)', async () => {
    const agent = await createAgent(prisma, { isPremium: true });
    const property = await createProperty(prisma, { agentId: agent.id });
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
    expect(body.description.length).toBeGreaterThan(10);
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('GET /api/ai/match-leads → 402 PREMIUM_REQUIRED for non-premium user', async () => {
    const agent = await createAgent(prisma, { isPremium: false });
    const property = await createProperty(prisma, { agentId: agent.id });
    const cookie = await loginAs(app, agent.email, agent._plainPassword);

    const res = await app.inject({
      method: 'GET',
      url: `/api/ai/match-leads?propertyId=${property.id}`,
      headers: { cookie },
    });

    expect(res.statusCode).toBe(402);
    expect(res.json()).toEqual({
      error: 'PREMIUM_REQUIRED',
      feature: 'Estia AI',
    });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('GET /api/ai/match-properties → 402 PREMIUM_REQUIRED for non-premium user', async () => {
    const agent = await createAgent(prisma, { isPremium: false });
    const lead = await createLead(prisma, { agentId: agent.id });
    const cookie = await loginAs(app, agent.email, agent._plainPassword);

    const res = await app.inject({
      method: 'GET',
      url: `/api/ai/match-properties?leadId=${lead.id}`,
      headers: { cookie },
    });

    expect(res.statusCode).toBe(402);
    expect(res.json()).toEqual({
      error: 'PREMIUM_REQUIRED',
      feature: 'Estia AI',
    });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('POST /api/meetings/:id/summarize → 402 PREMIUM_REQUIRED for non-premium user', async () => {
    const agent = await createAgent(prisma, { isPremium: false });
    const lead = await createLead(prisma, { agentId: agent.id });
    const meeting = await prisma.leadMeeting.create({
      data: {
        agentId: agent.id,
        leadId: lead.id,
        title: 'פגישה',
        startsAt: new Date('2026-05-01T10:00:00Z'),
        endsAt:   new Date('2026-05-01T10:30:00Z'),
      },
    });
    const cookie = await loginAs(app, agent.email, agent._plainPassword);

    const { payload, headers } = audioMultipart(new Uint8Array([1, 2, 3]));
    const res = await app.inject({
      method: 'POST',
      url: `/api/meetings/${meeting.id}/summarize`,
      headers: { cookie, ...headers },
      payload,
    });

    expect(res.statusCode).toBe(402);
    expect(res.json()).toEqual({
      error: 'PREMIUM_REQUIRED',
      feature: 'סיכום פגישות',
    });
    // Neither Anthropic nor S3 should have been touched.
    expect(mockCreate).not.toHaveBeenCalled();
    expect(s3Put).not.toHaveBeenCalled();
  });
});
