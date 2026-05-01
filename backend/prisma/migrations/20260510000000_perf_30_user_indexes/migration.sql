-- PERF — 30-user smooth target (2026-05-01 perf sweep follow-up).
--
-- Two additive composite indexes on Property:
--
-- 1. (agentId, priority DESC, createdAt DESC) — covers the Properties
--    list endpoint's dominant query (`findMany({ where: { agentId },
--    orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }] })`).
--    Without it Postgres uses (agentId, createdAt DESC) and resorts by
--    priority in memory, ~50ms cost in the hot path at 200-row pages.
--
-- 2. (agentId, status, updatedAt) — covers Dashboard staleProperties
--    (`status = 'ACTIVE' AND updatedAt < cutoff ORDER BY updatedAt`).
--
-- IF NOT EXISTS so re-applies on rollback are no-ops. Both are read-
-- write online safe; no exclusive lock, just a metadata update.
CREATE INDEX IF NOT EXISTS "Property_agentId_priority_createdAt_idx"
  ON "Property" ("agentId", "priority" DESC, "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "Property_agentId_status_updatedAt_idx"
  ON "Property" ("agentId", "status", "updatedAt");
