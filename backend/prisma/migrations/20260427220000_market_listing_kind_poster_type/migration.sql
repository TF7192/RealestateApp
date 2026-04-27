-- Add `kind` (forsale|rent) and `posterType` (private|agency) to MarketListing.
-- Both nullable + indexed; existing rows are NULL until next watcher tick
-- refreshes their metadataHash (hash now includes these fields).
ALTER TABLE "MarketListing"
  ADD COLUMN "kind" TEXT,
  ADD COLUMN "posterType" TEXT;

CREATE INDEX "MarketListing_kind_idx" ON "MarketListing" ("kind");
CREATE INDEX "MarketListing_posterType_idx" ON "MarketListing" ("posterType");
