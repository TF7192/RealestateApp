-- 2026-05-11 — Property.landingPageConfig.
-- Per-property JSON config for the per-asset landing page at
-- /l/:agentSlug/:propertySlug. Premium agents author the config via
-- /properties/:id/landing-editor; non-premium agents and pre-feature
-- rows have `null`, which the renderer treats as "use the hard-coded
-- default layout" (the pre-editor behavior). Additive, no backfill.

ALTER TABLE "Property"
  ADD COLUMN "landingPageConfig" JSONB;
