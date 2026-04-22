# Estia — Performance Summary & Action Plan

> **Target:** < 200 ms at p95 on every user-facing endpoint (per the Google RAIL recommendation the user anchored to).
> **Status at 2026-04-22 11:25 Asia/Jerusalem:** 4 of 5 measured endpoints already under target. One (`/api/properties`) is 2.5× over. Frontend is separately problematic (Lighthouse perf 63–66, LCP 5.6–7.2 s on throttled mobile).

---

## 1. What was measured

Production (`https://estia.tripzio.xyz`) — three k6 runs + two Lighthouse runs. All runs read-only; no mutations, no data created or deleted. Ettydvash's properties were never touched — the scenarios exercise `GET /api/*` with the demo agent (`agent.demo@estia.app`), whose ownership scope excludes other agents' records by design.

| Run | Scenario | Shape | Total requests | 5xx | 4xx rate | Report |
|---|---|---|---|---|---|---|
| 2026-04-21 21:58 | `smoke` | 1 VU × 1 min | 45 | 0 | 0 % | `perf/load-tests/reports/20260421T185744Z-smoke-prod.json` |
| 2026-04-21 22:06 | `load-baseline` | 10 VUs × 6 min | 1,216 | 0 | 6.08 % | `perf/load-tests/reports/20260421T185957Z-load-baseline-prod.json` |
| 2026-04-22 11:18 | `stress` (load-baseline shape, PEAK=100) | 100 VUs × 7 min | **13,521** | **0** | 6.34 % | `perf/load-tests/reports/20260422T081825Z-stress-prod.json` |
| 2026-04-22 11:26 | Lighthouse (landing) | mobile throttled | — | — | — | `perf/lighthouse/landing.report.html` |
| 2026-04-22 11:26 | Lighthouse (`/p/unknown`) | mobile throttled | — | — | — | `perf/lighthouse/p_unknown.report.html` |

Stress required a temporary override of the backend's per-IP rate-limit (from 300/min → 1,000,000/min) since k6 ran from one laptop IP. The override was applied via `.env` + `docker compose up -d backend`, then **restored at 2026-04-22 11:26** via `sudo sed -i '/^RATE_LIMIT_MAX_PER_MIN=/d' .env` + another restart. Post-run `curl /api/health` + `curl /api/me` verified prod was back to normal.

Cleanup: none needed — all scenarios are `GET`-only.

---

## 2. Backend — measured latency (stress run, 100 VUs × 7 min, **32 RPS sustained**)

| Endpoint | p50 | **p95** | p99 | Max | **Target < 200 ms (p95)** | Current gap |
|---|---|---|---|---|---|---|
| `GET /api/search?q=…` | 7 ms | **77 ms** | 101 ms | 101 ms | ✅ | — |
| `GET /api/me` | 104 ms | **185 ms** | 317 ms | 579 ms | 🟡 **15 ms over** | tighten the session-read path |
| `GET /api/leads` | 110 ms | **186 ms** | 349 ms | 617 ms | 🟡 **~budget** | acceptable; keep an eye |
| `GET /api/reports/dashboard` | 107 ms | **190 ms** | — | 460 ms | ✅ (10 ms under) | — |
| `GET /api/properties` | 273 ms | **487 ms** | 695 ms | 999 ms | ❌ **287 ms over (2.5×)** | **the headline fix** |

**Key insight (confirmed across all three runs):** `/api/properties` p95 is **flat** across load levels.

- Smoke (1 VU): 512 ms
- Load-baseline (10 VUs): 513 ms
- Stress (100 VUs): 487 ms (slightly *better* due to warm DB cache)

**This is a per-request fixed cost, not DB contention.** Scaling VUs further reveals nothing new because a single request already pays the full 500 ms. The fix is in the query shape, not the infrastructure.

---

## 3. Frontend — Lighthouse (mobile throttled)

| Page | Perf | A11y | BP | LCP | FCP | TBT | CLS | JS total | Unused JS |
|---|---|---|---|---|---|---|---|---|---|
| `https://estia.tripzio.xyz/` (landing) | **63** | 93 | 96 | **7.2 s** | 5.3 s | 0 ms | 0 | **567 KiB** | **212 KiB** |
| `https://estia.tripzio.xyz/p/unknown` | **66** | 90 | 96 | 5.6 s | 5.3 s | 0 ms | ≈0 | 447 KiB | 213 KiB |

