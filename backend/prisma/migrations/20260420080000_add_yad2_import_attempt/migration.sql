-- CreateTable: Yad2ImportAttempt — sliding-window quota for agency imports.
CREATE TABLE "Yad2ImportAttempt" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "attemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Yad2ImportAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: lookup by agent + recent attempt window.
CREATE INDEX "Yad2ImportAttempt_agentId_attemptedAt_idx" ON "Yad2ImportAttempt"("agentId", "attemptedAt");
