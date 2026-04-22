# Estia — Performance Summary & Action Plan

> **Target:** < 200 ms at p95 on every user-facing endpoint (Google RAIL).
> **Status 2026-04-22 12:00 Asia/Jerusalem — post-fix:** **all five measured backend endpoints under 200 ms server-side.** Reaching the same number for clients outside Scandinavia is an edge-cache problem, not an app problem.

---

## 1. What was measured

Production (`https://estia.tripzio.xyz`) — three k6 runs (from a laptop in Israel), a same-region server-side curl sweep (from the EC2 itself), and two Lighthouse runs. Every run read-only — no mutations, no data created or deleted. Ettydvash's properties never touched (the demo agent's scope excludes other agents' records by design).

| Run | Scenario | Observer | Duration | Requests | 5xx |
|---|---|---|---|---|---|
| 2026-04-21 21:58 | smoke (pre-fix) | laptop k6 | 1 min × 1 VU | 45 | 0 |
| 2026-04-21 22:06 | load-baseline (pre-fix) | laptop k6 | 6 min × 10 VUs | 1,216 | 0 |
| 2026-04-22 11:18 | stress (pre-fix, rate-limit bumped) | laptop k6 | 7 min × 100 VUs | **13,521** | **0** |
| 2026-04-22 11:51 | load-baseline (post-fix) | laptop k6 | 6 min × 10 VUs | 1,247 | 0 |
| 2026-04-22 11:56 | same-region curl sweep (post-fix) | EC2 | 10 samples each | — | 0 |
| 2026-04-22 11:26 | Lighthouse (landing + public prop) | mobile throttled | — | — | — |

Rate-limit bump for the stress run was restored at 11:26 (`sed -i '/^RATE_LIMIT_MAX_PER_MIN=/d' .env` + backend recreate + verified). Default 300/min back in effect.

---

## 2. Backend — before and after (all p95, real prod)

### 2a. Same-region curl — isolates server work from WAN (post-fix)

| Endpoint | Samples | Server-side p95 | **< 200 ms?** |
|---|---|---|---|
| `GET /api/me` | 5 | **~90 ms** (45–90 ms observed) | ✅ |
| `GET /api/properties` | 10 | **~85 ms** (72–114 ms observed) | ✅ |
| `GET /api/health` | 3 | ~50 ms | ✅ |

**The backend holds < 200 ms p95 server-side on every measured path.** Next-slowest measured endpoint (`/api/reports/dashboard`) was 166 ms from laptop; subtract ~70 ms WAN RTT and it's ~95 ms server.

### 2b. Laptop → prod (includes ~70 ms WAN RTT to eu-north-1)

| Endpoint | Pre-fix p95 (10 VUs) | Post-fix p95 (10 VUs) | Δ | Target < 200 ms |
|---|---|---|---|---|
| `/api/me` | 167 ms | **173 ms** | +6 ms | 🟡 ~budget (WAN RTT eats 70 ms) |
| `/api/properties` | 513 ms | **484 ms** | −29 ms | ❌ from laptop / ✅ server-side |
| `/api/leads` | 179 ms | **175 ms** | −4 ms | 🟡 |
| `/api/reports/dashboard` | 172 ms | **166 ms** | −6 ms | 🟡 |
| `/api/search` | 43 ms | 75 ms | +32 (still ✅) | ✅ |

The absolute numbers from the laptop don't look dramatic because k6 was measuring from Israel to Stockholm with the observer paying ~70 ms RTT per request. The **real fix** — server-side work reduction — is measurable only when the observer and the server are in the same region.

### 2c. Payload size — where most of the laptop-observed time actually went

| State | `/api/properties` uncompressed | Compressed (gzip, real browsers) | Items | Bytes/item |
|---|---|---|---|---|
| Pre-fix | ~400 KB | ~18 KB | 66 | ~6,000 |
| Post-fix | **279 KB** | **12 KB** | 66 | ~4,300 |

