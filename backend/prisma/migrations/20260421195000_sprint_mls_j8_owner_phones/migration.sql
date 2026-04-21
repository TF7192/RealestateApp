-- Sprint MLS parity — Task J8: per-owner phone numbers.
-- Additive only. The legacy `Owner.phone` column stays as the
-- denormalized primary number; each OwnerPhone row adds a kind
-- + label for the Nadlan-One style multi-phone table.

CREATE TABLE "OwnerPhone" (
  "id"        TEXT          NOT NULL,
  "ownerId"   TEXT          NOT NULL,
  "phone"     TEXT          NOT NULL,
  "kind"      TEXT          NOT NULL DEFAULT 'primary',
  "label"     TEXT,
  "sortOrder" INTEGER       NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3)  NOT NULL,
  CONSTRAINT "OwnerPhone_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "OwnerPhone"
  ADD CONSTRAINT "OwnerPhone_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "Owner"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "OwnerPhone_ownerId_idx" ON "OwnerPhone"("ownerId");
