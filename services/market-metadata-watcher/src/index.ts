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
  log('watcher.boot', { once, intervalMs: config.intervalMs, jitterMs: config.jitterMs });

  if (once) {
    await runWatcherTick({ prisma, logger });
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
