-- Add SEO-friendly slug columns + uniqueness constraints.

ALTER TABLE "User"     ADD COLUMN "slug" TEXT;
ALTER TABLE "Property" ADD COLUMN "slug" TEXT;

CREATE UNIQUE INDEX "User_slug_key"            ON "User"("slug") WHERE "slug" IS NOT NULL;
CREATE UNIQUE INDEX "Property_agentId_slug_key" ON "Property"("agentId","slug") WHERE "slug" IS NOT NULL;
