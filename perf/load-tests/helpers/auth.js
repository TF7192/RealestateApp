// Login once, reuse the session cookie across VUs for the rest of the run.
// Hitting POST /api/auth/login on every iteration would swamp the auth
// endpoint (argon2 is CPU-hard) and isn't realistic — real users log in
// once per session, not once per request.
//
// Consumed from k6 scenarios via:
//   import { login } from '../helpers/auth.js';
//   export function setup() { return { cookie: login() }; }
//   export default function (data) { http.get(`${BASE}/...`, { cookies: parse(data.cookie) }); }

import http from 'k6/http';
import { check, fail } from 'k6';

const BASE_URL = __ENV.BASE_URL;
const EMAIL    = __ENV.TEST_AGENT_EMAIL    || 'agent.demo@estia.app';
const PASSWORD = __ENV.TEST_AGENT_PASSWORD || 'estia-demo-1234';

if (!BASE_URL) {
  fail('BASE_URL env var is required (e.g. https://staging.estia.tripzio.xyz or http://localhost:4100).');
}

export { BASE_URL };

export function login() {
  const res = http.post(
    `${BASE_URL}/api/auth/login`,
    JSON.stringify({ email: EMAIL, password: PASSWORD }),
    { headers: { 'Content-Type': 'application/json' }, tags: { endpoint: 'auth/login' } }
  );
  check(res, {
    'login 200': (r) => r.status === 200,
  }) || fail(`login failed: ${res.status} ${res.body}`);
  // k6 http stores cookies per-VU; return the raw Set-Cookie header so
  // the scenario can replay it in every request with `jar`.
  const setCookie = res.headers['Set-Cookie'] || '';
  return setCookie;
}

// Re-usable jar builder so every request rides the same cookie.
export function jarFor(setCookie) {
  const jar = http.cookieJar();
  if (setCookie) {
    // Expected form: estia_token=<value>; Path=/; HttpOnly; Secure; SameSite=Lax
    const m = setCookie.match(/estia_token=([^;]+)/);
    if (m) jar.set(BASE_URL, 'estia_token', m[1]);
  }
  return jar;
}
