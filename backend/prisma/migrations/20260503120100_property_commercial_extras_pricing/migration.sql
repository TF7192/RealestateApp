-- 2026-05-03 sprint — additive: per-spot parking price and storage price
-- for commercial listings. FE computes the all-in total at render time.
ALTER TABLE "Property" ADD COLUMN "parkingPricePerSpot" INTEGER;
ALTER TABLE "Property" ADD COLUMN "storagePrice" INTEGER;
