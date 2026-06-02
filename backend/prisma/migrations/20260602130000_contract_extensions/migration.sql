ALTER TABLE "Contract"
  ADD COLUMN "propertiesSnapshot" JSONB,
  ADD COLUMN "baseContractId" TEXT;
ALTER TABLE "Contract"
  ADD CONSTRAINT "Contract_baseContractId_fkey"
  FOREIGN KEY ("baseContractId") REFERENCES "Contract"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Contract_baseContractId_idx" ON "Contract"("baseContractId");
