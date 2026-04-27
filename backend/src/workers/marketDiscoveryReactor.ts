// Market Discovery Reactor — backend-side worker that processes new
// MarketListing rows.
//
// Responsibility (single):
//   For every MarketListing where reactedAt IS NULL:
//     1. Score it against every active LeadSearchProfile (via lib/marketDiscoveryMatching).
//     2. For matches above MARKET_MATCH_MIN_SCORE: insert MarketListingLeadMatch
//        (idempotent via unique index) + Notification + (if opted-in) PendingNotificationDelivery.
//     3. Mark the listing reactedAt = now().
//
// Why this lives here, not in the watcher (per the SOLID refactor):
//   - The watcher's single responsibility is "discover Yad2 listings →
//     write metadata rows". It doesn't know about Lead, agentId,
//     UserNotificationPreference, Notification, or email delivery.
//   - Adding Madlan / Komo / RentNet as future sources doesn't need to
//     duplicate matching logic — each new source just writes
//     MarketListing rows; this reactor handles them uniformly.
//   - Matching weights, notification preferences, email logic can
//     change without rebuilding the watcher container.
//
// Cadence: every 30s. Picks up to 50 unprocessed listings per tick;
// the (reactedAt, firstSeenAt) covering index keeps that scan O(log n).

import { prisma } from '../lib/prisma.js';
import { scoreMatch } from '../lib/marketDiscoveryMatching.js';
import { ensureSearchProfilesForOrphanLeads } from '../lib/leadSearchProfileSeed.js';

const POLL_MS = 30 * 1000;
const BATCH_SIZE = 50;
const MIN_SCORE = Number.parseInt(process.env.MARKET_MATCH_MIN_SCORE || '70', 10);

let timer: NodeJS.Timeout | null = null;
let running = false;

export function startMarketDiscoveryReactor() {
  if (timer) return;

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await drainOnce();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[market-discovery-reactor] tick failed:', err);
    } finally {
      running = false;
    }
  };

  setTimeout(() => { void tick(); }, 5_000);
  timer = setInterval(() => { void tick(); }, POLL_MS);
}

export function stopMarketDiscoveryReactor() {
  if (timer) clearInterval(timer);
  timer = null;
}

async function drainOnce() {
  // Auto-seed missing LeadSearchProfile rows. Most agents never open the
  // dedicated profile editor, so without this fallback the matching
  // pipeline runs against an empty profile set and never fires.
  // Idempotent — only inserts where the relation is empty.
  try {
    const seeded = await ensureSearchProfilesForOrphanLeads(prisma);
    if (seeded > 0) {
      // eslint-disable-next-line no-console
      console.info('[market-discovery-reactor] seeded-profiles', { count: seeded });
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[market-discovery-reactor] seed-failed', String(err));
  }

  const unprocessed = await prisma.marketListing.findMany({
    where: { reactedAt: null, status: 'active' },
    orderBy: { firstSeenAt: 'asc' },
    take: BATCH_SIZE,
  });
  if (unprocessed.length === 0) return;

  // Pre-fetch active profiles once per tick — typically dozens, not
  // thousands. Trades one large query for N small ones; for N=50
  // listings × M=100 profiles the in-memory loop is microseconds.
  const profiles = await prisma.leadSearchProfile.findMany({
    where: {
      lead: { status: { in: ['HOT', 'WARM', 'COLD'] } },
    },
    include: { lead: { select: { id: true, agentId: true } } },
  });

  for (const listing of unprocessed) {
    let createdAny = false;
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
      if (r.score < MIN_SCORE) continue;

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

      await prisma.notification.create({
        data: {
          userId: profile.lead.agentId,
          type: 'market_listing_match',
          title: 'נכס חדש מתאים לליד שלך',
          body: notificationBody(listing),
          link: `/market-discovery?match=${match.id}`,
        },
      });
      createdAny = true;

      // Phase 3 — opt-in external delivery. Look up the agent's
      // preference; if email is enabled and the score meets their
      // personal threshold, queue a PendingNotificationDelivery.
      // The notificationDelivery worker drains the queue via SES.
      try {
        const pref = await prisma.userNotificationPreference.findUnique({
          where: { userId: profile.lead.agentId },
          include: { user: { select: { email: true } } },
        });
        if (pref && r.score >= pref.minMatchScoreForExternalDelivery) {
          if (pref.marketMatchEmailEnabled && pref.user.email) {
            await prisma.pendingNotificationDelivery.create({
              data: {
                userId: profile.lead.agentId,
                channel: 'email',
                type: 'market_listing_match',
                title: 'נכס חדש מתאים לליד שלך',
                body: notificationBody(listing),
                link: `/market-discovery?match=${match.id}`,
                recipientEmail: pref.user.email,
                idempotencyKey: `market_listing_match:${match.id}`,
              },
            });
          }
          // SMS branch intentionally not enabled — no provider yet.
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn(
          '[market-discovery-reactor] queue-delivery-failed',
          { matchId: match.id, agentUserId: profile.lead.agentId, err: String(err) },
        );
      }
    }

    // Mark this listing as processed regardless of whether matches
    // fired. NULL means "needs a fresh look" — set reactedAt = NULL
    // on every row to force re-evaluation when matching weights
    // change.
    await prisma.marketListing.update({
      where: { id: listing.id },
      data: { reactedAt: new Date() },
    });

    if (createdAny) {
      // eslint-disable-next-line no-console
      console.info('[market-discovery-reactor] reacted', { listingId: listing.id });
    }
  }
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
