-- Sprint 1 / MLS parity — Task K2: Customer / Lead admin block.
-- Fully additive. Existing `status` column is retained as the thermal
-- temperature (HOT/WARM/COLD) — new columns below cover the Nadlan
-- admin block concepts separately.

-- 1. Customer-facing lifecycle status (Nadlan CustomerStatusID).
CREATE TYPE "CustomerStatus" AS ENUM (
  'ACTIVE',      -- אקטואלי
  'INACTIVE',    -- לא אקטואלי
  'CANCELLED',   -- מבוטל
  'PAUSED',      -- מוקפא
  'IN_DEAL',     -- עיסקה
  'BOUGHT',      -- קנה
  'RENTED'       -- שכר
);

-- 2. Purpose of search (multi-select).
CREATE TYPE "CustomerPurpose" AS ENUM (
  'INVESTMENT',  -- השקעה
  'RESIDENCE',   -- מגורים
  'COMMERCIAL',  -- מסחרי
  'COMBINATION'  -- קומבינציה
);

-- 3. New Lead columns.
ALTER TABLE "Lead" ADD COLUMN "customerStatus"      "CustomerStatus";
ALTER TABLE "Lead" ADD COLUMN "commissionPct"       DOUBLE PRECISION;
ALTER TABLE "Lead" ADD COLUMN "isPrivate"           BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Lead" ADD COLUMN "purposes"            "CustomerPurpose"[] NOT NULL DEFAULT ARRAY[]::"CustomerPurpose"[];
-- Uses the existing Seriousness enum (NONE/SORT_OF/MEDIUM/VERY) from
-- the J9 migration — same rating scale, applied to the customer side
-- this time.
ALTER TABLE "Lead" ADD COLUMN "seriousnessOverride" "Seriousness";

-- 4. Multi-agent assignment on leads ("סוכנים"). Primary assignee stays
-- `agentId` on Lead; additional assignees live in a join table.
CREATE TABLE "LeadAgent" (
  "leadId"     TEXT         NOT NULL,
  "agentId"    TEXT         NOT NULL,
  "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LeadAgent_pkey" PRIMARY KEY ("leadId", "agentId")
);

ALTER TABLE "LeadAgent"
  ADD CONSTRAINT "LeadAgent_leadId_fkey"
  FOREIGN KEY ("leadId") REFERENCES "Lead"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LeadAgent"
  ADD CONSTRAINT "LeadAgent_agentId_fkey"
  FOREIGN KEY ("agentId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "LeadAgent_agentId_idx" ON "LeadAgent"("agentId");

-- 5. Helpful partial index for the admin customer-status filter.
CREATE INDEX "Lead_customerStatus_idx" ON "Lead"("customerStatus");
