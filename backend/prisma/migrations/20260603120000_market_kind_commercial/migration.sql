-- Add 'commercial' to MarketListingKind enum so the hourly watcher
-- can persist Yad2 commercial listings alongside forsale and rent.
ALTER TYPE "MarketListingKind" ADD VALUE IF NOT EXISTS 'commercial';
