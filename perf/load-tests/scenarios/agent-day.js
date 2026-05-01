// "Busy real-estate agent" simulation — what 30 agents working a normal
// day actually look like to the backend. Each VU represents one agent
// session that:
//
//   - logs into the dashboard (5-call fan-out via /api/dashboard/full)
//   - browses /properties (paginated list)
//   - opens 1-2 property details + their offers
//   - browses /customers (lead list)
//   - opens a lead detail + its search profiles
//   - opens /reports
//   - searches a few times
//   - polls /api/topbar-counts every page-nav (Layout.jsx pattern)
//   - opens /map for ~10s with 50 pins
//   - occasionally hits /api/public-matches/count
//
// The mix is tuned so that across 30 VUs there are always ~2-5 inflight
// requests at any moment — a realistic active-agent load. This is NOT
// the dashboard-mount stampede (that's the Phase E concurrent-users
// test); this is sustained working-day traffic.
//
// Required env:
//   BASE_URL, ESTIA_TOKEN, ALLOW_RUN=1
// Optional:
//   PEAK_VUS (30), STEADY_MIN (15), SEED_PROPERTY_ID, SEED_LEAD_ID

import http from 'k6/http';
import { sleep, group } from 'k6';
import { record } from '../helpers/checks.js';

if (__ENV.ALLOW_RUN !== '1') throw new Error('ALLOW_RUN=1 required.');

const BASE_URL  = __ENV.BASE_URL;
const TOKEN     = __ENV.ESTIA_TOKEN;
const SEED_PROP = __ENV.SEED_PROPERTY_ID || '';
const SEED_LEAD = __ENV.SEED_LEAD_ID || '';
if (!BASE_URL || !TOKEN) throw new Error('BASE_URL and ESTIA_TOKEN required.');

const PEAK_VUS   = parseInt(__ENV.PEAK_VUS   || '30', 10);
const STEADY_MIN = parseInt(__ENV.STEADY_MIN || '15', 10);

export const options = {
  scenarios: {
    busy_agents: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m',                target: PEAK_VUS },
        { duration: `${STEADY_MIN}m`,    target: PEAK_VUS },
        { duration: '1m',                target: 0 },
      ],
      gracefulRampDown: '30s',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.02'],
    'http_req_duration{endpoint:dashboard_full}':       ['p(95)<2000'],
    'http_req_duration{endpoint:properties_list}':      ['p(95)<2000'],
    'http_req_duration{endpoint:property_detail}':      ['p(95)<1500'],
    'http_req_duration{endpoint:leads_list}':           ['p(95)<2000'],
    'http_req_duration{endpoint:lead_detail}':          ['p(95)<1000'],
    'http_req_duration{endpoint:topbar_counts}':        ['p(95)<500'],
    'http_req_duration{endpoint:reports_dashboard}':    ['p(95)<2000'],
    'http_req_duration{endpoint:search}':               ['p(95)<1500'],
    'http_req_duration{endpoint:public_matches_count}': ['p(95)<1500'],
  },
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
};

const headers = { Cookie: `estia_token=${TOKEN}`, 'X-Posthog-Distinct-Id': 'perf-bot-agent-day' };
const R = () => Math.random();

// One full agent "session" — runs in a loop while the VU is active.
export default function () {
  group('agent_session', () => {
    // 1. Dashboard mount (the bundled call replaces 5 fan-outs).
    record(http.get(`${BASE_URL}/api/dashboard/full`, { headers, tags: { endpoint: 'dashboard_full' } }), 'aggregations');
    record(http.get(`${BASE_URL}/api/topbar-counts`, { headers, tags: { endpoint: 'topbar_counts' } }), 'reads');
    sleep(3 + R() * 4); // agent reads dashboard for 3-7s

    // 2. Properties list — main browse activity
    record(http.get(`${BASE_URL}/api/properties?take=20`, { headers, tags: { endpoint: 'properties_list' } }), 'lists');
    record(http.get(`${BASE_URL}/api/topbar-counts`, { headers, tags: { endpoint: 'topbar_counts' } }), 'reads');
    sleep(2 + R() * 3);

    // 3. Open 1-2 property details
    if (SEED_PROP && R() < 0.7) {
      record(http.get(`${BASE_URL}/api/properties/${SEED_PROP}`, { headers, tags: { endpoint: 'property_detail' } }), 'reads');
      record(http.get(`${BASE_URL}/api/properties/${SEED_PROP}/offers`, { headers, tags: { endpoint: 'property_offers' } }), 'lists');
      sleep(4 + R() * 6);
    }

    // 4. Customers list
    record(http.get(`${BASE_URL}/api/leads?take=20`, { headers, tags: { endpoint: 'leads_list' } }), 'lists');
    record(http.get(`${BASE_URL}/api/topbar-counts`, { headers, tags: { endpoint: 'topbar_counts' } }), 'reads');
    sleep(2 + R() * 3);

    // 5. Open a lead detail
    if (SEED_LEAD && R() < 0.6) {
      record(http.get(`${BASE_URL}/api/leads/${SEED_LEAD}`, { headers, tags: { endpoint: 'lead_detail' } }), 'reads');
      record(http.get(`${BASE_URL}/api/leads/${SEED_LEAD}/search-profiles`, { headers, tags: { endpoint: 'lead_search_profiles' } }), 'lists');
      sleep(3 + R() * 4);
    }

    // 6. Reports
    if (R() < 0.4) {
      record(http.get(`${BASE_URL}/api/reports/dashboard`, { headers, tags: { endpoint: 'reports_dashboard' } }), 'aggregations');
      sleep(3 + R() * 4);
    }

    // 7. Search (few times per session)
    if (R() < 0.5) {
      const queries = ['%D7%93%D7%99%D7%A8%D7%94', '%D7%AA%D7%9C%20%D7%90%D7%91%D7%99%D7%91', '%D7%99%D7%95%D7%A1%D7%99'];
      const q = queries[Math.floor(R() * queries.length)];
      record(http.get(`${BASE_URL}/api/search?q=${q}`, { headers, tags: { endpoint: 'search' } }), 'search');
      sleep(2 + R() * 2);
    }

    // 8. Map view (occasional)
    if (R() < 0.2) {
      record(http.get(`${BASE_URL}/api/properties?take=200`, { headers, tags: { endpoint: 'properties_map' } }), 'lists');
      sleep(8 + R() * 5); // map view is sticky
    }

    // 9. Public matches count (sidebar badge poll)
    if (R() < 0.3) {
      record(http.get(`${BASE_URL}/api/public-matches/count`, { headers, tags: { endpoint: 'public_matches_count' } }), 'aggregations');
    }

    // 10. Deals list (occasional)
    if (R() < 0.25) {
      record(http.get(`${BASE_URL}/api/deals`, { headers, tags: { endpoint: 'deals_list' } }), 'lists');
      sleep(2 + R() * 2);
    }

    // 11. Reminders panel poll (every page-nav)
    record(http.get(`${BASE_URL}/api/reminders?upcoming=1`, { headers, tags: { endpoint: 'reminders_list' } }), 'lists');

    // Idle 5-15s before the next browse cycle.
    sleep(5 + R() * 10);
  });
}
