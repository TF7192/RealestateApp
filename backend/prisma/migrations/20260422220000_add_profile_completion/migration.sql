-- A-4 — first-login onboarding gate. Null until the agent submits the
-- onboarding form (license + optional title / agency / phone); the SPA
-- route guard redirects to /onboarding until this column is set.
ALTER TABLE "User" ADD COLUMN "profileCompletedAt" TIMESTAMP(3);
