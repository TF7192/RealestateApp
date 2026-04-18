-- First-run tutorial bookkeeping on User.
ALTER TABLE "User"
  ADD COLUMN "hasCompletedTutorial" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "firstLoginPlatform"   TEXT;
