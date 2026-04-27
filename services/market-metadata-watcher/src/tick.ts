import type { PrismaClient } from '@prisma/client';
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

export async function runWatcherTick({ prisma, logger }: Deps) {
  const run = await prisma.marketWatcherRun.create({
    data: { source: 'all', status: 'running' },
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

    for (const src of sources) {
      let discovered: HashableListing[] = [];
      if (src.name === 'yad2') {
        const known = new Set<string>(
          (await prisma.marketListing.findMany({
            where: { source: 'yad2' },
            select: { externalListingId: true },
          })).map((r) => r.externalListingId),
        );
        const result = await discoverYad2({
          regions: config.discoveryRegions,
          knownTokens: known,
          hardCeiling: config.hardCeiling,
          log: logger,
        });
        discovered = result.items;
        log('tick.source-fetched', {
          source: src.name,
          count: discovered.length,
          fetched: result.stats.fetched,
          itemsSeen: result.stats.itemsSeen,
        });
      } else {
        // When a new source ships, dispatch it here. Fail open by
        // logging — an unknown source shouldn't block other sources.
        log('tick.source-skipped-unknown', { source: src.name });
        continue;
      }

      for (const item of discovered.slice(0, config.hardCeiling)) {
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
              originalUrl: deriveUrl(src.baseUrl, item),
              city: item.city,
              neighborhood: item.neighborhood,
              street: item.street,
              propertyType: item.propertyType,
              rooms: item.rooms,
              sizeSqm: item.sizeSqm,
              floor: item.floor,
              price: item.price,
              pricePerSqm: item.pricePerSqm,
              status: item.status || 'active',
              metadataHash: hash,
              // reactedAt deliberately left NULL — the backend's
              // marketDiscoveryReactor worker picks it up on its
              // next tick, scores it against active profiles, and
              // creates Notification + delivery-queue rows.
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
                    status: item.status || existing.status,
                    metadataHash: hash,
                    // Reset the reactor cursor when metadata changes
                    // so the reactor re-evaluates the listing — the
                    // new price/rooms/etc might cross a different
                    // agent's threshold than the original did.
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
                status: item.status || existing.status,
                metadataHash: hash,
              },
            });
            snapshotsCreated++;
          }
        }
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
