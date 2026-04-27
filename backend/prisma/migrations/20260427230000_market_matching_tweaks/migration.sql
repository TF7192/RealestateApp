-- Add `customDeliveryEmail` to UserNotificationPreference. Lowers
-- minMatchScoreForExternalDelivery default from 85 → 40 so newly-created
-- preference rows inherit the same threshold the reactor uses.
ALTER TABLE "UserNotificationPreference"
  ADD COLUMN "customDeliveryEmail" TEXT;

ALTER TABLE "UserNotificationPreference"
  ALTER COLUMN "minMatchScoreForExternalDelivery" SET DEFAULT 40;

-- Backfill `kind` for listings ingested before the column existed.
-- The pre-rolldown watcher only fetched /realestate/forsale/... URLs,
-- so every NULL-kind active row is unambiguously a sale.
UPDATE "MarketListing" SET "kind" = 'forsale'
WHERE "kind" IS NULL AND "status" = 'active';

-- Reset reactor cursor on every active listing so they re-evaluate
-- under the new matching logic (city normalization + tolerance + lower
-- threshold). Idempotent — sets a column that the reactor itself
-- writes back to non-null on every successful pass.
UPDATE "MarketListing" SET "reactedAt" = NULL WHERE "status" = 'active';
