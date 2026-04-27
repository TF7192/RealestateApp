# Market Discovery — Implementation Plan

**Goal:** hourly Yad2 metadata watcher → store safe metadata only →
expose in CRM at `/market-discovery` → let agents duplicate listings
into their own properties → notify agents when discovered listings
match an active `LeadSearchProfile`.

This is a multi-day feature. The plan below splits work into four
phases so the user can ship + review at each gate. Phase 1 (the
foundation) is included in this commit; Phases 2–4 ship in follow-up
PRs after Phase 1 review.

## What already exists (reuse — do NOT rebuild)

| Feature | Existing location | Reuse strategy |
|---|---|---|
| Yad2 Playwright crawler | `backend/src/lib/yad2-crawler.ts` (`crawlAgency`, `mapSectionToAssetClass`) | Wrap in a new "discovery" entry-point that lists **public for-sale + for-rent feeds by city** instead of agency-scoped pages |
| Lead search requirements | `LeadSearchProfile` model in `prisma/schema.prisma:1434` (cities, neighborhoods, rooms range, price range, etc.) | Match `MarketListing` rows against active profiles — no new `lead_property_requirements` table needed |
| Lead/property matching engine | `backend/src/lib/matching.ts` | Extend with a `matchListingAgainstProfile(listing, profile)` variant that returns the spec's `MatchScore { score, reasons }` |
| In-app notifications | `Notification` model + `routes/notifications.ts` | Add a new `type = 'market_listing_match'`. Agents only see their own (`userId` scoped) — already enforced |
| Email infrastructure | `backend/src/lib/email.ts` | Wire `NotificationDeliveryProvider.sendEmail` to it; SMS provider is a TODO until the user picks one |
| Property creation | `backend/src/routes/properties.ts` (`POST /api/properties`) | Reuse for "Duplicate to My Properties" — body is built from `MarketListing` columns only (no images/descriptions/phones) |
| Auth + ownership | `requireUser`, `requireAgent` middleware everywhere | New routes follow the existing pattern; `agentId` always from `req.user.id`, never from client body |

## Constraints (legal + safety, hard-coded)

1. **Metadata only.** Schema does not allow images, descriptions,
   phone numbers, names, HTML, or screenshots. The `MarketListing`
   model has no `description` / `image` / `seller` columns by
   design.
2. **Source link preserved.** Every CRM render of a discovered
   listing includes `originalUrl` and surfaces it as
   "פתח במקור". After duplication into the agent's own properties,
   the duplicated `Property` keeps a `marketListingId` reference
   (via `MarketListing.crmDuplicates` back-relation) so the
   "Open Original" button stays available.
3. **Conservative crawl.** Reuses the existing 600ms polite gap +
   100-listings-per-section cap from `yad2-crawler.ts`. Hourly +
   jitter; per-source quota in `MarketListingSource.maxPerHour`.
4. **No stealth, no proxies, no CAPTCHA-solve.** Existing crawler
   does plain Chromium with the JS-challenge wait. No fingerprint
   spoofing.

## New Prisma models (Phase 1)

All additive. No existing models change.

