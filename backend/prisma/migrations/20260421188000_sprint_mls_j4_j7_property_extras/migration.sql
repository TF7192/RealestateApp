-- Sprint 3 / MLS parity — Tasks J4, J5, J6, J7.
-- J1 (structured address) and J2 (deal/price) and J3 (ownership) are
-- already covered by existing Property columns. This migration fills
-- the remaining gaps against Nadlan One's property form:
--   J4 — richer size/layout (half-rooms, bathrooms, toilets, master)
--   J5 — condition as an enum (currently free-text in `renovated`)
--   J6 — heating as a multi-select (text array)
--   J7 — building/unit extras (pool, gym, doorman, gated community,
--        accessibility, utility room, furnished, pet-friendly, source)

CREATE TYPE "PropertyCondition" AS ENUM (
  'NEW',                -- חדש מקבלן
  'AS_NEW',             -- חדש
  'RENOVATED',          -- משופץ
  'PRESERVED',          -- שמור
  'NEEDS_RENOVATION',   -- דורש שיפוץ
  'NEEDS_TLC',          -- זקוק לחידוש
  'RAW'                 -- שלד / מעטפת
);

ALTER TABLE "Property"
  ADD COLUMN "condition"        "PropertyCondition",
  ADD COLUMN "heatingTypes"     TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "halfRooms"        INTEGER,
  ADD COLUMN "masterBedroom"    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "bathrooms"        INTEGER,
  ADD COLUMN "toilets"          INTEGER,
  ADD COLUMN "furnished"        BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "petFriendly"      BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "doormenService"   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "gym"              BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "pool"             BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "gatedCommunity"   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "accessibility"    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "utilityRoom"      BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "listingSource"    TEXT;
