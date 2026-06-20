import pino from 'pino';
import { PrismaClient } from '@prisma/client';
import { config } from './config.js';
import { scheduleLoop } from './scheduler.js';
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

  // 2026-06-20 — single scheduled loop crawling ALL kinds back-to-back
  // each cycle. Replaces the previous two-loop design (rent boots +~17s,
  // forsale boots +4h) that starved forsale: every deploy recreates the
  // container, resetting forsale's large boot offset, so with frequent
  // deploys forsale rarely reached its first tick while rent (tiny boot
  // delay) always ran fresh. A single loop with one small boot delay
  // fixes that — each cycle scrapes rent + forsale + commercial in one
  // run via discoverYad2, which already iterates kinds × regions with
  // polite gaps, so the three kinds go one after another in a single
  // browser session lifecycle.
  //
  // Cadence: every config.kindIntervalMs (8h in prod → 3 cycles/day,
  // each cycle covering all three kinds). config.kindOffsetMs is now
  // UNUSED — the offset-staggering it drove is gone with the two-loop
  // design; the config field is kept to avoid an env/compose change.
  const CYCLE_INTERVAL_MS = config.kindIntervalMs;
  const bootDelayMs = Math.floor(Math.random() * 20_000);
  const stopAll = scheduleLoop({
    label: 'all-kinds',
    intervalMs: CYCLE_INTERVAL_MS,
    jitterMs: config.jitterMs,
    bootDelayMs,
    tick: () =>
      runWatcherTick({ prisma, logger }, { kinds: ['rent', 'forsale', 'commercial'] }),
    log,
  });
  const stop = () => { stopAll(); };

  // Graceful shutdown — Docker sends SIGTERM 10s before SIGKILL on
  // `compose down` / `up -d --recreate`. Mark every in-flight run row
  // as `failed (interrupted)` so the admin observability page doesn't
  // show ghosts. The streaming upsert (tick.ts) means every row
  // already committed before SIGTERM is preserved — only the
  // currently-running tick's RUN ROW gets finalized here, not the
  // listings.
  const shutdown = async (signal: string) => {
    log('watcher.shutdown', { signal });
    stop();
    try {
      await prisma.marketWatcherRun.updateMany({
        where: { status: 'running' },
        data: {
          status: 'failed',
          finishedAt: new Date(),
          errorMessage: `interrupted (${signal}) — graceful shutdown`,
        },
      });
    } catch { /* ignore — DB may already be disconnected */ }
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
