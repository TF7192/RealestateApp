-- P0-4 from the DB audit (binary-sleeping-mist).
-- Float currency columns → Decimal. Float aggregates lose precision
-- when summing over thousands of rows, which is unacceptable for
-- billing math (AI usage costs, agent commission %).
--
-- The USING clause coerces existing double-precision values without
-- data loss; the new (5,2) commission columns can hold up to 999.99%
-- which matches the Zod input bound of 0..100.

ALTER TABLE "AiUsage"
  ALTER COLUMN "costUsd" TYPE numeric(12, 4) USING "costUsd"::numeric(12, 4),
  ALTER COLUMN "costUsd" SET DEFAULT 0;

ALTER TABLE "Property"
  ALTER COLUMN "agentCommissionPct" TYPE numeric(5, 2) USING "agentCommissionPct"::numeric(5, 2);

ALTER TABLE "Lead"
  ALTER COLUMN "commissionPct" TYPE numeric(5, 2) USING "commissionPct"::numeric(5, 2);
