import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createAgent } from '../../factories/user.factory.js';
import { createLead } from '../../factories/lead.factory.js';
import { loginAs } from '../../helpers/auth.js';
import { prisma } from '../../setup/integration.setup.js';

// Mock the Anthropic SDK + S3 put-helper *before* importing the
// server. vi.hoisted lets the spies exist before vi.mock's factory
// runs; otherwise the factory would close over undefined refs because
// vi.mock hoists above the regular `const` declaration.
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

// The route dispatches its S3 write through `putMeetingAudio` in
// backend/src/lib/meetingAudio.ts. Mocking that helper (rather than
// the full @aws-sdk/client-s3 package) keeps the test fast and the
// assertion focused on the route's contract.
vi.mock('../../../backend/src/lib/meetingAudio.js', () => ({
  putMeetingAudio: s3Put,
}));

const { build } = await import('../../../backend/src/server.js');

let app: FastifyInstance;

beforeAll(async () => {
  // Ensure the SDK is configured so the happy path doesn't 503.
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
  // Default happy path — the model returns clean JSON, S3 succeeds
  // (returns the key it was asked to write at).
  mockCreate.mockResolvedValue({
    content: [{
      type: 'text',
      text: JSON.stringify({
        summary: 'הלקוח מעוניין בדירת 4 חדרים במרכז. סיכום פגישה ראשונית.',
        actionItems: ['לשלוח 3 נכסים בדירוג גבוה', 'לוודא אישור משכנתא'],
        nextSteps: ['לתאם פגישה שנייה בעוד שבוע'],
      }),
    }],
  });
  s3Put.mockImplementation(async ({ key }: { key: string }) => key);
});

afterEach(() => {
  vi.clearAllMocks();
});

// Build a minimal multipart body with one `audio` field — same shape
// the /api/ai/voice-lead suite uses (see ai-voice.test.ts).
function audioMultipart(
  bytes: Uint8Array,
  filename = 'meeting.webm',
  contentType = 'audio/webm',
): { payload: Buffer; headers: Record<string, string> } {
  const boundary = '----estia-summarize-boundary';
  const pre = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="audio"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`,
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

async function seedMeeting(agentId: string, leadId: string) {
  return prisma.leadMeeting.create({
    data: {
      agentId,
      leadId,
      title: 'פגישה עם לקוח',
      startsAt: new Date('2026-05-01T10:00:00Z'),
      endsAt:   new Date('2026-05-01T10:30:00Z'),
    },
  });
}

describe('POST /api/meetings/:id/summarize', () => {
  it('A — 401 without a session cookie', async () => {
    const { payload, headers } = audioMultipart(new Uint8Array([1, 2, 3]));
    const res = await app.inject({
      method: 'POST',
      url: '/api/meetings/some-id/summarize',
      headers,
      payload,
    });
    expect(res.statusCode).toBe(401);
    expect(mockCreate).not.toHaveBeenCalled();
    expect(s3Put).not.toHaveBeenCalled();
  });

  it('404 — meeting does not exist', async () => {
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const { payload, headers } = audioMultipart(new Uint8Array([1, 2, 3]));
    const res = await app.inject({
      method: 'POST',
      url: '/api/meetings/does-not-exist/summarize',
      headers: { cookie, ...headers },
      payload,
    });
    expect(res.statusCode).toBe(404);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('404 — meeting belongs to another agent (cross-agent isolation)', async () => {
    const [a, b] = await Promise.all([createAgent(prisma), createAgent(prisma)]);
    const bLead = await createLead(prisma, { agentId: b.id });
    const meeting = await seedMeeting(b.id, bLead.id);

    const cookie = await loginAs(app, a.email, a._plainPassword);
    const { payload, headers } = audioMultipart(new Uint8Array([1, 2, 3]));
    const res = await app.inject({
      method: 'POST',
      url: `/api/meetings/${meeting.id}/summarize`,
      headers: { cookie, ...headers },
      payload,
    });
    // Collapses "not mine" → 404 so we don't leak the other agent's row.
    expect(res.statusCode).toBe(404);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('H — happy path: uploads to S3, calls Anthropic, persists structured summary', async () => {
    const agent = await createAgent(prisma);
    const lead  = await createLead(prisma, { agentId: agent.id });
    const meeting = await seedMeeting(agent.id, lead.id);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);

    const { payload, headers } = audioMultipart(new Uint8Array([1, 2, 3, 4]));
    const res = await app.inject({
      method: 'POST',
      url: `/api/meetings/${meeting.id}/summarize`,
      headers: { cookie, ...headers },
      payload,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    // Shape — the card on the frontend reads these three fields.
    expect(body.meeting.id).toBe(meeting.id);
    expect(typeof body.meeting.summary).toBe('string');
    expect(body.meeting.summary.length).toBeGreaterThan(0);
    expect(body.meeting.summaryJson).toMatchObject({
      summary: expect.any(String),
      actionItems: expect.any(Array),
      nextSteps: expect.any(Array),
    });
    // The key ties back to the seeded meeting so a later GET can 302
    // at a presigned URL for audio playback.
    expect(body.meeting.audioKey).toBe(
      `meeting-audio/${agent.id}/${meeting.id}.webm`,
    );

    // Side effects — putMeetingAudio received the buffer under the
    // right key; Anthropic received the summary request with the
    // pinned model.
    expect(s3Put).toHaveBeenCalledTimes(1);
    const putArgs = s3Put.mock.calls[0][0];
    expect(putArgs.key).toBe(`meeting-audio/${agent.id}/${meeting.id}.webm`);
    expect(putArgs.contentType).toBe('audio/webm');
    expect(Buffer.isBuffer(putArgs.body)).toBe(true);

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockCreate.mock.calls[0][0].model).toBe('claude-opus-4-7');

    // Persisted row matches response so the detail page can re-render
    // without a refetch.
    const row = await prisma.leadMeeting.findUnique({ where: { id: meeting.id } });
    expect(row?.summary).toBe(body.meeting.summary);
    expect(row?.audioKey).toBe(`meeting-audio/${agent.id}/${meeting.id}.webm`);
  });
});
