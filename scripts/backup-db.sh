#!/usr/bin/env bash
# Nightly Postgres dump → S3.  Runs from /etc/cron.d/estia-db-backup as ec2-user.

set -euo pipefail

DATE=$(date -u +%Y-%m-%d)
TMP=$(mktemp /tmp/estia-db-XXXX.sql.gz)
BUCKET="${S3_BUCKET:-estia-prod}"
REGION="${S3_REGION:-eu-north-1}"

cd /home/ec2-user/estia-new

# Use compose exec (via sudo because docker socket).  -T = no TTY for cron.
sudo docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_dump -U estia -d estia | gzip > "$TMP"

aws s3 cp "$TMP" "s3://$BUCKET/db-backups/$DATE.sql.gz" --region "$REGION"
rm -f "$TMP"

echo "[$(date -Iseconds)] db backup uploaded to s3://$BUCKET/db-backups/$DATE.sql.gz"
