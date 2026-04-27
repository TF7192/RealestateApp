-- Sprint 1 / MLS parity — Task J9: Property pipeline + admin block.
-- Fully additive. All new columns nullable / defaulted so existing
-- rows keep rendering. `stage` defaults to IN_PROGRESS for the legacy
-- back-catalog.

-- 1. Extend PropertyStatus with Nadlan's extra life-cycle values.
ALTER TYPE "PropertyStatus" ADD VALUE IF NOT EXISTS 'INACTIVE';
ALTER TYPE "PropertyStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';
ALTER TYPE "PropertyStatus" ADD VALUE IF NOT EXISTS 'IN_DEAL';

-- 2. New PropertyStage enum (orthogonal to status) — pipeline stage.
CREATE TYPE "PropertyStage" AS ENUM (
  'WATCHING',
  'PRE_ACQUISITION',
  'IN_PROGRESS',
  'SIGNED_NON_EXCLUSIVE',
  'SIGNED_EXCLUSIVE',
  'EXCLUSIVITY_ENDED',
  'REFUSED_BROKERAGE',
  'REMOVED'
);

-- 3. Seller-side seriousness.
CREATE TYPE "Seriousness" AS ENUM ('NONE', 'SORT_OF', 'MEDIUM', 'VERY');

-- 4. Property admin columns.
ALTER TABLE "Property" ADD COLUMN "stage" "PropertyStage" DEFAULT 'IN_PROGRESS';
ALTER TABLE "Property" ADD COLUMN "agentCommissionPct" DOUBLE PRECISION;
ALTER TABLE "Property" ADD COLUMN "primaryAgentId" TEXT;
ALTER TABLE "Property" ADD COLUMN "exclusivityExpire" TIMESTAMP(3);
ALTER TABLE "Property" ADD COLUMN "sellerSeriousness" "Seriousness";
ALTER TABLE "Property" ADD COLUMN "brokerNotes" TEXT;

ALTER TABLE "Property"
  ADD CONSTRAINT "Property_primaryAgentId_fkey"
  FOREIGN KEY ("primaryAgentId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Property_stage_idx" ON "Property"("stage");
CREATE INDEX "Property_primaryAgentId_idx" ON "Property"("primaryAgentId");
