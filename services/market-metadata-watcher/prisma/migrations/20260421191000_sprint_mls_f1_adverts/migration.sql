-- Sprint 6 / MLS parity — Task F1. Advert entity. Nadlan tracks a
-- separate "advert" row per publication channel (Yad2, Facebook,
-- Onmap, …) with its own title/body/price so agents can A/B different
-- copy. Estia's existing MarketingAction table flags *whether* a
-- channel is done; Advert captures *what was published* there.

CREATE TYPE "AdvertChannel" AS ENUM (
  'YAD2',
  'ONMAP',
  'MADLAN',
  'FACEBOOK',
  'WHATSAPP',
  'INSTAGRAM',
  'WEBSITE',
  'OTHER'
);

CREATE TYPE "AdvertStatus" AS ENUM (
  'DRAFT',
  'PUBLISHED',
  'PAUSED',
  'EXPIRED',
  'REMOVED'
);

CREATE TABLE "Advert" (
  "id"             TEXT            NOT NULL,
  "agentId"        TEXT            NOT NULL,
  "propertyId"     TEXT            NOT NULL,
  "channel"        "AdvertChannel" NOT NULL,
  "status"         "AdvertStatus"  NOT NULL DEFAULT 'DRAFT',
  "title"          TEXT,
  "body"           TEXT,
  "publishedPrice" INTEGER,
  "externalUrl"    TEXT,
  "externalId"     TEXT,
  "publishedAt"    TIMESTAMP(3),
  "expiresAt"      TIMESTAMP(3),
  "createdAt"      TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3)    NOT NULL,
  CONSTRAINT "Advert_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Advert"
  ADD CONSTRAINT "Advert_agentId_fkey"
  FOREIGN KEY ("agentId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Advert"
  ADD CONSTRAINT "Advert_propertyId_fkey"
  FOREIGN KEY ("propertyId") REFERENCES "Property"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "Advert_agentId_idx"     ON "Advert"("agentId");
CREATE INDEX "Advert_propertyId_idx"  ON "Advert"("propertyId");
CREATE INDEX "Advert_channel_status_idx" ON "Advert"("channel", "status");
