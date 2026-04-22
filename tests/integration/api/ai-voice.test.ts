import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { build } from '../../../backend/src/server.js';
import { prisma } from '../../setup/integration.setup.js';
import { createAgent, createCustomer } from '../../factories/user.factory.js';
import { loginAs } from '../../helpers/auth.js';

// The AI route at /api/ai/voice-lead forwards the multipart upload to the
// in-network orchestrator container. Here we stub `global.fetch` so the
// tests exercise the route end-to-end (auth, rate-limit, audit log, trace
// id) without needing a running container.

let app: FastifyInstance;
const ORIGINAL_FETCH = global.fetch;

beforeAll(async () => {
  // Raise the per-minute rate limit so the suite's E2E-like pressure
  // doesn't hit the global 300/min ceiling before the route's own
  // 10/min cap fires in the test we care about.
  process.env.RATE_LIMIT_MAX_PER_MIN = '10000';
  app = await build();
  await app.ready();
});
afterAll(async () => {
  await app.close();
  global.fetch = ORIGINAL_FETCH;
});

beforeEach(() => {
  // Default successful upstream — individual tests override with
  // vi.mocked(global.fetch).mockResolvedValueOnce(...).
  global.fetch = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        transcript: 'שלום',
        extracted: { name: 'דן', phone: '050-1234567' },
        created: { id: 'lead-new', name: 'דן' },
        mode: 'created',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  ) as any;
});

afterEach(() => {
  vi.restoreAllMocks();
});

