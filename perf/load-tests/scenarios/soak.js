// Soak — expected peak load held for 2 hours. Surfaces memory leaks,
// connection-pool creep, log-disk growth, slow-starting cache misses.
//
// Guarded by ALLOW_RUN=1 — see perf/WHERE_TO_RUN.md.

import http from 'k6/http';
import { sleep } from 'k6';
import { BASE_URL, login, jarFor } from '../helpers/auth.js';
import { record } from '../helpers/checks.js';

if (__ENV.ALLOW_RUN !== '1') {
  throw new Error('ALLOW_RUN=1 required — read perf/WHERE_TO_RUN.md first.');
}

const SUSTAIN_VUS = parseInt(__ENV.SUSTAIN_VUS || '50', 10);
const HOURS       = parseFloat(__ENV.HOURS     || '2');

export const options = {
  scenarios: {
    soak: {
      executor: 'constant-vus',
      vus: SUSTAIN_VUS,
      duration: `${HOURS * 60}m`,
    },
  },
  thresholds: {
    http_req_failed:   ['rate<0.001'],
    http_req_duration: ['p(95)<500'],
  },
};

export function setup() { return { cookie: login() }; }

export default function (data) {
  jarFor(data.cookie);
  record(http.get(`${BASE_URL}/api/me`,          { tags: { endpoint: 'me' } }),         'reads');
  record(http.get(`${BASE_URL}/api/properties`,  { tags: { endpoint: 'properties' } }), 'lists');
  record(http.get(`${BASE_URL}/api/leads`,       { tags: { endpoint: 'leads' } }),      'lists');
  sleep(3 + Math.random() * 2);
}
