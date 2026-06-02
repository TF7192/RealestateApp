-- 2026-06-02 — Per-agent Gmail-style labels for /market-discovery rows.
--
-- Two new tables:
--   MarketTag             — per-agent label (name + hex color)
--   MarketTagAssignment   — attaches a MarketTag to a MarketListing
--
-- Both cascade on owner-delete (agent → tags → assignments) and on
-- listing-delete (listing → assignments). Namespace is per-agent:
-- unique(agentId, name) on the tag; unique(tagId, marketListingId)
-- on the assignment (idempotent attach).

CREATE TABLE "MarketTag" (
  "id"        TEXT NOT NULL,
  "agentId"   TEXT NOT NULL,
  "name"      TEXT NOT NULL,
  "color"     TEXT NOT NULL DEFAULT '#b48b4c',
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "MarketTag_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MarketTag_agentId_name_key" ON "MarketTag"("agentId", "name");
CREATE INDEX "MarketTag_agentId_idx" ON "MarketTag"("agentId");

ALTER TABLE "MarketTag"
  ADD CONSTRAINT "MarketTag_agentId_fkey"
  FOREIGN KEY ("agentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "MarketTagAssignment" (
  "id"              TEXT NOT NULL,
  "tagId"           TEXT NOT NULL,
  "marketListingId" TEXT NOT NULL,
  "assignedAt"      TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MarketTagAssignment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MarketTagAssignment_tagId_marketListingId_key"
  ON "MarketTagAssignment"("tagId", "marketListingId");
CREATE INDEX "MarketTagAssignment_marketListingId_idx"
  ON "MarketTagAssignment"("marketListingId");
CREATE INDEX "MarketTagAssignment_tagId_idx"
  ON "MarketTagAssignment"("tagId");

ALTER TABLE "MarketTagAssignment"
  ADD CONSTRAINT "MarketTagAssignment_tagId_fkey"
  FOREIGN KEY ("tagId") REFERENCES "MarketTag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MarketTagAssignment"
  ADD CONSTRAINT "MarketTagAssignment_marketListingId_fkey"
  FOREIGN KEY ("marketListingId") REFERENCES "MarketListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
