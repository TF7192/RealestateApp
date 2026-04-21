-- Sprint 1 / MLS parity — Task D1: Standalone Reminder entity.
-- Fully additive.

CREATE TYPE "ReminderStatus" AS ENUM ('PENDING', 'COMPLETED', 'CANCELLED');

CREATE TABLE "Reminder" (
  "id"          TEXT             NOT NULL,
  "agentId"     TEXT             NOT NULL,
  "title"       TEXT             NOT NULL,
  "notes"       TEXT,
  "dueAt"       TIMESTAMP(3)     NOT NULL,
  "status"      "ReminderStatus" NOT NULL DEFAULT 'PENDING',
  "completedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  -- Optional relations — reminders can float (no entity) or anchor to
  -- a lead/customer/property for quick navigation from the reminder row.
  "leadId"      TEXT,
  "propertyId"  TEXT,
  "customerId"  TEXT,
  "createdAt"   TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3)     NOT NULL,
  CONSTRAINT "Reminder_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Reminder"
  ADD CONSTRAINT "Reminder_agentId_fkey"
  FOREIGN KEY ("agentId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Reminder"
  ADD CONSTRAINT "Reminder_leadId_fkey"
  FOREIGN KEY ("leadId") REFERENCES "Lead"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Reminder"
  ADD CONSTRAINT "Reminder_propertyId_fkey"
  FOREIGN KEY ("propertyId") REFERENCES "Property"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Reminder"
  ADD CONSTRAINT "Reminder_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Reminder_agentId_status_dueAt_idx"
  ON "Reminder"("agentId", "status", "dueAt");
CREATE INDEX "Reminder_leadId_idx"     ON "Reminder"("leadId");
CREATE INDEX "Reminder_propertyId_idx" ON "Reminder"("propertyId");
CREATE INDEX "Reminder_customerId_idx" ON "Reminder"("customerId");
