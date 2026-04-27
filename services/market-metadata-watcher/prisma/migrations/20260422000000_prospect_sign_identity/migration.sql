-- Prospect-sign form parity: capture ID-type/number + residential
-- address at signature time. Matches the industry-standard interested-
-- party intake. Fully additive + nullable so existing rows stay valid.

ALTER TABLE "Prospect"
  ADD COLUMN "idType"    TEXT,
  ADD COLUMN "idNumber"  TEXT,
  ADD COLUMN "address"   TEXT;
