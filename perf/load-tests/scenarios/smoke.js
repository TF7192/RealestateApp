// Smoke — 1 VU, 1 minute. Sanity-check every critical endpoint class
// survives a single request. Budgeted as a CI gate.
//
// Run:
//   BASE_URL=http://localhost:4100 k6 run perf/load-tests/scenarios/smoke.js
//
// NOTE: this file is a scenario stub. It refuses to run until
// `perf/WHERE_TO_RUN.md` is answered and ALLOW_RUN=1 is explicitly set,
// so nobody accidentally load-tests production.

import http from 'k6/http';
import { sleep } from 'k6';
import { BASE_URL, login, jarFor } from '../helpers/auth.js';
import { record } from '../helpers/checks.js';

if (__ENV.ALLOW_RUN !== '1') {
  throw new Error(
    'ALLOW_RUN=1 must be set explicitly. Read perf/WHERE_TO_RUN.md first — ' +
    'every scenario is disabled until the target environment is chosen.'
  );
}

export const options = {
  vus: 1,
  duration: '1m',
  thresholds: {
    http_req_failed: ['rate<0.01'],
    'http_req_duration{endpoint:me}':          ['p(95)<300'],
    'http_req_duration{endpoint:properties}':  ['p(95)<500'],
    'http_req_duration{endpoint:leads}':       ['p(95)<500'],
    'http_req_duration{endpoint:reports}':     ['p(95)<1500'],
  },
};

export function setup() {
  return { cookie: login() };
}

export default function (data) {
  jarFor(data.cookie);

  record(http.get(`${BASE_URL}/api/me`,           { tags: { endpoint: 'me' } }),          'reads');
  sleep(1);
  record(http.get(`${BASE_URL}/api/properties`,   { tags: { endpoint: 'properties' } }),  'lists');
  sleep(1);
  record(http.get(`${BASE_URL}/api/leads`,        { tags: { endpoint: 'leads' } }),       'lists');
  sleep(1);
  record(http.get(`${BASE_URL}/api/reports/dashboard`, { tags: { endpoint: 'reports' } }), 'aggregations');
  sleep(2);
}
