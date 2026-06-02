-- 2026-06-02 — drop התאמות פומביות (public-matches) feature.
-- Removes the per-viewer "seen" table and the four Property columns
-- that backed the cross-agent shared pool. CASCADE on the seen table
-- so historical rows clear cleanly; the Property columns are dropped
-- IF EXISTS for idempotency across environments.

DROP TABLE IF EXISTS "PublicMatchSeen" CASCADE;

ALTER TABLE "Property"
  DROP COLUMN IF EXISTS "isPublicMatch",
  DROP COLUMN IF EXISTS "publicMatchAt",
  DROP COLUMN IF EXISTS "publicMatchNote",
  DROP COLUMN IF EXISTS "publicMatchSourceId";
