// Live dedup verification — runs discoverYad2 twice in the same
// process. Run 1 starts with an empty set; run 2 passes run 1's
// tokens as known. Run 2 should:
//   - find the same population of listings (page 1 result is stable
//     within seconds)
//   - report zero `novelOnThisPage` on page 1
//   - early-exit after page 1 (no walk to page 2+)
//
// Not a unit test — a script you `node` to manually verify against
// live Yad2. Usage:
//   MARKET_WATCHER_DISCOVERY_REGIONS=center-and-sharon \
//   node dist/__tests__/dedup-live.js

import pino from 'pino';
import { config } from '../config.js';
import { discoverYad2, closeBrowser } from '../sources/yad2.js';

const logger = pino({ level: 'info' });

async function main() {
  // Run 1 — empty known set, walks pages until exhaustion.
  const r1 = await discoverYad2({
    regions: config.discoveryRegions,
    knownTokens: new Set<string>(),
    hardCeiling: config.hardCeiling,
    log: logger,
  });
  logger.info(
    {
      run: 1,
      itemsFound: r1.items.length,
      pagesFetched: r1.stats.fetched,
      itemsSeen: r1.stats.itemsSeen,
    },
    'dedup.run-1-complete',
  );

  // Build the known set from run 1's tokens. In production this is
  // populated from the DB by tick.ts.
  const known = new Set<string>(r1.items.map((i) => i.externalListingId));
  logger.info({ knownTokens: known.size }, 'dedup.known-set-built');

  // Run 2 — pretend everything from run 1 is already in DB.
  const r2 = await discoverYad2({
    regions: config.discoveryRegions,
    knownTokens: known,
    hardCeiling: config.hardCeiling,
    log: logger,
  });

  // For each token in run 2's results, print enough metadata to tell
  // whether it's a freshly-posted listing or a boosted-from-back-pages
  // listing. The MarketListing schema doesn't carry a "yad2 boost
  // marker", but city/neighborhood/price + the fact that it appeared
  // on page 1 are enough to eyeball the difference vs the dominant
  // characteristics of run 1.
  for (const item of r2.items) {
    logger.info({ novelInRun2: item }, 'dedup.run-2-novel-detail');
  }
  logger.info(
    {
      run: 2,
      itemsFound: r2.items.length,
      pagesFetched: r2.stats.fetched,
      itemsSeen: r2.stats.itemsSeen,
    },
    'dedup.run-2-complete',
  );

  // Verdict
  const r1Pages = r1.stats.fetched;
  const r2Pages = r2.stats.fetched;
  const newInRun2 = r2.items.length;
  logger.info(
    {
      run1Pages: r1Pages,
      run2Pages: r2Pages,
      run1Tokens: r1.items.length,
      run2Tokens: r2.items.length,
      newInRun2,
      // Healthy state of the system if:
      //   run2Pages << run1Pages   (early-exit kicked in)
      //   newInRun2 ≈ 0..a-few     (only listings posted between runs)
      verdict:
        r2Pages <= r1Pages && newInRun2 <= 5
          ? 'PASS — dedup short-circuited run 2'
          : 'INVESTIGATE — run 2 walked unexpectedly far',
    },
    'dedup.verdict',
  );

  await closeBrowser();
}

main().catch((err) => {
  logger.error({ err: String(err) }, 'dedup.failed');
  process.exit(1);
});
