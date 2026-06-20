import type {
  MarketListingKind,
  MarketListingPosterType,
  MarketListingStatus,
  PrismaClient,
} from '@prisma/client';
import type { Logger } from 'pino';
import { config } from './config.js';
import { metadataHash, type HashableListing } from './hash.js';
import { discoverYad2 } from './sources/yad2.js';

// Watcher tick — SINGLE RESPONSIBILITY: discover listings from
// configured sources → upsert metadata rows → snapshot when metadata
// changes → close the run row with summary counts.
//
// Explicitly NOT this service's job:
//   - matching listings against LeadSearchProfiles
//   - creating Notification rows
//   - queueing email/SMS deliveries
//
// Those CRM-domain concerns live in the backend's
// `marketDiscoveryReactor.ts` worker, which polls
// `MarketListing.reactedAt IS NULL` rows and reacts on its own
// schedule. The watcher writes; the reactor reads. Clean
// hand-off via a single nullable column.
//
// Why the split:
//   - Adding Madlan/Komo/RentNet as new sources = one new file in
//     `src/sources/`, no matching/notification code duplication.
//   - Matching weights, notification preferences, email logic can
//     change without rebuilding the heavy Playwright Chromium
//     watcher container.
//   - This service has no AWS/SES/CRM-domain dependencies — it can
//     even be deployed as a standalone discovery service for a
//     partner if needed.

type Deps = { prisma: PrismaClient; logger: Logger };

// Kinds to crawl in a single tick. Default is `forsale` only — a
// follow-up tick crawls `rent`. Splitting kinds across separate
// browser sessions (15+ min apart) gives each kind a fresh Reblaze
// challenge slot, since challenge cookies + IP reputation accumulate
// over a single context's lifetime.
// FETCH kinds a tick can crawl — these map to Yad2 URL sections
// (/realestate/<kind>/<region>). 'commercial' is one mixed bucket that
// the extractor splits per-item into the stored commercial_forsale /
// commercial_rent kinds via subcategoryId; the upsert path below writes
// item.kind (the STORED kind) unchanged.
export type WatcherKind = 'forsale' | 'rent' | 'commercial';

// Sweep up `running` rows that have been hanging since before this
// process booted. They almost always indicate a previous container
// got SIGTERM'd by a deploy mid-tick — the row never got finalized.
// Running this on boot keeps the admin run-log honest and prevents
// a 'running' row from blocking the "is anything in-flight?" check
// elsewhere in the codebase.
export async function reapStaleRuns(prisma: PrismaClient, logger: Logger) {
  // 10-minute floor — generous enough that a real in-flight tick
  // never gets clipped (a normal cold-start tick is ~3 minutes).
  const cutoff = new Date(Date.now() - 10 * 60 * 1000);
  const result = await prisma.marketWatcherRun.updateMany({
    where: { status: 'running', startedAt: { lt: cutoff } },
    data: {
      status: 'failed',
      finishedAt: new Date(),
      errorMessage: 'interrupted (container restart) — reaped on next boot',
    },
  });
  if (result.count > 0) {
    logger.warn({ reaped: result.count }, 'tick.reaped-stale-runs');
  }
}

// Quiet-hours window in Israel local time. Skip scans between
// 23:00 and 06:00 — Yad2's organic traffic drops to ~5% of daytime
// volume in those hours, so our scrape would stand out in their
// telemetry. Honest residential users aren't doom-scrolling listings
// at 3am; we shouldn't either.
const QUIET_START_HOUR = 23; // 23:00 Asia/Jerusalem
const QUIET_END_HOUR   = 6;  // 06:00 Asia/Jerusalem

function isInQuietHours(): boolean {
  // Asia/Jerusalem handles DST automatically (Mar/Oct). 24h hour.
  const hour = Number.parseInt(
    new Intl.DateTimeFormat('en-US', {
      hour: '2-digit',
      hour12: false,
      timeZone: 'Asia/Jerusalem',
    }).format(new Date()),
    10,
  );
  // Window is [23:00, 06:00) — wrap-around midnight.
  if (QUIET_START_HOUR > QUIET_END_HOUR) {
    return hour >= QUIET_START_HOUR || hour < QUIET_END_HOUR;
  }
  return hour >= QUIET_START_HOUR && hour < QUIET_END_HOUR;
}

