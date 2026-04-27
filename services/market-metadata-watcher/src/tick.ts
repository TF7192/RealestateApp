import type { PrismaClient } from '@prisma/client';
import type { Logger } from 'pino';
import { config } from './config.js';
import { metadataHash, type HashableListing } from './hash.js';
import { scoreMatch } from './matching.js';
import { discoverYad2 } from './sources/yad2.js';

// One end-to-end watcher run:
//   1. Open a `MarketWatcherRun` row (status: running).
//   2. Discover listings from each enabled source.
//   3. Upsert each listing; insert a snapshot if metadata changed.
//   4. For new/updated active listings, evaluate matches against
//      every active LeadSearchProfile.
//   5. Create CRM Notification rows for matches above threshold.
//   6. Close the run row with summary counts.
//
// Phase 1: source-side discovery is stubbed to a typed shape so the
// route + DB plumbing can ship + be tested independently. Phase 1.5
// will plug in a Yad2 city-feed extractor that reuses the existing
// crawlAgency Playwright pool. The ALL-CAPS NOTE in the body marks
// the seam.

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
  let matchesCreated = 0;
  let notificationsCreated = 0;

  try {
    log('tick.started');

    // Self-seed the yad2 source on first run so an empty DB still
    // produces listings without a manual SQL insert.
    await prisma.marketListingSource.upsert({
      where: { name: 'yad2' },
      update: {},
      create: { name: 'yad2', baseUrl: 'https://www.yad2.co.il' },
    });

    const sources = await prisma.marketListingSource.findMany({ where: { isEnabled: true } });
    if (sources.length === 0) {
      log('tick.no-sources');
    }

    for (const src of sources) {
      let discovered: HashableListing[] = [];
      if (src.name === 'yad2') {
        // Build the known-tokens set once per source so the discoverer
        // can short-circuit pages where every listing is already in DB.
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
        log('tick.source-skipped-unknown', { source: src.name });
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
          // New active listings get the match-evaluation pass.
          if (created.status === 'active') {
            const r = await evaluateMatches({ prisma, logger }, created);
            matchesCreated += r.matchesCreated;
            notificationsCreated += r.notificationsCreated;
          }
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
        matchesCreated,
        notificationsCreated,
      },
    });
    log('tick.completed', { listingsSeen, listingsCreated, listingsUpdated, snapshotsCreated, matchesCreated, notificationsCreated });
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
  // For yad2 the externalListingId is the listing token; the
  // canonical detail URL is `${baseUrl}/realestate/item/<token>`.
  // Sources that use a different scheme override this in their own
  // extractor.
  const trimmed = baseUrl.replace(/\/$/, '');
  return `${trimmed}/realestate/item/${item.externalListingId}`;
}

async function evaluateMatches(
  { prisma, logger }: Deps,
  listing: { id: string; city: string | null; neighborhood: string | null; propertyType: string | null; rooms: number | null; price: number | null; sizeSqm: number | null },
): Promise<{ matchesCreated: number; notificationsCreated: number }> {
  let matchesCreated = 0;
  let notificationsCreated = 0;

  // Active profiles only — `LeadSearchProfile` doesn't carry an
  // is_active column directly, but the parent Lead's `status` does.
  // Phase 1: match against profiles whose lead is in an active state.
  const profiles = await prisma.leadSearchProfile.findMany({
    where: {
      lead: { status: { in: ['NEW', 'CONTACTED', 'QUALIFIED', 'ACTIVE'] as any } },
    },
    include: { lead: { select: { id: true, agentId: true } } },
  });

  for (const profile of profiles) {
    const r = scoreMatch(
      {
        city: listing.city,
        neighborhood: listing.neighborhood,
        propertyType: listing.propertyType,
        rooms: listing.rooms,
        price: listing.price,
        sizeSqm: listing.sizeSqm,
      },
      {
        cities: profile.cities,
        neighborhoods: profile.neighborhoods,
        propertyTypes: profile.propertyTypes,
        minRoom: profile.minRoom == null ? null : Math.floor(profile.minRoom),
        maxRoom: profile.maxRoom == null ? null : Math.floor(profile.maxRoom),
        minPrice: profile.minPrice,
        maxPrice: profile.maxPrice,
      },
    );
    if (r.score < config.matchMinScore) continue;

    // Idempotent insert — unique (marketListingId, leadId, searchProfileId).
    const existing = await prisma.marketListingLeadMatch.findUnique({
      where: {
        marketListingId_leadId_searchProfileId: {
          marketListingId: listing.id,
          leadId: profile.leadId,
          searchProfileId: profile.id,
        },
      },
    });
    if (existing) continue;

    const match = await prisma.marketListingLeadMatch.create({
      data: {
        marketListingId: listing.id,
        leadId: profile.leadId,
        searchProfileId: profile.id,
        agentUserId: profile.lead.agentId,
        score: r.score,
        reasonsJson: r.reasons as any,
        status: 'new',
      },
    });
    matchesCreated++;

    await prisma.notification.create({
      data: {
        userId: profile.lead.agentId,
        type: 'market_listing_match',
        title: 'נכס חדש מתאים לליד שלך',
        body: notificationBody(listing),
        link: `/market-discovery?match=${match.id}`,
      },
    });
    notificationsCreated++;
  }

  logger.info(
    { listingId: listing.id, matchesCreated, notificationsCreated },
    'tick.matches-evaluated',
  );
  return { matchesCreated, notificationsCreated };
}

function notificationBody(l: {
  city: string | null;
  rooms: number | null;
  sizeSqm: number | null;
  price: number | null;
}): string {
  const cityFrag = l.city ? ` ב${l.city}` : '';
  const parts = [
    l.rooms != null ? `${l.rooms} חדרים` : null,
    l.sizeSqm != null ? `${l.sizeSqm} מ״ר` : null,
    l.price != null ? `₪${l.price.toLocaleString('he-IL')}` : null,
  ].filter(Boolean);
  return `נמצא נכס חדש${cityFrag} שמתאים לדרישות של ליד פעיל${parts.length ? `: ${parts.join(', ')}` : ''}.`;
}
