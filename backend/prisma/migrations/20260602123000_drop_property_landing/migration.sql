-- Drop the per-property landing-page feature (editor + public page).
-- See docs/removal-2026-06-02-feature-cull.md §7.
--
-- The landing page surfaced `Property.landingPageConfig` as the
-- editor-authored layout, `PropertyInquiry` as the public contact-form
-- backing store, and `PropertyView` as the anonymous per-day view
-- counter. All three are deleted together — the editor + public
-- routes + tracker pixel are all gone in the same commit.

ALTER TABLE "Property" DROP COLUMN IF EXISTS "landingPageConfig";

DROP TABLE IF EXISTS "PropertyInquiry" CASCADE;
DROP TABLE IF EXISTS "PropertyView" CASCADE;
