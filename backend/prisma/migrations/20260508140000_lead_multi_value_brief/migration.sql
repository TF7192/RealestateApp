-- 2026-05-08 PR 2 — multi-value brief fields on Lead. The single
-- `city` / `neighborhood` columns are preserved (matching + seed
-- still read them); the agent UI now binds to the arrays. Floor /
-- sqm get from-to range columns; rooms range already exists as
-- roomsMin/roomsMax. Defaults keep legacy rows unaffected.
ALTER TABLE "Lead" ADD COLUMN "cities"        TEXT[]   NOT NULL DEFAULT '{}';
ALTER TABLE "Lead" ADD COLUMN "neighborhoods" TEXT[]   NOT NULL DEFAULT '{}';
ALTER TABLE "Lead" ADD COLUMN "propertyTypes" TEXT[]   NOT NULL DEFAULT '{}';
ALTER TABLE "Lead" ADD COLUMN "floorMin"      INTEGER;
ALTER TABLE "Lead" ADD COLUMN "floorMax"      INTEGER;
ALTER TABLE "Lead" ADD COLUMN "sqmMin"        INTEGER;
ALTER TABLE "Lead" ADD COLUMN "sqmMax"        INTEGER;
