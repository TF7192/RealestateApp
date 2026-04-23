-- Commercial-lead requirement fields — mirror the commercial block on
-- Property so agents can capture a business brief (office / shop /
-- workspace) on the lead side. All columns nullable or default-false
-- so every existing private-home lead keeps working untouched.
ALTER TABLE "Lead"
  ADD COLUMN "sqmGrossMin"             INTEGER,
  ADD COLUMN "sqmNetMin"               INTEGER,
  ADD COLUMN "accessibilityRequired"   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "buildStateRequired"      TEXT,
  ADD COLUMN "workstationsMin"         INTEGER,
  ADD COLUMN "kitchenetteRequired"     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "floorShelterRequired"    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "inOfficeToiletsRequired" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "onFloorToiletsRequired"  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "openSpaceRequired"       BOOLEAN NOT NULL DEFAULT false;
