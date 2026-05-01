// "Realistic workday" stress at a FIXED VU count — Scenario A.
// Each VU = one agent doing the same 30s session loop as agent-day.js,
// but the runner holds a constant VU count so the resulting p50/p95/p99
// numbers reflect ONE concurrency level cleanly (no ramp blur).
//
// Run once per level. The wrapping shell script in this directory
// invokes 7 of these runs at 10/20/30/50/100/150/200 VUs.
//
// Required env: BASE_URL, ESTIA_TOKEN, ALLOW_RUN=1, FIXED_VUS, DURATION (default 4m).
import http from 'k6/http';
import { sleep, group } from 'k6';
import { record } from '../helpers/checks.js';

if (__ENV.ALLOW_RUN !== '1') throw new Error('ALLOW_RUN=1 required.');
const BASE_URL = __ENV.BASE_URL, TOKEN = __ENV.ESTIA_TOKEN;
const SEED_PROP = __ENV.SEED_PROPERTY_ID || '';
const SEED_LEAD = __ENV.SEED_LEAD_ID || '';
if (!BASE_URL || !TOKEN) throw new Error('BASE_URL and ESTIA_TOKEN required.');

const FIXED_VUS = parseInt(__ENV.FIXED_VUS || '30', 10);
const DURATION = __ENV.DURATION || '4m';

export const options = {
  scenarios: {
    workday: {
      executor: 'constant-vus',
      vus: FIXED_VUS,
      duration: DURATION,
    },
  },
  thresholds: { http_req_failed: ['rate<0.05'] },
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
};

const headers = { Cookie: `estia_token=${TOKEN}`, 'X-Posthog-Distinct-Id': 'perf-bot-workday' };
const R = () => Math.random();

export default function () {
  group('session', () => {
    record(http.get(`${BASE_URL}/api/dashboard/full`, { headers, tags: { endpoint: 'dashboard_full' } }), 'aggregations');
    record(http.get(`${BASE_URL}/api/topbar-counts`, { headers, tags: { endpoint: 'topbar_counts' } }), 'reads');
    sleep(2 + R() * 3);

    record(http.get(`${BASE_URL}/api/properties?take=20`, { headers, tags: { endpoint: 'properties_list' } }), 'lists');
    sleep(1 + R() * 2);

    if (SEED_PROP && R() < 0.7) {
      record(http.get(`${BASE_URL}/api/properties/${SEED_PROP}`, { headers, tags: { endpoint: 'property_detail' } }), 'reads');
      sleep(2 + R() * 3);
    }

    record(http.get(`${BASE_URL}/api/leads?take=20`, { headers, tags: { endpoint: 'leads_list' } }), 'lists');
    sleep(1 + R() * 2);

    if (SEED_LEAD && R() < 0.6) {
      record(http.get(`${BASE_URL}/api/leads/${SEED_LEAD}`, { headers, tags: { endpoint: 'lead_detail' } }), 'reads');
    }
    if (R() < 0.4) {
      record(http.get(`${BASE_URL}/api/reports/dashboard`, { headers, tags: { endpoint: 'reports_dashboard' } }), 'aggregations');
    }
    if (R() < 0.3) {
      record(http.get(`${BASE_URL}/api/search?q=%D7%93%D7%99%D7%A8%D7%94`, { headers, tags: { endpoint: 'search' } }), 'search');
    }
    if (R() < 0.25) {
      record(http.get(`${BASE_URL}/api/deals`, { headers, tags: { endpoint: 'deals_list' } }), 'lists');
    }
    record(http.get(`${BASE_URL}/api/reminders?upcoming=1`, { headers, tags: { endpoint: 'reminders_list' } }), 'lists');
    sleep(3 + R() * 5);
  });
}
