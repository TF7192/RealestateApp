# Estia — Deployment Runbook

Operator's manual for the deployed system. Live at `https://estia.tripzio.xyz`.

---

## Server access

```bash
ssh -i ~/Downloads/tripzio.pem ec2-user@ec2-13-49-145-46.eu-north-1.compute.amazonaws.com
```

Code lives at `/home/ec2-user/estia-new/`.

---

## Day-to-day deploys

### Push a new release (CI/CD)

```bash
git tag v$(date +%Y.%m.%d-%H%M)
git push origin --tags
```

GitHub Actions (`.github/workflows/deploy.yml`) takes over: SSH → pull → docker compose build → migrate → up.

### Manual deploy from your laptop

```bash
./scripts/deploy.sh
```

This rsyncs the working tree to EC2 and runs `docker compose build && up -d` + `prisma migrate deploy`.

### Restart a single container

```bash
ssh -i ~/Downloads/tripzio.pem ec2-user@... \
  'cd /home/ec2-user/estia-new && sudo docker compose restart frontend'
```

### Rollback

```bash
git checkout <previous-tag>
./scripts/deploy.sh
```

Frontend rolls back in ~60s. Schema rollbacks: `npx prisma migrate resolve --rolled-back <name>` then redeploy with the previous schema. (Prisma migrations are forward-only — don't delete migration folders, generate down-migrations explicitly if needed.)

---

## First-time server bootstrap (only when you replace the EC2)

```bash
# 1. Create the box (Terraform — see infra/terraform/)
cd infra/terraform
terraform init
terraform apply

# 2. SSH in and run bootstrap
scp -i ~/Downloads/tripzio.pem scripts/bootstrap-server.sh ec2-user@<new-ip>:
ssh -i ~/Downloads/tripzio.pem ec2-user@<new-ip> 'sudo bash bootstrap-server.sh'

# 3. Push code + run prisma migrate deploy
./scripts/deploy.sh
```

`bootstrap-server.sh` installs Docker + nginx + certbot, configures swap, sets up the systemd unit that auto-starts compose at boot.

---

## Database backups

A nightly cron on the EC2 runs:

```bash
docker compose exec -T postgres pg_dump -U estia estia | gzip \
  | aws s3 cp - s3://estia-prod/db-backups/$(date +%Y-%m-%d).sql.gz
```

S3 lifecycle deletes anything older than 14 days. To restore:

```bash
aws s3 cp s3://estia-prod/db-backups/2026-04-15.sql.gz - \
  | gunzip \
  | docker compose exec -T postgres psql -U estia estia
```

---

## Uploads (property photos / videos)

Backend writes to S3 when `UPLOADS_BACKEND=s3` is set in `.env` (production default). Bucket: `s3://estia-prod/uploads/`. Files served via the backend at `/uploads/<key>` which 302-redirects to a presigned S3 URL (or you can flip nginx to proxy directly).

In dev (`UPLOADS_BACKEND=local`) files land at `/app/uploads/`.

---

## Domain + TLS

- Domain `tripzio.xyz` registered externally; `estia` subdomain points to the EC2 Elastic IP.
- nginx terminates TLS via Let's Encrypt (Certbot). Auto-renewal: `systemctl status certbot-renew.timer`.
- Force renewal: `sudo certbot renew --force-renewal`.

---

## Secrets

Production secrets live in `/home/ec2-user/estia-new/.env` on the server (chmod 600, owned by `ec2-user`). They are **NOT** in git. Required:

```
POSTGRES_PASSWORD=...
JWT_SECRET=...
PUBLIC_ORIGIN=https://estia.tripzio.xyz
UPLOADS_BACKEND=s3
S3_BUCKET=estia-prod
S3_REGION=eu-north-1
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
```

The EC2 instance also has an **IAM role** attached (`estia-prod-app`) with scoped S3 PUT/GET to `estia-prod/*` — using the role is preferred over baking access keys into `.env`. The Terraform sets this up.

To rotate JWT secret: write the new one in `.env`, `docker compose restart backend`. All existing sessions invalidated.

---

## CI/CD (GitHub Actions)

Workflow `.github/workflows/deploy.yml` triggers on push of any tag matching `v*`.

GitHub repository secrets needed:
- `EC2_HOST` — `ec2-13-49-145-46.eu-north-1.compute.amazonaws.com`
- `EC2_USER` — `ec2-user`
- `EC2_SSH_KEY` — full PEM content of `tripzio.pem`

Configure at: GitHub → Settings → Secrets and variables → Actions.

---

## Monitoring & alerts

- **Health**: `curl https://estia.tripzio.xyz/api/health`
- **Disk**: log into the box and `df -h /` — alert when >85%
- **AWS Budget**: $40/mo email alert configured per account (see `scripts/aws-budget.sh`)
- **Container status**: `sudo docker compose ps` shows all 3 containers

---

## Common operator tasks

| Task | Command |
|---|---|
| View logs | `sudo docker compose logs -f backend` |
| Inspect DB | `sudo docker compose exec postgres psql -U estia estia` |
| Run a migration | `sudo docker compose exec backend npx prisma migrate deploy` |
| Backfill slugs | `sudo docker compose exec backend node dist/scripts/backfill-slugs.js` |
| Free disk | `sudo docker builder prune -af && sudo docker system prune -f` |
| Clear iOS DerivedData (huge) | `rm -rf /home/ec2-user/estia-new/frontend/ios/App/DerivedData` |
| Force frontend rebuild | `sudo docker compose build --no-cache frontend && sudo docker compose up -d frontend` |
