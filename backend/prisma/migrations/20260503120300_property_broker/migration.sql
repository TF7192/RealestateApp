-- 2026-05-03 sprint — per-property external broker contacts. Independent
-- of PropertyAssignee (which links Estia agents). PropertyBroker holds
-- name/phone/email/agency/expertise of an outside colleague the agent is
-- coordinating with on a specific listing. Cascade on property delete.
CREATE TABLE "PropertyBroker" (
    "id"         TEXT         NOT NULL,
    "propertyId" TEXT         NOT NULL,
    "agentId"    TEXT         NOT NULL,
    "name"       TEXT         NOT NULL,
    "phone"      TEXT,
    "email"      TEXT,
    "agency"     TEXT,
    "expertise"  TEXT,
    "notes"      TEXT,
    "createdAt"  TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"  TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "PropertyBroker_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PropertyBroker_propertyId_idx" ON "PropertyBroker"("propertyId");
CREATE INDEX "PropertyBroker_agentId_idx"    ON "PropertyBroker"("agentId");
ALTER TABLE "PropertyBroker"
  ADD CONSTRAINT "PropertyBroker_propertyId_fkey"
  FOREIGN KEY ("propertyId") REFERENCES "Property"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PropertyBroker"
  ADD CONSTRAINT "PropertyBroker_agentId_fkey"
  FOREIGN KEY ("agentId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
