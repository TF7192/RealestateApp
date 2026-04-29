-- Per-agent specialty cities — drives the "מודעות חדשות בשוק" feed.
--
-- When non-empty, /api/market-discovery/listings filters returned
-- MarketListing rows to `city ∈ specialtyCities` (canonicalized via
-- `normalizeCity`). Empty array ⇒ legacy behavior (no city filter),
-- so existing users see no regression on rollout.
--
-- Additive, non-destructive. Defaults to the empty Postgres text[]
-- so every existing User row is automatically opted-in to the
-- legacy "show everything" path.

ALTER TABLE "User"
  ADD COLUMN "specialtyCities" TEXT[] NOT NULL DEFAULT '{}';
