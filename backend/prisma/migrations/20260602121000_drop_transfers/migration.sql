-- 2026-06-02 — drop העברות (transfers) feature.
-- Removes the PropertyTransfer table and the TransferStatus enum
-- that backed the agent-to-agent property handoff flow. CASCADE on
-- the table so any lingering FK constraints from Property/User clear
-- cleanly; the enum is dropped IF EXISTS for idempotency across
-- environments. Also drops the TRANSFER value from the
-- MessageTemplateKind enum since the kind is no longer surfaced and
-- the templates UI / API don't accept it.

DROP TABLE IF EXISTS "PropertyTransfer" CASCADE;
DROP TYPE IF EXISTS "TransferStatus";

-- Postgres has no native "remove enum value" — recreate the enum
-- with the four remaining kinds. Wipe any existing TRANSFER rows
-- before the swap so the column cast doesn't fail.
DELETE FROM "MessageTemplate" WHERE "kind" = 'TRANSFER';

ALTER TYPE "MessageTemplateKind" RENAME TO "MessageTemplateKind_old";
CREATE TYPE "MessageTemplateKind" AS ENUM (
  'BUY_PRIVATE',
  'RENT_PRIVATE',
  'BUY_COMMERCIAL',
  'RENT_COMMERCIAL'
);
ALTER TABLE "MessageTemplate"
  ALTER COLUMN "kind" TYPE "MessageTemplateKind"
  USING ("kind"::text::"MessageTemplateKind");
DROP TYPE "MessageTemplateKind_old";
