-- 2026-05-03 sprint — additive: optional Israeli ID number for the
-- property owner. Nullable so existing rows are unaffected.
ALTER TABLE "Property" ADD COLUMN "ownerNationalId" VARCHAR(40);
