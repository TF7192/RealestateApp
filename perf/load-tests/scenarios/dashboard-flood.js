// "9am-Monday stampede" — Scenario B. Each VU repeatedly hits the
// dashboard-mount cluster (dashboard/full + topbar-counts +
// properties + leads) with NO think-time, modelling "every agent in
// the agency clicks Login at the exact same second and refreshes
// every page nav". This is the worst-case concurrency profile.
//
// Required env: BASE_URL, ESTIA_TOKEN, ALLOW_RUN=1, FIXED_VUS, DURATION (90s).
import http from 'k6/http';
import { sleep } from 'k6';
import { record } from '../helpers/checks.js';

if (__ENV.ALLOW_RUN !== '1') throw new Error('ALLOW_RUN=1 required.');
const BASE_URL = __ENV.BASE_URL, TOKEN = __ENV.ESTIA_TOKEN;
if (!BASE_URL || !TOKEN) throw new Error('BASE_URL and ESTIA_TOKEN required.');

const FIXED_VUS = parseInt(__ENV.FIXED_VUS || '30', 10);
const DURATION = __ENV.DURATION || '90s';

export const options = {
  scenarios: {
    stampede: {
      executor: 'constant-vus',
      vus: FIXED_VUS,
      duration: DURATION,
    },
  },
  thresholds: { http_req_failed: ['rate<0.10'] },
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
};

const headers = { Cookie: `estia_token=${TOKEN}`, 'X-Posthog-Distinct-Id': 'perf-bot-flood' };

export default function () {
  // The dashboard-mount cluster: 4 calls the FE fires immediately on
  // /dashboard mount. We do them in PARALLEL via http.batch so the VU
  // models a real browser, not a sequential script.
  const responses = http.batch([
    { method: 'GET', url: `${BASE_URL}/api/dashboard/full`,    params: { headers, tags: { endpoint: 'dashboard_full' } } },
    { method: 'GET', url: `${BASE_URL}/api/topbar-counts`,     params: { headers, tags: { endpoint: 'topbar_counts' } } },
    { method: 'GET', url: `${BASE_URL}/api/properties?take=20`, params: { headers, tags: { endpoint: 'properties_list' } } },
    { method: 'GET', url: `${BASE_URL}/api/leads?take=20`,     params: { headers, tags: { endpoint: 'leads_list' } } },
  ]);
  for (const r of responses) record(r, 'aggregations');
  sleep(1); // 1s between mounts
}
