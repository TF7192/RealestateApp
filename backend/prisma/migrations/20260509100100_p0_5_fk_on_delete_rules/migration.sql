-- P0-5 from the DB audit (binary-sleeping-mist).
-- Add explicit ON DELETE rules to four FKs that previously defaulted
-- to NO ACTION (which Postgres treats like RESTRICT). The defaults
-- silently blocked User / UploadedFile deletes.

-- PropertyTransfer.fromAgent → CASCADE (transfer dies with originator)
ALTER TABLE "PropertyTransfer" DROP CONSTRAINT "PropertyTransfer_fromAgentId_fkey";
ALTER TABLE "PropertyTransfer"
  ADD CONSTRAINT "PropertyTransfer_fromAgentId_fkey"
  FOREIGN KEY ("fromAgentId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- PropertyTransfer.toAgent → SET NULL (preserve sender's audit trail)
ALTER TABLE "PropertyTransfer" DROP CONSTRAINT "PropertyTransfer_toAgentId_fkey";
ALTER TABLE "PropertyTransfer"
  ADD CONSTRAINT "PropertyTransfer_toAgentId_fkey"
  FOREIGN KEY ("toAgentId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Deal.agent → CASCADE (deals are agent-owned business records)
ALTER TABLE "Deal" DROP CONSTRAINT "Deal_agentId_fkey";
ALTER TABLE "Deal"
  ADD CONSTRAINT "Deal_agentId_fkey"
  FOREIGN KEY ("agentId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Agreement.file → SET NULL (audit trail outlives the PDF blob)
ALTER TABLE "Agreement" DROP CONSTRAINT "Agreement_fileId_fkey";
ALTER TABLE "Agreement"
  ADD CONSTRAINT "Agreement_fileId_fkey"
  FOREIGN KEY ("fileId") REFERENCES "UploadedFile"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
