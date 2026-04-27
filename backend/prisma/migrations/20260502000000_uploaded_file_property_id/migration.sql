-- Per-asset documents: optional FK from UploadedFile to Property so an
-- agent can attach a PDF (exclusivity agreement, building plan, arnona
-- statement, etc.) directly to a listing. Nullable + onDelete SetNull
-- so existing global documents and the /documents page keep working;
-- if a property is deleted, its attached documents become unscoped
-- rather than disappearing, mirroring the existing PropertyOwner FK
-- pattern.

ALTER TABLE "UploadedFile"
  ADD COLUMN "propertyId" TEXT;

ALTER TABLE "UploadedFile"
  ADD CONSTRAINT "UploadedFile_propertyId_fkey"
    FOREIGN KEY ("propertyId") REFERENCES "Property"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "UploadedFile_propertyId_idx" ON "UploadedFile"("propertyId");
