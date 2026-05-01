-- Add ON DELETE CASCADE to Property.agent and Lead.agent FKs.
--
-- The purgeDeletedUsers worker (backend/src/workers/purgeDeletedUsers.ts)
-- relies on FK cascades to remove every row owned by a soft-deleted user
-- once the 30-day retention window passes. Every other agent-owned model
-- already cascades (Owner / Deal / LeadMeeting / Tag / Reminder /
-- SavedSearch / Favorite). Property and Lead were missing the clause —
-- so a user who ever created a property silently never got hard-deleted,
-- breaking the privacy promise at /privacy.
--
-- Additive: dropping + recreating the FK constraint preserves all rows.

ALTER TABLE "Property" DROP CONSTRAINT "Property_agentId_fkey";
ALTER TABLE "Property"
  ADD CONSTRAINT "Property_agentId_fkey"
  FOREIGN KEY ("agentId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Lead" DROP CONSTRAINT "Lead_agentId_fkey";
ALTER TABLE "Lead"
  ADD CONSTRAINT "Lead_agentId_fkey"
  FOREIGN KEY ("agentId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
