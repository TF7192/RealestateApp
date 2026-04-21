# Estia — Performance Baseline

> The "as-is" headline numbers. **Empty until the first real run.** Gated on `perf/WHERE_TO_RUN.md` — no scenario fires before we agree where.

Re-written after every baseline run. Keep this file brief (one screen). Detailed per-run reports live under `perf/load-tests/reports/`.

---

## Headline (last measured: _pending_)

| Metric | Value | Budget (`BUDGETS.md`) | Status |
|---|---|---|---|
| Concurrent active users sustained | — | — | — |
| RPS sustained (mixed workload) | — | — | — |
| p50 / p95 / p99 (overall) | — | — | — |
| Error rate at peak load | — | — | — |
| DB CPU at peak | — | — | — |
| API CPU at peak | — | — | — |
| Capacity ceiling (breakpoint) | — | — | — |

---

## Per-endpoint p95 (last measured: _pending_)

| Endpoint class | p50 | p95 | p99 | RPS | Notes |
|---|---|---|---|---|---|
| `GET /api/me` | — | — | — | — | |
| `GET /api/properties` | — | — | — | — | |
| `GET /api/properties/:id` | — | — | — | — | |
| `GET /api/leads` | — | — | — | — | |
| `GET /api/leads/:id` | — | — | — | — | |
| `GET /api/reports/dashboard` | — | — | — | — | |
| `POST /api/auth/login` | — | — | — | — | |
| `GET /api/public/og/property/:a/:s` | — | — | — | — | |

---

## Frontend (last measured: _pending_)

| Metric | Value | Budget | Status |
|---|---|---|---|
| Largest Contentful Paint | — | < 2.5 s | — |
| Interaction to Next Paint | — | < 200 ms | — |
| Cumulative Layout Shift | — | < 0.1 | — |
| Time to First Byte | — | < 600 ms | — |
| Initial JS bundle (gzipped) | — | < 300 KB | — |
| Lighthouse Performance score | — | > 85 | — |

Measurement profile: **Fast 3G throttling + 4× CPU slowdown**, Chrome 120+ headless.

---

## Infra utilization at measured peak (last: _pending_)

| Resource | Peak | Avg | Budget | Status |
|---|---|---|---|---|
| EC2 CPU (`t3.small`, 2 vCPU burst) | — | — | — | — |
| EC2 RAM | — | — | — | — |
| RDS CPU (`db.t4g.micro`, 1 vCPU) | — | — | — | — |
| RDS active connections | — | — | < 50 | — |
| RDS storage | — | — | — | — |
| Disk I/O (`gp3`) | — | — | — | — |

---

## Previous runs

Each entry is one line — delta from the prior run, link to the report under `perf/load-tests/reports/`.

- _pending_

---

## The three headline answers (for `CLAUDE.md` stakeholder questions)

- **How many users can we handle right now?** _pending — no measurement yet._
- **What happens if we suddenly get 10× traffic?** _pending — needs a spike test._
- **What's the ceiling?** _pending — needs a breakpoint test._
