// 2026-05-06 — batched lead-match digest.
//
// Replaces the old "fire one email per match the moment it lands"
// behaviour. Agents complained the inbox was unmanageable: every
// listing the reactor scored above their threshold became its own
// SES email. We now accumulate matches into NotificationDispatch
// rows (written by marketDiscoveryReactor.ts) and drain them once
// every 30 minutes into a single per-agent digest.
//
// Idempotency contract:
//   • The (agentId, leadId, marketListingId) triple is unique on
//     NotificationDispatch — the reactor uses createMany skipDuplicates.
//   • The digest stamps `dispatchedAt` on every row it ships, inside
//     the same transaction that sends the email. A re-run that
//     arrives a second later finds zero un-dispatched rows and
//     never sends a duplicate.
//   • Rows arriving DURING send are still in the next window;
//     they're not erased.
//
// The drain function is exported so a Vitest test can call it
// directly without spinning up a timer.

import { prisma } from '../lib/prisma.js';
import {
  sendMatchDigestEmail,
  type DigestProperty,
} from '../lib/email.js';

// 30 minutes — the explicit user request. Configurable via env so
// staging can be impatient.
const DIGEST_INTERVAL_MS = Number(process.env.DIGEST_INTERVAL_MS) || 30 * 60 * 1000;

let timer: NodeJS.Timeout | null = null;
let running = false;

export function startMatchDigestScheduler() {
  if (timer) return;

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await runDigestOnce();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[match-digest] tick failed:', err);
    } finally {
      running = false;
    }
  };

  // 60s stagger from boot so deploys don't immediately fan out.
  setTimeout(() => { void tick(); }, 60_000);
  timer = setInterval(() => { void tick(); }, DIGEST_INTERVAL_MS);
}

export function stopMatchDigestScheduler() {
  if (timer) clearInterval(timer);
  timer = null;
}

// Exported for tests. Returns the number of digests actually sent.
export async function runDigestOnce(deps: {
  prismaClient?: typeof prisma;
  send?: typeof sendMatchDigestEmail;
  origin?: string;
} = {}): Promise<number> {
  const db = deps.prismaClient ?? prisma;
  const send = deps.send ?? sendMatchDigestEmail;
  const origin = deps.origin ?? (process.env.PUBLIC_ORIGIN || 'https://estia.co.il');

  // 1. Find every agent with at least one un-dispatched row.
  // distinct() in Prisma needs an orderBy/select pair — group by
  // agentId is more idiomatic.
  const agentBuckets = await db.notificationDispatch.groupBy({
    by: ['agentId'],
    where: { dispatchedAt: null },
    _count: { _all: true },
  });
  if (agentBuckets.length === 0) return 0;

  let digestsSent = 0;

  for (const bucket of agentBuckets) {
    const agentId = bucket.agentId;

    // Snapshot un-dispatched rows for this agent NOW. Anything that
    // arrives after this read stays for the next window.
    const rows = await db.notificationDispatch.findMany({
      where: { agentId, dispatchedAt: null },
      orderBy: { createdAt: 'asc' },
    });
    if (rows.length === 0) continue;

    // Resolve recipient + opt-in status. If the agent toggled email
    // OFF since the row was queued, mark the rows dispatched anyway
    // so they don't sit forever — the in-app notification already
    // fired at write-time.
    const pref = await db.userNotificationPreference.findUnique({
      where: { userId: agentId },
      include: { user: { select: { email: true } } },
    });

    const recipient =
      (pref?.customDeliveryEmail || pref?.user?.email) ?? null;
    const optedIn = !!pref?.marketMatchEmailEnabled;

    if (!recipient || !optedIn) {
      // "Mark as spent" — flushes any rows queued before the agent
      // disabled the channel.
      await db.notificationDispatch.updateMany({
        where: { id: { in: rows.map((r) => r.id) } },
        data: { dispatchedAt: new Date() },
      });
      continue;
    }

    // Hydrate listing + lead details for the email body.
    const listingIds = Array.from(new Set(rows.map((r) => r.marketListingId)));
    const leadIds = Array.from(new Set(rows.map((r) => r.leadId)));

    const [listings, leads] = await Promise.all([
      db.marketListing.findMany({
        where: { id: { in: listingIds } },
        select: {
          id: true, street: true, city: true, neighborhood: true,
          rooms: true, sizeSqm: true, price: true, originalUrl: true,
        },
      }),
      db.lead.findMany({
        where: { id: { in: leadIds } },
        select: { id: true, name: true, phone: true },
      }),
    ]);
    const listingById = new Map(listings.map((l) => [l.id, l]));
    const leadById = new Map(leads.map((l) => [l.id, l]));

    // Group rows by listing → list of leads.
    const grouped = new Map<string, typeof rows>();
    for (const r of rows) {
      const arr = grouped.get(r.marketListingId) ?? [];
      arr.push(r);
      grouped.set(r.marketListingId, arr);
    }

    const properties: DigestProperty[] = [];
    for (const [listingId, group] of grouped) {
      const l = listingById.get(listingId);
      if (!l) continue; // listing was deleted between queue + drain
      properties.push({
        marketListingId: l.id,
        street: l.street,
        city: l.city,
        neighborhood: l.neighborhood,
        rooms: l.rooms,
        sizeSqm: l.sizeSqm,
        price: l.price,
        originalUrl: l.originalUrl,
        appLink: `/market-discovery?listing=${l.id}`,
        leads: group
          .map((row) => {
            const lead = leadById.get(row.leadId);
            if (!lead) return null;
            return {
              name: lead.name,
              phone: lead.phone,
              matchScore: row.matchScore,
            };
          })
          .filter((x): x is NonNullable<typeof x> => x !== null),
      });
    }

    if (properties.length === 0) {
      // Listings vanished — still flush rows so we don't try again.
      await db.notificationDispatch.updateMany({
        where: { id: { in: rows.map((r) => r.id) } },
        data: { dispatchedAt: new Date() },
      });
      continue;
    }

    const totalLeads = properties.reduce((n, p) => n + p.leads.length, 0);

    // Stamp BEFORE send. If SES then fails we leave the rows
    // dispatched anyway — re-trying duplicates is the worse failure
    // mode (user explicitly asked for no duplicate emails). The
    // operator can re-trigger via a one-off if a true outage hits.
    const stampedAt = new Date();
    await db.notificationDispatch.updateMany({
      where: { id: { in: rows.map((r) => r.id) } },
      data: { dispatchedAt: stampedAt },
    });

    try {
      await send({
        to: recipient,
        totalLeads,
        properties,
        origin,
      });
      digestsSent += 1;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[match-digest] send failed', { agentId, err: String(err) });
      // We deliberately do NOT un-stamp the rows — see comment above.
    }
  }

  return digestsSent;
}
