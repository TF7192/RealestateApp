-- Sprint 6 — Documents library.
--
-- Adds a `tags` text[] column on UploadedFile so the new /documents
-- page can filter uploads by user-defined label (e.g. "חוזים", "סקרים").
-- Existing rows default to an empty array.
--
-- Also indexes `kind` + `ownerId` composite for the common "list this
-- agent's pdfs" query the Documents page hits on every mount.

ALTER TABLE "UploadedFile"
  ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT '{}';

CREATE INDEX "UploadedFile_ownerId_kind_idx"
  ON "UploadedFile"("ownerId", "kind");
