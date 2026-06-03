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

// Exported so integration tests can invoke a single drain directly
// without the 30s setInterval.
export async function drainOnce() {
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
      leadId: string;
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
        leadId: profile.leadId,
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

      await prisma.notification.create({
        data: {
          userId: agentUserId,
          type: 'market_listing_match',
          title: notificationTitle(listing, matches),
          body: notificationBody(listing, matches),
          link: `/market-discovery?match=${primary.matchId}`,
        },
      });

      // 2026-05-06 — opt-in external delivery via the digest queue.
      // Instead of queueing one PendingNotificationDelivery per
      // (agent, listing) — which fired immediately and was the
      // source of inbox-spam complaints — we write one
      // NotificationDispatch row per (agent, lead, listing). A
      // separate scheduler reads un-dispatched rows every 30
      // minutes and sends ONE consolidated email per agent.
      // Dedup is enforced by the unique index on the triple, so
      // re-running the reactor (reactedAt reset) never resurfaces
      // a pair we already mailed about.
      try {
        const pref = await prisma.userNotificationPreference.findUnique({
          where: { userId: agentUserId },
        });
        const topScore = Math.max(...matches.map((m) => m.score));
        if (
          pref?.marketMatchEmailEnabled &&
          topScore >= pref.minMatchScoreForExternalDelivery
        ) {
          // Persist every match (one row per lead). Skip duplicates so
          // the reactor stays idempotent across re-evaluations.
          await prisma.notificationDispatch.createMany({
            data: matches.map((m) => ({
              agentId: agentUserId,
              leadId: m.leadId,
              marketListingId: listing.id,
              matchScore: m.score,
            })),
            skipDuplicates: true,
          });
          // SMS branch intentionally not enabled — no provider yet.
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn(
          '[market-discovery-reactor] queue-dispatch-failed',
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
// 2026-05-08 — listing kind label in Hebrew. Maps the Prisma enum
// MarketListingKind (`forsale` / `rent` / `commercial`) onto the
// natural Hebrew preposition phrase that reads inside a sentence.
function listingKindLabel(kind: 'forsale' | 'rent' | 'commercial' | null | undefined): string {
  if (kind === 'rent') return 'להשכרה';
  if (kind === 'forsale') return 'למכירה';
  if (kind === 'commercial') return 'מסחרי';
  return '';
}

// Format the matched-customer names as a natural Hebrew phrase.
//   1 match  → "טל"
//   2 matches → "טל והדר"
//   3+       → "טל, הדר ועוד {N-2}{ suffix?}"
// `suffix` (e.g. "מתעניינים") is appended after the count when set.
// The list is capped to the first two names — agents glance at the
// notification, so a wall of names hurts more than it helps.
function formatMatchedNames(
  matches: { leadName: string }[],
  opts: { suffix?: string } = {},
): string {
  const names = matches.map((m) => m.leadName).filter(Boolean) as string[];
  if (names.length === 0) return '';
  if (names.length === 1) return names[0]!;
  if (names.length === 2) return `${names[0]} ו${names[1]}`;
  const rest = names.length - 2;
  const tail = opts.suffix ? `ועוד ${rest} ${opts.suffix}` : `ועוד ${rest}`;
  return `${names[0]}, ${names[1]} ${tail}`;
}

// Title ─ the bell-popover headline. Format:
//   "נכס חדש {למכירה|להשכרה} ב{עיר} מתאים ל{שמות}, ועוד N מתעניינים"
// Each segment is opt-in so missing fields don't leave dangling words:
// e.g. "נכס חדש מתאים לטל" if both kind + city are null.
function notificationTitle(
  l: { city: string | null; kind: 'forsale' | 'rent' | 'commercial' | null | undefined },
  matches: { leadName: string }[],
): string {
  const kind = listingKindLabel(l.kind);
  const cityFrag = l.city ? `ב${l.city}` : '';
  const namesFrag = formatMatchedNames(matches, { suffix: 'מתעניינים' });

  const head = ['נכס חדש', kind, cityFrag].filter(Boolean).join(' ');
  return namesFrag ? `${head} מתאים ל${namesFrag}` : head;
}

// Body ─ the preview line under the title. Format:
//   "נמצא נכס חדש ב{עיר}, רחוב {רחוב} אשר מתאים ל{שמות} ועוד N"
// Same opt-in rules as the title; falls back gracefully when city /
// street are null. Body intentionally omits the trailing "מתעניינים"
// to keep the line shorter — the title already names the audience.
function notificationBody(
  l: { street: string | null; city: string | null },
  matches: { leadName: string }[],
): string {
  const placeBits: string[] = [];
  if (l.city)   placeBits.push(`ב${l.city}`);
  if (l.street) placeBits.push(`רחוב ${l.street}`);
  const placeFrag = placeBits.join(', ');
  const namesFrag = formatMatchedNames(matches);

  const head = placeFrag ? `נמצא נכס חדש ${placeFrag}` : 'נמצא נכס חדש';
  return namesFrag ? `${head} אשר מתאים ל${namesFrag}` : head;
}

// 2026-05-06 — the previous per-match plain-text email body lived
// here. It's now rendered by lib/matchDigest.ts when the digest
// scheduler fires its 30-min batch, so the reactor itself no longer
// composes any email content.
