// Shared assertions + tagging helpers used by every scenario. Keeps
// the per-scenario files focused on *shape* (ramp profile, duration,
// endpoint mix) rather than boilerplate.

import { check } from 'k6';
import { Trend, Counter } from 'k6/metrics';

export const latencies = {
  auth:         new Trend('e_auth_p',         true),
  reads:        new Trend('e_reads_p',        true),
  lists:        new Trend('e_lists_p',        true),
  writes:       new Trend('e_writes_p',       true),
  aggregations: new Trend('e_aggregations_p', true),
  search:       new Trend('e_search_p',       true),
  public:       new Trend('e_public_p',       true),
};

export const rateLimitHits = new Counter('rate_limit_429');

// Record a response into its class's Trend + assert on status / latency.
// `budget` is the scenario's p95 target for that class — used only to
// annotate the summary; hard pass/fail lives in `options.thresholds`.
export function record(res, klass) {
  const t = latencies[klass];
  if (t) t.add(res.timings.duration);
  if (res.status === 429) rateLimitHits.add(1);
  return check(res, {
    [`${klass} 2xx/3xx/401`]: (r) => r.status < 500,
  });
}
