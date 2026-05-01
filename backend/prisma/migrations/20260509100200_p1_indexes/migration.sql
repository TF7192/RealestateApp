-- P1-1 + P1-2 from the DB audit (binary-sleeping-mist).
-- All additive: missing FK indexes and compound indexes for hot
-- list-query patterns. No data migration; safe to apply online.
--
-- Note: Prisma can't emit CREATE INDEX CONCURRENTLY. If the target
-- table has heavy concurrent writes at apply time, run these manually
-- with CONCURRENTLY in a maintenance window and stamp the migration
-- as applied with `prisma migrate resolve --applied`.

-- P1-1 — FK lookup indexes
CREATE INDEX IF NOT EXISTS "Message_senderId_idx" ON "Message"("senderId");
CREATE INDEX IF NOT EXISTS "OfficeInvite_invitedById_idx" ON "OfficeInvite"("invitedById");
CREATE INDEX IF NOT EXISTS "OfficeInvite_acceptedById_idx" ON "OfficeInvite"("acceptedById");
CREATE INDEX IF NOT EXISTS "OwnerPhone_ownerId_kind_idx" ON "OwnerPhone"("ownerId", "kind");

-- P1-2 — Agent-scoped compound indexes
CREATE INDEX IF NOT EXISTS "Lead_agentId_status_idx" ON "Lead"("agentId", "status");
CREATE INDEX IF NOT EXISTS "Lead_agentId_customerStatus_idx" ON "Lead"("agentId", "customerStatus");
CREATE INDEX IF NOT EXISTS "LeadMeeting_agentId_startsAt_idx" ON "LeadMeeting"("agentId", "startsAt");
CREATE INDEX IF NOT EXISTS "Advert_agentId_channel_status_idx" ON "Advert"("agentId", "channel", "status");
