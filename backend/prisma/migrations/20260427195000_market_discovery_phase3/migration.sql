-- Market Discovery — Phase 3 (notification preferences + delivery queue).
-- Additive only.

CREATE TABLE "UserNotificationPreference" (
  "id"                                TEXT PRIMARY KEY,
  "userId"                            TEXT NOT NULL UNIQUE,
  "marketMatchInAppEnabled"           BOOLEAN NOT NULL DEFAULT true,
  "marketMatchEmailEnabled"           BOOLEAN NOT NULL DEFAULT false,
  "marketMatchSmsEnabled"             BOOLEAN NOT NULL DEFAULT false,
  "minMatchScoreForExternalDelivery"  INTEGER NOT NULL DEFAULT 85,
  "createdAt"                         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"                         TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UserNotificationPreference_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "PendingNotificationDelivery" (
  "id"             TEXT PRIMARY KEY,
  "userId"         TEXT NOT NULL,
  "channel"        TEXT NOT NULL,
  "type"           TEXT NOT NULL,
  "title"          TEXT NOT NULL,
  "body"           TEXT,
  "link"           TEXT,
  "recipientEmail" TEXT,
  "recipientPhone" TEXT,
  "status"         TEXT NOT NULL DEFAULT 'pending',
  "errorMessage"   TEXT,
  "sentAt"         TIMESTAMP(3),
  "attemptCount"   INTEGER NOT NULL DEFAULT 0,
  "idempotencyKey" TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PendingNotificationDelivery_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "PendingNotificationDelivery_status_createdAt_idx"
  ON "PendingNotificationDelivery"("status", "createdAt");
CREATE INDEX "PendingNotificationDelivery_userId_status_idx"
  ON "PendingNotificationDelivery"("userId", "status");
CREATE INDEX "PendingNotificationDelivery_idempotencyKey_idx"
  ON "PendingNotificationDelivery"("idempotencyKey");
