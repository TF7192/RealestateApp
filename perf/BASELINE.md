# Estia — Performance Baseline

> The "as-is" headline numbers. **First two runs landed 2026-04-21 against production** — smoke (1 VU × 1 min) and load-baseline (10 VUs × 5 min steady + 1 min ramp). Detailed reports in `perf/load-tests/reports/`.

---

## Headline (load-baseline — 10 VUs × 5 min, 1,216 requests, 791 iterations)

| Metric | Value | Budget | Status |
|---|---|---|---|
| Concurrent users held | 10 | — (validation only; target = 500 CCU) | — |
| RPS sustained | **3.3 RPS** (1,216 req / 365 s) | — (target = 50 RPS) | _need stress to project_ |
| p50 overall | 113 ms | — | ✅ |
| p95 overall | **454 ms** | < 500 ms | 🟡 at budget |
| p99 overall | — (see per-endpoint) | < 1 s | ✅ |
| **Error rate** (HTTP ≥ 400) | **6.08 %** (74/1216) | < 0.1 % | ❌ (investigation → F-2) |
| Server error rate (5xx) | **0 %** | < 0.1 % | ✅ |
| Data received | 130 MB / 365 s ≈ **356 KB/s** | — | heavy list payloads dominate |

> **Under light concurrency (10 VUs) the server never errored with 5xx.** The 6% "failed" rate is HTTP 4xx — either 401s from session expiry, 429s from per-IP rate-limit (5 VUs × multiple endpoints/iteration easily gets near 300/min from one IP), or 404s on newer sprint-1 routes that may not exist in the deployed SHA. See F-2.

---

## Per-endpoint (load-baseline)

| Endpoint | p50 | p95 | p99 | Max | Budget (p95) | Status |
|---|---|---|---|---|---|---|
| `GET /api/me` | 97 ms | **167 ms** | 176 ms | 250 ms | < 150 ms | 🟡 |
| `GET /api/properties` | 429 ms | **513 ms** | 525 ms | 578 ms | < 400 ms | ❌ |
| `GET /api/leads` | 102 ms | 179 ms | 208 ms | 259 ms | < 400 ms | ✅ |
| `GET /api/reports/dashboard` | 96 ms | 172 ms | 201 ms | 201 ms | < 1500 ms | ✅ |
| `GET /api/search?q=דירה` | 7 ms | **43 ms** | 90 ms | 90 ms | < 800 ms | ✅✅ |

Sample sizes vary: `/api/properties` + `/api/me` saw the most hits (weighted scenario). `/api/search` was faster than expected — either a small dataset is masking a latent ILIKE/full-scan issue (`S-1` suspicion from `FINDINGS.md`) or the search layer is already doing the right thing.

### Key observation: `/api/properties` is flat under concurrency

Smoke (1 VU): `/api/properties` p95 = **512 ms**. Load (10 VUs): **513 ms**. Same cost.

**This is per-request work, not DB contention.** Scaling VUs won't reveal the bottleneck — a single request already pays 500 ms+ in query fan-out or serialization. See `FINDINGS.md#F-1`.

---

## Frontend (pending — needs Lighthouse CI run)

| Metric | Value | Budget | Status |
|---|---|---|---|
| Largest Contentful Paint | — | < 2.5 s | — |
| Interaction to Next Paint | — | < 200 ms | — |
| Cumulative Layout Shift | — | < 0.1 | — |
| Time to First Byte | — | < 600 ms | — |
| Initial JS bundle (gzipped) | — | < 300 KB | — |
| Lighthouse Performance score | — | > 85 | — |

---

## Infra utilization at load-baseline peak (pending `aws login`)

| Resource | Peak | Avg | Budget | Status |
|---|---|---|---|---|
| EC2 CPU (`t3.small`, 2 vCPU burst) | — | — | < 70 % | — |
| EC2 RAM | — | — | < 80 % | — |
| RDS CPU (`db.t4g.micro`, 1 vCPU) | — | — | < 70 % | — |
| RDS active connections | — | — | < 50 | — |
| `pg_stat_statements` top-5 slow | — | — | query p95 < 100 ms | — |

> Gated on AWS session re-auth + RDS parameter-group flip for `pg_stat_statements`. Without it we're guessing at DB-side numbers.

---

## Previous runs (newest first)

- **2026-04-21T22:06Z** — `load-baseline` — 10 VUs × 6 min on prod — 0 × 5xx, 6.08 % 4xx, `/api/properties` p95 flat under concurrency (confirms F-1 is query-shape not infra). Report: `perf/load-tests/reports/20260421T190002Z-load-baseline-prod.json`.
- **2026-04-21T21:58Z** — `smoke` — 1 VU × 1 min on prod — 45/45 checks ✓, 0 errors, `/api/properties` p95 = 512 ms (budget 500 ms). Report: `perf/load-tests/reports/20260421T185821Z-smoke-prod.json`.

---

## The three headline answers (partial — `stress`/`breakpoint` blocked on dedicated env)

- **"How many users can we handle right now?"** — At 10 concurrent users the app holds with **zero server errors**, p95 475 ms. Higher CCU is **unsafe to test on prod** (t3.small + db.t4g.micro shared with Tripzio + real agents). A proper capacity number requires `stress`/`breakpoint` on an isolated target.
- **"What happens if we suddenly get 10× traffic?"** — Extrapolating from the per-request profile: `/api/properties` already sits at 500 ms single-user, so a 10× burst will mostly be DB-contention territory we haven't measured. Needs `spike` on an isolated target.
- **"What's the ceiling?"** — Unknown. Next step: enable `pg_stat_statements`, run one more prod baseline with DB-side instrumentation, then stand up the staging-lite target for stress/breakpoint.
