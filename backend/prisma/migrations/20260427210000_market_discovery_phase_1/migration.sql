-- Market Discovery — Phase 1 (2026-04-27).
-- Recovery migration: commit c6ccd39 added these models to schema.prisma
-- without including a migration file, so the deployed Prisma client
-- threw P2022 ("column Property.marketListingId does not exist") on
-- every property-related query. This migration brings prod in sync.

CREATE TABLE "MarketListingSource" (
  "id"         TEXT PRIMARY KEY,
  "name"       TEXT NOT NULL UNIQUE,
  "baseUrl"    TEXT NOT NULL,
  "isEnabled"  BOOLEAN NOT NULL DEFAULT true,
  "maxPerHour" INTEGER NOT NULL DEFAULT 200,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3) NOT NULL
);

CREATE TABLE "MarketListing" (
  "id"                TEXT PRIMARY KEY,
  "source"            TEXT NOT NULL,
  "externalListingId" TEXT NOT NULL,
  "originalUrl"       TEXT NOT NULL,
  "city"              TEXT,
  "neighborhood"      TEXT,
  "street"            TEXT,
  "propertyType"      TEXT,
  "rooms"             DOUBLE PRECISION,
  "sizeSqm"           INTEGER,
  "floor"             INTEGER,
  "price"             INTEGER,
  "pricePerSqm"       INTEGER,
  "firstSeenAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "status"            TEXT NOT NULL DEFAULT 'active',
  "metadataHash"      TEXT NOT NULL,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL
);

CREATE UNIQUE INDEX "MarketListing_source_externalListingId_key"
  ON "MarketListing"("source", "externalListingId");
CREATE INDEX "MarketListing_source_idx"        ON "MarketListing"("source");
CREATE INDEX "MarketListing_city_idx"          ON "MarketListing"("city");
CREATE INDEX "MarketListing_neighborhood_idx"  ON "MarketListing"("neighborhood");
CREATE INDEX "MarketListing_propertyType_idx"  ON "MarketListing"("propertyType");
CREATE INDEX "MarketListing_price_idx"         ON "MarketListing"("price");
CREATE INDEX "MarketListing_rooms_idx"         ON "MarketListing"("rooms");
CREATE INDEX "MarketListing_sizeSqm_idx"       ON "MarketListing"("sizeSqm");
CREATE INDEX "MarketListing_firstSeenAt_idx"   ON "MarketListing"("firstSeenAt");
CREATE INDEX "MarketListing_status_idx"        ON "MarketListing"("status");
CREATE INDEX "MarketListing_metadataHash_idx"  ON "MarketListing"("metadataHash");

CREATE TABLE "MarketListingSnapshot" (
  "id"              TEXT PRIMARY KEY,
  "marketListingId" TEXT NOT NULL,
  "capturedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "price"           INTEGER,
  "pricePerSqm"     INTEGER,
  "status"          TEXT NOT NULL,
  "metadataHash"    TEXT NOT NULL,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MarketListingSnapshot_marketListingId_fkey"
    FOREIGN KEY ("marketListingId") REFERENCES "MarketListing"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "MarketListingSnapshot_marketListingId_idx" ON "MarketListingSnapshot"("marketListingId");
CREATE INDEX "MarketListingSnapshot_capturedAt_idx"      ON "MarketListingSnapshot"("capturedAt");
CREATE INDEX "MarketListingSnapshot_price_idx"           ON "MarketListingSnapshot"("price");
CREATE INDEX "MarketListingSnapshot_status_idx"          ON "MarketListingSnapshot"("status");

CREATE TABLE "MarketWatcherRun" (
  "id"                   TEXT PRIMARY KEY,
  "startedAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt"           TIMESTAMP(3),
  "status"               TEXT NOT NULL DEFAULT 'running',
  "source"               TEXT NOT NULL,
  "listingsSeen"         INTEGER NOT NULL DEFAULT 0,
  "listingsCreated"      INTEGER NOT NULL DEFAULT 0,
  "listingsUpdated"      INTEGER NOT NULL DEFAULT 0,
  "snapshotsCreated"     INTEGER NOT NULL DEFAULT 0,
  "matchesCreated"       INTEGER NOT NULL DEFAULT 0,
  "notificationsCreated" INTEGER NOT NULL DEFAULT 0,
  "errorMessage"         TEXT,
  "metadataJson"         JSONB,
  "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "MarketWatcherRun_startedAt_idx" ON "MarketWatcherRun"("startedAt");
CREATE INDEX "MarketWatcherRun_status_idx"    ON "MarketWatcherRun"("status");
CREATE INDEX "MarketWatcherRun_source_idx"    ON "MarketWatcherRun"("source");

CREATE TABLE "MarketListingLeadMatch" (
  "id"              TEXT PRIMARY KEY,
  "marketListingId" TEXT NOT NULL,
  "leadId"          TEXT NOT NULL,
  "searchProfileId" TEXT,
  "agentUserId"     TEXT NOT NULL,
  "score"           INTEGER NOT NULL,
  "reasonsJson"     JSONB NOT NULL,
  "status"          TEXT NOT NULL DEFAULT 'new',
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MarketListingLeadMatch_marketListingId_fkey"
    FOREIGN KEY ("marketListingId") REFERENCES "MarketListing"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MarketListingLeadMatch_leadId_fkey"
    FOREIGN KEY ("leadId") REFERENCES "Lead"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MarketListingLeadMatch_agentUserId_fkey"
    FOREIGN KEY ("agentUserId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "MarketListingLeadMatch_marketListingId_leadId_searchProfileId_key"
  ON "MarketListingLeadMatch"("marketListingId", "leadId", "searchProfileId");
CREATE INDEX "MarketListingLeadMatch_marketListingId_idx" ON "MarketListingLeadMatch"("marketListingId");
CREATE INDEX "MarketListingLeadMatch_leadId_idx"          ON "MarketListingLeadMatch"("leadId");
CREATE INDEX "MarketListingLeadMatch_searchProfileId_idx" ON "MarketListingLeadMatch"("searchProfileId");
CREATE INDEX "MarketListingLeadMatch_agentUserId_idx"     ON "MarketListingLeadMatch"("agentUserId");
CREATE INDEX "MarketListingLeadMatch_score_idx"           ON "MarketListingLeadMatch"("score");
CREATE INDEX "MarketListingLeadMatch_status_idx"          ON "MarketListingLeadMatch"("status");
CREATE INDEX "MarketListingLeadMatch_createdAt_idx"       ON "MarketListingLeadMatch"("createdAt");

-- Property.marketListingId — back-pointer used after an agent
-- duplicates a discovered listing into their own CRM properties.
ALTER TABLE "Property"
  ADD COLUMN "marketListingId" TEXT,
  ADD CONSTRAINT "Property_marketListingId_fkey"
    FOREIGN KEY ("marketListingId") REFERENCES "MarketListing"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Property_marketListingId_idx" ON "Property"("marketListingId");
