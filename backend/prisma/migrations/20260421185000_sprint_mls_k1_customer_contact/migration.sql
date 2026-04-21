-- Sprint 2 / MLS parity — Task K1: Lead contact + identity
-- normalization. Fully additive. Existing `name` / `phone` / `email`
-- stay the source of truth; the new fields let us store the Nadlan
-- form's richer structure (first / last / company / multiple phones /
-- fax / id / zip).

ALTER TABLE "Lead" ADD COLUMN "firstName"    TEXT;
ALTER TABLE "Lead" ADD COLUMN "lastName"     TEXT;
ALTER TABLE "Lead" ADD COLUMN "companyName"  TEXT;
ALTER TABLE "Lead" ADD COLUMN "address"      TEXT;
ALTER TABLE "Lead" ADD COLUMN "cityText"     TEXT;
ALTER TABLE "Lead" ADD COLUMN "zip"          TEXT;
ALTER TABLE "Lead" ADD COLUMN "primaryPhone" TEXT;
ALTER TABLE "Lead" ADD COLUMN "phone1"       TEXT;
ALTER TABLE "Lead" ADD COLUMN "phone2"       TEXT;
ALTER TABLE "Lead" ADD COLUMN "fax"          TEXT;
ALTER TABLE "Lead" ADD COLUMN "personalId"   TEXT;
ALTER TABLE "Lead" ADD COLUMN "description"  TEXT;
