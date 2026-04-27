-- Sprint 5.1 — Universal premium gate.
--
-- `isPremium` flips the gate on every 3rd-party-integration feature
-- (Estia AI + meeting summariser today; more as the product grows).
-- Defaults to FALSE so the flag is additive without touching any
-- existing row's behavior: the `requirePremium` middleware returns
-- 402 PREMIUM_REQUIRED for non-premium callers, and the frontend
-- catches that status to surface the "שדרגו" dialog.
--
-- Toggled manually by admins for the time being (no self-serve
-- upgrade flow yet); a future Sprint 5.x will wire the /contact page
-- into an actual checkout.
ALTER TABLE "User"
  ADD COLUMN "isPremium" BOOLEAN NOT NULL DEFAULT false;