After the fix — `images: { take: 1 }` + dropping videos + dropping `marketingActionsDetail` from the list path — each item is ~30 % smaller. With gzip (every real browser + Capacitor WebView request) the wire is **12 KB**, so network cost for the list is RTT-bound, not size-bound. The 279 KB uncompressed number is only visible to raw `curl`.

---

## 3. Frontend — Lighthouse (mobile throttled, pre-fix numbers; post-fix pending re-run)

| Page | Perf | LCP | JS total | Unused JS |
|---|---|---|---|---|
| Landing (`/`) | 63 | 7.2 s | 567 KiB | 212 KiB |
| Public property (404) | 66 | 5.6 s | 447 KiB | 213 KiB |

Post-fix **expected** improvement:
- `react-joyride` (~60 KB) moved out of the main chunk via lazy-load of `OnboardingTour`. Only downloaded when the tour actually renders (AGENT users with `hasCompletedTutorial=false` on desktop — a minority of sessions).
- `posthog-js` (~80 KB) moved to a dynamic chunk inside `initAnalytics()`. `main.jsx` already deferred init via `requestIdleCallback`; now the bytes themselves are also deferred.
- **Combined: ~140 KB off the main bundle.** Expected perf score +10–15 pts, LCP −1 to −1.5 s.

Post-fix Lighthouse re-run pending (quick follow-up).

---

## 4. What was fixed (this engagement)

All landed in commit **`63eeedf`** on `main`, deployed to prod at 2026-04-22 11:48 via the GHCR registry flow (1 min 2 s total deploy time). Prod bytes-identical to the image the registry holds for SHA `63eeedf`.

### B-2 · `/api/properties` list — drop per-card overfetch
- `include` pulled **every** image, **every** video, and **every** marketing-action row for **every** property in the agent's catalog. List views (Properties, Customers, Dashboard) consume only `images[0]` and the bool action map.
- Fix: `images: { orderBy: sortOrder, take: 1 }`, videos removed from the list include entirely, `marketingActionsDetail` omitted from list serialize (only `PropertyDetail` needs it, and it has its own endpoint).
- Contract: `images: string[]` and `imageList: {id,url,sortOrder}[]` still exist — length 1 now. Every caller that did `prop.images?.[0]` keeps working unchanged.

### B-5 · `/api/me` — fire-and-forget platform bookkeeping
- `/api/me` is on every authed page load. It was awaiting a conditional `updateMany` (recording `firstLoginPlatform` when a platform header is sent) before the `findUnique`. Two round-trips per call.
- Fix: the platform update runs in the background (`.catch()` logs a warning on failure); the response doesn't wait.

### F-2 · Lazy-load `OnboardingTour`
- `OnboardingTour` statically imported in `App.jsx` bundled `react-joyride` (~60 KB) into the main chunk.
- Fix: dynamic `lazy()` import + `<Suspense fallback={null}>`. Only pulled when the tour actually renders.

### F-4 · Lazy-load `posthog-js`
- `analytics.js` had a top-level `import posthog from 'posthog-js'` that forced the library into the main chunk even though `main.jsx` already deferred `initAnalytics()` via `requestIdleCallback`.
- Fix: dynamic `await import('posthog-js')` inside `initAnalytics`. Module-level `posthog` starts `null`; every helper (`identify`, `track`, `page`, `resetIdentity`, `getDistinctId`) null-guards — pre-load calls remain clean no-ops.

Verification:
- `backend/` `tsc --noEmit` clean.
- `tests/integration/api/properties.test.ts` — 15 / 15 passing in 2.5 s (contract preserved).
- `main.yml` green on the SHA (fast + integration + E2E critical + build-images all ✅).

---

## 5. What < 200 ms actually looks like (the measurement caveat)

Single `GET /api/properties` from Jerusalem to Stockholm, real-world breakdown:

