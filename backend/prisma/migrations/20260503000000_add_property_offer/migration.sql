-- Track price offers received on a property. Each row is one offer
-- event; chained negotiations from the same buyer create separate
-- rows so the timeline stays intact.

CREATE TYPE "PropertyOfferStatus" AS ENUM (
  'NEW',
  'NEGOTIATING',
  'ACCEPTED',
  'DECLINED',
  'WITHDRAWN'
);

CREATE TABLE "PropertyOffer" (
  "id"         TEXT PRIMARY KEY,
  "propertyId" TEXT NOT NULL,
  "leadId"     TEXT,
  "buyerName"  TEXT NOT NULL,
  "buyerPhone" TEXT,
  "amount"     INTEGER NOT NULL,
  "status"     "PropertyOfferStatus" NOT NULL DEFAULT 'NEW',
  "notes"      TEXT,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PropertyOffer_propertyId_fkey"
    FOREIGN KEY ("propertyId") REFERENCES "Property"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PropertyOffer_leadId_fkey"
    FOREIGN KEY ("leadId") REFERENCES "Lead"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "PropertyOffer_propertyId_idx" ON "PropertyOffer"("propertyId");
CREATE INDEX "PropertyOffer_leadId_idx"     ON "PropertyOffer"("leadId");
CREATE INDEX "PropertyOffer_status_idx"     ON "PropertyOffer"("status");
CREATE INDEX "PropertyOffer_receivedAt_idx" ON "PropertyOffer"("receivedAt");
