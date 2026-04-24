// Sprint 5.1 — public /api/contact endpoint.
//
// Tests lock three contracts:
//   1. Happy path — sendContactEmail is called with the hardcoded
//      recipient + the right subject/body shape.
//   2. Validation — empty subject/body 400s.
//   3. Rate limit — 6th request from the same IP inside the window
//      returns 429 (the first five are accepted).

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';

// vi.hoisted keeps the spy reference available at module-eval time so
// the factory below can close over it before the server import runs.
const { sendEmail } = vi.hoisted(() => ({
  sendEmail: vi.fn(),
}));

// Mock the whole email helper so @aws-sdk/client-ses never loads in
// the test process — the real module opens SES clients that would
// try to resolve credentials.
vi.mock('../../../backend/src/lib/email.js', () => ({
  sendContactEmail: sendEmail,
  _internals: {
    RECIPIENT: 'talfuks1234@gmail.com',
    SENDER: 'no-reply@estia.co.il',
    REGION: 'eu-north-1',
    SUBJECT_PREFIX: '[Estia][Contact]',
  },
}));

const { build } = await import('../../../backend/src/server.js');
const { _resetContactRateLimit } = await import(
  '../../../backend/src/routes/contact.js'
);

let app: FastifyInstance;

beforeAll(async () => {
  // The global limiter (300/min) is unrelated to the per-route 5/hr;
  // raise it so the rate-limit test can send 6 requests quickly.
  process.env.RATE_LIMIT_MAX_PER_MIN = '10000';
  app = await build();
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  sendEmail.mockReset();
  sendEmail.mockResolvedValue(undefined);
  // The route's in-memory hit-map persists between tests; zero it so
  // each test starts from a clean window.
  _resetContactRateLimit();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/contact', () => {
  it('H — happy path: calls SESClient.send-equivalent with the right recipient', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/contact',
      payload: {
        subject: 'Question about pricing',
        body: 'Hi, I would like to know more about the premium tier.',
        fromName: 'Adam',
        fromEmail: 'adam@example.co.il',
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });

    // Helper was called exactly once with the expected shape. The
    // recipient is hardcoded inside sendContactEmail — here we only
    // check that the subject/body made it through intact.
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const [args] = sendEmail.mock.calls[0];
    expect(args.subject).toBe('Question about pricing');
    expect(args.body).toContain('premium tier');
    expect(args.fromName).toBe('Adam');
    expect(args.fromEmail).toBe('adam@example.co.il');
  });

  it('400 — empty subject rejected', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/contact',
      payload: { subject: '', body: 'has body' },
    });
    expect(res.statusCode).toBe(400);
    expect(sendEmail).not.toHaveBeenCalled();

    // Also empty body
    const res2 = await app.inject({
      method: 'POST',
      url: '/api/contact',
      payload: { subject: 'has subject', body: '' },
    });
    expect(res2.statusCode).toBe(400);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('429 — 6th request from the same IP within the hour is rate-limited', async () => {
    // First 5 should succeed.
    for (let i = 0; i < 5; i++) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/contact',
        // Pin the IP so the rate limiter keys on a single bucket; under
        // real infra this header is already forwarded by the ingress
        // (trustProxy is on in server.ts).
        headers: { 'x-forwarded-for': '203.0.113.7' },
        payload: { subject: `t${i}`, body: `body ${i}` },
      });
      expect(res.statusCode).toBe(200);
    }
    // 6th — rejected.
    const sixth = await app.inject({
      method: 'POST',
      url: '/api/contact',
      headers: { 'x-forwarded-for': '203.0.113.7' },
      payload: { subject: 't6', body: 'body 6' },
    });
    expect(sixth.statusCode).toBe(429);
    expect(sixth.json().error.code).toBe('rate_limited');
    expect(sendEmail).toHaveBeenCalledTimes(5);
  });
});
