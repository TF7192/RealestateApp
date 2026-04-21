// Breakpoint — binary-search the capacity ceiling. Incrementally higher
// arrival-rate stages; k6 auto-aborts when thresholds break. The last
// stage that passed is the reported ceiling.
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
      startRate: 10, timeUnit: '1s',
      preAllocatedVUs: 100, maxVUs: 2000,
      stages: [
        { duration: '10m', target: 50  },
        { duration: '10m', target: 100 },
        { duration: '10m', target: 200 },
        { duration: '10m', target: 400 },
        { duration: '10m', target: 800 },
      ],
    },
  },
  thresholds: {
    // Hard-stop the run if either breaks — we've found the ceiling.
    http_req_failed:   [{ threshold: 'rate<0.01', abortOnFail: true, delayAbortEval: '1m' }],
    http_req_duration: [{ threshold: 'p(95)<1000', abortOnFail: true, delayAbortEval: '1m' }],
  },
};

export function setup() { return { cookie: login() }; }

export default function (data) {
  jarFor(data.cookie);
  record(http.get(`${BASE_URL}/api/me`,         { tags: { endpoint: 'me' } }),         'reads');
  record(http.get(`${BASE_URL}/api/properties`, { tags: { endpoint: 'properties' } }), 'lists');
  sleep(0.5);
}
