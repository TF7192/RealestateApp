-- CreateTable
CREATE TABLE "MarketContext" (
    "id" TEXT NOT NULL,
    "cityKey" TEXT NOT NULL,
    "streetKey" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dealCount" INTEGER NOT NULL DEFAULT 0,
    "payload" JSONB NOT NULL,
    "error" TEXT,

    CONSTRAINT "MarketContext_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MarketContext_cityKey_streetKey_kind_key" ON "MarketContext"("cityKey", "streetKey", "kind");

-- CreateIndex
CREATE INDEX "MarketContext_fetchedAt_idx" ON "MarketContext"("fetchedAt");
