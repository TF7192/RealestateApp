-- Sprint 4 — in-app notifications.
--
-- Agent-scoped notification rows. `type` is a free-form string (e.g.
-- "reminder_due", "lead_assigned", "property_transferred"); the
-- frontend maps types to icons. `readAt` is NULL until the user
-- dismisses the row; dual index on (userId, readAt) powers the
-- unread-count query without scanning the whole per-user slice.
CREATE TABLE "Notification" (
  "id"         TEXT NOT NULL,
  "userId"     TEXT NOT NULL,
  "type"       TEXT NOT NULL,
  "title"      TEXT NOT NULL,
  "body"       TEXT,
  "link"       TEXT,
  "readAt"     TIMESTAMP(3),
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt" DESC);
CREATE INDEX "Notification_userId_readAt_idx"    ON "Notification"("userId", "readAt");

ALTER TABLE "Notification"
  ADD CONSTRAINT "Notification_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
