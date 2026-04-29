-- 2026-05-06 — batched lead-match notifications.
--
-- Rather than firing one email per match the moment it's discovered,
-- the reactor now writes one NotificationDispatch row per (agent,
-- lead, marketListing). A 30-minute digest scheduler reads every
-- agent's un-dispatched rows, sends a single consolidated email,
-- and stamps `dispatchedAt`. The unique constraint is the dedup
-- contract — re-evaluation of a listing never queues a duplicate
-- email for a pair we already sent about.

CREATE TABLE "NotificationDispatch" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "marketListingId" TEXT NOT NULL,
    "matchScore" INTEGER NOT NULL DEFAULT 0,
    "dispatchedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationDispatch_pkey" PRIMARY KEY ("id")
);

-- Dedup: the same (agent, lead, listing) triple can only ever exist
-- once. The reactor uses createMany({ skipDuplicates: true }) so
-- re-runs are idempotent.
CREATE UNIQUE INDEX "NotificationDispatch_agentId_leadId_marketListingId_key"
    ON "NotificationDispatch"("agentId", "leadId", "marketListingId");

-- Hot path for the digest scheduler:
--   SELECT ... WHERE agentId = $1 AND dispatchedAt IS NULL
CREATE INDEX "NotificationDispatch_agentId_dispatchedAt_idx"
    ON "NotificationDispatch"("agentId", "dispatchedAt");

-- For agent-fan-out: pick distinct agents with un-dispatched rows.
CREATE INDEX "NotificationDispatch_dispatchedAt_idx"
    ON "NotificationDispatch"("dispatchedAt");

ALTER TABLE "NotificationDispatch"
    ADD CONSTRAINT "NotificationDispatch_agentId_fkey"
    FOREIGN KEY ("agentId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
