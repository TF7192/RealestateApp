// scripts/backfill-notifications.ts
//
// One-off backfill: rewrite existing `market_listing_match` Notification
// rows so their `title` and `body` use the 2026-05-08 sentence format —
// "נכס חדש למכירה ברמת גן מתאים לטל, הדר ועוד 2 מתעניינים".
//
// Each notification stores the originating match ID in its `link`
// field as `/market-discovery?match=<id>`. We resolve that to the
// MarketListingLeadMatch row, fetch every match for the same
// (listing, agent) pair (so the names list matches what the reactor
// would have produced), look up the listing for street/city/kind,
// then UPDATE Notification.{title, body}.
//
// Idempotent — runs against the current row state every time. Safe
// to re-run if a tweak to the formatters lands later. Notifications
// whose match row no longer exists (deleted lead etc.) are skipped
// and counted.
//
// Run inside the prod backend container:
//   sudo docker exec -d estia-new-backend-1 \
//     sh -c 'npx tsx scripts/backfill-notifications.ts > /tmp/backfill-notifications.log 2>&1'
//
// Or run with --dry-run first to see what would change without writing.

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ── Formatters (mirrored from marketDiscoveryReactor.ts so we don't
// need to export them). Update both places if the format changes. ─

function listingKindLabel(kind: 'forsale' | 'rent' | null | undefined): string {
  if (kind === 'rent') return 'להשכרה';
  if (kind === 'forsale') return 'למכירה';
  return '';
}

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

function notificationTitle(
  l: { city: string | null; kind: 'forsale' | 'rent' | null | undefined },
  matches: { leadName: string }[],
): string {
  const kind = listingKindLabel(l.kind);
  const cityFrag = l.city ? `ב${l.city}` : '';
  const namesFrag = formatMatchedNames(matches, { suffix: 'מתעניינים' });
  const head = ['נכס חדש', kind, cityFrag].filter(Boolean).join(' ');
  return namesFrag ? `${head} מתאים ל${namesFrag}` : head;
}

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

// ── Backfill loop ─────────────────────────────────────────────────

const MATCH_ID_RE = /[?&]match=([a-z0-9-]+)/i;

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  const notifs = await prisma.notification.findMany({
    where: { type: 'market_listing_match' },
    select: { id: true, userId: true, link: true, title: true, body: true },
    orderBy: { createdAt: 'asc' },
  });
  console.log(`found ${notifs.length} market_listing_match notifications` +
    (dryRun ? ' (dry-run)' : ''));

  let updated = 0;
  let unchanged = 0;
  let orphaned = 0;
  let errored = 0;

  for (const n of notifs) {
    try {
      const m = n.link?.match(MATCH_ID_RE);
      const matchId = m?.[1];
      if (!matchId) { orphaned += 1; continue; }

      // Resolve match → listing + agent.
      const primary = await prisma.marketListingLeadMatch.findUnique({
        where: { id: matchId },
        select: { marketListingId: true, agentUserId: true },
      });
      if (!primary) { orphaned += 1; continue; }

      // Listing → kind, city, street.
      const listing = await prisma.marketListing.findUnique({
        where: { id: primary.marketListingId },
        select: { kind: true, city: true, street: true },
      });
      if (!listing) { orphaned += 1; continue; }

      // All matches for this (listing, agent) pair → ordered names.
      const allMatches = await prisma.marketListingLeadMatch.findMany({
        where: {
          marketListingId: primary.marketListingId,
          agentUserId: primary.agentUserId,
        },
        select: { lead: { select: { name: true } } },
        orderBy: { score: 'desc' },
      });
      const matches = allMatches
        .map((row) => ({ leadName: row.lead?.name || '' }))
        .filter((row) => row.leadName);

      const newTitle = notificationTitle(listing, matches);
      const newBody  = notificationBody(listing, matches);

      if (newTitle === n.title && newBody === n.body) {
        unchanged += 1;
        continue;
      }

      if (dryRun) {
        console.log(`would update ${n.id}: ${n.title!.slice(0, 60)}… → ${newTitle.slice(0, 60)}…`);
      } else {
        await prisma.notification.update({
          where: { id: n.id },
          data: { title: newTitle, body: newBody },
        });
      }
      updated += 1;
    } catch (e) {
      errored += 1;
      console.warn(`error on ${n.id}:`, (e as Error).message);
    }
  }

  console.log(`done. updated=${updated} unchanged=${unchanged} orphaned=${orphaned} errored=${errored}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
