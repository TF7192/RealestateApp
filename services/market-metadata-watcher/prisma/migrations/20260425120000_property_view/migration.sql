-- Sprint 9 / marketing — page-view tracker (lane A). Additive only.
--
-- One row per (property × visitor × UTC-day). The tracker endpoint
-- computes `visitorHash = sha256(ip + userAgent + YYYY-MM-DD UTC)` and
-- inserts; a same-day reload collides on the unique index and is
-- swallowed as a dedup (returned `{ ok: true, deduped: true }`). A
-- different day produces a new row because the date is part of the
-- hash input AND the uniqueness key.
--
-- The composite (propertyId, viewedAt) index supports the aggregation
-- endpoint coming in a later lane — counts + time-series scans on a
-- single property never touch the rest of the table.
CREATE TABLE "PropertyView" (
  "id"          TEXT NOT NULL,
  "propertyId"  TEXT NOT NULL,
  "visitorHash" TEXT NOT NULL,
  "referrer"    TEXT,
  "userAgent"   TEXT,
  "viewedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PropertyView_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PropertyView_propertyId_visitorHash_viewedAt_key"
  ON "PropertyView"("propertyId", "visitorHash", "viewedAt");

CREATE INDEX "PropertyView_propertyId_viewedAt_idx"
  ON "PropertyView"("propertyId", "viewedAt");

ALTER TABLE "PropertyView" ADD CONSTRAINT "PropertyView_propertyId_fkey"
  FOREIGN KEY ("propertyId") REFERENCES "Property"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
