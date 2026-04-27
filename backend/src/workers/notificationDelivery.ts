// Phase 3 — pending-notification-delivery worker.
//
// The Yad2 watcher writes `PendingNotificationDelivery` rows when a
// match qualifies for external delivery (agent opted in + score above
// their threshold). This worker (lives in the backend container, has
// AWS credentials) drains the queue.
//
// Why a separate worker (vs. inline at watcher write-time):
//   1. The watcher container has no AWS SDK and no SES credentials
//      (per Phase 3 architecture decision in MARKET_DISCOVERY_PLAN.md).
//   2. SES failures shouldn't block the watcher's tick — the queue
//      gives us retry semantics for free.
//   3. Audit trail (sentAt, attemptCount, errorMessage) lives in the
//      DB so an admin can see exactly what was sent vs. what failed.
//
// Cadence: runs every 60s on a setInterval inside the backend's
// startup (lib/scheduler.ts is for cron-style work elsewhere; this
// is simple enough for a plain interval). Picks up to 25 rows per
// tick, status='pending', oldest first.

import { prisma } from '../lib/prisma.js';
import { sendNotificationEmail } from '../lib/email.js';

const POLL_MS = 60 * 1000;
const BATCH_SIZE = 25;
const MAX_ATTEMPTS = 3;

let timer: NodeJS.Timeout | null = null;
let running = false;

export function startNotificationDeliveryWorker() {
  // Idempotent — if the route registration runs twice (HMR, tests),
  // don't queue a second interval.
  if (timer) return;

  const tick = async () => {
    if (running) return;          // skip if a previous tick is still draining
    running = true;
    try {
      await drainOnce();
    } catch (err) {
      // We deliberately swallow + log. A worker exception would
      // crash the parent if unhandled; the next tick retries.
      // eslint-disable-next-line no-console
      console.error('[notification-delivery] tick failed:', err);
    } finally {
      running = false;
    }
  };

  // Stagger the first tick by ~10s so it doesn't pile onto deploy
  // traffic, then run on cadence.
  setTimeout(() => { void tick(); }, 10_000);
  timer = setInterval(() => { void tick(); }, POLL_MS);
}

export function stopNotificationDeliveryWorker() {
  if (timer) clearInterval(timer);
  timer = null;
}

async function drainOnce() {
  const rows = await prisma.pendingNotificationDelivery.findMany({
    where: { status: 'pending', attemptCount: { lt: MAX_ATTEMPTS } },
    orderBy: { createdAt: 'asc' },
    take: BATCH_SIZE,
  });
  if (rows.length === 0) return;

  for (const row of rows) {
    if (row.channel === 'sms') {
      // No SMS provider integrated yet — mark skipped so the row
      // doesn't churn the queue forever. When a provider is wired,
      // flip this back to a real send.
      await prisma.pendingNotificationDelivery.update({
        where: { id: row.id },
        data: { status: 'skipped', errorMessage: 'sms provider not configured' },
      });
      continue;
    }

    if (row.channel !== 'email' || !row.recipientEmail) {
      await prisma.pendingNotificationDelivery.update({
        where: { id: row.id },
        data: {
          status: 'failed',
          errorMessage: row.channel !== 'email'
            ? `unknown channel: ${row.channel}`
            : 'recipientEmail missing',
          attemptCount: { increment: 1 },
        },
      });
      continue;
    }

    try {
      await sendNotificationEmail({
        to:        row.recipientEmail,
        subject:   row.title,
        body:      row.body || '',
        link:      row.link
          ? `${process.env.PUBLIC_ORIGIN || 'https://estia.co.il'}${row.link}`
          : null,
        linkLabel: 'פתח באפליקציה',
      });
      await prisma.pendingNotificationDelivery.update({
        where: { id: row.id },
        data: { status: 'sent', sentAt: new Date(), attemptCount: { increment: 1 } },
      });
    } catch (err) {
      const newAttempt = row.attemptCount + 1;
      await prisma.pendingNotificationDelivery.update({
        where: { id: row.id },
        data: {
          status: newAttempt >= MAX_ATTEMPTS ? 'failed' : 'pending',
          errorMessage: String(err).slice(0, 1000),
          attemptCount: { increment: 1 },
        },
      });
    }
  }
}
