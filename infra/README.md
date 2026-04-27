# Infra — production blue-green setup

One-time migration from single-color to blue-green. After this is
done, `scripts/deploy-blue-green.sh` handles every subsequent
deploy with zero downtime.

## What's changing

| Before | After |
|---|---|
| `backend` (single, port 6002) | `backend-blue` (6002) + `backend-green` (6003) |
| `frontend` (single, port 3001) | `frontend-blue` (3001) + `frontend-green` (3002) |
| `market-watcher` (single, no port) | unchanged — single instance, no inbound traffic |
| Host nginx → frontend container's internal /api proxy | Host nginx splits /api/* and /* into two upstreams |
| `docker compose up -d` produces ~5–15s gap | `nginx -s reload` flips atomically; in-flight requests drain naturally |

## One-time install (do this BEFORE the next deploy)

SSH to EC2:
```bash
ssh -i /path/to/tripzio.pem ec2-user@ec2-13-49-145-46.eu-north-1.compute.amazonaws.com
```

Then on the host:
```bash
# 1) Pull the latest infra/nginx/estia.conf from the repo
cd /home/ec2-user/estia-new
git fetch origin main
git pull origin main

# 2) Back up current nginx config (rollback path)
sudo cp /etc/nginx/conf.d/estia.conf /etc/nginx/conf.d/estia.conf.bak.$(date +%Y%m%d)

# 3) Install the new template
sudo cp infra/nginx/estia.conf /etc/nginx/conf.d/estia.conf

# 4) Validate + reload
sudo nginx -t && sudo nginx -s reload

# 5) Boot the IDLE pair (green) on the latest image so the next
#    deploy has somewhere to flip TO. The active pair (blue) keeps
#    running on the current image.
export ESTIA_TAG_BLUE="$(cat .deployed_sha 2>/dev/null || echo main)"
export ESTIA_TAG_GREEN="$ESTIA_TAG_BLUE"
sudo -E docker compose -f docker-compose.prod.yml up -d --no-deps \
  backend-blue backend-green frontend-blue frontend-green market-watcher

# 6) Verify both pairs are healthy
curl -fsS http://127.0.0.1:6002/api/health   # blue backend
curl -fsS http://127.0.0.1:6003/api/health   # green backend
```

## Rollback procedure

If anything looks wrong after a deploy:

```bash
# Re-flip nginx to the previous color manually:
sudo sed -i \
  -e 's|server 127.0.0.1:6003; # backend-active|server 127.0.0.1:6002; # backend-active|' \
  -e 's|server 127.0.0.1:6002; # backend-inactive|server 127.0.0.1:6003; # backend-inactive|' \
  -e 's|server 127.0.0.1:3002; # frontend-active|server 127.0.0.1:3001; # frontend-active|' \
  -e 's|server 127.0.0.1:3001; # frontend-inactive|server 127.0.0.1:3002; # frontend-inactive|' \
  /etc/nginx/conf.d/estia.conf
sudo nginx -t && sudo nginx -s reload
```

The previous color's container is still running (deploy script
keeps it alive for ~5min drain or until manual stop), so the flip
is instant.

## What this fixes

Previously `docker compose up -d` would `stop && start` the active
backend/frontend, producing ~5–15 seconds of 502s for any client
hitting /api during the swap. With blue-green:

- New container boots in parallel on a different port.
- Health-checked before the flip — failed deploys never affect
  serving traffic.
- nginx reload is graceful; in-flight connections finish on the
  old upstream while new connections route to the new.
- Connection-aware drain (5min cap) handles long uploads.

## What still needs work (post-Phase 1)

- **WebSocket disconnect on flip.** AI chat (`/api/ai/chat/ws`) holds
  long-lived connections. After the flip, the WS server (old backend)
  keeps serving the existing socket until the user closes the page or
  loses connection. New WebSocket attempts route to the new backend.
  Auto-reconnect is already wired in `Ai.jsx`.
- **Truly-unbounded uploads.** A 200MB file upload that takes
  > 5min to finish would be cut by the drain cap. Mitigation:
  presigned-URL direct-to-S3 uploads (backend coordinates,
  doesn't proxy the bytes). Separate refactor; not blocking.
- **Multi-host scaling.** Single-EC2 today. When we scale out, the
  upstream blocks point at multiple hosts and the script
  generalizes naturally.
