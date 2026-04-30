-- 2026-04-30 — neighborhood ↔ street join.
-- Each Neighborhood row gets the registry street codes that fall inside
-- its OSM polygon (or, for polygon-less neighborhoods, the nearest
-- registry streets via the Voronoi fallback in the build script).
-- /api/lookups/streets?neighborhood=X uses this to narrow autocomplete
-- to that neighborhood's streets only.
ALTER TABLE "Neighborhood" ADD COLUMN "streetCodes" INTEGER[] NOT NULL DEFAULT '{}';
CREATE INDEX "Neighborhood_streetCodes_idx" ON "Neighborhood" USING GIN ("streetCodes");
