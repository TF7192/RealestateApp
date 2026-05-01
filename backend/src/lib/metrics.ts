// Prometheus metrics — http request duration histogram + counter +
// inflight gauge. Wired into Fastify via the request lifecycle hooks
// in server.ts. Exposed at GET /api/metrics (token-gated by
// METRICS_TOKEN; if unset the route 503s so we don't leak the
// endpoint surface from a running prod backend).
//
// Why histograms over Trends: Prometheus's `histogram_quantile()` PromQL
// function computes p50/p95/p99 across all replicas using the bucket
// counts — no need to merge per-replica state. Buckets are tuned for
// the latency band we care about (10ms-5s).
import promClient from 'prom-client';
import type { FastifyInstance, FastifyRequest } from 'fastify';

const register = new promClient.Registry();
promClient.collectDefaultMetrics({ register });

export const httpRequestDuration = new promClient.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds, by method/route/status',
  labelNames: ['method', 'route', 'status'] as const,
  // Buckets: 10ms, 25ms, 50ms, 100ms, 200ms, 400ms, 800ms, 1.5s, 3s, 5s, 10s.
  // Covers normal API latency band + the requestTimeout=5s cutoff.
  buckets: [0.01, 0.025, 0.05, 0.1, 0.2, 0.4, 0.8, 1.5, 3, 5, 10],
  registers: [register],
});

export const httpRequestsTotal = new promClient.Counter({
  name: 'http_requests_total',
  help: 'Count of HTTP requests, by method/route/status',
  labelNames: ['method', 'route', 'status'] as const,
  registers: [register],
});

export const httpInflight = new promClient.Gauge({
  name: 'http_requests_inflight',
  help: 'In-flight HTTP requests right now',
  labelNames: ['method'] as const,
  registers: [register],
});

// Reuse a single registry — caller exposes /api/metrics off this.
export const metricsRegistry = register;

// Routes that flood the histogram with one-off paths (signed URL
// callbacks, the metrics endpoint itself) — collapse to a generic
// label so cardinality stays bounded.
function normalizeRoute(req: FastifyRequest): string {
  const r = (req as any).routeOptions?.url || (req as any).routerPath;
  if (typeof r === 'string' && r.length > 0) return r;
  // Fallback: collapse the URL to a path-only form. Don't emit raw
  // user input as a label — Prometheus would explode the cardinality.
  return 'unknown';
}

// Wire the histogram + counter + inflight gauge into the Fastify
// request lifecycle. Call once at boot, before the first route.
export function instrumentFastify(app: FastifyInstance): void {
  app.addHook('onRequest', async (req) => {
    httpInflight.inc({ method: req.method });
  });
  app.addHook('onResponse', async (req, reply) => {
    httpInflight.dec({ method: req.method });
    const labels = {
      method: req.method,
      route: normalizeRoute(req),
      status: String(reply.statusCode),
    };
    const dur = reply.elapsedTime / 1000; // ms → s
    httpRequestDuration.observe(labels, dur);
    httpRequestsTotal.inc(labels);
  });
}
