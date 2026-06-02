-- Drop the marketing-management feature. § 4 of the 2026-06-02 feature cull.
--
-- MarketingAction was the per-property action-tracker checklist that the
-- now-deleted /marketing hub aggregated KPIs from. The table is dropped
-- with CASCADE so any leftover FK references (none expected, but be
-- safe) collapse cleanly.
--
-- PropertyView is NOT dropped here — it underpins the public property-
-- landing-page anonymous view counter, which § 7 of the same cull will
-- remove together with the landing-page surfaces themselves. Same for
-- PropertyInquiry — that table feeds the public landing-page contact
-- form; § 7 owns its removal.

DROP TABLE IF EXISTS "MarketingAction" CASCADE;
