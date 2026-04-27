-- Phase 3 refactor — move matching + notification creation out of
-- the Yad2 watcher into a backend reactor. The reactor needs a
-- cursor to know which MarketListing rows it hasn't processed yet.
-- Additive, nullable; existing rows treated as "needs reaction"
-- (NULL) so the reactor backfills on first run after deploy.

ALTER TABLE "MarketListing" ADD COLUMN "reactedAt" TIMESTAMP(3);

-- Covering index for the reactor's hot query: WHERE reactedAt IS NULL
-- ORDER BY firstSeenAt ASC LIMIT N. Index range scan stays cheap
-- regardless of table growth.
CREATE INDEX "MarketListing_reactedAt_firstSeenAt_idx"
  ON "MarketListing"("reactedAt", "firstSeenAt");
