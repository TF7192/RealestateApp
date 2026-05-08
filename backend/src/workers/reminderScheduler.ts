// Reminder firing scheduler.
//
// Reminders (model `Reminder`) sit in the DB with a `dueAt` timestamp.
// Until 2026-05-08 nothing converted "this reminder is due" into a
// user-visible signal — agents complained that scheduled reminders
// silently passed without a bell. This worker bridges that gap.
//
// Cadence: every 60s. Pulls up to 50 PENDING reminders whose
// `dueAt <= now()` and `notifiedAt IS NULL`. Per row:
//   1. Create a Notification row (type='reminder_due', userId=agentId,
//      title='⏰ ' + reminder.title, body=reminder.notes ?? null,
//      link → /reminders or the anchored entity)
//   2. Set reminder.notifiedAt = now() so we don't notify again.
//
// Notification rows then surface in the bell + are picked up by
// notificationDelivery for any opted-in external channels (email/push).
import { prisma } from '../lib/prisma.js';

const POLL_MS = 60 * 1000;
const BATCH_SIZE = 50;

let timer: NodeJS.Timeout | null = null;
let running = false;

function buildLink(r: { leadId: string | null; propertyId: string | null }): string {
  if (r.leadId) return `/customers/${r.leadId}`;
  if (r.propertyId) return `/properties/${r.propertyId}`;
  return '/reminders';
}

async function drainOnce() {
  const now = new Date();
  const due = await prisma.reminder.findMany({
    where: {
      status: 'PENDING',
      dueAt: { lte: now },
      notifiedAt: null,
    },
    orderBy: { dueAt: 'asc' },
    take: BATCH_SIZE,
  });
  if (due.length === 0) return;

  for (const r of due) {
    try {
      await prisma.$transaction([
        prisma.notification.create({
          data: {
            userId: r.agentId,
            type: 'reminder_due',
            title: `⏰ ${r.title}`,
            body: r.notes || null,
            link: buildLink(r),
          },
        }),
        prisma.reminder.update({
          where: { id: r.id },
          data: { notifiedAt: new Date() },
        }),
      ]);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[reminder-scheduler] failed to fire reminder', r.id, err);
    }
  }
}

export function startReminderScheduler() {
  if (timer) return;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await drainOnce();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[reminder-scheduler] tick failed:', err);
    } finally {
      running = false;
    }
  };
  setTimeout(() => { void tick(); }, 5_000);
  timer = setInterval(() => { void tick(); }, POLL_MS);
}

export function stopReminderScheduler() {
  if (timer) clearInterval(timer);
  timer = null;
}
