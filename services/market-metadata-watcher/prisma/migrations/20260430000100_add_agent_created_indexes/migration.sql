-- PERF-015 — composite (agentId, createdAt DESC) indexes on the two
-- biggest agent-scoped tables. Today the planner has to either filter
-- on `agentId` and then sort, or pick the existing `(agentId)` index
-- and pay an extra in-memory sort. With this composite the
-- "give me an agent's recent rows" pattern (Properties list, Customers
-- list, Dashboard, sidebar favorites hydration) becomes a clean index
-- scan.
--
-- The plain CREATE INDEX runs inside the Prisma migration
-- transaction; on dev / CI it's instantaneous.
--
-- TODO(prod): when these tables grow large enough that the brief
-- ACCESS EXCLUSIVE lock matters, drop+recreate concurrently:
--
--   psql ... -c 'DROP INDEX "Property_agentId_createdAt_idx";'
--   psql ... -c 'CREATE INDEX CONCURRENTLY "Property_agentId_createdAt_idx" ON "Property"("agentId", "createdAt" DESC);'
--   psql ... -c 'DROP INDEX "Lead_agentId_createdAt_idx";'
--   psql ... -c 'CREATE INDEX CONCURRENTLY "Lead_agentId_createdAt_idx" ON "Lead"("agentId", "createdAt" DESC);'

CREATE INDEX "Property_agentId_createdAt_idx" ON "Property"("agentId", "createdAt" DESC);
CREATE INDEX "Lead_agentId_createdAt_idx"     ON "Lead"("agentId", "createdAt" DESC);