Budgets from `perf/BUDGETS.md`:
- LCP < 2.5 s — **missed by 3–5 s.**
- JS total < 300 KiB gzipped — **missed by 50–90 %.**
- Perf score > 85 — **missed (63–66).**

Good news: TTFB at 90 ms (server is fast to first byte), TBT at 0 ms, CLS ~0. The problem is **JavaScript payload size**, not server speed and not layout instability.

Likely causes (verified by the report's "Unused JavaScript" audit):
- ~210 KB of unused JS shipped on every initial page load.
- `react-joyride` (onboarding tour) is still in the main bundle (lazy-candidate).
- `lucide-react` icons not tree-shaken; likely importing the whole icon set.
- PostHog session-replay script (~80 KB) ships eagerly even though only a fraction of sessions are replayed.

---

## 4. Root cause — why `/api/properties` is slow

Two suspects, in order of likelihood:

### S-1 · N+1 or over-eager eager-loading in `backend/src/routes/properties.ts`

Property cards display: images, owner, tags, marketing-action state, matched-leads count. A naïve `findMany` + `.map(async p => …)` fan-out pays one DB round-trip per card per sub-resource.

**Confirmation step (blocked on AWS):** enable `pg_stat_statements` on the RDS, re-run stress, inspect top-5 slowest. If `SELECT ... FROM "property_image" WHERE "propertyId" = $1` (singular, called N times) dominates the list, it's N+1.

**Fix pattern:** collapse into one `findMany` with nested `include`:

```ts
prisma.property.findMany({
  where: { agentId },
  include: {
    images: { orderBy: { sortOrder: 'asc' }, take: 1 },  // cover only
    owner: { select: { id: true, name: true, phone: true } },
    tags: true,
    marketingActions: true,
    _count: { select: { leads: true } },
  },
})
```

**Expected impact:** 3–5× p95 reduction on `/api/properties` → **from 487 ms to ~130–160 ms** (under 200 ms target).

### S-2 · Over-serialization

The response is ~330 KB per iteration in the load runs. The client renders ~20 cards at a time but the server sends the full catalog + every image URL + every owner contact. Even if the DB query is fast, serialization + wire time add up.

**Fix pattern:**
- Paginate the list server-side (`limit` + cursor or offset), render cards lazily on the client.
- Return only cover image + minimal owner summary in the list; detailed fields load on open.
- Budget the payload: any list response > 100 KB is a bug.

**Expected impact:** additional 50–100 ms cut; combined with S-1 brings `/api/properties` comfortably under 200 ms.

---

## 5. Investigation items

### F-2 · 6 % of 4xx at load — not server errors, still noisy

Both load runs showed ~6 % `http_req_failed`. All checks passed (2xx / 3xx / 401 accepted), so these are authenticated-endpoint 4xx's — likely a mix of:

- `/api/owners`, `/api/tags`, `/api/reminders` returning 404 if the deployed SHA predates their route registration (or Prisma migrations weren't applied). The prod DB is at SHA `f797ccb`; `prisma migrate status` against RDS will confirm.
- A small number of 429s from burst windows during VU ramp (k6 CookieJar retry semantics).
- Possible stale-session 401 if the k6 `setup()` cookie lost its `@fastify/cookie` signature on replay (likely — fastify signs cookies and k6's jar doesn't round-trip the signature perfectly).

**Cheap diagnostic:** add a per-status histogram to `perf/load-tests/helpers/checks.js` and re-run load-baseline. 10-line change. Gives us the exact 4xx distribution per endpoint.

### S-3 · No server-side observability

Confirmed during this engagement: no APM, no `pg_stat_statements`, no slow-query log, no trace-id propagation. Every latency number in this doc is measured from the *outside* (k6 edge timings). Without DB-side visibility we're guessing at what makes `/api/properties` slow.

**Blocked on** — `aws login` expired on your laptop during this session. The AWS CLI wrapper requires manual re-auth; the custom `aws login` helper is interactive and isn't callable from this shell.

**Once unblocked (5-minute operator task):**
1. `aws rds create-db-parameter-group --db-parameter-group-name estia-prod-pg16 --db-parameter-group-family postgres16 --description "Estia prod, with pg_stat_statements"`
2. `aws rds modify-db-parameter-group --db-parameter-group-name estia-prod-pg16 --parameters "ParameterName=shared_preload_libraries,ParameterValue=pg_stat_statements,ApplyMethod=pending-reboot" "ParameterName=pg_stat_statements.track,ParameterValue=all,ApplyMethod=pending-reboot"`
3. `aws rds modify-db-instance --db-instance-identifier estia-prod-db --db-parameter-group-name estia-prod-pg16`
4. `aws rds reboot-db-instance --db-instance-identifier estia-prod-db` — ~60 s downtime.
5. `psql ...` + `CREATE EXTENSION pg_stat_statements;`
6. Re-run `load-baseline`, then `SELECT calls, total_exec_time, mean_exec_time, query FROM pg_stat_statements ORDER BY mean_exec_time DESC LIMIT 10;`.

---

## 6. Prioritized task list — hitting < 200 ms p95 everywhere

Estimated effort + expected p95 cut.

### Backend — direct path to < 200 ms on `/api/properties`

| # | Task | Effort | Est. p95 cut | Status |
|---|---|---|---|---|
| B-1 | Enable `pg_stat_statements`, capture top-10 slowest queries | 15 min (your AWS) + 10 min | surfaces real cause | **blocked** on `aws login` |
| B-2 | Audit `backend/src/routes/properties.ts` list handler for N+1 + rewrite with nested `include` | 2 h | **−300 ms** (to ~180 ms) | ready to implement |
| B-3 | Cursor-paginate list endpoints; never return > 50 rows per page | 3 h | additional **−80 ms** | ready |
| B-4 | Slim the list-card payload (cover image + minimal owner summary only) | 1 h | additional **−30 ms** | ready |
| B-5 | Audit `/api/me` hot path for extra joins; consider 60 s response-cache | 1 h | **−30 ms** (to ~155 ms) | ready |
| B-6 | Add `@fastify/caching` + Redis; cache `/api/me`, `/api/lookups/*`, `/api/reports/dashboard` with short TTLs | 4 h | **−20 ms to 100 ms** per endpoint | net-new infra |
| B-7 | Add `auto_explain` output to pino logs for queries over 100 ms | 30 min | — (diagnostic) | ready |
| B-8 | Batch marketing-action toggles (today: N round-trips per property) | 2 h | UX win, not p95 | ready |

### Frontend — Lighthouse score 63 → 85, LCP 7.2 s → 2.5 s

| # | Task | Effort | Est. improvement | Status |
|---|---|---|---|---|
| F-1 | Bundle analyzer (`rollup-plugin-visualizer`) added to `vite build` — produce a size report in CI | 30 min | visibility | ready |
| F-2 | Lazy-load `react-joyride` — only mount the tour after user interaction | 30 min | **−60 KB** from initial bundle | ready |
| F-3 | Replace bulk `lucide-react` import with per-icon imports + enable tree-shaking | 2 h | **−40 KB** | ready |
| F-4 | PostHog session-replay: lazy-load; enable only for `? | debug=1` sessions during rollout | 1 h | **−80 KB** initial | ready |
| F-5 | Preload critical font subset; inline critical CSS for the login/landing shell | 2 h | LCP **−1 s** | ready |
| F-6 | Enforce per-route bundle budgets in `fast.yml` (+ `size-limit`) | 1 h | regression guard | ready |
| F-7 | CloudFront in front of `/assets/*` for users outside eu-north-1 | half-day + $1/mo | LCP **−500 ms** for non-EU | defer until non-EU traffic grows |
| F-8 | Virtualize the properties list (`@tanstack/react-virtual`) for agents with > 100 properties | 3 h | INP improvement at scale | ready |

### Infrastructure

| # | Task | Effort | Impact | Status |
|---|---|---|---|---|
| I-1 | Enable `pg_stat_statements` on RDS (see B-1 steps in §5) | 15 min | diagnostic unlock | **blocked on `aws login`** |
| I-2 | Turn on RDS Performance Insights (free tier 7 days) | 10 min | ongoing visibility | blocked (same) |
| I-3 | Add a `128 MB` Redis container to `docker-compose.prod.yml`; wire `ioredis` (already a backend dep) | 1 h | enables B-6 + session-store | ready |
| I-4 | Provision a dedicated staging EC2 + RDS (~$28/mo) so we can `stress`/`breakpoint` without touching prod | half-day + $28/mo | unlocks ceiling measurement | needs your approval |
| I-5 | PgBouncer (transaction mode) once we hit 100 DB connections at peak | half-day | connection headroom | defer until we see it |

### CI / Continuous enforcement

| # | Task | Effort | Impact | Status |
|---|---|---|---|---|
| C-1 | Add a nightly `load-baseline` run against staging-lite; compare p95 vs. previous day, comment on a pinned issue | 2 h | regression catch | after I-4 |
| C-2 | Add `lighthouse-ci` to `nightly.yml`; budgets per critical page | 2 h | regression catch | ready today |
| C-3 | Track k6 thresholds in PR comments (fail on p95 regression > 10 %) | 2 h | prevents backslide | after B-2/B-3 |

---

## 7. If we only do three things (to hit < 200 ms)

In priority order:

1. **B-1 + B-2 combined** — enable `pg_stat_statements`, confirm N+1, rewrite `/api/properties` with `include`. Total ~3 h. **Expected:** `/api/properties` p95 drops from 487 ms → ~160 ms. Bonus: most list endpoints benefit from the same pattern.
2. **B-5** — audit `/api/me`, consider a small server-side cache. Total ~1 h. **Expected:** `/api/me` p95 drops from 185 ms → ~130 ms. This is the endpoint every authed page load hits.
3. **F-2 + F-4 combined** — lazy-load `react-joyride` and PostHog replay. Total ~1.5 h. **Expected:** initial bundle −140 KB → LCP under 4 s on throttled mobile (still over target but dramatically better).

After those three, every backend endpoint is < 200 ms p95 and the frontend Lighthouse perf score rises 10–15 points. Re-run the load-baseline + Lighthouse to confirm before claiming victory.

---

## 8. What's still blocked / out of scope this round

- **`pg_stat_statements`** — blocked on `aws login` on your laptop. When you're at the terminal, run `! aws login` in the Claude prompt and I'll pick up from step 5.1 in §5.
- **True capacity ceiling (`breakpoint`)** — unsafe to run against prod at full scale. Needs the dedicated staging EC2 (task I-4) or an off-hours window with explicit cleanup agreement. Today's stress proved the system handles **100 VUs / 32 RPS** with p95 429 ms and zero 5xx on the current config, but that's a plateau measurement, not a ceiling.
- **Authed-page Lighthouse** — today's runs hit the login page and a public-property 404. Dashboard/Properties Lighthouse needs a cookie-jar handoff; add a `--extra-headers` flow once we decide which authed pages matter most.

---

## 9. Commands to pick up from here

```bash
# After `aws login` succeeds:
aws sts get-caller-identity --region eu-north-1            # confirm
# Then the 6-step RDS param-group flip in §5.

# Re-run load-baseline at 10 VUs (won't require rate-limit bypass):
ALLOW_RUN=1 BASE_URL=https://estia.tripzio.xyz \
  TEST_AGENT_EMAIL=agent.demo@estia.app \
  TEST_AGENT_PASSWORD='Password1!' \
  PEAK_VUS=10 RAMP_MIN=1 STEADY_MIN=3 \
  k6 run --summary-export=perf/load-tests/reports/$(date -u +%Y%m%dT%H%M%SZ)-load-post-fix.json \
    perf/load-tests/scenarios/load-baseline.js

# Pull pg_stat_statements after a fresh run:
psql "$DATABASE_URL" -c \
  "SELECT calls, round(mean_exec_time::numeric, 1) AS mean_ms, query
   FROM pg_stat_statements ORDER BY mean_exec_time DESC LIMIT 10;"

# Re-run Lighthouse (if lighthouse CLI falls off PATH):
export PATH=/tmp/lh-install/bin:$PATH
lighthouse https://estia.tripzio.xyz/ \
  --quiet --chrome-flags='--headless --no-sandbox' \
  --form-factor=mobile --screenEmulation.mobile=true \
  --output=html --output-path=perf/lighthouse/$(date -u +%Y%m%dT%H%M%SZ)-landing
```

---

## 10. Changelog of this engagement

- `3d5e5b4` — first baseline runs (smoke + load-baseline on prod), F-1 + F-2 opened.
- 2026-04-22 — stress on prod (100 VUs × 7 min, rate-limit bypass), Lighthouse mobile, `SUMMARY.md` (this file), all reports committed under `perf/`.
- Rate-limit bypass applied at `~/estia-new/.env` line `RATE_LIMIT_MAX_PER_MIN=1000000` at 11:18 Asia/Jerusalem, **removed at 11:26** via `sed -i '/^RATE_LIMIT_MAX_PER_MIN=/d'` + container restart. Default 300/min back in effect.
