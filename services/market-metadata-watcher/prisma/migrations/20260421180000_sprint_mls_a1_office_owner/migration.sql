-- Sprint 1 / MLS parity — Task A1: Office model + OWNER role.
-- Fully additive. Existing rows keep their current role and get NULL
-- `officeId` (no office attached) so the solo-agent flow is untouched.

-- 1. Extend the UserRole enum.
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'OWNER';

-- 2. New Office table.
CREATE TABLE "Office" (
  "id"        TEXT          NOT NULL,
  "name"      TEXT          NOT NULL,
  "phone"     TEXT,
  "address"   TEXT,
  "logoUrl"   TEXT,
  "createdAt" TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3)  NOT NULL,
  CONSTRAINT "Office_pkey" PRIMARY KEY ("id")
);

-- 3. Attach users to an office (nullable FK, SET NULL on office delete).
ALTER TABLE "User" ADD COLUMN "officeId" TEXT;
ALTER TABLE "User"
  ADD CONSTRAINT "User_officeId_fkey"
  FOREIGN KEY ("officeId") REFERENCES "Office"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "User_officeId_idx" ON "User"("officeId");
