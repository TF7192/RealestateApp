import { config } from './config.js';

// Per-label run-loop with jitter + lock. Each label (e.g. "forsale",
// "rent") gets its own queue + own in-flight flag, so the two kinds
// run independently and never overlap with each other OR themselves.
// Single-process locking is in-memory; if you horizontally scale the
// watcher, this needs to move to a DB-row lock or Redis.
const runningByLabel = new Map<string, boolean>();

export type Tick = () => Promise<void>;

export function scheduleLoop(opts: {
  label: string;
  intervalMs: number;
  jitterMs: number;
  bootDelayMs: number;
  tick: Tick;
  log: (msg: string, extra?: unknown) => void;
}): () => void {
  const { label, intervalMs, jitterMs, bootDelayMs, tick, log } = opts;
  let timer: NodeJS.Timeout | null = null;
  let stopped = false;

  const queueNext = () => {
    if (stopped) return;
    const jitter = Math.floor((Math.random() - 0.5) * 2 * jitterMs);
    const next = Math.max(60_000, intervalMs + jitter);
    log('scheduler.next-run', { label, inMs: next, jitterMs: jitter });
    timer = setTimeout(() => {
      void runOnce(label, tick, log).finally(queueNext);
    }, next);
  };

  log('scheduler.bootstrap', { label, bootDelayMs });
  timer = setTimeout(() => {
    void runOnce(label, tick, log).finally(queueNext);
  }, bootDelayMs);

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    log('scheduler.stopped', { label });
  };
}

async function runOnce(
  label: string,
  tick: Tick,
  log: (msg: string, extra?: unknown) => void,
): Promise<void> {
  if (runningByLabel.get(label)) {
    log('scheduler.skip-overlap', { label });
    return;
  }
  runningByLabel.set(label, true);
  const t0 = Date.now();
  try {
    await tick();
    log('scheduler.run-ok', { label, durationMs: Date.now() - t0 });
  } catch (err) {
    log('scheduler.run-failed', { label, durationMs: Date.now() - t0, error: String(err) });
  } finally {
    runningByLabel.set(label, false);
  }
}

// Back-compat shim for any caller that still imports scheduleHourly.
// New code should call scheduleLoop() directly.
export function scheduleHourly(tick: Tick, log: (msg: string, extra?: unknown) => void): () => void {
  return scheduleLoop({
    label: 'hourly',
    intervalMs: config.intervalMs,
    jitterMs: config.jitterMs,
    bootDelayMs: Math.floor(Math.random() * 30_000),
    tick,
    log,
  });
}
