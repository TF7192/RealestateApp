# Estia — AWS Deployment Plan

> Budget-aware, single-VM deployment. Live at `https://estia.tripzio.xyz`.
> Target: ≤ $50/month steady-state. Actual: ~$17/month (Green).

## Stack
- **Frontend**: React + Vite, served by nginx in Docker.
- **Backend**: Fastify + Prisma + PostgreSQL.
- **Mobile**: Capacitor iOS app loading the same web bundle from `https://estia.tripzio.xyz`.
- **Storage**: User uploads (property photos / videos) + nightly DB backups → **S3**.
- **No Redis**: declared in the original compose but **zero references in source code**. Dropped from prod.

## Architecture (Option A — single host)
```
                            ┌─────────────────────────────────────┐
                            │   EC2  t4g.small (eu-north-1)       │
   estia.tripzio.xyz  ───►  │   nginx (TLS, Let's Encrypt)        │
                            │     │                               │
                            │     ├─ frontend  (nginx serving Vite dist)
                            │     └─ backend   (Fastify, port 4000)
                            │           │                         │
                            │           ▼                         │
                            │      postgres 16  (volume)          │
                            └────────────┬────────────────────────┘
                                         │ aws s3 cp / pg_dump
                                         ▼
                                ┌────────────────────┐
                                │  S3: estia-prod    │
                                │   /uploads/        │  ← property photos
                                │   /db-backups/     │  ← daily pg_dump.gz
                                └────────────────────┘
```

## Why this and not the alternatives

| Option | Monthly | Why not |
|---|---|---|
| **A — single t4g.small EC2 + S3 + nginx (chosen)** | ~$17 | wins on every axis for an early-stage CRM with one agent's worth of traffic |
| B — EC2 + RDS single-AZ + S3 | ~$45 | RDS managed value not yet justified; pg_dump → S3 covers backup discipline |
| C — ECS Fargate + RDS + ALB + CloudFront | ~$130+ | massive overkill for current load; ALB alone is $16/mo |

NAT Gateway, ALB, multi-AZ, EKS, CloudFront, WAF, managed Redis — **none used**. Each would push us past the budget.

## Networking & TLS
- EC2 in default VPC, public subnet, Elastic IP.
- Security group: `22/tcp` from operator IP only · `80, 443/tcp` from `0.0.0.0/0`.
- nginx terminates TLS via Let's Encrypt (Certbot, auto-renew via cron).
- PostgreSQL bound to `127.0.0.1` only — never publicly reachable.

## Reproducibility
- `infra/terraform/` — IaC for the net-new pieces (S3, IAM role, GitHub OIDC role, EC2 import).
- `scripts/bootstrap-server.sh` — one-shot server setup (Docker, nginx, certbot, swap).
- `scripts/deploy.sh` — pull → build → migrate → restart.
- `.github/workflows/deploy.yml` — fires when a tag matching `v*` is pushed to `main`.
- `docker-compose.prod.yml` — production compose (no Redis, S3-aware backend env).

## DR & backup
- **DB**: nightly `pg_dump | gzip | aws s3 cp` to `s3://estia-prod/db-backups/`. 14-day rotation via S3 lifecycle.
- **Uploads**: backend writes to S3 directly (env: `UPLOADS_BACKEND=s3`). On rollback or instance replacement, photos persist.
- **Container restart**: `restart: unless-stopped` on each service. Docker daemon enabled via `systemctl`.
- **Rollback**: `git checkout <prev-tag> && ./scripts/deploy.sh` — under 90 seconds for the frontend container.

## Health & observability
- `GET /api/health` — Fastify endpoint, returns `{ ok: true }`.
- nginx access + error logs at `/var/log/nginx/`.
- App logs via `docker compose logs <service>` (rotated by Docker's default `json-file` driver, capped at 50 MB total).
- AWS Budget alert configured at $40/month (manual setup; instructions in `DEPLOYMENT_RUNBOOK.md`).
