-- Compliance fields per the 2026-04-27 PPL audit:
--   termsAcceptedAt   — explicit consent timestamp at signup (PPL §11)
--   analyticsConsent  — cookie / PostHog opt-in tri-state (null/true/false)
--   passwordChangedAt — JWT revocation anchor
--
-- All nullable + additive. Existing rows: termsAcceptedAt and
-- passwordChangedAt stay NULL until the user next acts (no forced
-- re-consent for legacy users — they're treated as having accepted
-- the policy under §11 implicit-consent for the existing relationship).

ALTER TABLE "User"
  ADD COLUMN "termsAcceptedAt"    TIMESTAMP(3),
  ADD COLUMN "analyticsConsent"   BOOLEAN,
  ADD COLUMN "analyticsConsentAt" TIMESTAMP(3),
  ADD COLUMN "passwordChangedAt"  TIMESTAMP(3);
