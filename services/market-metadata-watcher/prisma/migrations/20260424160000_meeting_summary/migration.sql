-- Sprint 5 / AI — meeting voice summariser.
--
-- Additive columns on LeadMeeting that hold:
--   audioKey     — storage key for the uploaded voice note (S3 key for
--                  production, `local://tmp/<uuid>.webm` when S3 was
--                  unreachable in the test env)
--   summary      — human-readable Hebrew summary rendered as a paragraph
--                  on the meeting card
--   summaryJson  — structured payload so the card can render action
--                  items + next-steps as separate lists without re-
--                  parsing prose. Schema today is
--                    { summary, actionItems: string[], nextSteps: string[] }
--                  but we keep the column `Json` so future prompts can
--                  add fields without another migration.
--
-- All three are NULL for existing rows; the frontend treats NULL as
-- "no summary yet" and shows the record button instead.
ALTER TABLE "LeadMeeting"
  ADD COLUMN "audioKey"    TEXT,
  ADD COLUMN "summary"     TEXT,
  ADD COLUMN "summaryJson" JSONB;
