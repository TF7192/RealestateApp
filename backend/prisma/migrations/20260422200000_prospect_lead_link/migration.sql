-- Prospect ↔ Lead link. Purely additive, nullable FK. A signed
-- prospect is often the same physical person as an existing Lead in
-- the agent's CRM; linking the two lets the agent surface the signed
-- agreement on the lead's timeline. ON DELETE SET NULL so deleting a
-- lead doesn't cascade-delete the signed prospect record.
ALTER TABLE "Prospect" ADD COLUMN "leadId" TEXT;
CREATE INDEX "Prospect_leadId_idx" ON "Prospect"("leadId");
ALTER TABLE "Prospect"
  ADD CONSTRAINT "Prospect_leadId_fkey"
  FOREIGN KEY ("leadId") REFERENCES "Lead"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
