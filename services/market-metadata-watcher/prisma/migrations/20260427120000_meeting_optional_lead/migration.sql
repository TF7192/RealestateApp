-- Sprint 4.1 / Calendar — agent-only meetings (no lead required).
--
-- The /calendar page needs a "פגישה חדשה" CTA the agent can use to
-- block out time even when there's no lead in the CRM yet (e.g. a
-- coffee with another broker, an internal review, prep time). We
-- relax LeadMeeting.leadId to nullable so the same row type can back
-- both lead-scoped and agent-only meetings without a second table.
--
-- Additive — existing rows keep their leadId. The FK already drops to
-- SET NULL on lead delete (see schema.prisma), but Prisma generated
-- onDelete: Cascade originally; we re-create the FK to ON DELETE
-- SET NULL so deleting the lead leaves the agent's meeting record
-- intact rather than removing it. Existing meeting rows are unaffected.
ALTER TABLE "LeadMeeting"
  ALTER COLUMN "leadId" DROP NOT NULL;

ALTER TABLE "LeadMeeting"
  DROP CONSTRAINT "LeadMeeting_leadId_fkey";

ALTER TABLE "LeadMeeting"
  ADD CONSTRAINT "LeadMeeting_leadId_fkey"
  FOREIGN KEY ("leadId") REFERENCES "Lead"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
