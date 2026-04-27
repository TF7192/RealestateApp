-- Sprint 6 — in-house digital contract e-sign flow (no DocuSign).
-- Adds a `Contract` table differentiated from the legacy `Agreement`
-- table (which remains for agents uploading already-signed third-party
-- PDFs). This row is the source of truth for contracts rendered AND
-- signed inside Estia via the reused prospect-pdf path.
CREATE TABLE "Contract" (
  "id"            TEXT NOT NULL,
  "agentId"      TEXT NOT NULL,
  "propertyId"   TEXT,
  "leadId"       TEXT,
  "type"         TEXT NOT NULL,
  "title"        TEXT NOT NULL,
  "body"         TEXT NOT NULL,
  "signerName"   TEXT NOT NULL,
  "signerPhone"  TEXT,
  "signerEmail"  TEXT,
  "signedAt"     TIMESTAMP(3),
  "signatureName" TEXT,
  "signatureHash" TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Contract_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Contract_agentId_idx"    ON "Contract"("agentId");
CREATE INDEX "Contract_propertyId_idx" ON "Contract"("propertyId");
CREATE INDEX "Contract_leadId_idx"     ON "Contract"("leadId");
CREATE INDEX "Contract_type_idx"       ON "Contract"("type");

ALTER TABLE "Contract" ADD CONSTRAINT "Contract_agentId_fkey"
  FOREIGN KEY ("agentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_propertyId_fkey"
  FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_leadId_fkey"
  FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;