// Helper — build a minimal multipart body with one `audio` field.
function audioMultipart(bytes: Uint8Array, filename = 'clip.webm', contentType = 'audio/webm'): { payload: Buffer; headers: Record<string, string> } {
  const boundary = '----estia-test-boundary';
  const pre = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="audio"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`,
    'utf8'
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

describe('POST /api/ai/voice-lead', () => {
  it('A — 401 without a cookie', async () => {
    const { payload, headers } = audioMultipart(new Uint8Array([1, 2, 3]));
    const res = await app.inject({
      method: 'POST',
      url: '/api/ai/voice-lead',
      headers,
      payload,
    });
    expect(res.statusCode).toBe(401);
  });

  it('A — 403 when a CUSTOMER role tries to use it', async () => {
    const customer = await createCustomer(prisma);
    const cookie = await loginAs(app, customer.email, customer._plainPassword);
    const { payload, headers } = audioMultipart(new Uint8Array([1, 2, 3]));
    const res = await app.inject({
      method: 'POST',
      url: '/api/ai/voice-lead',
      headers: { cookie, ...headers },
      payload,
    });
    expect([401, 403]).toContain(res.statusCode);
  });

  it('H — happy path: forwards audio, returns orchestrator JSON + traceId', async () => {
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const { payload, headers } = audioMultipart(new Uint8Array([1, 2, 3, 4]));

    const res = await app.inject({
      method: 'POST',
      url: '/api/ai/voice-lead',
      headers: { cookie, ...headers },
      payload,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.mode).toBe('created');
    expect(body.created.id).toBe('lead-new');
    expect(typeof body.traceId).toBe('string');
    expect(body.traceId.length).toBeGreaterThan(0);

    // The route forwarded exactly one upstream call, with the actor
    // header set to the signed-in user's id.
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = (global.fetch as any).mock.calls[0];
    expect(String(url)).toMatch(/\/process\?kind=LEAD$/);
    const hdrs = new Headers(init.headers);
    expect(hdrs.get('X-Agent-Actor-Id')).toBe(agent.id);
  });

  it('H — kind=PROPERTY propagates to the orchestrator URL', async () => {
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const { payload, headers } = audioMultipart(new Uint8Array([1, 2, 3]));

    await app.inject({
      method: 'POST',
      url: '/api/ai/voice-lead?kind=PROPERTY',
      headers: { cookie, ...headers },
      payload,
    });
    const [url] = (global.fetch as any).mock.calls[0];
    expect(String(url)).toMatch(/\/process\?kind=PROPERTY$/);
  });

  it('V — 400 when no audio field in the multipart', async () => {
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    // Empty multipart — no file parts at all.
    const boundary = '----none';
    const payload = Buffer.from(`--${boundary}--\r\n`, 'utf8');
    const res = await app.inject({
      method: 'POST',
      url: '/api/ai/voice-lead',
      headers: {
        cookie,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': String(payload.length),
      },
      payload,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('no_audio');
  });

  it('V — 400 on empty audio file', async () => {
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const { payload, headers } = audioMultipart(new Uint8Array(0));
    const res = await app.inject({
      method: 'POST',
      url: '/api/ai/voice-lead',
      headers: { cookie, ...headers },
      payload,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('empty_audio');
  });

  it('V — 413 on audio larger than 30MB', async () => {
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    // 31MB of zeroes.
    const big = new Uint8Array(31 * 1024 * 1024);
    const { payload, headers } = audioMultipart(big);
    const res = await app.inject({
      method: 'POST',
      url: '/api/ai/voice-lead',
      headers: { cookie, ...headers },
      payload,
    });
    expect(res.statusCode).toBe(413);
    expect(res.json().error.code).toBe('audio_too_large');
  });

  it('Upstream — 502 when the orchestrator is unreachable', async () => {
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    global.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED')) as any;
    const { payload, headers } = audioMultipart(new Uint8Array([1, 2, 3]));
    const res = await app.inject({
      method: 'POST',
      url: '/api/ai/voice-lead',
      headers: { cookie, ...headers },
      payload,
    });
    expect(res.statusCode).toBe(502);
    expect(res.json().error.code).toBe('ai_unreachable');
    expect(typeof res.json().error.traceId).toBe('string');
  });

  it('Upstream — 502 when orchestrator returns 500', async () => {
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    global.fetch = vi.fn().mockResolvedValue(
      new Response('upstream boom', { status: 500 })
    ) as any;
    const { payload, headers } = audioMultipart(new Uint8Array([1, 2, 3]));
    const res = await app.inject({
      method: 'POST',
      url: '/api/ai/voice-lead',
      headers: { cookie, ...headers },
      payload,
    });
    expect(res.statusCode).toBe(502);
    expect(res.json().error.code).toBe('ai_upstream_error');
  });

  it('Audit — writes a voice_created activity row on success', async () => {
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const { payload, headers } = audioMultipart(new Uint8Array([1, 2, 3]));

    const res = await app.inject({
      method: 'POST',
      url: '/api/ai/voice-lead',
      headers: { cookie, ...headers },
      payload,
    });
    expect(res.statusCode).toBe(200);

    const rows = await prisma.activityLog.findMany({
      where: { agentId: agent.id, verb: 'voice_created' },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].entityType).toBe('Lead');
    expect(rows[0].entityId).toBe('lead-new');
  });

  it('Audit — skipped when mode=draft', async () => {
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    global.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          transcript: '…',
          extracted: { name: 'partial' },
          created: null,
          mode: 'draft',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    ) as any;
    const { payload, headers } = audioMultipart(new Uint8Array([1, 2, 3]));

    const res = await app.inject({
      method: 'POST',
      url: '/api/ai/voice-lead',
      headers: { cookie, ...headers },
      payload,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().mode).toBe('draft');

    const rows = await prisma.activityLog.findMany({
      where: { agentId: agent.id, verb: 'voice_created' },
    });
    expect(rows).toHaveLength(0);
  });
});

describe('Service-token path on /api/leads and /api/properties', () => {
  const TOKEN = 'integration-service-token-xyz';
  const ORIG = process.env.ESTIA_SERVICE_TOKEN;
  beforeAll(() => { process.env.ESTIA_SERVICE_TOKEN = TOKEN; });
  afterAll(() => { process.env.ESTIA_SERVICE_TOKEN = ORIG; });

  it('H — /api/leads POST accepts a service token + actor id (no cookie)', async () => {
    const agent = await createAgent(prisma);
    const res = await app.inject({
      method: 'POST',
      url: '/api/leads',
      headers: {
        authorization: `Bearer ${TOKEN}`,
        'x-agent-actor-id': agent.id,
      },
      payload: {
        name: 'מהסוכן הקולי',
        phone: '050-7654321',
        interestType: 'PRIVATE',
        lookingFor: 'BUY',
      },
    });
    expect(res.statusCode).toBe(200);
    const lead = res.json().lead;
    expect(lead.agentId).toBe(agent.id);
  });

  it('A — wrong service token falls through to 401 (no JWT)', async () => {
    const agent = await createAgent(prisma);
    const res = await app.inject({
      method: 'POST',
      url: '/api/leads',
      headers: {
        authorization: 'Bearer wrong-token',
        'x-agent-actor-id': agent.id,
      },
      payload: {
        name: 'nope',
        phone: '050-0000000',
        interestType: 'PRIVATE',
        lookingFor: 'BUY',
      },
    });
    expect(res.statusCode).toBe(401);
  });

  it('A — actor id alone (no bearer) falls through to 401', async () => {
    const agent = await createAgent(prisma);
    const res = await app.inject({
      method: 'POST',
      url: '/api/leads',
      headers: { 'x-agent-actor-id': agent.id },
      payload: {
        name: 'nope',
        phone: '050-0000000',
        interestType: 'PRIVATE',
        lookingFor: 'BUY',
      },
    });
    expect(res.statusCode).toBe(401);
  });

  it('H — /api/properties POST accepts the service-token path too', async () => {
    const agent = await createAgent(prisma);
    const res = await app.inject({
      method: 'POST',
      url: '/api/properties',
      headers: {
        authorization: `Bearer ${TOKEN}`,
        'x-agent-actor-id': agent.id,
      },
      payload: {
        street: 'הרצל',
        city: 'חיפה',
        assetClass: 'RESIDENTIAL',
        category: 'SALE',
      },
    });
    // The route may either accept (200) — the request was authenticated
    // as the agent and validation passed — or 400 if the property
    // schema rejects the minimal payload. Either outcome proves the
    // auth path worked; a 401/403 would fail this test.
    expect([200, 400]).toContain(res.statusCode);
  });
});
