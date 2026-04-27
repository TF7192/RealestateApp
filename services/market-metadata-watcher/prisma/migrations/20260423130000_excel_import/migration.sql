-- Excel import — per-row tag so a botched batch can be bulk-deleted,
-- and per-agent saved column mappings so repeat imports from the same
-- vendor file auto-apply the last choice.

ALTER TABLE "Property" ADD COLUMN "importBatchId" TEXT;
ALTER TABLE "Lead"     ADD COLUMN "importBatchId" TEXT;
CREATE INDEX "Property_importBatchId_idx" ON "Property"("importBatchId");
CREATE INDEX "Lead_importBatchId_idx"     ON "Lead"("importBatchId");

CREATE TABLE "ImportMapping" (
  "id"         TEXT NOT NULL,
  "agentId"    TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "headerSig"  TEXT NOT NULL,
  "mapping"    JSONB NOT NULL,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ImportMapping_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ImportMapping_agentId_entityType_headerSig_key"
  ON "ImportMapping"("agentId", "entityType", "headerSig");
ALTER TABLE "ImportMapping"
  ADD CONSTRAINT "ImportMapping_agentId_fkey"
  FOREIGN KEY ("agentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
