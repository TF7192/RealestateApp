-- Co-broker flag: true when the listing was handed over by another
-- brokerage and this agent is co-listing it. Default false so all
-- existing rows remain "own mandate".
ALTER TABLE "Property" ADD COLUMN "coBrokered" BOOLEAN NOT NULL DEFAULT false;
