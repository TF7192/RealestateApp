-- PERF-005 — image-variant URLs on PropertyImage.
--
-- Both nullable so legacy rows uploaded before the resize pipeline
-- shipped (or rows imported from Yad2 with only a remote URL) keep
-- rendering. New uploads write all three columns directly to public
-- S3 URLs and bypass the /uploads/* redirect chain.

ALTER TABLE "PropertyImage"
  ADD COLUMN "urlCard"  TEXT,
  ADD COLUMN "urlThumb" TEXT;
