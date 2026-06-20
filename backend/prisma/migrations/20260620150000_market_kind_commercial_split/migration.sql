-- Commercial sale/rent split. The Yad2 commercial feed
-- (/realestate/commercial/<region>) mixes both transaction types; the
-- item's subcategoryId encodes it (7 = sale, 4 = rent). The watcher now
-- derives the split kind at extraction time and persists it as one of
-- these two values. The legacy flat `commercial` value is kept for
-- pre-split rows that can't be retro-classified.
--
-- Postgres 16: ALTER TYPE ... ADD VALUE is not allowed inside an
-- explicit transaction block, so these statements run unwrapped.
ALTER TYPE "MarketListingKind" ADD VALUE IF NOT EXISTS 'commercial_forsale';
ALTER TYPE "MarketListingKind" ADD VALUE IF NOT EXISTS 'commercial_rent';
