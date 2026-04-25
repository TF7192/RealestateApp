import { PrismaClient, type Prisma } from '@prisma/client';

// PERF-028 — slow-query observability. Setting `log: ['query']` is
// far too noisy (every SELECT echoed to stdout). Instead we listen
// on the `query` event and only emit a `console.warn` line when a
// statement crosses the 200ms threshold. Production logs flow through
// pino on the Fastify side; this stays a console.warn so the line
// shows up even before any request context (server boot, cron jobs).
//
// Threshold is intentionally loose — Postgres in prod runs sub-50ms
// for typical reads, so anything above 200ms means we missed an index
// or are pulling unbounded rows. See performance_tasks.md PERF-028.
const SLOW_QUERY_MS = 200;

export const prisma = new PrismaClient({
  log: [
    { emit: 'event', level: 'query' },
    { emit: 'stdout', level: 'warn' },
    { emit: 'stdout', level: 'error' },
  ],
});

// Prisma's typed event for the 'query' channel — duration is in ms.
prisma.$on('query' as never, (e: Prisma.QueryEvent) => {
  if (e.duration > SLOW_QUERY_MS) {
    // eslint-disable-next-line no-console
    console.warn(
      JSON.stringify({
        level: 'warn',
        msg: 'slow query',
        duration_ms: e.duration,
        query: e.query,
        params: e.params,
      })
    );
  }
});