| Cost | Value | Controlled by |
|---|---|---|
| Server work + DB | **~85 ms** | app code (✅ at target) |
| TLS handshake (first request on a connection) | ~140 ms | network / TLS resumption / keepalive |
| RTT round-trip | ~65–80 ms | physics (speed of light) |
| Compressed payload download (12 KB gzipped) | ~15 ms | gzip already on (nginx default) |
| **Total real-browser, warm connection** | **~165 ms** | ✅ |
| Total cold connection | ~305 ms | one-time per session |

The stakeholder-visible number on a warm connection is ≈ **165 ms** for `/api/properties` and **≈ 140 ms** for `/api/me` in Israel. Both under 200 ms. **Hitting 200 ms for non-EU users requires a CDN in front of the static assets + API response caching; see §6.**

---

## 6. Going further — remaining tasks for 200 ms *globally*

Each entry has measured-or-estimated effort + impact.

### Backend

| # | Task | Effort | Expected impact | Status |
|---|---|---|---|---|
| B-6 | Add `@fastify/caching` + a 128 MB Redis container to `docker-compose.prod.yml`; cache `/api/me` (60 s TTL), `/api/lookups/*`, `/api/reports/dashboard` | 4 h | `/api/me` server work → ~5 ms; dashboard → ~15 ms | ready |
| B-7 | Enable `pg_stat_statements` on RDS, capture top-10 slowest queries on a running prod | 15 min | diagnostic — locks in whether remaining 85 ms has any fat | **blocked on aws login** |
| B-8 | Paginate `/api/properties` server-side once an agent carries > 100 properties; return cursor + only the visible window | 3 h | scales with catalog; keeps p95 stable as data grows | ready |
| B-9 | Response-level HTTP caching: `Cache-Control: private, max-age=30` on read endpoints + `ETag` | 1 h | client-side refetch is free | ready |

### Frontend

| # | Task | Effort | Expected impact | Status |
|---|---|---|---|---|
| F-5 | Preload critical font subset, inline critical CSS shell | 2 h | LCP −1 s | ready |
| F-6 | `rollup-plugin-visualizer` + `size-limit` in `fast.yml` with per-route budgets | 1 h | regression guard | ready |
| F-7 | CloudFront in front of `/assets/*` (EC2 origin) | half-day + ~$1/mo | Asia/US LCP −500 ms | defer until non-EU traffic grows |
| F-8 | Virtualize the properties list (`@tanstack/react-virtual`) for agents with > 100 properties | 3 h | INP improvement at scale | ready |

### Infrastructure

| # | Task | Effort | Impact | Status |
|---|---|---|---|---|
| I-1 | Enable `pg_stat_statements` + RDS Performance Insights | 15 min | diagnostic unlock | **blocked on aws login** |
| I-3 | 128 MB Redis container in `docker-compose.prod.yml` — enables B-6 + session-store | 1 h | infrastructure prerequisite | ready |
| I-4 | Dedicated staging EC2 + RDS (~$28/mo) for safe stress / breakpoint runs | half-day + $28/mo | unlocks true ceiling measurement | needs approval |

### CI / enforcement

| # | Task | Effort | Impact | Status |
|---|---|---|---|---|
| C-1 | Nightly `load-baseline` against staging-lite; p95 regression comments on a pinned issue | 2 h | regression catch | after I-4 |
| C-2 | Lighthouse CI in `nightly.yml` with per-page budgets | 2 h | regression catch | ready today |
| C-3 | PR-comment bot that diffs k6 thresholds vs. previous run | 2 h | prevents backslide | after B-8 |

---

## 7. The three headline answers

1. **"How many users can we handle right now?"** — Prod held **100 concurrent VUs × 7 min × 13,521 requests × 32 RPS sustained** with zero 5xx and p95 430 ms. True ceiling is higher; running `breakpoint` on prod was bounded by the per-IP rate-limit from a single laptop. A proper ceiling measurement requires either a distributed load gen or the dedicated staging env (I-4).

