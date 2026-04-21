# Estia — Performance Findings

> Running log of bottlenecks + the fix that moved the number. One entry per finding, newest first. Each entry links to the load-test report that exposed it and the commit that landed the fix.

---

## F-1 · `/api/properties` p95 is 3-5× the other list endpoints — N+1 or selecting too much

**Observed 2026-04-21 21:58 Asia/Jerusalem**, smoke run on prod.

- `/api/properties` p95 = **512 ms** (budget 400 ms, warning 500 ms).
- `/api/leads` p95 = 143 ms — identical list-endpoint shape architecturally.
- `/api/me` p95 = 180 ms.
- `/api/reports/dashboard` p95 = 169 ms.

The single-user smoke doesn't hit DB contention, so the extra ~370 ms is a single-request cost — structurally how we build the property list. Two plausible causes, not yet confirmed:

1. **Server-side fan-out**: property list returns images / owner / tags / marketing-action / matched-leads per card. If Prisma isn't doing a single-query `include` per sub-resource (N+1), that's 5–7 additional round-trips × 50-ish properties per agent.
2. **Response size**: the full smoke iteration pulls ~330 KB, most of it `/api/properties` (every image URL + every owner contact). Client-side we render maybe 20 cards at a time — we're over-sending.

**Next profiling steps:**
- Enable `pg_stat_statements` (pending `aws login`) and look at the top-5 slowest queries during the next baseline run. If `property` + aggregates dominate, it's N+1.
- Check the route's Prisma query shape in `backend/src/routes/properties.ts` — look for chained `await`s inside `.map()` over the properties list.
- Run a repeat smoke at 5 VUs for 5 min and watch if `/api/properties` p95 scales linearly with VUs (→ DB/CPU-bound) or sub-linearly (→ per-request fixed cost).

**Impact if fixed:** biggest expected single win. `/api/properties` is on the critical path of every agent's page-one render.

---

## F-2 · 6 % HTTP 4xx rate at 10 VUs — suspected rate-limiter + possibly-unroute'd sprint-1 endpoints

**Observed 2026-04-21 22:06 Asia/Jerusalem**, load-baseline on prod (10 VUs × 5 min steady, 1,216 requests).

