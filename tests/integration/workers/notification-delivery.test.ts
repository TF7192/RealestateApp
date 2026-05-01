// Integration test for the notification-delivery worker
// (backend/src/workers/notificationDelivery.ts).
//
// The worker drains PendingNotificationDelivery rows and dispatches
// each through SES (sendNotificationEmail). We invoke drainOnce()
// directly so the 60s setInterval doesn't gate the test, mock the
// SES helper at the lib boundary so no real AWS request fires, and
// assert the row's terminal state (sent / failed / skipped).
//
// Covered branches:
//   - happy path: pending → sent, sentAt stamped, attemptCount = 1
//   - sms channel: skipped (no SMS provider configured)
//   - missing recipientEmail: failed with reason
//   - SES throws below MAX_ATTEMPTS: stays pending, attemptCount++
//   - SES throws AT MAX_ATTEMPTS: row terminates as failed

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { prisma } from '../../setup/integration.setup.js';
import { createUser } from '../../factories/user.factory.js';

// Mock the SES helper before the worker is imported. vi.hoisted lets
// the spy reference exist before vi.mock's factory is hoisted past
// the regular imports.
const { sesSend } = vi.hoisted(() => ({ sesSend: vi.fn() }));
vi.mock('../../../backend/src/lib/email.js', () => ({
  sendNotificationEmail: sesSend,
  sendContactEmail: vi.fn(),
  _internals: {
    RECIPIENT: 'support@estia.co.il',
    SENDER: 'no-reply@estia.co.il',
    REGION: 'eu-north-1',
    SUBJECT_PREFIX: '[Estia][Test]',
  },
}));

const { drainOnce } = await import('../../../backend/src/workers/notificationDelivery.js');

beforeAll(() => {
  // Worker reads PUBLIC_ORIGIN to resolve link URLs.
  process.env.PUBLIC_ORIGIN = 'https://test.estia.co.il';
});

afterAll(() => {
  delete process.env.PUBLIC_ORIGIN;
});

beforeEach(() => {
  sesSend.mockReset();
});

async function makePending(userId: string, overrides: Partial<{
  channel: string;
  recipientEmail: string | null;
  attemptCount: number;
  status: string;
}> = {}) {
  return prisma.pendingNotificationDelivery.create({
    data: {
      userId,
      channel: 'email',
      type: 'market_listing_match',
      title: 'התאמה חדשה',
      body: 'נמצאה התאמה ללקוח שלך',
      link: '/leads/abc',
      recipientEmail: 'user@example.com',
      status: 'pending',
      attemptCount: 0,
      ...overrides,
    },
  });
}

describe('notificationDelivery — drainOnce', () => {
  it('happy path: pending → sent, attemptCount=1, sentAt stamped, SES called once', async () => {
    sesSend.mockResolvedValue(undefined);
    const user = await createUser(prisma);
    const row = await makePending(user.id);

    await drainOnce();

    const after = await prisma.pendingNotificationDelivery.findUnique({ where: { id: row.id } });
    expect(after?.status).toBe('sent');
    expect(after?.sentAt).not.toBeNull();
    expect(after?.attemptCount).toBe(1);

    expect(sesSend).toHaveBeenCalledTimes(1);
    const call = sesSend.mock.calls[0][0];
    expect(call.to).toBe('user@example.com');
    expect(call.subject).toBe('התאמה חדשה');
    // Worker stitches PUBLIC_ORIGIN onto the relative link.
    expect(call.link).toBe('https://test.estia.co.il/leads/abc');
  });

  it('sms channel: row marked skipped + SES not called', async () => {
    const user = await createUser(prisma);
    const row = await makePending(user.id, { channel: 'sms', recipientEmail: null });

    await drainOnce();

    const after = await prisma.pendingNotificationDelivery.findUnique({ where: { id: row.id } });
    expect(after?.status).toBe('skipped');
    expect(after?.errorMessage).toMatch(/sms/i);
    expect(sesSend).not.toHaveBeenCalled();
  });

  it('missing recipientEmail on email-channel row: marked failed', async () => {
    const user = await createUser(prisma);
    const row = await makePending(user.id, { channel: 'email', recipientEmail: null });

    await drainOnce();

    const after = await prisma.pendingNotificationDelivery.findUnique({ where: { id: row.id } });
    expect(after?.status).toBe('failed');
    expect(after?.errorMessage).toMatch(/recipientEmail missing/i);
    expect(sesSend).not.toHaveBeenCalled();
  });

  it('transient SES failure (attempt 1): row stays pending with attemptCount=1', async () => {
    sesSend.mockRejectedValue(new Error('Throttling'));
    const user = await createUser(prisma);
    const row = await makePending(user.id);

    await drainOnce();

    const after = await prisma.pendingNotificationDelivery.findUnique({ where: { id: row.id } });
    expect(after?.status).toBe('pending');
    expect(after?.attemptCount).toBe(1);
    expect(after?.errorMessage).toMatch(/Throttling/);
  });

  it('terminal SES failure (3rd attempt): row marked failed', async () => {
    sesSend.mockRejectedValue(new Error('UpstreamReject'));
    const user = await createUser(prisma);
    const row = await makePending(user.id, { attemptCount: 2 });

    await drainOnce();

    const after = await prisma.pendingNotificationDelivery.findUnique({ where: { id: row.id } });
    expect(after?.status).toBe('failed');
    expect(after?.attemptCount).toBe(3);
  });

  it('idempotent: running drainOnce twice on a clean queue is a no-op', async () => {
    await drainOnce();
    await drainOnce();
    expect(sesSend).not.toHaveBeenCalled();
  });
});
