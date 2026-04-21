-- Sprint 1 / MLS parity — Task A2: Unified Tag + TagAssignment model
-- ("מדבקות"). Fully additive.

CREATE TYPE "TagScope" AS ENUM ('PROPERTY', 'LEAD', 'CUSTOMER', 'ALL');
CREATE TYPE "TagEntity" AS ENUM ('PROPERTY', 'LEAD', 'CUSTOMER');

CREATE TABLE "Tag" (
  "id"        TEXT         NOT NULL,
  "agentId"   TEXT         NOT NULL,
  "name"      TEXT         NOT NULL,
  "color"     TEXT         NOT NULL DEFAULT '#C9A14B',
  "scope"     "TagScope"   NOT NULL DEFAULT 'ALL',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Tag_agentId_name_key" ON "Tag"("agentId", "name");
CREATE INDEX "Tag_agentId_scope_idx" ON "Tag"("agentId", "scope");
ALTER TABLE "Tag"
  ADD CONSTRAINT "Tag_agentId_fkey"
  FOREIGN KEY ("agentId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "TagAssignment" (
  "id"         TEXT         NOT NULL,
  "tagId"      TEXT         NOT NULL,
  "entityType" "TagEntity"  NOT NULL,
  "entityId"   TEXT         NOT NULL,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TagAssignment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TagAssignment_tagId_entityType_entityId_key"
  ON "TagAssignment"("tagId", "entityType", "entityId");
CREATE INDEX "TagAssignment_entityType_entityId_idx"
  ON "TagAssignment"("entityType", "entityId");
ALTER TABLE "TagAssignment"
  ADD CONSTRAINT "TagAssignment_tagId_fkey"
  FOREIGN KEY ("tagId") REFERENCES "Tag"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
