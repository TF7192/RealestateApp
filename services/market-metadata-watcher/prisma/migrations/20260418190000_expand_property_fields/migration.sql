-- Expand Property with registry fields, commercial fields, granular
-- parking/storage/elevator/shelter breakdowns, and the exclusivity
-- agreement PDF pointer.
--
-- All columns are nullable or defaulted so the migration is additive
-- and safe to apply to existing rows without backfill.

ALTER TABLE "Property"
  ADD COLUMN "sqmTabu"                INTEGER,
  ADD COLUMN "sqmGross"               INTEGER,
  ADD COLUMN "sqmNet"                 INTEGER,
  ADD COLUMN "elevatorCount"          INTEGER,
  ADD COLUMN "shabbatElevator"        BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "buildState"             TEXT,
  ADD COLUMN "vacancyFlexible"        BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "parkingType"            TEXT,
  ADD COLUMN "parkingCount"           INTEGER,
  ADD COLUMN "parkingCovered"         BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "parkingCoupled"         BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "parkingTandem"          BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "parkingEvCharger"       BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "nearbyParking"          BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "storageLocation"        TEXT,
  ADD COLUMN "storageSize"            INTEGER,
  ADD COLUMN "floorShelter"           BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "shelter"                BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "neighborhood"           TEXT,
  ADD COLUMN "gush"                   TEXT,
  ADD COLUMN "helka"                  TEXT,
  ADD COLUMN "arnonaAmount"           INTEGER,
  ADD COLUMN "buildingCommittee"      INTEGER,
  ADD COLUMN "kitchenette"            BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "meetingRoom"            BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "workstations"           INTEGER,
  ADD COLUMN "lobbySecurity"          BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "exclusivityAgreementUrl" TEXT;

-- Rename the legacy `externalCoop` marketing-action key to `brokerCoop`
-- (same concept, clearer Hebrew label: "שיתופי פעולה מתווכים"). Existing
-- done/notes/link state is preserved by the rename. We update in-place
-- without adding a new row so per-property history stays intact.
UPDATE "MarketingAction"
   SET "actionKey" = 'brokerCoop'
 WHERE "actionKey" = 'externalCoop';
