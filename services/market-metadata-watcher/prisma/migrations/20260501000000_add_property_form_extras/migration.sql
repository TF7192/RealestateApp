-- PR2 form additions for the new-property page (2026-04-26).
-- All columns are additive and either nullable or default-false so the
-- migration is safe to apply on a hot database.

ALTER TABLE "Property"
  ADD COLUMN "unitNumber"        TEXT,
  ADD COLUMN "enSuiteToilet"     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "residentsRoom"     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "bicycleRoom"       BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "managementCompany" TEXT,
  ADD COLUMN "tenantSideOnly"    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "commissionTerms"   TEXT;