- `http_req_failed: 6.08 %` (74 / 1216). Zero 5xx — every request reached the server and got a structured response. `checks_succeeded: 100 %` means every one was a 2xx/3xx/401 (the check's allowance band).
- **The k6 metric "failed" counts 4xx too** — so 401 / 429 / 404 all bump this without being server errors.

### Most likely causes (in order)

1. **IP-level rate-limit (429).** The Fastify global limiter is 300 req/min per IP; my load-gen ran from a single laptop IP. 10 VUs × multiple endpoints/iteration with 2–3 s think-time averaged ~3.3 RPS overall, so I *shouldn't* have tripped it — but burst windows during ramp-up could. The `checks.js` helper increments `rate_limit_429` — next run should print that counter in the summary and confirm.
2. **Session-cookie replay glitch under k6's built-in `CookieJar`.** The setup call returned the raw `Set-Cookie` header to every VU and `jarFor()` restores it per-iteration; if the cookie secret-derived signature doesn't survive the hop (`@fastify/cookie` uses signed cookies), some `/api/me` etc. calls could 401-retry.
3. **Sprint-1 routes 404 on the deployed SHA.** The `load-baseline` scenario hits `/api/owners`, `/api/tags`, `/api/reminders`. If the prod image at `f797ccb` predates the `registerTagRoutes` / `registerReminderRoutes` additions — or those Prisma migrations haven't been run — they return 404.

### Next steps

- Add a `status_distribution` output to the k6 scenario so the report shows how many 401/404/429 per endpoint. Cheapest diagnostic; 10 lines in `checks.js`.
- Verify the deployed SHA against `main` HEAD — `ssh ec2 'cat /home/ec2-user/estia-new/.deployed_sha'` vs `git rev-parse --short origin/main`.
- Confirm prisma migrations current on prod RDS via `docker compose exec backend npx prisma migrate status`.
- Re-run the baseline after the above; if 4xx drops to < 1 % we've isolated the cause.

**Impact:** cosmetic at the measurement level — doesn't suggest an availability issue — but a real fix is needed before we trust any "error-rate" number out of the load runs.

---

## F-1 · `/api/properties` p95 is 3-5× the other list endpoints — N+1 or selecting too much

**Confirmed 2026-04-21 22:06** via the load-baseline run: `/api/properties` p95 was 513 ms at 10 VUs, identical to the 512 ms smoke-run value at 1 VU. **The cost is per-request fixed**, not concurrency-driven — scaling VUs won't reveal a new bottleneck; the single request already pays 500 ms+ somewhere.

Compare peers on the same run:
- `/api/leads` (same list-endpoint shape): 179 ms — 2.9× faster
- `/api/me` (single row): 167 ms — 3.1× faster
- `/api/reports/dashboard` (aggregation): 172 ms — 3.0× faster
- `/api/search`: 43 ms — fastest of all

Plausible causes:
1. **Server-side fan-out.** Property cards display images + owner + tags + marketing-action + matched-leads. Without a tight `include` block in Prisma, one parent query turns into 5–7 child queries × 50-ish properties per agent.
2. **Response size.** Full iteration pulled ~330 KB of data received; most of it is the `/api/properties` response (every image URL + every owner contact for the agent's full catalog). We over-fetch and let the client filter.

**Next profiling steps:**
- Enable `pg_stat_statements` (gated on `aws login`) and re-run the baseline. If `property` + aggregates dominate the top-5, it's N+1.
- Read `backend/src/routes/properties.ts` for chained `await`s inside `.map()` over the list.
- Compare query shape: `prisma.property.findMany({ include: { images: true, owner: true, tags: true, marketingActions: true } })` would collapse 5 queries into 1 JOIN.

**Impact if fixed:** largest single win available. `/api/properties` is on the critical path of every agent's dashboard + properties page render.

---

## F-0 · (next slot)

Reserved for the next finding.

---

## Pre-baseline suspicions (tracking — unverified)

These are educated guesses from reading the repo. They are **not** findings until a profile or load test confirms them. Listed so they're on the radar, not to justify pre-optimization.

### S-1 · RDS `db.t4g.micro` is the primary ceiling

- **Evidence:** 1 vCPU, 1 GB RAM, single-AZ. 36 Prisma models, many nested selects (`property + images + owner + leads + transfers + prospects + marketingActions`). No connection pooler. No Redis in front of read-heavy endpoints.
- **Expected symptom under load:** DB CPU pegged at 100 % while app container CPU is ~40 %.
- **Fix order:** (1) enable `pg_stat_statements`, (2) surface the top-5 slowest queries, (3) add missing indexes, (4) cache the three hottest reads in Redis with 60 s TTL, (5) only then consider vertical-scaling the RDS.

### S-2 · No Redis — every authed page hits the DB

- **Evidence:** `backend/src/server.ts` registers no Redis client; `ioredis` is in `package.json` but searched references come up empty.
- **Expected symptom under load:** `/api/me` p95 scales linearly with DB CPU.
- **Fix order:** (1) add a `lib/cache.ts` with ioredis + a dev-mode in-memory fallback, (2) cache the `me` response with a 60 s TTL keyed on user id, (3) wire a small Redis instance into `docker-compose.prod.yml` (a 128 MB container on the same EC2 is enough to start).

### S-3 · argon2 login is expensive by design

- **Evidence:** `argon2` module in `backend/package.json`; CPU-hard by construction.
- **Expected symptom under load:** login traffic saturates one vCPU faster than any other endpoint.
- **Mitigation:** the 10/15m per-IP rate-limit already bounds this; the real fix is keeping JWT sessions long enough that agents don't re-login often (today's cookie-expiry unknown — audit and extend if < 24 h for refresh path).

### S-4 · N+1 on property/lead lists

- **Evidence:** property list renders per-card `matchedLeads`, `marketingProgress`, `ownerPhone`, `imageList[0]`. Without checked includes the ORM fans out one query per card.
- **Expected symptom:** list-endpoint p95 scales linearly with number of items returned, not with the count.
- **Fix order:** run `pg_stat_statements` against a paginated list hit first; compare row-count of queries to `LIMIT` to confirm.

### S-5 · No bundle budget enforcement

- **Evidence:** `frontend/package.json` has no `rollup-plugin-visualizer`; `fast.yml` has no bundle-size step. Ten lazy routes is good; 10 eager routes (Dashboard, Properties, ...) may still be heavy.
- **Fix order:** wire the visualizer + set per-route budgets in `BUDGETS.md`, CI-enforce per PR.

### S-6 · No CDN — Hebrew users outside eu-north-1 pay TLS RTT

- **Evidence:** nginx on EC2 is the only edge. Static assets served with `Cache-Control: public, immutable` but only from Stockholm.
- **Expected symptom:** LCP for Asia/US users 2–3× what Stockholm users see.
- **Mitigation if traffic outside EU grows:** CloudFront in front of the static `/assets/*` path is a half-day of work + ~$1/mo.

---

## Fix log (post-fix entries go here)

_empty_
