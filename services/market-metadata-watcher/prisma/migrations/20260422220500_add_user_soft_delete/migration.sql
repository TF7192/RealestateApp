-- A-1 — soft delete. /api/me rejects requests with this column set so
-- the SPA sees a 401 and bounces to the landing. Rows stay intact so a
-- support request can restore the account and shared properties remain
-- visible to co-owner agents.
ALTER TABLE "User" ADD COLUMN "deletedAt" TIMESTAMP(3);
