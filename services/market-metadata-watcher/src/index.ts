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

  // 2026-05-08 — cadence dropped to twice-a-day per kind (was every 2
  // hours = 12×/day per kind). Two scans cover the daily flow without
  // burning Reblaze quota or our proxy budget. Cadence:
  //   t =  0:00  → rent
  //   t =  6:00  → forsale
  //   t = 12:00  → rent
  //   t = 18:00  → forsale
  //   …
  // Rent boots first (~0–30s) so the under-represented kind gets fresh
  // deal flow sooner; forsale follows 6 hours later. The wider stagger
  // means Reblaze sees rent + forsale as two independent visitors
  // hitting once-per-cycle each, and per-IP rate-limit budgets fully
  // refresh between ticks.
  const KIND_INTERVAL_MS = config.kindIntervalMs;  // env-driven (12 h default → 2 ticks/day per kind)
  const KIND_OFFSET_MS   = config.kindOffsetMs;    // env-driven (6 h default — kinds alternate across the day)
  const rentBootDelay = Math.floor(Math.random() * 30_000);
  const forsaleBootDelay = rentBootDelay + KIND_OFFSET_MS;
  const stopRent = scheduleLoop({
    label: 'rent',
    intervalMs: KIND_INTERVAL_MS,
    jitterMs: config.jitterMs,
    bootDelayMs: rentBootDelay,
    tick: () => runWatcherTick({ prisma, logger }, { kinds: ['rent'] }),
    log,
  });
  const stopForsale = scheduleLoop({
    label: 'forsale',
    intervalMs: KIND_INTERVAL_MS,
    jitterMs: config.jitterMs,
    bootDelayMs: forsaleBootDelay,
    tick: () => runWatcherTick({ prisma, logger }, { kinds: ['forsale'] }),
    log,
  });
  const stop = () => { stopForsale(); stopRent(); };

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
