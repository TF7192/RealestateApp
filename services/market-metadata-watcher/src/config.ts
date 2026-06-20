// Watcher configuration — env-driven so prod / staging / local can
// override without code changes.

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

function listEnv(name: string, fallback: string[]): string[] {
  const raw = process.env[name];
  if (!raw) return fallback;
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

export const config = {
  // 1 hour default — used only by the scheduleHourly back-compat shim
  // and the boot log line. Production cadence is driven by
  // kindIntervalMs / kindOffsetMs below; this value is effectively
  // dead in the prod path but kept for the legacy entrypoint.
  intervalMs:        intEnv('MARKET_WATCHER_INTERVAL_MS', 60 * 60 * 1000),
  // Cycle cadence. As of 2026-06-20 a single scheduled loop scrapes ALL
  // kinds (rent + forsale + commercial) back-to-back each cycle, every
  // kindIntervalMs (prod: 8h → 3 cycles/day). discoverYad2 walks
  // kinds × regions with polite gaps within one cycle.
  kindIntervalMs:    intEnv('MARKET_WATCHER_KIND_INTERVAL_MS', 12 * 60 * 60 * 1000),
  // UNUSED since 2026-06-20 — the two-loop offset-staggering design was
  // replaced by the single all-kinds loop (see index.ts). Kept so the
  // existing MARKET_WATCHER_KIND_OFFSET_MS env / compose var doesn't
  // become an "unknown variable" error; reading it here is harmless.
  kindOffsetMs:      intEnv('MARKET_WATCHER_KIND_OFFSET_MS',    6 * 60 * 60 * 1000),
  // ±10 minutes by default — keeps us off the top-of-the-hour and
  // out of cron-clash territory.
  jitterMs:          intEnv('MARKET_WATCHER_JITTER_MS',   10 * 60 * 1000),
  // Yad2 region slugs to discover. Live-verified in chat: 7 regions
  // cover 100% of Israel's listing volume. Default = all 7.
  // Override per-env if you want to scope down (e.g. dev runs only
  // tel-aviv-area to save fetch budget).
  discoveryRegions:  listEnv('MARKET_WATCHER_DISCOVERY_REGIONS', [
    'tel-aviv-area',
    'center-and-sharon',
    'jerusalem-area',
    'coastal-north',
    'north-and-valleys',
    'south',
    'east',
  ]),
  // Min match score (0..100) to create a notification.
  matchMinScore:     intEnv('MARKET_MATCH_MIN_SCORE', 70),
  // Polite per-listing gap. The existing crawler defaults to 600ms;
  // the watcher inherits that from playwright route handling.
  politeGapMs:       intEnv('MARKET_POLITE_GAP_MS', 600),
  // Hard ceiling on listings ingested per single run, regardless of
  // source.maxPerHour. Belt-and-braces against runaway scrapes.
  hardCeiling:       intEnv('MARKET_HARD_CEILING', 500),
} as const;

export type Config = typeof config;
