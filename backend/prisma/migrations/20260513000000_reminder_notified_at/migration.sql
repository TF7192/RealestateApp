-- Reminder firing scheduler — track when a reminder was notified so
-- the worker doesn't double-fire. NULL means not yet emitted.
ALTER TABLE "Reminder" ADD COLUMN "notifiedAt" TIMESTAMPTZ(6);

-- Partial index makes the worker's hot-path query
-- (status='PENDING' AND dueAt<=now() AND notifiedAt IS NULL) cheap.
CREATE INDEX "Reminder_due_unfired" ON "Reminder" ("dueAt")
  WHERE "status" = 'PENDING' AND "notifiedAt" IS NULL;
