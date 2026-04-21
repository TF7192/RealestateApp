-- Sprint 2 / MLS parity — Task K4: Repeatable `הנכס המבוקש` profiles
-- on Lead. Child table so one lead can have multiple search profiles
-- (e.g. "buying in Tel Aviv" AND "investing in Jerusalem").
-- Fully additive; the flat single-value fields on Lead (rooms, budget,
-- city, etc.) remain for back-compat and can eventually be migrated
-- into a profile row.

CREATE TABLE "LeadSearchProfile" (
  "id"               TEXT         NOT NULL,
  "leadId"           TEXT         NOT NULL,
  "label"            TEXT,
  "domain"           "AssetClass",
  "dealType"         "PropertyCategory",
  "propertyTypes"    TEXT[]       NOT NULL DEFAULT ARRAY[]::TEXT[],
  "cities"           TEXT[]       NOT NULL DEFAULT ARRAY[]::TEXT[],
  "neighborhoods"    TEXT[]       NOT NULL DEFAULT ARRAY[]::TEXT[],
  "streets"          TEXT[]       NOT NULL DEFAULT ARRAY[]::TEXT[],
  "minRoom"          DOUBLE PRECISION,
  "maxRoom"          DOUBLE PRECISION,
  "minPrice"         INTEGER,
  "maxPrice"         INTEGER,
  "minPricePerSqm"   INTEGER,
  "maxPricePerSqm"   INTEGER,
  "minFloor"         INTEGER,
  "maxFloor"         INTEGER,
  "minBuilt"         INTEGER,
  "maxBuilt"         INTEGER,
  "minPlot"          INTEGER,
  "maxPlot"          INTEGER,
  "parkingReq"       BOOLEAN      NOT NULL DEFAULT false,
  "elevatorReq"      BOOLEAN      NOT NULL DEFAULT false,
  "balconyReq"       BOOLEAN      NOT NULL DEFAULT false,
  "furnitureReq"     BOOLEAN      NOT NULL DEFAULT false,
  "mamadReq"         BOOLEAN      NOT NULL DEFAULT false,
  "storeroomReq"     BOOLEAN      NOT NULL DEFAULT false,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LeadSearchProfile_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "LeadSearchProfile"
  ADD CONSTRAINT "LeadSearchProfile_leadId_fkey"
  FOREIGN KEY ("leadId") REFERENCES "Lead"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "LeadSearchProfile_leadId_idx" ON "LeadSearchProfile"("leadId");
