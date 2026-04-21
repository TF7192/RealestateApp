-- Sprint 5 / MLS parity — Task J10. Secondary assignees on a property.
-- Nadlan lets several agents collaborate on the same listing (primary
-- handler + co-agents). Estia already has `primaryAgentId`; this join
-- table captures the others without altering the canonical `agentId`
-- owner column (which stays authoritative for scoping).

CREATE TABLE "PropertyAssignee" (
  "propertyId" TEXT         NOT NULL,
  "userId"     TEXT         NOT NULL,
  "role"       TEXT         NOT NULL DEFAULT 'CO_AGENT',   -- CO_AGENT / OBSERVER
  "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PropertyAssignee_pkey" PRIMARY KEY ("propertyId", "userId")
);

ALTER TABLE "PropertyAssignee"
  ADD CONSTRAINT "PropertyAssignee_propertyId_fkey"
  FOREIGN KEY ("propertyId") REFERENCES "Property"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PropertyAssignee"
  ADD CONSTRAINT "PropertyAssignee_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "PropertyAssignee_userId_idx" ON "PropertyAssignee"("userId");
