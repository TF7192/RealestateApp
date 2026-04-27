-- Sprint 2 / MLS parity — Task L1: rich quick-lead status enum.
-- Nadlan's `LeadStatusID` distinguishes nine lifecycle states that
-- Estia's ternary `LeadStatus` (HOT/WARM/COLD) can't represent. We add
-- a separate `QuickLeadStatus` enum + column — the thermal `status`
-- stays untouched.

CREATE TYPE "QuickLeadStatus" AS ENUM (
  'NEW',             -- חדש
  'INTENT_TO_CALL',  -- בכוונת התקשרות
  'CONVERTED',       -- הומר
  'DISQUALIFIED',    -- נפסל
  'NOT_INTERESTED',  -- לא מעוניין
  'IN_PROGRESS',     -- בתהליך
  'CONVERTED_NO_OPPORTUNITY', -- הומר, אין הזדמנות
  'DELETED',         -- נמחק
  'ARCHIVED'         -- ארכיון
);

ALTER TABLE "Lead" ADD COLUMN "leadStatus" "QuickLeadStatus" DEFAULT 'NEW';

CREATE INDEX "Lead_leadStatus_idx" ON "Lead"("leadStatus");
