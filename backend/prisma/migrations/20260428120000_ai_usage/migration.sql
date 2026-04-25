-- Sprint 10 — per-user AI usage ledger.
-- One row per Anthropic call. Lets owners see who's spending what
-- on the /office page and gives us a real measurement surface
-- before we start enforcing per-user quotas.
--
-- `costUsd` is computed server-side from the published per-model
-- prices and stored as the source of truth — so price changes don't
-- retroactively rewrite history.

CREATE TABLE "AiUsage" (
  "id"                  TEXT NOT NULL,
  "userId"              TEXT NOT NULL,
  "feature"             TEXT NOT NULL,              -- 'chat' | 'describe' | 'voice-ingest' | 'meeting-brief' | 'offer-review' | 'ai-match'
  "model"               TEXT NOT NULL,              -- 'claude-opus-4-7' | 'claude-haiku-4-5' | 'whisper-1'
  "inputTokens"         INTEGER NOT NULL DEFAULT 0,
  "outputTokens"        INTEGER NOT NULL DEFAULT 0,
  "cacheReadTokens"     INTEGER NOT NULL DEFAULT 0,
  "cacheCreateTokens"   INTEGER NOT NULL DEFAULT 0,
  "audioSeconds"        INTEGER NOT NULL DEFAULT 0, -- whisper-only
  "costUsd"             DOUBLE PRECISION NOT NULL DEFAULT 0,
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AiUsage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AiUsage_userId_createdAt_idx"
  ON "AiUsage"("userId", "createdAt" DESC);
CREATE INDEX "AiUsage_createdAt_idx"
  ON "AiUsage"("createdAt" DESC);

ALTER TABLE "AiUsage" ADD CONSTRAINT "AiUsage_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
