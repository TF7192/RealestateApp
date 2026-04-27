-- Public matches — agents opt a property into a cross-agent pool so other
-- agents can duplicate it into their own list. Source agent keeps the
-- original row untouched; the duplicate lands as a new Property on the
-- duplicator's agentId with `publicMatchSourceId` pointing back for
-- attribution. Notifications + the source property's "copies" list both
-- derive from this foreign key.
--
-- Partial index on `isPublicMatch = true` keeps the table's own queries
-- cheap (the pool is a small slice of total properties).

ALTER TABLE "Property" ADD COLUMN "isPublicMatch"       BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Property" ADD COLUMN "publicMatchAt"       TIMESTAMP(3);
ALTER TABLE "Property" ADD COLUMN "publicMatchNote"     TEXT;
ALTER TABLE "Property" ADD COLUMN "publicMatchSourceId" TEXT;

CREATE INDEX "Property_isPublicMatch_idx"
  ON "Property"("isPublicMatch") WHERE "isPublicMatch" = true;

CREATE INDEX "Property_publicMatchSourceId_idx"
  ON "Property"("publicMatchSourceId");

ALTER TABLE "Property" ADD CONSTRAINT "Property_publicMatchSourceId_fkey"
  FOREIGN KEY ("publicMatchSourceId") REFERENCES "Property"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