```prisma
model MarketListingSource {
  id          String   @id @default(cuid())
  name        String   @unique             // "yad2"
  baseUrl     String
  isEnabled   Boolean  @default(true)
  maxPerHour  Int      @default(200)       // safety cap on listings ingested per run
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  listings    MarketListing[]
}

model MarketListing {
  id                 String   @id @default(cuid())
  source             String                                  // matches MarketListingSource.name
  externalListingId  String                                  // yad2's listing token
  originalUrl        String                                  // canonical "פתח במקור" link
  city               String?
  neighborhood       String?
  street             String?
  propertyType       String?                                 // "apartment" | "house" | "commercial" | etc.
  rooms              Float?
  sizeSqm            Int?
  floor              Int?
  price              Int?
  pricePerSqm        Int?
  firstSeenAt        DateTime  @default(now())
  lastSeenAt         DateTime  @default(now())
  status             String    @default("active")            // "active" | "removed" | "unknown"
  metadataHash       String                                  // sha256 of canonicalized metadata, used to detect changes
  createdAt          DateTime  @default(now())
  updatedAt          DateTime  @updatedAt

  snapshots          MarketListingSnapshot[]
  leadMatches        MarketListingLeadMatch[]
  crmDuplicates      Property[]                              // back-relation; new column on Property below

  @@unique([source, externalListingId])
  @@index([source])
  @@index([city])
  @@index([neighborhood])
  @@index([propertyType])
  @@index([price])
  @@index([rooms])
  @@index([sizeSqm])
  @@index([firstSeenAt])
  @@index([status])
  @@index([metadataHash])
}

model MarketListingSnapshot {
  id              String   @id @default(cuid())
  marketListingId String
  marketListing   MarketListing @relation(fields: [marketListingId], references: [id], onDelete: Cascade)
  capturedAt      DateTime @default(now())
  price           Int?
  pricePerSqm     Int?
  status          String
  metadataHash    String
  createdAt       DateTime @default(now())

  @@index([marketListingId])
  @@index([capturedAt])
  @@index([price])
  @@index([status])
}

model MarketWatcherRun {
  id                    String    @id @default(cuid())
  startedAt             DateTime  @default(now())
  finishedAt            DateTime?
  status                String    @default("running")        // "running" | "success" | "failed" | "skipped"
  source                String
  listingsSeen          Int       @default(0)
  listingsCreated       Int       @default(0)
  listingsUpdated       Int       @default(0)
  snapshotsCreated      Int       @default(0)
  matchesCreated        Int       @default(0)
  notificationsCreated  Int       @default(0)
  errorMessage          String?
  metadataJson          Json?
  createdAt             DateTime  @default(now())

  @@index([startedAt])
  @@index([status])
  @@index([source])
}

model MarketListingLeadMatch {
  id                String        @id @default(cuid())
  marketListingId   String
  marketListing     MarketListing @relation(fields: [marketListingId], references: [id], onDelete: Cascade)
  leadId            String
  lead              Lead          @relation(fields: [leadId], references: [id], onDelete: Cascade)
  searchProfileId   String?                                  // nullable for legacy "flat-fields" lead matches
  agentUserId       String                                   // denormalized for query speed; lead.agentId
  agent             User          @relation(fields: [agentUserId], references: [id], onDelete: Cascade)
  score             Int                                       // 0–100
  reasonsJson       Json
  status            String        @default("new")            // "new" | "viewed" | "dismissed" | "duplicated"
  createdAt         DateTime      @default(now())
  updatedAt         DateTime      @updatedAt

  @@unique([marketListingId, leadId, searchProfileId])
  @@index([marketListingId])
  @@index([leadId])
  @@index([searchProfileId])
  @@index([agentUserId])
  @@index([score])
  @@index([status])
  @@index([createdAt])
}
```

Plus one column on the existing `Property` model — strictly additive:

```prisma
model Property {
  // … existing fields …
  marketListingId String?
  marketListing   MarketListing? @relation(fields: [marketListingId], references: [id], onDelete: SetNull)
}
```

Plus the back-relations on `Lead` (`marketListingMatches`) and `User`
(`marketListingMatches`) — additive.

## Phases

### Phase 1 — Foundation (this commit)

**Status: ✅ shipped in this commit.**

- Prisma migration adding the 5 new models + the `Property.marketListingId` column.
- `services/market-metadata-watcher/` skeleton:
  - `Dockerfile` (Playwright base image, matches the existing one)
  - `package.json`
  - `src/index.ts` — bootstrap
  - `src/scheduler.ts` — hourly + jitter, lock-protected, no overlap
  - `src/db.ts` — Prisma client, scoped to the new tables only
  - `src/sources/yad2.ts` — wraps the existing `crawlAgency`-style API to discover new listings via Yad2's city feeds
  - `src/extractors/yad2-listing.ts` — converts a raw Yad2 listing object → safe `MarketListing` payload (drops description, images, phones)
  - `src/hash.ts` — canonical metadata hash
  - `src/upsert.ts` — idempotent upsert + snapshot creation
  - `src/matching.ts` — score function (0–100) per the spec
  - `src/notifications.ts` — creates `Notification` rows for matched agents
  - `src/config.ts` — env vars (`MARKET_MATCH_MIN_SCORE`, etc.)
- Backend route stubs:
  - `GET /api/market-listings` — paginated list with filters
  - `GET /api/market-listings/:id`
  - `POST /api/market-listings/:id/duplicate` — creates a `Property` under `req.user.id`
  - `GET /api/market-matches`
  - `POST /api/market-matches/:id/view`
  - `POST /api/market-matches/:id/dismiss`
