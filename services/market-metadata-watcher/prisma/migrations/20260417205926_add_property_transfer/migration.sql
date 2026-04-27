-- CreateEnum
CREATE TYPE "TransferStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'CANCELLED', 'WHATSAPP_SENT');

-- CreateTable
CREATE TABLE "PropertyTransfer" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "fromAgentId" TEXT NOT NULL,
    "toAgentId" TEXT,
    "toAgentEmail" TEXT,
    "status" "TransferStatus" NOT NULL DEFAULT 'PENDING',
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),

    CONSTRAINT "PropertyTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PropertyTransfer_fromAgentId_idx" ON "PropertyTransfer"("fromAgentId");

-- CreateIndex
CREATE INDEX "PropertyTransfer_toAgentId_idx" ON "PropertyTransfer"("toAgentId");

-- CreateIndex
CREATE INDEX "PropertyTransfer_status_idx" ON "PropertyTransfer"("status");

-- AddForeignKey
ALTER TABLE "PropertyTransfer" ADD CONSTRAINT "PropertyTransfer_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropertyTransfer" ADD CONSTRAINT "PropertyTransfer_fromAgentId_fkey" FOREIGN KEY ("fromAgentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropertyTransfer" ADD CONSTRAINT "PropertyTransfer_toAgentId_fkey" FOREIGN KEY ("toAgentId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
