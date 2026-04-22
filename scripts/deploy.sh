#!/usr/bin/env bash
# Estia — push local code to the EC2 host and (re)build/restart compose.
#
# Idempotent. Skips the heavy iOS DerivedData and node_modules dirs so the
# 8 GB EC2 disk doesn't fill up.  Designed to be runnable from a laptop.

set -euo pipefail

HOST="${ESTIA_HOST:-ec2-13-49-145-46.eu-north-1.compute.amazonaws.com}"
USER="${ESTIA_USER:-ec2-user}"
KEY="${ESTIA_KEY:-$HOME/Downloads/tripzio.pem}"
REMOTE_DIR="/home/ec2-user/estia-new"

if [ ! -f "$KEY" ]; then
  echo "❌ SSH key not found at $KEY — set ESTIA_KEY=/path/to/tripzio.pem" >&2
  exit 1
fi

echo "==> rsync source to $HOST"
rsync -avz --delete \
  -e "ssh -i $KEY -o StrictHostKeyChecking=no" \
  --include='/backend/' --include='/backend/src/***' --include='/backend/prisma/***' \
  --include='/backend/package.json' --include='/backend/package-lock.json' \
  --include='/backend/Dockerfile' --include='/backend/tsconfig.json' \
  --include='/frontend/' --include='/frontend/src/***' --include='/frontend/public/***' \
  --include='/frontend/package.json' --include='/frontend/package-lock.json' \
  --include='/frontend/Dockerfile' --include='/frontend/nginx.conf' \
  --include='/frontend/index.html' --include='/frontend/vite.config.js' \
  --include='/frontend/eslint.config.js' --include='/frontend/capacitor.config.json' \
  --include='/docker-compose.prod.yml' --include='/scripts/***' \
  --exclude='*' \
  "$(dirname "$(dirname "$(realpath "$0")")")/" \
  "$USER@$HOST:$REMOTE_DIR/"

echo "==> build + restart on $HOST"
ssh -i "$KEY" -o StrictHostKeyChecking=no "$USER@$HOST" '
  set -e
  cd /home/ec2-user/estia-new
  sudo docker compose -f docker-compose.prod.yml build --pull
  sudo docker compose -f docker-compose.prod.yml up -d
  echo "==> running prisma migrate deploy"
  sudo docker compose -f docker-compose.prod.yml exec -T backend npx prisma migrate deploy
  sudo docker builder prune -af >/dev/null 2>&1 || true
  df -h / | tail -1
'

echo "==> healthcheck"
curl -sf https://estia.co.il/api/health && echo "  ✓ API healthy"
echo "==> frontend bundle:"
curl -s https://estia.co.il/ | grep -oE 'assets/index-[^"]+\.(js|css)' | head -2
