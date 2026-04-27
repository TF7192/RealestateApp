-- Market Discovery (Phase 1) — additive only.
--
-- Adds five new tables for the hourly Yad2 metadata watcher and one
-- nullable column on Property so duplicated CRM rows can keep an
-- "Open Original" link back to the source listing.
--
-- LEGAL/SAFETY: schema does not include columns for images,
-- descriptions, phone numbers, names, HTML, or screenshots. The
-- extractor (services/market-metadata-watcher/src/extractors/yad2-listing.ts)
-- enforces the same constraint at the read side.

-- ──────────────────────────────────────────────────────────────────
-- Tables
-- ──────────────────────────────────────────────────────────────────

CREATE TABLE "MarketListingSource" (
    "id"          TEXT        NOT NULL,
    "name"        TEXT        NOT NULL,
    "baseUrl"     TEXT        NOT NULL,
    "isEnabled"   BOOLEAN     NOT NULL DEFAULT true,
    "maxPerHour"  INTEGER     NOT NULL DEFAULT 200,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MarketListingSource_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MarketListing" (
    "id"                TEXT             NOT NULL,
    "source"            TEXT             NOT NULL,
    "externalListingId" TEXT             NOT NULL,
    "originalUrl"       TEXT             NOT NULL,
    "city"              TEXT,
    "neighborhood"      TEXT,
    "street"            TEXT,
    "propertyType"      TEXT,
    "rooms"             DOUBLE PRECISION,
    "sizeSqm"           INTEGER,
    "floor"             INTEGER,
    "price"             INTEGER,
    "pricePerSqm"       INTEGER,
    "firstSeenAt"       TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt"        TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status"            TEXT             NOT NULL DEFAULT 'active',
    "metadataHash"      TEXT             NOT NULL,
    "createdAt"         TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"         TIMESTAMP(3)     NOT NULL,
    CONSTRAINT "MarketListing_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MarketListingSnapshot" (
    "id"              TEXT         NOT NULL,
    "marketListingId" TEXT         NOT NULL,
    "capturedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "price"           INTEGER,
    "pricePerSqm"     INTEGER,
    "status"          TEXT         NOT NULL,
    "metadataHash"    TEXT         NOT NULL,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MarketListingSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MarketWatcherRun" (
    "id"                   TEXT         NOT NULL,
    "startedAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt"           TIMESTAMP(3),
    "status"               TEXT         NOT NULL DEFAULT 'running',
    "source"               TEXT         NOT NULL,
    "listingsSeen"         INTEGER      NOT NULL DEFAULT 0,
    "listingsCreated"      INTEGER      NOT NULL DEFAULT 0,
    "listingsUpdated"      INTEGER      NOT NULL DEFAULT 0,
    "snapshotsCreated"     INTEGER      NOT NULL DEFAULT 0,
    "matchesCreated"       INTEGER      NOT NULL DEFAULT 0,
    "notificationsCreated" INTEGER      NOT NULL DEFAULT 0,
    "errorMessage"         TEXT,
    "metadataJson"         JSONB,
    "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MarketWatcherRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MarketListingLeadMatch" (
    "id"              TEXT         NOT NULL,
    "marketListingId" TEXT         NOT NULL,
    "leadId"          TEXT         NOT NULL,
    "searchProfileId" TEXT,
    "agentUserId"     TEXT         NOT NULL,
    "score"           INTEGER      NOT NULL,
    "reasonsJson"     JSONB        NOT NULL,
    "status"          TEXT         NOT NULL DEFAULT 'new',
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MarketListingLeadMatch_pkey" PRIMARY KEY ("id")
);

-- ──────────────────────────────────────────────────────────────────
-- Property column for back-pointer to source MarketListing
-- ──────────────────────────────────────────────────────────────────

ALTER TABLE "Property" ADD COLUMN "marketListingId" TEXT;

-- ──────────────────────────────────────────────────────────────────
-- Indexes
-- ──────────────────────────────────────────────────────────────────

CREATE UNIQUE INDEX "MarketListingSource_name_key" ON "MarketListingSource"("name");

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
CREATE UNIQUE INDEX "MarketListing_source_externalListingId_key"
    ON "MarketListing"("source", "externalListingId");

CREATE INDEX "MarketListingSnapshot_marketListingId_idx" ON "MarketListingSnapshot"("marketListingId");
CREATE INDEX "MarketListingSnapshot_capturedAt_idx"      ON "MarketListingSnapshot"("capturedAt");
CREATE INDEX "MarketListingSnapshot_price_idx"           ON "MarketListingSnapshot"("price");
CREATE INDEX "MarketListingSnapshot_status_idx"          ON "MarketListingSnapshot"("status");

CREATE INDEX "MarketWatcherRun_startedAt_idx" ON "MarketWatcherRun"("startedAt");
CREATE INDEX "MarketWatcherRun_status_idx"    ON "MarketWatcherRun"("status");
CREATE INDEX "MarketWatcherRun_source_idx"    ON "MarketWatcherRun"("source");

CREATE INDEX "MarketListingLeadMatch_marketListingId_idx" ON "MarketListingLeadMatch"("marketListingId");
CREATE INDEX "MarketListingLeadMatch_leadId_idx"          ON "MarketListingLeadMatch"("leadId");
CREATE INDEX "MarketListingLeadMatch_searchProfileId_idx" ON "MarketListingLeadMatch"("searchProfileId");
CREATE INDEX "MarketListingLeadMatch_agentUserId_idx"     ON "MarketListingLeadMatch"("agentUserId");
CREATE INDEX "MarketListingLeadMatch_score_idx"           ON "MarketListingLeadMatch"("score");
CREATE INDEX "MarketListingLeadMatch_status_idx"          ON "MarketListingLeadMatch"("status");
CREATE INDEX "MarketListingLeadMatch_createdAt_idx"       ON "MarketListingLeadMatch"("createdAt");
CREATE UNIQUE INDEX "MarketListingLeadMatch_marketListingId_leadId_searchProfile_key"
    ON "MarketListingLeadMatch"("marketListingId", "leadId", "searchProfileId");

CREATE INDEX "Property_marketListingId_idx" ON "Property"("marketListingId");

-- ──────────────────────────────────────────────────────────────────
-- Foreign keys
-- ──────────────────────────────────────────────────────────────────

ALTER TABLE "MarketListingSnapshot"
  ADD CONSTRAINT "MarketListingSnapshot_marketListingId_fkey"
  FOREIGN KEY ("marketListingId") REFERENCES "MarketListing"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MarketListingLeadMatch"
  ADD CONSTRAINT "MarketListingLeadMatch_marketListingId_fkey"
  FOREIGN KEY ("marketListingId") REFERENCES "MarketListing"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MarketListingLeadMatch"
  ADD CONSTRAINT "MarketListingLeadMatch_leadId_fkey"
  FOREIGN KEY ("leadId") REFERENCES "Lead"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MarketListingLeadMatch"
  ADD CONSTRAINT "MarketListingLeadMatch_agentUserId_fkey"
  FOREIGN KEY ("agentUserId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Property"
  ADD CONSTRAINT "Property_marketListingId_fkey"
  FOREIGN KEY ("marketListingId") REFERENCES "MarketListing"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