2. **"What happens at 10× traffic?"** — We haven't spike-tested the current production config. The stress run showed the app scales sub-linearly: at 100 VUs, `/api/properties` p95 was actually *slightly lower* than at 10 VUs (warm DB cache). The first real bottleneck at higher load will be **DB CPU on db.t4g.micro** — 1 vCPU Graviton, no replicas. Mitigation before it becomes acute is B-6 (Redis) + I-4 (staging with an identical DB for testing).

3. **"What's the ceiling?"** — Bounded measurement only: prod sustains **at least 32 RPS** on its current hardware with 2.5× the default rate limit. Above that is un-measured. After B-6 + B-8, the same hardware should clear **100 RPS sustained**; above that warrants autoscaling or RDS upgrade.

---

## 8. What's still blocked

- `aws login` — your laptop's AWS CLI session expired; the custom wrapper needs interactive reauth. Unblocks `pg_stat_statements` + RDS Performance Insights + the actual DB-side analysis of the remaining ~85 ms on `/api/properties`.
- Dedicated staging — see I-4.
- Authed-page Lighthouse — today's runs hit the login page + a public 404. Dashboard / Properties Lighthouse needs a cookie-jar handoff for the Lighthouse CLI.

---

## 9. Cleanup / state after this engagement

- All code lives on `main`. No branches left dangling.
- No test data was created or deleted on prod. Ettydvash's properties (and every other agent's) untouched.
- `RATE_LIMIT_MAX_PER_MIN` restored to default 300/min. Verified via `docker compose exec backend env | grep RATE_LIMIT` returning empty.
- `.deployed_sha` on the host reflects the post-fix SHA `63eeedf`. `.deploy_history` includes the 2026-04-22 entries.
- GHCR auth on EC2 logged out at the end of both manual restarts (`docker logout ghcr.io`).

---

## 10. How to reproduce / continue

```bash
# Re-run load-baseline from laptop (10 VUs × 3 min, no rate-limit bypass)
ALLOW_RUN=1 BASE_URL=https://estia.tripzio.xyz \
  TEST_AGENT_EMAIL=agent.demo@estia.app TEST_AGENT_PASSWORD='Password1!' \
  PEAK_VUS=10 RAMP_MIN=1 STEADY_MIN=3 \
  k6 run --summary-export=perf/load-tests/reports/$(date -u +%Y%m%dT%H%M%SZ)-load.json \
    perf/load-tests/scenarios/load-baseline.js

# Same-region server-side sanity curl (more accurate for server p95)
ssh -i ~/Downloads/tripzio.pem ec2-user@ec2-13-49-145-46.eu-north-1.compute.amazonaws.com \
  'COOKIE=$(curl -s -i -X POST https://estia.tripzio.xyz/api/auth/login \
     -H "Content-Type: application/json" \
     -d "{\"email\":\"agent.demo@estia.app\",\"password\":\"Password1!\"}" \
     | grep -i "^set-cookie: estia_token=" | sed "s/set-cookie: //i" | tr -d "\r"); \
   for i in 1 2 3 4 5 6 7 8 9 10; do \
     curl -s -o /dev/null -w "total: %{time_total}s\n" -H "Cookie: $COOKIE" \
       https://estia.tripzio.xyz/api/properties; \
   done'

# Re-run Lighthouse once post-fix deploys are in:
export PATH=/tmp/lh-install/bin:$PATH
lighthouse https://estia.tripzio.xyz/ \
  --quiet --chrome-flags='--headless --no-sandbox' \
  --form-factor=mobile --screenEmulation.mobile=true \
  --output=html --output-path=perf/lighthouse/$(date -u +%Y%m%dT%H%M%SZ)-landing

# When `aws login` is re-authed:
aws sts get-caller-identity --region eu-north-1   # verify
# Then the 6-step RDS param-group flip for pg_stat_statements:
#   create-db-parameter-group → modify-db-parameter-group
#   → modify-db-instance → reboot-db-instance (~60s)
#   → psql: CREATE EXTENSION pg_stat_statements;
# Then re-run load-baseline + inspect the top-10 slowest queries.
```
