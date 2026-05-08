-- 2026-05-08 — additional requirement booleans on the lead's brief:
-- proximity to schools/educational institutions and access to public
-- transport. Stored on Lead alongside the other *Required booleans
-- (parkingRequired, balconyRequired, etc.) so the form has one place
-- to read+write. Matching code can layer on top later.
ALTER TABLE "Lead" ADD COLUMN "educationProximityRequired" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Lead" ADD COLUMN "publicTransportRequired"    BOOLEAN NOT NULL DEFAULT false;
