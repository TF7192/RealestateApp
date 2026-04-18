-- CreateEnum
CREATE TYPE "MessageTemplateKind" AS ENUM ('BUY_PRIVATE', 'RENT_PRIVATE', 'BUY_COMMERCIAL', 'RENT_COMMERCIAL', 'TRANSFER');

-- CreateTable
CREATE TABLE "MessageTemplate" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "kind" "MessageTemplateKind" NOT NULL,
    "body" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MessageTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MessageTemplate_agentId_idx" ON "MessageTemplate"("agentId");

-- CreateIndex
CREATE UNIQUE INDEX "MessageTemplate_agentId_kind_key" ON "MessageTemplate"("agentId", "kind");

-- AddForeignKey
ALTER TABLE "MessageTemplate" ADD CONSTRAINT "MessageTemplate_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
