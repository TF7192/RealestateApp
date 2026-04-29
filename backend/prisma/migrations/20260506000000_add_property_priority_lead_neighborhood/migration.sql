-- Property.priority: agent-set ranking (higher floats to top of list).
ALTER TABLE "Property" ADD COLUMN "priority" INTEGER NOT NULL DEFAULT 0;

-- Lead.neighborhood: most leads describe a neighborhood, only some specify
-- a street; the previous schema only allowed city + street so neighborhood
-- requirements got lost in `notes`. Indexed for matching against the
-- existing Property.neighborhood column.
ALTER TABLE "Lead" ADD COLUMN "neighborhood" TEXT;
CREATE INDEX "Lead_neighborhood_idx" ON "Lead"("neighborhood");
