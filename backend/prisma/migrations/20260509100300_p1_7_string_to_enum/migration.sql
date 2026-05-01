-- P1-7 from the DB audit (binary-sleeping-mist).
-- String columns → Postgres enums. Eight conversions in one migration.
-- The USING clause coerces existing text values; enum members were
-- chosen to exactly match the on-disk strings, so no data is lost.
--
-- Each block: drop default → ALTER TYPE → set new default. Postgres
-- rebuilds dependent indexes automatically.

-- 1. Agreement.status (SENT / SIGNED / EXPIRED / CANCELLED)
CREATE TYPE "AgreementStatus" AS ENUM ('SENT', 'SIGNED', 'EXPIRED', 'CANCELLED');
ALTER TABLE "Agreement" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Agreement"
  ALTER COLUMN "status" TYPE "AgreementStatus"
  USING "status"::"AgreementStatus";
ALTER TABLE "Agreement" ALTER COLUMN "status" SET DEFAULT 'SENT';

-- 2. OwnerPhone.kind (primary / secondary / spouse / work / fax / other)
CREATE TYPE "OwnerPhoneKind" AS ENUM ('primary', 'secondary', 'spouse', 'work', 'fax', 'other');
ALTER TABLE "OwnerPhone" ALTER COLUMN "kind" DROP DEFAULT;
ALTER TABLE "OwnerPhone"
  ALTER COLUMN "kind" TYPE "OwnerPhoneKind"
  USING "kind"::"OwnerPhoneKind";
ALTER TABLE "OwnerPhone" ALTER COLUMN "kind" SET DEFAULT 'primary';

-- 3. UploadedFile.kind (property_image / signed_agreement / document / other)
CREATE TYPE "UploadedFileKind" AS ENUM ('property_image', 'signed_agreement', 'document', 'other');
ALTER TABLE "UploadedFile"
  ALTER COLUMN "kind" TYPE "UploadedFileKind"
  USING "kind"::"UploadedFileKind";

-- 4. MarketListing.status (active / removed / unknown)
CREATE TYPE "MarketListingStatus" AS ENUM ('active', 'removed', 'unknown');
ALTER TABLE "MarketListing" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "MarketListing"
  ALTER COLUMN "status" TYPE "MarketListingStatus"
  USING "status"::"MarketListingStatus";
ALTER TABLE "MarketListing" ALTER COLUMN "status" SET DEFAULT 'active';

-- 5. MarketListing.kind (forsale / rent) — nullable
CREATE TYPE "MarketListingKind" AS ENUM ('forsale', 'rent');
ALTER TABLE "MarketListing"
  ALTER COLUMN "kind" TYPE "MarketListingKind"
  USING "kind"::"MarketListingKind";

-- 6. MarketListing.posterType (private / agency) — nullable
CREATE TYPE "MarketListingPosterType" AS ENUM ('private', 'agency');
ALTER TABLE "MarketListing"
  ALTER COLUMN "posterType" TYPE "MarketListingPosterType"
  USING "posterType"::"MarketListingPosterType";

-- 7. MarketWatcherRun.status (running / success / failed / skipped)
CREATE TYPE "MarketWatcherRunStatus" AS ENUM ('running', 'success', 'failed', 'skipped');
ALTER TABLE "MarketWatcherRun" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "MarketWatcherRun"
  ALTER COLUMN "status" TYPE "MarketWatcherRunStatus"
  USING "status"::"MarketWatcherRunStatus";
ALTER TABLE "MarketWatcherRun" ALTER COLUMN "status" SET DEFAULT 'running';

-- 8. MarketContext.kind (buy / rent)
CREATE TYPE "MarketContextKind" AS ENUM ('buy', 'rent');
ALTER TABLE "MarketContext"
  ALTER COLUMN "kind" TYPE "MarketContextKind"
  USING "kind"::"MarketContextKind";
