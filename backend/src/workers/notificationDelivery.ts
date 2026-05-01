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

// Exported so integration tests can invoke a single drain directly
// instead of waiting for the 60s setInterval to fire.
export async function drainOnce() {
  const rows = await prisma.pendingNotificationDelivery.findMany({
    where: { status: 'pending', attemptCount: { lt: MAX_ATTEMPTS } },
    orderBy: { createdAt: 'asc' },
    take: BATCH_SIZE,
  });
  if (rows.length === 0) return;

  // P1-5 — group by outcome and use updateMany. The previous loop
  // fired one update() per row (up to 25 per drain), serially. Email
  // sends still happen sequentially because SES rate-limits per-account,
  // but the bookkeeping writes now collapse into 4 batched queries.
  const skippedSms: string[] = [];          // sms — no provider
  const failedNoEmail: { id: string; reason: string }[] = [];
  const sentIds: string[] = [];
  const failedAfterSend: { id: string; err: string; attemptCount: number }[] = [];
  const retryAfterSend: { id: string; err: string }[] = [];

  for (const row of rows) {
    if (row.channel === 'sms') {
      skippedSms.push(row.id);
      continue;
    }
    if (row.channel !== 'email' || !row.recipientEmail) {
      failedNoEmail.push({
        id: row.id,
        reason: row.channel !== 'email'
          ? `unknown channel: ${row.channel}`
          : 'recipientEmail missing',
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
      sentIds.push(row.id);
    } catch (err) {
      const newAttempt = row.attemptCount + 1;
      const errStr = String(err).slice(0, 1000);
      if (newAttempt >= MAX_ATTEMPTS) {
        failedAfterSend.push({ id: row.id, err: errStr, attemptCount: newAttempt });
      } else {
        retryAfterSend.push({ id: row.id, err: errStr });
      }
    }
  }

  const writes: Array<Promise<unknown>> = [];

  if (skippedSms.length) {
    writes.push(prisma.pendingNotificationDelivery.updateMany({
      where: { id: { in: skippedSms } },
      data: { status: 'skipped', errorMessage: 'sms provider not configured' },
    }));
  }

  if (sentIds.length) {
    writes.push(prisma.pendingNotificationDelivery.updateMany({
      where: { id: { in: sentIds } },
      data: { status: 'sent', sentAt: new Date(), attemptCount: { increment: 1 } },
    }));
  }

  // failedNoEmail rows can have different `errorMessage` values; fan
  // out per row but still in parallel. Typically <5 per drain.
  for (const f of failedNoEmail) {
    writes.push(prisma.pendingNotificationDelivery.update({
      where: { id: f.id },
      data: {
        status: 'failed',
        errorMessage: f.reason,
        attemptCount: { increment: 1 },
      },
    }));
  }

  // Same per-row pattern for SES failures — different error strings.
  for (const f of failedAfterSend) {
    writes.push(prisma.pendingNotificationDelivery.update({
      where: { id: f.id },
      data: { status: 'failed', errorMessage: f.err, attemptCount: { increment: 1 } },
    }));
  }
  for (const r of retryAfterSend) {
    writes.push(prisma.pendingNotificationDelivery.update({
      where: { id: r.id },
      data: { status: 'pending', errorMessage: r.err, attemptCount: { increment: 1 } },
    }));
  }

  await Promise.all(writes);
}
