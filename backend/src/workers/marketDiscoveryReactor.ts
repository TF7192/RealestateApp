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
// 40 = city (25 or near-city via the normalizer) + at least one other
// partial fit (price-near = 8, rooms-near = 8). The pre-rolldown default
// of 70 was set when matching used strict ranges only; with tolerance
// + auto-seeded profiles (which often carry only city/budget/rooms),
// 70 was unreachable and matches never fired in practice.
const MIN_SCORE = Number.parseInt(process.env.MARKET_MATCH_MIN_SCORE || '40', 10);

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
  // Pull the lead's name + status too — used to enrich the email body
  // ("ליד: דנה לוי, סטטוס: WARM") so agents see WHO matched without
  // opening the app.
  const profiles = await prisma.leadSearchProfile.findMany({
    where: {
      lead: { status: { in: ['HOT', 'WARM', 'COLD'] } },
    },
    include: {
      lead: { select: { id: true, agentId: true, name: true, status: true } },
    },
  });

  for (const listing of unprocessed) {
    // Track all matches we created for THIS listing, grouped by agent.
    // We emit ONE notification + ONE email per (agent, listing) at the
    // end of the loop, even if the listing matched several of the
    // agent's leads — the previous code created one delivery per
    // match, which is the duplicate-email source.
    type AgentMatch = {
      matchId: string;
      leadName: string;
      leadStatus: string;
      score: number;
      reasons: string[];
    };
    const perAgent = new Map<string, AgentMatch[]>();

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

      const bucket = perAgent.get(profile.lead.agentId) ?? [];
      bucket.push({
        matchId: match.id,
        leadName: profile.lead.name,
        leadStatus: profile.lead.status,
        score: r.score,
        reasons: r.reasons,
      });
      perAgent.set(profile.lead.agentId, bucket);
    }

    // ONE notification + ONE email per agent for this listing.
    //
    // Agency-listing filter ("only alerts for private properties, not
    // תיווך"): skip notification + email when posterType !== 'private'.
    // We still kept the MarketListingLeadMatch rows above so the
    // /market-discovery page surfaces them — the user's request was
    // about ALERTS, not about hiding the match itself.
    const isPrivate = listing.posterType === 'private';

    for (const [agentUserId, matches] of perAgent) {
      if (matches.length === 0) continue;
      const primary = matches[0]; // deep-link target — any match works

      if (!isPrivate) {
        // eslint-disable-next-line no-console
        console.info('[market-discovery-reactor] alert-skipped-non-private', {
          listingId: listing.id, posterType: listing.posterType, agentUserId,
        });
        continue;
      }

      const title = matches.length === 1
        ? 'נכס חדש מתאים לליד שלך'
        : `נכס חדש מתאים ל-${matches.length} לידים שלך`;

      await prisma.notification.create({
        data: {
          userId: agentUserId,
          type: 'market_listing_match',
          title,
          body: notificationBody(listing, matches.length),
          link: `/market-discovery?match=${primary.matchId}`,
        },
      });

      // Phase 3 — opt-in external delivery. Look up the agent's
      // preference; if email is enabled and the score meets their
      // personal threshold, queue ONE PendingNotificationDelivery
      // for the whole listing. Idempotency key is keyed on (listing,
      // agent) — not on a single match.id — so a re-evaluation
      // (reactedAt reset) can't re-queue the same email.
      try {
        const pref = await prisma.userNotificationPreference.findUnique({
          where: { userId: agentUserId },
          include: { user: { select: { email: true } } },
        });
        const topScore = Math.max(...matches.map((m) => m.score));
        if (pref && topScore >= pref.minMatchScoreForExternalDelivery) {
          if (pref.marketMatchEmailEnabled) {
            // customDeliveryEmail wins when set — that's the address the
            // agent typed into the "רישום להתראות מייל" popup. Falls
            // back to the User's login email so the toggle still works
            // without explicit override.
            const recipient = pref.customDeliveryEmail || pref.user.email;
            if (recipient) {
              await prisma.pendingNotificationDelivery.create({
                data: {
                  userId: agentUserId,
                  channel: 'email',
                  type: 'market_listing_match',
                  title,
                  body: emailBody(listing, matches),
                  link: `/market-discovery?match=${primary.matchId}`,
                  recipientEmail: recipient,
                  idempotencyKey: `market_listing_match:${listing.id}:${agentUserId}`,
                },
              });
            }
          }
          // SMS branch intentionally not enabled — no provider yet.
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn(
          '[market-discovery-reactor] queue-delivery-failed',
          { listingId: listing.id, agentUserId, err: String(err) },
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

    if (perAgent.size > 0) {
      // eslint-disable-next-line no-console
      console.info('[market-discovery-reactor] reacted', {
        listingId: listing.id,
        agents: perAgent.size,
        matches: Array.from(perAgent.values()).reduce((n, ms) => n + ms.length, 0),
        alerted: isPrivate,
      });
    }
  }
}

// In-app notification body — short, fits in the bell dropdown.
function notificationBody(
  l: { city: string | null; rooms: number | null; sizeSqm: number | null; price: number | null },
  leadCount: number,
): string {
  const cityFrag = l.city ? ` ב${l.city}` : '';
  const parts = [
    l.rooms != null ? `${l.rooms} חדרים` : null,
    l.sizeSqm != null ? `${l.sizeSqm} מ״ר` : null,
    l.price != null ? `₪${l.price.toLocaleString('he-IL')}` : null,
  ].filter(Boolean);
  const leadFrag = leadCount === 1 ? 'לליד פעיל' : `ל-${leadCount} לידים פעילים`;
  return `נמצא נכס חדש${cityFrag} שמתאים ${leadFrag}${parts.length ? `: ${parts.join(', ')}` : ''}.`;
}

// Plain-text email body — multi-line, includes WHO matched, WHY, and
// the original Yad2 link. The notificationDelivery worker appends a
// "פתח באפליקציה" CTA line + URL after this.
function emailBody(
  l: {
    city: string | null;
    neighborhood: string | null;
    rooms: number | null;
    sizeSqm: number | null;
    price: number | null;
    propertyType: string | null;
    originalUrl: string;
  },
  matches: { leadName: string; leadStatus: string; score: number; reasons: string[] }[],
): string {
  const lines: string[] = [];

  const headline = matches.length === 1
    ? 'נמצא נכס חדש שמתאים לליד פעיל שלך:'
    : `נמצא נכס חדש שמתאים ל-${matches.length} לידים פעילים שלך:`;
  lines.push(headline);
  lines.push('');

  // Listing block
  const where = [l.city, l.neighborhood].filter(Boolean).join(' / ');
  if (where) lines.push(`📍 ${where}`);
  const specs = [
    l.propertyType,
    l.rooms != null ? `${l.rooms} חדרים` : null,
    l.sizeSqm != null ? `${l.sizeSqm} מ״ר` : null,
    l.price != null ? `₪${l.price.toLocaleString('he-IL')}` : null,
  ].filter(Boolean);
  if (specs.length) lines.push(specs.join(' · '));
  lines.push(`🔗 קישור למודעה ביד2: ${l.originalUrl}`);
  lines.push('');

  // Matched leads
  lines.push(matches.length === 1 ? 'ליד תואם:' : 'לידים תואמים:');
  matches.forEach((m, i) => {
    const idx = matches.length === 1 ? '' : `${i + 1}. `;
    lines.push(`${idx}${m.leadName} — סטטוס: ${m.leadStatus} (התאמה ${m.score})`);
    if (m.reasons.length > 0) {
      lines.push(`   סיבות: ${m.reasons.join(', ')}`);
    }
  });

  return lines.join('\n');
}
