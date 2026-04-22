-- E-1 — structured Deal parties + close date.
--
-- Adds optional `buyerId` (Lead), `sellerId` (Owner) and `closeDate`
-- columns to Deal so the new "צור עסקה" flow can bind a deal to the
-- lead / owner / property / close-date trio instead of the current
-- free-text `buyerAgent` / `sellerAgent` columns. Those free-text
-- columns stay in place for back-compat — new rows populate either
-- (FKs + free-text is redundant but not harmful).
--
-- DealStatus gets two additional values (CLOSED, CANCELLED) per the
-- Discovery spec. Existing values (WAITING_MORTGAGE / PENDING_CONTRACT
-- / FELL_THROUGH) are preserved — deleting them would be destructive.

ALTER TYPE "DealStatus" ADD VALUE IF NOT EXISTS 'CLOSED';
ALTER TYPE "DealStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';

ALTER TABLE "Deal" ADD COLUMN "buyerId"  TEXT;
ALTER TABLE "Deal" ADD COLUMN "sellerId" TEXT;
ALTER TABLE "Deal" ADD COLUMN "closeDate" TIMESTAMP(3);

-- FKs; ON DELETE SET NULL so deleting a lead / owner doesn't cascade
-- into losing the deal record (commission history is important).
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_buyerId_fkey"
  FOREIGN KEY ("buyerId") REFERENCES "Lead"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Deal" ADD CONSTRAINT "Deal_sellerId_fkey"
  FOREIGN KEY ("sellerId") REFERENCES "Owner"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Deal_buyerId_idx"  ON "Deal"("buyerId");
CREATE INDEX "Deal_sellerId_idx" ON "Deal"("sellerId");
