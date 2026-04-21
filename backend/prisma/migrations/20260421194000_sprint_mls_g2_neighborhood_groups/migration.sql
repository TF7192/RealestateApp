-- Sprint 7 / MLS parity — Task G2.
--
-- G2 layers "marketable area" groupings over the flat G1 neighborhood
-- dictionary. Nadlan One and real-estate agents commonly talk in terms
-- of umbrella areas (e.g. "צפון ישן תל אביב" bundles רמת אביב, נווה
-- שרת, מעוז אביב, …). Keeping the flat Neighborhood table intact lets
-- the existing autocomplete + hygiene keep working; the group layer is
-- purely additive and OWNER-curated.
--
-- Data shape:
--   NeighborhoodGroup        — group metadata per (city, name)
--   NeighborhoodGroupMember  — join row linking a group to a
--                              Neighborhood, with sortOrder so the
--                              admin UI can render a consistent order.

CREATE TABLE "NeighborhoodGroup" (
  "id"          TEXT         NOT NULL,
  "city"        TEXT         NOT NULL,
  "name"        TEXT         NOT NULL,
  "description" TEXT,
  "aliases"     TEXT[]       NOT NULL DEFAULT ARRAY[]::TEXT[],
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NeighborhoodGroup_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "NeighborhoodGroup_city_name_key"
  ON "NeighborhoodGroup"("city", "name");
CREATE INDEX "NeighborhoodGroup_city_idx"
  ON "NeighborhoodGroup"("city");

CREATE TABLE "NeighborhoodGroupMember" (
  "groupId"        TEXT NOT NULL,
  "neighborhoodId" TEXT NOT NULL,
  "sortOrder"      INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "NeighborhoodGroupMember_pkey"
    PRIMARY KEY ("groupId", "neighborhoodId")
);
ALTER TABLE "NeighborhoodGroupMember"
  ADD CONSTRAINT "NeighborhoodGroupMember_groupId_fkey"
  FOREIGN KEY ("groupId") REFERENCES "NeighborhoodGroup"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NeighborhoodGroupMember"
  ADD CONSTRAINT "NeighborhoodGroupMember_neighborhoodId_fkey"
  FOREIGN KEY ("neighborhoodId") REFERENCES "Neighborhood"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "NeighborhoodGroupMember_neighborhoodId_idx"
  ON "NeighborhoodGroupMember"("neighborhoodId");
