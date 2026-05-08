-- 2026-05-08 — Lead.streets[] for multi-street briefs. Single
-- `street` column stays for back-compat (route copies streets[0]
-- into it on save). Default empty array, legacy rows unaffected.
ALTER TABLE "Lead" ADD COLUMN "streets" TEXT[] NOT NULL DEFAULT '{}';
