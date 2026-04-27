-- Sprint 5 / MLS parity — Task H3. Agent-scoped activity log. Captures
-- who did what to which entity, so the UI can render a "recent
-- activity" timeline and the office owner can audit other agents.
-- Entity FK is deliberately weak (no SetNull/Cascade) — we want the
-- log to outlive row deletions for audit purposes.

CREATE TABLE "ActivityLog" (
  "id"         TEXT         NOT NULL,
  "agentId"    TEXT         NOT NULL,
  "actorId"    TEXT,            -- null when the system produced the event
  "verb"       TEXT         NOT NULL,  -- "created" | "updated" | "deleted" | custom
  "entityType" TEXT         NOT NULL,  -- "Property" | "Lead" | "Deal" | …
  "entityId"   TEXT,
  "summary"    TEXT,            -- optional one-line Hebrew description
  "metadata"   JSONB,           -- free-form payload (diff, before/after …)
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ActivityLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ActivityLog_agentId_createdAt_idx" ON "ActivityLog"("agentId", "createdAt" DESC);
CREATE INDEX "ActivityLog_entityType_entityId_idx" ON "ActivityLog"("entityType", "entityId");