- Frontend page skeleton at `/market-discovery` (Hebrew "מודעות חדשות בשוק") — list-only, filter UI deferred to Phase 2.
- Unit tests:
  - `metadata hash is deterministic + changes when relevant fields change`
  - `upsert is idempotent`
  - `score calculation matches spec`

### Phase 2 — Frontend polish + filter UI + match notifications wired

- Full filter UI on `/market-discovery` (city / neighborhood /
  type / rooms / price / sqm / status / first-seen range).
- Sort options.
- Match status surfacing: when an agent navigates from a notification,
  the listing gets a "מתאים לליד שלך" highlight + reasons.
- Notification bell wires through to `/market-discovery?match=:id`.
- Mobile polish following the same conventions as
  `IPHONE_SMOOTHNESS_MAP.md`.

### Phase 3 — Notification preferences + delivery hooks

- `UserNotificationPreference` model.
- `NotificationDeliveryLog` model.
- `NotificationDeliveryProvider` interface + email impl backed by
  `lib/email.ts`.
- SMS provider: TODO (left as a documented hook; integration when
  a provider is chosen).
- Threshold gate (`min_match_score_for_external_delivery`, default 85).
- Settings UI under `/settings/notifications`.

### Phase 4 — Observability + admin

- Last-scan UI on `/market-discovery` ("נסרק לפני 12 דקות").
- Admin page `/admin/market-watcher` showing
  `MarketWatcherRun` rows: success/failed counts, last error,
  listings ingested per run, matches created.
- Manual "Run now" button (admin-only).
- Slack/email alerting on N consecutive failed runs.

## Security model (enforced from Phase 1)

- All routes require `requireUser` (or `requireAgent`).
- `POST /api/market-listings/:id/duplicate` body **does not accept**
  `userId` / `agentId` — the new Property's `agentId` is set from
  `req.user.id` server-side. Test asserts this.
- `GET /api/market-matches` and `POST /api/market-matches/:id/{view,dismiss}`
  filter by `agentUserId = req.user.id`. Test asserts cross-agent
  access returns 404.
- `Notification` reads already filter by `userId = req.user.id`
  (existing route).

## Container deployment notes

- `docker-compose.yml` gets a new service:

```yaml
market-watcher:
  build:
    context: .
    dockerfile: services/market-metadata-watcher/Dockerfile
  environment:
    DATABASE_URL: ${DATABASE_URL}
    MARKET_MATCH_MIN_SCORE: 70
    MARKET_WATCHER_INTERVAL_MS: 3600000   # 1 hour
    MARKET_WATCHER_JITTER_MS: 600000      # ±10 min
    MARKET_WATCHER_DISCOVERY_CITIES: "תל אביב,רמת גן,גבעתיים,רעננה,הרצליה"
  depends_on:
    - db
  restart: unless-stopped
```

- The CRM container does not depend on the watcher. If the watcher
  is stopped, the CRM still serves cached `MarketListing` rows from
  the DB.
- Production deploy: add the new service to `docker-compose.prod.yml`
  in the same pattern; watcher rolls out via the existing
  `gh workflow run deploy-prod.yml -f ref=<sha>` flow.

## Runbook (after Phase 1 lands)

```bash
# Local dev — apply the schema migration
cd backend
npx prisma migrate dev --name market_discovery_phase1

# Run the watcher locally
cd services/market-metadata-watcher
npm install
npm run dev   # one-shot run, no scheduler
npm start     # scheduler enabled, runs every hour

# Inspect runs
psql $DATABASE_URL -c "select started_at, status, listings_created, matches_created, error_message from market_watcher_runs order by started_at desc limit 10;"

# Stop the watcher (CRM keeps working)
docker compose stop market-watcher

# Rollback
# - Watcher: docker compose stop, drop the new image. Tables stay.
# - Schema: `prisma migrate resolve --rolled-back market_discovery_phase1` then drop tables manually.
#   (Additive migration — no existing-data risk.)
```

## What's NOT in Phase 1 (explicit deferrals)

- Filter UI on the frontend (only basic list shipped).
- Notification bell wiring to the new match type.
- SMS / email delivery (architecture hooks only).
- Notification preferences table + UI.
- Admin observability page.
- Pull-to-refresh / View Transitions on the new page.
- Real production deploy: Phase 1 ships as code only — `docker-compose.prod.yml`
  edit, watcher container build, and migration apply happen on a
  separate review/approval cycle.
