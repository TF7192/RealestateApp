# Perf — where do load tests run?

Gating question before any `perf/load-tests/scenarios/*.js` script actually fires. Four options; each has a clear trade-off.

## Option 1 — Staging-lite on the same EC2 (recommended default)

**What it is.** Second compose stack on the production EC2, bound to new ports (`127.0.0.1:6003` backend, `127.0.0.1:3002` frontend). nginx serves it under `staging.estia.tripzio.xyz` with its own TLS cert. Uses the same RDS instance but a separate Prisma schema (`estia_staging`) so data is isolated. `RATE_LIMIT_MAX_PER_MIN` set to a high value on the staging container only.

- **Cost delta:** $0/month (shares EC2 + RDS).
- **Isolation:** ports are isolated; DB is schema-isolated, but both schemas run on the same 1 vCPU / 1 GB RAM RDS instance. A heavy staging stress-test **will** impact prod DB performance.
- **Setup cost:** ~2 hours — another compose file, nginx vhost + cert, a seed step, and a `deploy-staging.yml` workflow.
- **Good for:** smoke, load-baseline, spike. Bad for stress (DB contention with prod), soak (will affect prod over hours), breakpoint (ditto).

## Option 2 — Dedicated staging EC2 + RDS

**What it is.** Second t3.small + db.t4g.micro in eu-north-1, separate security groups, no contact with prod.

- **Cost delta:** ~$28/month extra ($13 EC2 + $15 RDS).
- **Isolation:** complete.
- **Setup cost:** ~half a day — terraform for the new instance + DB, a new GHCR-auth bootstrap, `deploy-staging.yml` pointed at the new host.
- **Good for:** everything including stress + soak + breakpoint. This is the "right" answer if perf work continues past this engagement.

## Option 3 — Local against `docker-compose.test.yml`

**What it is.** k6 running from your MacBook against `localhost` with the repo's existing disposable Postgres.

- **Cost delta:** $0.
- **Isolation:** total.
- **Setup cost:** ~30 min — point k6 at `http://localhost:4100` and reuse the seeded test agent.
- **Good for:** developer-iteration loops, validating code-level improvements ("does this query rewrite shave p95?"). **Bad for** any capacity claim — you're measuring your laptop, not the t3.small.

## Option 4 — Production at off-hours

**What it is.** Flip `RATE_LIMIT_MAX_PER_MIN=100000` on the prod container, run k6 against `estia.tripzio.xyz` at ~02:00 Asia/Jerusalem with the demo agent, clean up after.

- **Cost delta:** $0, but real-user risk is non-zero and the rate-limit protection is temporarily off.
- **Isolation:** none — you're testing the real system with real data volumes.
- **Setup cost:** ~30 min.
- **Good for:** the *one* moment when you want a production capacity measurement and accept the risk. **Bad for** routine perf work; every failure mode shows up in prod logs.

## Recommendation

- **Default to (1) Staging-lite on the same EC2** for the initial baseline + load + spike scenarios. Cheap, fast to stand up, and "real enough" for the traffic model we expect.
- **Use (3) locally** for dev-iteration — "did this fix the N+1?" answers are faster locally than round-tripping a staging deploy.
- **Hold (2) as the upgrade path** if perf work keeps going — flip when the staging-lite DB contention gets noticeable in prod monitoring.
- **Reserve (4) for the final capacity number** — one careful off-hours run, reported once, never as a routine scenario.

## What I need from you

One word per question:

1. **Staging-lite, dedicated staging, local-only, or prod-at-off-hours for the initial baseline run?** (Staging-lite is my default; I'll build that if you don't pick.)
2. **OK to enable `pg_stat_statements` on the prod RDS now?** (It's a parameter-group change, reversible, zero app-side code, gives us the top-N slowest queries before we even run k6.)
3. **Headline target for the engagement's capacity number** — 500 CCU? 1,000? Something else?

Once I have those three answers I'll build the first scenarios and produce `BASELINE.md`.
