// Load baseline — ramp to expected peak, hold, ramp down. This is the
// scenario `BASELINE.md`'s headline numbers come from.
//
// Parameterized:
//   PEAK_VUS   — concurrent users at steady state (default 50)
//   RAMP_MIN   — minutes to ramp up  (default 5)
//   STEADY_MIN — minutes at peak    (default 15)
//
// Guarded by ALLOW_RUN=1 — see perf/WHERE_TO_RUN.md.

import http from 'k6/http';
import { sleep, group } from 'k6';
import { BASE_URL, login, jarFor } from '../helpers/auth.js';
import { record } from '../helpers/checks.js';

if (__ENV.ALLOW_RUN !== '1') {
  throw new Error('ALLOW_RUN=1 required — read perf/WHERE_TO_RUN.md first.');
}

const PEAK_VUS   = parseInt(__ENV.PEAK_VUS   || '50', 10);
const RAMP_MIN   = parseInt(__ENV.RAMP_MIN   || '5',  10);
const STEADY_MIN = parseInt(__ENV.STEADY_MIN || '15', 10);

export const options = {
  scenarios: {
    mixed: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: `${RAMP_MIN}m`,   target: PEAK_VUS },
        { duration: `${STEADY_MIN}m`, target: PEAK_VUS },
        { duration: '2m',             target: 0 },
      ],
      gracefulRampDown: '30s',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.001'],
    'http_req_duration{endpoint:me}':         ['p(95)<150', 'p(99)<300'],
    'http_req_duration{endpoint:properties}': ['p(95)<400', 'p(99)<800'],
    'http_req_duration{endpoint:leads}':      ['p(95)<400', 'p(99)<800'],
    'http_req_duration{endpoint:reports}':    ['p(95)<1500'],
    'http_req_duration{endpoint:search}':     ['p(95)<800'],
  },
};

export function setup() { return { cookie: login() }; }

// Weighted iteration: 70% reads / 20% writes-ish / 10% aggregations.
// Picks the path per iteration from a weighted distribution.
const R = () => Math.random();
const pick = (weights) => {
  const total = weights.reduce((a, b) => a + b[1], 0);
  let n = R() * total;
  for (const [fn, w] of weights) { n -= w; if (n <= 0) return fn; }
  return weights[weights.length - 1][0];
};

export default function (data) {
  jarFor(data.cookie);
  group('user-behaves-like-an-agent', () => {
    const behaviors = [
      [() => {
        record(http.get(`${BASE_URL}/api/me`,          { tags: { endpoint: 'me' } }),         'reads');
        record(http.get(`${BASE_URL}/api/properties`,  { tags: { endpoint: 'properties' } }), 'lists');
        sleep(2 + R() * 3);
      }, 35],
      [() => {
        record(http.get(`${BASE_URL}/api/leads`,       { tags: { endpoint: 'leads' } }),      'lists');
        sleep(2 + R() * 3);
      }, 20],
      [() => {
        // Open a property detail
        record(http.get(`${BASE_URL}/api/properties?limit=20`, { tags: { endpoint: 'properties' } }), 'lists');
        // Pick one — skip if empty (fresh DB). We don't parse the body in
        // this stub; the scenario author can swap in an id-picker when
        // the real data model is stable.
        sleep(1 + R() * 2);
      }, 15],
      [() => {
        record(http.get(`${BASE_URL}/api/reports/dashboard`, { tags: { endpoint: 'reports' } }), 'aggregations');
        sleep(3 + R() * 3);
      }, 10],
      [() => {
        record(http.get(`${BASE_URL}/api/search?q=דירה`, { tags: { endpoint: 'search' } }), 'search');
        sleep(1 + R() * 2);
      }, 10],
      [() => {
        // Owners + tags + reminders side-panels
        record(http.get(`${BASE_URL}/api/owners`,   { tags: { endpoint: 'owners' } }),   'lists');
        record(http.get(`${BASE_URL}/api/tags`,     { tags: { endpoint: 'tags' } }),     'lists');
        record(http.get(`${BASE_URL}/api/reminders`, { tags: { endpoint: 'reminders' } }), 'lists');
        sleep(2 + R() * 2);
      }, 10],
    ];
    const go = pick(behaviors);
    go();
  });
}
