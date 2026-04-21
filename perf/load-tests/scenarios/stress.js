// Stress — ramp far past expected peak, keep climbing until the system
// fails. Exploratory: no hard pass/fail; produces a ceiling number +
// first-failure-mode report.
//
// Guarded by ALLOW_RUN=1 — see perf/WHERE_TO_RUN.md.

import http from 'k6/http';
import { sleep } from 'k6';
import { BASE_URL, login, jarFor } from '../helpers/auth.js';
import { record } from '../helpers/checks.js';

if (__ENV.ALLOW_RUN !== '1') {
  throw new Error('ALLOW_RUN=1 required — read perf/WHERE_TO_RUN.md first.');
}

export const options = {
  scenarios: {
    climb: {
      executor: 'ramping-arrival-rate',
      startRate: 5, timeUnit: '1s',
      preAllocatedVUs: 50, maxVUs: 1000,
      stages: [
        { duration: '2m',  target: 50 },
        { duration: '3m',  target: 150 },
        { duration: '3m',  target: 300 },
        { duration: '3m',  target: 500 },
        { duration: '3m',  target: 800 },
        { duration: '3m',  target: 1200 },
      ],
    },
  },
  // Soft budgets so the run completes even when we blow them.
  thresholds: {
    http_req_failed:   ['rate<0.25'],
    http_req_duration: ['p(95)<5000'],
  },
};

export function setup() { return { cookie: login() }; }

export default function (data) {
  jarFor(data.cookie);
  record(http.get(`${BASE_URL}/api/me`,         { tags: { endpoint: 'me' } }),         'reads');
  record(http.get(`${BASE_URL}/api/properties`, { tags: { endpoint: 'properties' } }), 'lists');
  sleep(0.5);
}
