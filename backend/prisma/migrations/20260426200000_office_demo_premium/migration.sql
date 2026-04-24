-- Sprint 10 demo — דנה לוי (office.demo@estia.app) is the flagship
-- demo manager; every Estia AI surface should work for her so the
-- /ai page feels complete in a sales/demo session. Flip `isPremium`
-- to true unconditionally via migration so prod stays in sync even
-- if the seed step is skipped on a given deploy.
--
-- Idempotent — safe to run multiple times, safe if the row doesn't
-- exist yet (the first deploy seeds the user; subsequent deploys
-- just keep the flag on).
UPDATE "User"
SET    "isPremium" = true
WHERE  email = 'office.demo@estia.app';
