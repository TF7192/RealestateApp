-- P2-5 from the DB audit (binary-sleeping-mist).
-- Drop redundant single-column indexes that are fully covered by
-- existing compound indexes on the same leading column.

-- UploadedFile.ownerId — covered by (ownerId, kind)
DROP INDEX IF EXISTS "UploadedFile_ownerId_idx";

-- AiUsage.createdAt deferred until pg_stat_statements confirms no
-- query filters by createdAt without userId.
