# Estia — Monthly Cost Estimate

Region: **eu-north-1 (Stockholm)** — cheapest EU region.
Pricing as of 2026-Q2; verify against [AWS calculator](https://calculator.aws) before committing changes.

| Line item | Spec | $/month |
|---|---|---:|
| EC2 t4g.small | 2 vCPU Graviton, 2 GB RAM, on-demand | $13.10 |
| EBS gp3 root | 30 GB, 3 000 IOPS, 125 MB/s | $2.40 |
| EBS snapshot | weekly 30 GB AMI backup, ~$0.05/GB | $0.40 |
| S3 standard storage | ~5 GB uploads + 2 GB rotating backups | $0.16 |
| S3 PUT/GET requests | ~10 K/month | $0.05 |
| Data transfer out | ~10 GB/month | $0.90 |
| Route 53 hosted zone | tripzio.xyz (already exists) | $0.50 |
| AWS Certificate Manager | unused (Let's Encrypt) | $0 |
| Elastic IP | attached → free | $0 |
| CloudWatch logs | 1 GB/month free tier | $0 |
| **Total (steady state)** | | **~$17.51** |

**Classification: 🟢 Green** (well under $50 target).

## Headroom

When agent count grows past ~20:
- Bump EC2 to **t4g.medium** (~$25/mo) → comfortable for ~50 concurrent agents.
- Add **CloudFront** in front of `/uploads/` and the SPA (~$1–5/mo) once bandwidth >50 GB/month.
- Consider **RDS db.t4g.micro** (~$13/mo) when DB size > 20 GB or when DBA work eats more than 30 minutes/month.
- Even with all three upgrades: ~$45/mo → still Green.

## Cost guardrails

1. **Budget alert** at $40/month — `scripts/aws-budget.sh`.
2. **S3 lifecycle**: delete `db-backups/*` after 14 days (terraform).
3. **EBS snapshots**: weekly cron, retain 4 (manual prune in `scripts/snapshot.sh`).
4. **No NAT gateway, no ALB, no multi-AZ** — these are the silent budget killers.

## What's NOT in the budget

- **Apple Developer Program** ($99/year) — for iOS app distribution, paid externally.
- **Domain** (tripzio.xyz) — paid via the registrar, ~$10/year.
- **GitHub** — public/private repo on free tier.
