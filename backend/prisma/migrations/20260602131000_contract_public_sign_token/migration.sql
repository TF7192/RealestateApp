-- 2026-06-02 — public sign-by-link surface for Contract.
-- Adds a 30-day token (unique), its expiry, and a column to persist
-- the customer's hand-drawn signature as a PNG data-URL (200KB cap
-- enforced at the route layer).
ALTER TABLE "Contract"
  ADD COLUMN "publicSignToken" TEXT,
  ADD COLUMN "publicSignTokenExpiresAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "Contract_publicSignToken_key" ON "Contract"("publicSignToken");

ALTER TABLE "Contract" ADD COLUMN "signatureImage" TEXT;
