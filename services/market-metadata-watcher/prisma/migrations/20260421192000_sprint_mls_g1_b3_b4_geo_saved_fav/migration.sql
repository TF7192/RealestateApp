-- Sprint 7 / MLS parity — Tasks G1, B3, B4.
--
-- G1: Neighborhood directory. Nadlan maintains a normalized city +
-- neighborhood lookup used by both properties and customer profiles.
-- Estia stores neighborhoods as free strings today; this table is the
-- canonical dictionary for autocomplete and hygiene.
--
-- B3: SavedSearch — named filter snapshots so agents can return to a
-- query ("תל אביב 4+ חד׳ עד 3M") with one click.
--
-- B4: Favorite — a cross-entity pinboard (property/lead/owner).

CREATE TABLE "Neighborhood" (
  "id"        TEXT         NOT NULL,
  "city"      TEXT         NOT NULL,
  "name"      TEXT         NOT NULL,
  "aliases"   TEXT[]       NOT NULL DEFAULT ARRAY[]::TEXT[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Neighborhood_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Neighborhood_city_name_key" ON "Neighborhood"("city", "name");
CREATE INDEX "Neighborhood_city_idx"              ON "Neighborhood"("city");

CREATE TYPE "SavedSearchEntity" AS ENUM ('PROPERTY', 'LEAD');

CREATE TABLE "SavedSearch" (
  "id"         TEXT               NOT NULL,
  "agentId"    TEXT               NOT NULL,
  "entityType" "SavedSearchEntity" NOT NULL,
  "name"       TEXT               NOT NULL,
  "filters"    JSONB              NOT NULL,
  "createdAt"  TIMESTAMP(3)       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3)       NOT NULL,
  CONSTRAINT "SavedSearch_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "SavedSearch"
  ADD CONSTRAINT "SavedSearch_agentId_fkey"
  FOREIGN KEY ("agentId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "SavedSearch_agentId_idx" ON "SavedSearch"("agentId");

CREATE TYPE "FavoriteEntity" AS ENUM ('PROPERTY', 'LEAD', 'OWNER');

CREATE TABLE "Favorite" (
  "id"         TEXT             NOT NULL,
  "agentId"    TEXT             NOT NULL,
  "entityType" "FavoriteEntity" NOT NULL,
  "entityId"   TEXT             NOT NULL,
  "createdAt"  TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Favorite_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "Favorite"
  ADD CONSTRAINT "Favorite_agentId_fkey"
  FOREIGN KEY ("agentId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
CREATE UNIQUE INDEX "Favorite_agentId_entityType_entityId_key"
  ON "Favorite"("agentId", "entityType", "entityId");
