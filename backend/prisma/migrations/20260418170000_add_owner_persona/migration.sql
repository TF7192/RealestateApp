-- Add the Owner table — distinct persona from Lead/Customer.
-- One agent has many owners; one owner can own multiple properties.

CREATE TABLE "Owner" (
  "id"           TEXT PRIMARY KEY,
  "agentId"      TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "name"         TEXT NOT NULL,
  "phone"        TEXT NOT NULL,
  "email"        TEXT,
  "notes"        TEXT,
  "relationship" TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL
);

CREATE INDEX "Owner_agentId_idx" ON "Owner"("agentId");
CREATE INDEX "Owner_phone_idx"   ON "Owner"("phone");

-- Property gets an FK to Owner. Inline owner/ownerPhone/ownerEmail columns
-- stay for now (denormalized copy) until the rollout completes.
ALTER TABLE "Property" ADD COLUMN "propertyOwnerId" TEXT;
ALTER TABLE "Property"
  ADD CONSTRAINT "Property_propertyOwnerId_fkey"
  FOREIGN KEY ("propertyOwnerId") REFERENCES "Owner"("id")
  ON DELETE SET NULL;
CREATE INDEX "Property_propertyOwnerId_idx" ON "Property"("propertyOwnerId");
