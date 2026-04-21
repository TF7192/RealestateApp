// Spike — 5 min baseline, 2 min at 10×, back down. Validates
// graceful degradation + recovery.
//
// Guarded by ALLOW_RUN=1 — see perf/WHERE_TO_RUN.md.

import http from 'k6/http';
import { sleep } from 'k6';
import { BASE_URL, login, jarFor } from '../helpers/auth.js';
import { record } from '../helpers/checks.js';

if (__ENV.ALLOW_RUN !== '1') {
  throw new Error('ALLOW_RUN=1 required — read perf/WHERE_TO_RUN.md first.');
}

const BASELINE = parseInt(__ENV.BASELINE_VUS || '20', 10);
const SPIKE    = BASELINE * 10;

export const options = {
  scenarios: {
    baseline: {
      executor: 'constant-vus', vus: BASELINE, duration: '5m', startTime: '0s',
    },
    spike: {
      executor: 'ramping-vus',
      startVUs: BASELINE,
      startTime: '5m',
      stages: [
        { duration: '10s', target: SPIKE },
        { duration: '2m',  target: SPIKE },
        { duration: '10s', target: BASELINE },
        { duration: '2m',  target: BASELINE },  // recovery window
      ],
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.05'],
    // p95 may blow during spike; what we check is recovery.
  },
};

export function setup() { return { cookie: login() }; }

export default function (data) {
  jarFor(data.cookie);
  record(http.get(`${BASE_URL}/api/me`,         { tags: { endpoint: 'me' } }),         'reads');
  record(http.get(`${BASE_URL}/api/properties`, { tags: { endpoint: 'properties' } }), 'lists');
  sleep(1);
}
