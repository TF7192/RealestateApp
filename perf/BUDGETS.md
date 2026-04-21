# Estia — Performance Budgets

> The numbers the team agrees to hold the line on. Draft calibrated against the `CLAUDE.md` defaults — **will be re-calibrated after the first baseline run** when we know what's realistic.

---

## Frontend

| Metric | Budget | Measurement |
|---|---|---|
| Largest Contentful Paint (LCP) | **< 2.5 s** | Lighthouse on Dashboard, Properties, Property Detail — throttled Fast 3G + 4× CPU slowdown |
| Interaction to Next Paint (INP) | **< 200 ms** | RUM — PostHog web-vitals plugin |
| Cumulative Layout Shift (CLS) | **< 0.1** | Lighthouse + RUM |
| Initial JS bundle per critical route (gzipped) | **< 300 KB** | `rollup-plugin-visualizer` output; CI reports delta per PR |
| Lighthouse Performance score (Dashboard, Properties, Property Detail, Customer view) | **> 85** | Lighthouse CI in the nightly workflow |

---

## Backend — per-endpoint p95

| Endpoint class | p95 | p99 | Notes |
|---|---|---|---|
| Auth (`/api/auth/*`) | **< 400 ms** | **< 800 ms** | argon2 is the cost floor; don't over-optimize |
| Simple reads (`/api/me`, `/api/*/:id`) | **< 150 ms** | **< 300 ms** | Expect Redis-cached after first fix |
| List endpoints (`/api/properties`, `/api/leads`, `/api/owners`) | **< 400 ms** | **< 800 ms** | Requires correct indexes + no N+1 |
| Search (`/api/search/*`) | **< 800 ms** | **< 1.5 s** | Allowed extra headroom; dedicated search infra if we hit this |
| Writes (`POST`/`PATCH`/`DELETE`) | **< 500 ms** | **< 1 s** | |
| Aggregations (`/api/reports/*`, admin dashboards) | **< 1.5 s** | **< 3 s** | Cache heavily; stale-while-revalidate is acceptable |
| Public OG routes (`/api/public/og/*`) | **< 400 ms** | **< 800 ms** | Bot traffic; should be static-cacheable |

---

## Backend — system-wide

| Metric | Budget |
|---|---|
| Error rate at expected peak load | **< 0.1 %** |
| `/api/health` availability | **≥ 99.9 %** / 30-day rolling |
| DB query p95 (via `pg_stat_statements`) | **< 100 ms** — any query over is tagged for optimization |
| DB active connections at peak | **< 50** (breathing room before PgBouncer is needed) |

---

## Capacity — system-level

| Dimension | Target (6–12 month) | Stretch | Breakpoint |
|---|---|---|---|
| Concurrent active users | **500 CCU** | 1,000 CCU | _measured_ |
| RPS sustained | **50 RPS** | 150 RPS | _measured_ |
| Peak logins per minute | **60** | 200 | |
| Autoscale recovery after 5× spike | **< 60 s** | < 30 s | |
| Soak-test p95 drift over 2 hours | **< 5 %** | < 2 % | |

---

## Frontend bundle guards (enforced in CI after first measurement)

Per-route initial JS (gzipped):

- `/` (Dashboard) — budget **180 KB** (on critical path; loads for every authed user).
- `/properties` — budget **200 KB**.
- `/properties/:id` — budget **220 KB** (heavier: photo manager, marketing panel, map).
- `/customers` — budget **200 KB**.
- Lazy routes (Templates, AdminChats, AdminUsers, SellerCalculator, Yad2Import, Reports, ActivityLog, Reminders, Office, TagSettings) — **no individual budget** (already off-critical-path via code-split).

Any PR that bumps a budget by >10 % fails CI.

---

## Load-test pass/fail rules (per scenario)

- **smoke:** zero errors, p95 under budget for every critical endpoint class.
- **load-baseline:** error rate < 0.1 %, p95/p99 under budget for the full duration.
- **stress:** exploratory — no pass/fail; produces a ceiling number.
- **spike:** recovers to baseline p95 within 60 s of spike end; no cascading failures.
- **soak:** flat resource curves + < 5 % p95 drift over 2 h.
- **breakpoint:** reports a single RPS / CCU ceiling; passes if ceiling ≥ stretch target.

**Regressions against these budgets are bugs**, tracked the same way as failing tests. The first run may establish that several are currently unmet — that's expected; the budget stays, and we open issues for the gaps.