export async function runWatcherTick(
  { prisma, logger }: Deps,
  opts: { kinds?: WatcherKind[] } = {},
) {
  const kinds = opts.kinds ?? ['forsale'];

  // Skip during Israel-local quiet hours (23:00-06:00). The
  // scheduler still fires on cadence; we just bail before opening any
  // browser/proxy connections so Reblaze doesn't see overnight
  // traffic from us. Returns silently — no run row, no log noise.
  if (isInQuietHours()) {
    logger.info({ kinds }, 'tick.skipped-quiet-hours');
    return;
  }

  // Self-heal previous interrupted runs so the admin observability
  // page doesn't accumulate orphaned `running` rows. Idempotent +
  // cheap (single indexed UPDATE).
  await reapStaleRuns(prisma, logger);

  const run = await prisma.marketWatcherRun.create({
    data: { source: kinds.join('+'), status: 'running' },
  });
  const log = (msg: string, extra?: unknown) =>
    logger.info({ runId: run.id, ...((extra as object) || {}) }, msg);
  let listingsSeen = 0;
  let listingsCreated = 0;
  let listingsUpdated = 0;
  let snapshotsCreated = 0;

  try {
    log('tick.started');

    // Self-seed sources on first run.
    await prisma.marketListingSource.upsert({
      where: { name: 'yad2' },
      update: {},
      create: { name: 'yad2', baseUrl: 'https://www.yad2.co.il' },
    });
    // Future Madlan/Komo/RentNet seeding goes here — the rest of
    // the loop dispatches by source.name.

    const sources = await prisma.marketListingSource.findMany({ where: { isEnabled: true } });
    if (sources.length === 0) {
      log('tick.no-sources');
    }

    // Per-item upsert helper. Reused for both initial-fetch and the
    // per-page streaming path. Returns nothing — counters are bumped
    // via the closure to keep the call sites tight.
    const upsertOne = async (
      item: HashableListing,
      baseUrl: string,
    ): Promise<void> => {
      listingsSeen++;
      const hash = metadataHash(item);
      const existing = await prisma.marketListing.findUnique({
        where: {
          source_externalListingId: {
            source: item.source,
            externalListingId: item.externalListingId,
          },
        },
      });
      if (!existing) {
        const created = await prisma.marketListing.create({
          data: {
            source: item.source,
            externalListingId: item.externalListingId,
            originalUrl: deriveUrl(baseUrl, item),
            city: item.city,
            neighborhood: item.neighborhood,
            street: item.street,
            propertyType: item.propertyType,
            rooms: item.rooms,
            sizeSqm: item.sizeSqm,
            floor: item.floor,
            price: item.price,
            pricePerSqm: item.pricePerSqm,
            // HashableListing types these as `string | null` to keep the
            // hash function generic; Prisma's enums are strict. Cast at
            // the boundary — the source extractors emit only valid
            // lowercase enum values (kind: 'forsale'|'rent'|
            // 'commercial_forsale'|'commercial_rent'; poster:
            // 'private'|'agency'; status: 'active'|'removed'|'unknown').
            kind: item.kind as MarketListingKind | null,
            posterType: item.posterType as MarketListingPosterType | null,
            status: (item.status || 'active') as MarketListingStatus,
            metadataHash: hash,
            // reactedAt deliberately left NULL — backend reactor
            // processes new rows on its 30s poll cadence.
          },
        });
        listingsCreated++;
        await prisma.marketListingSnapshot.create({
          data: {
            marketListingId: created.id,
            price: created.price,
            pricePerSqm: created.pricePerSqm,
            status: created.status,
            metadataHash: hash,
          },
        });
        snapshotsCreated++;
      } else {
        const changed = existing.metadataHash !== hash;
        await prisma.marketListing.update({
          where: { id: existing.id },
          data: {
            lastSeenAt: new Date(),
            ...(changed
              ? {
                  city: item.city,
                  neighborhood: item.neighborhood,
                  street: item.street,
                  propertyType: item.propertyType,
                  rooms: item.rooms,
                  sizeSqm: item.sizeSqm,
                  floor: item.floor,
                  price: item.price,
                  pricePerSqm: item.pricePerSqm,
                  kind: item.kind as MarketListingKind | null,
                  posterType: item.posterType as MarketListingPosterType | null,
                  status: (item.status || existing.status) as MarketListingStatus,
                  metadataHash: hash,
                  // Reset reactor cursor on metadata change so the
                  // reactor re-evaluates against possibly-affected
                  // profile thresholds (price drops, status flips).
                  reactedAt: null,
                }
              : {}),
          },
        });
        if (changed) {
          listingsUpdated++;
          await prisma.marketListingSnapshot.create({
            data: {
              marketListingId: existing.id,
              price: item.price ?? null,
              pricePerSqm: item.pricePerSqm ?? null,
              status: (item.status || existing.status) as MarketListingStatus,
              metadataHash: hash,
            },
          });
          snapshotsCreated++;
        }
      }
    };

    for (const src of sources) {
      if (src.name === 'yad2') {
        const known = new Set<string>(
          (await prisma.marketListing.findMany({
            where: { source: 'yad2' },
            select: { externalListingId: true },
          })).map((r) => r.externalListingId),
        );
        // Streaming upsert — every page commits its rows BEFORE the
        // next page is fetched. If discovery hits a Reblaze timeout
        // halfway or the container is killed by a deploy, every
        // already-committed page survives. Previously this loop
        // collected every page in memory and committed at the end,
        // which is why 8 production runs accumulated as 'running'
        // with 0 listings — every run got interrupted before commit.
        const result = await discoverYad2({
          regions: config.discoveryRegions,
          kinds,
          knownTokens: known,
          hardCeiling: config.hardCeiling,
          log: logger,
          onPage: async (novel, ctx) => {
            for (const item of novel) {
              try {
                await upsertOne(item, src.baseUrl);
              } catch (err) {
                // Per-item error isolation — one malformed listing
                // shouldn't kill the whole page. Log + continue.
                logger.warn(
                  { err: String(err), token: item.externalListingId, ...ctx },
                  'tick.upsert-failed',
                );
              }
            }
            // Heartbeat the run row so the admin observability page
            // shows progress mid-tick, not just at completion.
            await prisma.marketWatcherRun.update({
              where: { id: run.id },
              data: { listingsSeen, listingsCreated, listingsUpdated, snapshotsCreated },
            }).catch(() => { /* swallow — run row may already be closed */ });
          },
        });
        log('tick.source-fetched', {
          source: src.name,
          discovered: result.items.length,
          fetched: result.stats.fetched,
          itemsSeen: result.stats.itemsSeen,
        });
      } else {
        log('tick.source-skipped-unknown', { source: src.name });
        continue;
      }
    }

    await prisma.marketWatcherRun.update({
      where: { id: run.id },
      data: {
        finishedAt: new Date(),
        status: 'success',
        listingsSeen,
        listingsCreated,
        listingsUpdated,
        snapshotsCreated,
        // matchesCreated + notificationsCreated stay 0 — those are
        // the reactor's counters now, recorded elsewhere if needed.
      },
    });
    log('tick.completed', { listingsSeen, listingsCreated, listingsUpdated, snapshotsCreated });
  } catch (err) {
    log('tick.failed', { error: String(err) });
    await prisma.marketWatcherRun
      .update({
        where: { id: run.id },
        data: { finishedAt: new Date(), status: 'failed', errorMessage: String(err) },
      })
      .catch(() => {/* swallow — run row may already be closed */});
    throw err;
  }
}

function deriveUrl(baseUrl: string, item: HashableListing): string {
  // Source-specific URL derivation. Yad2 = `${base}/realestate/item/<token>`.
  // When a new source lands, dispatch on item.source here.
  const trimmed = baseUrl.replace(/\/$/, '');
  if (item.source === 'yad2') {
    return `${trimmed}/realestate/item/${item.externalListingId}`;
  }
  // Sane default for unknown sources — gives the agent SOMETHING to
  // click. Source extractors should override by setting their own
  // url shape if needed (Phase 4 work).
  return `${trimmed}/${item.externalListingId}`;
}
