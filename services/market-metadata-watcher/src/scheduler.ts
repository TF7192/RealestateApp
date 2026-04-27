import { config } from './config.js';

// Run-loop with jitter + lock. Single-process locking is in-memory; if
// you horizontally scale the watcher, this needs to move to a DB-row
// lock or Redis (`SET NX PX`). For now one container owns the loop.
let running = false;

export type Tick = () => Promise<void>;

export function scheduleHourly(tick: Tick, log: (msg: string, extra?: unknown) => void): () => void {
  let timer: NodeJS.Timeout | null = null;
  let stopped = false;

  const queueNext = () => {
    if (stopped) return;
    const jitter = Math.floor((Math.random() - 0.5) * 2 * config.jitterMs);
    const next = Math.max(60_000, config.intervalMs + jitter);
    log('scheduler.next-run', { inMs: next, jitterMs: jitter });
    timer = setTimeout(() => {
      void runOnce(tick, log).finally(queueNext);
    }, next);
  };

  // Run once on boot (after a small initial delay so the first run
  // doesn't pile onto deploy traffic), then queue subsequent runs.
  const bootDelay = Math.floor(Math.random() * 30_000);
  log('scheduler.bootstrap', { bootDelayMs: bootDelay });
  timer = setTimeout(() => {
    void runOnce(tick, log).finally(queueNext);
  }, bootDelay);

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    log('scheduler.stopped');
  };
}

async function runOnce(tick: Tick, log: (msg: string, extra?: unknown) => void): Promise<void> {
  if (running) {
    log('scheduler.skip-overlap');
    return;
  }
  running = true;
  const t0 = Date.now();
  try {
    await tick();
    log('scheduler.run-ok', { durationMs: Date.now() - t0 });
  } catch (err) {
    log('scheduler.run-failed', { durationMs: Date.now() - t0, error: String(err) });
  } finally {
    running = false;
  }
}
