-- Extend the AuthProvider enum with APPLE. Additive; existing rows
-- (EMAIL / GOOGLE) are unchanged.
ALTER TYPE "AuthProvider" ADD VALUE 'APPLE';

-- Per-provider unique identifier so multiple Apple users don't collide
-- on the same Estia account. Nullable (EMAIL + GOOGLE users don't have
-- one), but unique when present.
ALTER TABLE "User" ADD COLUMN "appleId" TEXT;
CREATE UNIQUE INDEX "User_appleId_key" ON "User"("appleId");
