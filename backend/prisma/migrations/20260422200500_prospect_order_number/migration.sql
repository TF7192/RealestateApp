-- Per-agent sequential order number printed on the brokerage-services
-- agreement PDF (e.g. "הזמנה מס׳ 42"). Existing rows get sequential
-- numbers per-agent via a one-shot back-fill so PDFs work for old data.
ALTER TABLE "Prospect" ADD COLUMN "orderNumber" INTEGER;

-- Back-fill: for each agent, number their existing prospects in
-- creation order starting at 1. ROW_NUMBER is deterministic given
-- the ORDER BY clause.
UPDATE "Prospect" p
SET    "orderNumber" = sub.rn
FROM (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY "agentId" ORDER BY "createdAt", id) AS rn
  FROM   "Prospect"
) sub
WHERE  sub.id = p.id;

CREATE UNIQUE INDEX "Prospect_agentId_orderNumber_key"
  ON "Prospect"("agentId", "orderNumber");
