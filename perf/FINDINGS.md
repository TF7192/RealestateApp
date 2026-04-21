# Estia — Performance Findings

> Running log of bottlenecks + the fix that moved the number. One entry per finding, newest first. Each entry links to the load-test report that exposed it and the commit that landed the fix.

---

## F-0 · (placeholder)

Reserved for the first real finding after `BASELINE.md` is populated.

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
