#!/usr/bin/env bash
# Estia — bootstrap a fresh Amazon Linux 2023 / Ubuntu 22.04 EC2 instance for
# running the docker-compose stack.  Idempotent — safe to re-run.
#
# Usage:   sudo bash scripts/bootstrap-server.sh

set -euo pipefail

echo "[1/8] Updating package index"
if command -v dnf >/dev/null 2>&1; then
  dnf -y update
  PKG="dnf"
elif command -v apt-get >/dev/null 2>&1; then
  apt-get update -y
  PKG="apt-get"
else
  echo "Unsupported OS — only dnf or apt-get are supported." >&2
  exit 1
fi

echo "[2/8] Installing Docker, nginx, certbot, AWS CLI v2, cron, git"
if [ "$PKG" = "dnf" ]; then
  dnf -y install docker nginx certbot python3-certbot-nginx git cronie awscli
  systemctl enable --now crond
else
  apt-get install -y docker.io nginx certbot python3-certbot-nginx git cron awscli
  systemctl enable --now cron
fi
systemctl enable --now docker
usermod -aG docker ec2-user || usermod -aG docker ubuntu || true

echo "[3/8] Installing docker-compose v2 plugin"
DOCKER_CONFIG=${DOCKER_CONFIG:-/usr/local/lib/docker}
mkdir -p "$DOCKER_CONFIG/cli-plugins"
if ! docker compose version >/dev/null 2>&1; then
  curl -fSL "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" \
    -o "$DOCKER_CONFIG/cli-plugins/docker-compose"
  chmod +x "$DOCKER_CONFIG/cli-plugins/docker-compose"
fi
docker compose version

echo "[4/8] Configuring 2 GB swap (small VMs OOM-kill without it)"
if ! swapon --show | grep -q '/swapfile'; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile
  mkswap /swapfile && swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo "[5/8] Configuring nginx reverse-proxy template"
cat > /etc/nginx/conf.d/estia.conf <<'NGINX'
# Filled in by certbot --nginx on first TLS provision
server {
    listen 80;
    server_name estia.co.il;
    client_max_body_size 120m;

    location /api/ {
        proxy_pass http://127.0.0.1:6002/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    location /uploads/ {
        proxy_pass http://127.0.0.1:6002/uploads/;
    }
    location / {
        proxy_pass http://127.0.0.1:3001/;
        proxy_set_header Host $host;
    }
}
NGINX
nginx -t && systemctl restart nginx

echo "[6/8] Provisioning Let's Encrypt cert (interactive; needs DNS pointing to this box)"
echo "      → run manually:  sudo certbot --nginx -d estia.co.il --agree-tos -m operator@estia.co.il"
echo "      certbot-renew.timer is enabled by default for auto-renewal."

echo "[7/8] Creating /home/ec2-user/estia-new (target dir for ./scripts/deploy.sh rsync)"
install -d -o ec2-user -g ec2-user /home/ec2-user/estia-new

echo "[8/8] Setting up nightly DB backup cron + S3 lifecycle (run once after .env exists)"
cat > /etc/cron.d/estia-db-backup <<'CRON'
# Estia — nightly Postgres dump → S3 (rotated by S3 lifecycle policy)
30 2 * * * ec2-user cd /home/ec2-user/estia-new && /home/ec2-user/estia-new/scripts/backup-db.sh >> /var/log/estia-backup.log 2>&1
CRON
chmod 644 /etc/cron.d/estia-db-backup

echo "DONE. Next steps:"
echo "  1) scp .env to /home/ec2-user/estia-new/.env (chmod 600)"
echo "  2) cd /home/ec2-user/estia-new && sudo docker compose -f docker-compose.prod.yml up -d"
echo "  3) sudo certbot --nginx -d estia.co.il --agree-tos -m you@example.com"
