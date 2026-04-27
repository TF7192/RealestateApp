import pino from 'pino';
import { PrismaClient } from '@prisma/client';
import { config } from './config.js';
import { scheduleHourly } from './scheduler.js';
import { runWatcherTick } from './tick.js';

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });
const prisma = new PrismaClient();
const log = (msg: string, extra?: unknown) => logger.info({ ...((extra as object) || {}) }, msg);

async function main() {
  const once = process.argv.includes('--once');
  const dryRun = process.argv.includes('--dry-run');
  log('watcher.boot', { once, dryRun, intervalMs: config.intervalMs, jitterMs: config.jitterMs });

  // Dry-run: fetch + parse + log; no DB writes. Used to verify the
  // Yad2 fetch + extractor end-to-end without applying migrations or
  // hitting prod RDS — the full DB plumbing is exercised separately
  // by --once mode.
  if (dryRun) {
    const { discoverYad2, closeBrowser } = await import('./sources/yad2.js');
    const result = await discoverYad2({
      regions: config.discoveryRegions,
      knownTokens: new Set<string>(),
      hardCeiling: config.hardCeiling,
      log: logger,
    });
    log('watcher.dry-run-complete', {
      itemsFound: result.items.length,
      pagesFetched: result.stats.fetched,
      itemsSeen: result.stats.itemsSeen,
    });
    // Print a few sample items so the operator can eyeball the
    // metadata-only payload (no images, no descriptions, no phones).
    for (const it of result.items.slice(0, 5)) {
      logger.info({ sample: it }, 'watcher.dry-run-sample');
    }
    await closeBrowser();
    await prisma.$disconnect();
    return;
  }

  if (once) {
    await runWatcherTick({ prisma, logger });
    const { closeBrowser } = await import('./sources/yad2.js');
    await closeBrowser();
    await prisma.$disconnect();
    return;
  }

  const stop = scheduleHourly(() => runWatcherTick({ prisma, logger }), log);

  // Graceful shutdown — Docker sends SIGTERM on stop; finish the
  // in-flight tick before exiting so we don't half-write a snapshot.
  const shutdown = async (signal: string) => {
    log('watcher.shutdown', { signal });
    stop();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT',  () => void shutdown('SIGINT'));
}

main().catch((err) => {
  logger.error({ err }, 'watcher.fatal');
  process.exit(1);
});
