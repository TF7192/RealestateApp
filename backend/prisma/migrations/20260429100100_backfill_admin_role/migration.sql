-- SEC-010 follow-up — promote the existing platform admin row to
-- role='ADMIN'. The previous gate (ADMIN_EMAILS allowlist) treated
-- this email as admin via string match; once the gate flips to
-- role='ADMIN', without this backfill the platform admin would lock
-- themselves out at deploy time.
--
-- There's exactly one platform admin today, so a literal UPDATE is
-- the safe call. If the row doesn't exist (fresh DB / non-prod
-- environment that never seeded the magic email), the UPDATE is a
-- no-op — no harm done.
UPDATE "User"
SET    "role" = 'ADMIN'
WHERE  "email" = 'talfuks1234@gmail.com';
