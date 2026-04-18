-- Task 3 · structured address columns for Property.
-- Additive only: legacy `street` / `city` stay as the canonical human
-- display, and `lat`/`lng` were already present. `placeId` stores the
-- Photon / Nominatim OSM id (e.g. "W12345" or "R67890") so we can
-- re-query the address later. `formattedAddress` is the full human line
-- in Hebrew exactly as Photon returned it, for when we want to show a
-- verified single-line label alongside (or instead of) street + city.

ALTER TABLE "Property"
  ADD COLUMN     "placeId"          TEXT,
  ADD COLUMN     "formattedAddress" TEXT;

-- No backfill required — existing records keep their free-text address,
-- and the frontend falls back to street + city when placeId is null.
