-- CreateEnum
CREATE TYPE "LeadKind" AS ENUM ('BUYER', 'SELLER');

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN "kind" "LeadKind" NOT NULL DEFAULT 'BUYER';

-- Index for the /leads kind toggle.
CREATE INDEX "Lead_agentId_kind_idx" ON "Lead"("agentId", "kind");
