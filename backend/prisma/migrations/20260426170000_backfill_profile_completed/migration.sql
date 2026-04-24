-- A-4 follow-up — backfill `profileCompletedAt` for any AGENT/OWNER
-- whose agentProfile already carries a license number. These users
-- originally submitted the onboarding form but the login/signup
-- response was serialised without `profileCompletedAt`, which meant
-- the SPA's route guard never saw the stamp and bounced them back to
-- /onboarding every session — forcing them to re-type the same
-- license + office. Stamping here unblocks the guard; the auth.ts
-- serializer fix ships the stamp forward on every subsequent login.
UPDATE "User" u
SET    "profileCompletedAt" = COALESCE(u."profileCompletedAt", NOW())
FROM   "AgentProfile" ap
WHERE  ap."userId" = u."id"
  AND  u."role" IN ('AGENT', 'OWNER')
  AND  u."deletedAt" IS NULL
  AND  u."profileCompletedAt" IS NULL
  AND  ap."license" IS NOT NULL
  AND  length(btrim(ap."license")) >= 6;
