#!/usr/bin/env bash
# Blue-green deploy script for Estia production.
#
# Runs on EC2 via the deploy-prod.yml workflow. Determines the IDLE
# color from the host nginx upstream config, pulls + boots the IDLE
# pair on the new image, waits for /api/health, atomically flips
# nginx upstreams via sed+reload, then waits for the OLD pair's
# active connections to drain to zero before stopping it.
#
# In-flight requests during the flip:
#   • nginx graceful reload keeps existing connections alive on the
#     OLD upstream until they finish.
#   • New requests route to the NEW upstream as soon as the reload
#     completes.
#   • OLD container stays alive for up to 5 minutes (or until ss
#     reports zero active connections to its port, whichever first)
#     so a long upload survives.
#
# Failure mode: if /api/health doesn't pass on the IDLE backend
# within 60s, the script aborts BEFORE the flip — old keeps
# serving, no user-visible outage.
#
# Usage (run as root or via sudo):
#   ESTIA_TAG=<sha> bash scripts/deploy-blue-green.sh

set -eu -o pipefail

cd /home/ec2-user/estia-new

ESTIA_TAG="${ESTIA_TAG:?ESTIA_TAG must be set to the commit short-SHA}"
NGINX_CONF=/etc/nginx/conf.d/estia.conf
COMPOSE="sudo -E docker compose -f docker-compose.prod.yml"
DRAIN_MAX_SEC=300
DRAIN_POLL_SEC=2

log() { printf "\033[1;36m[deploy-bg]\033[0m %s\n" "$*"; }

# 1) Determine active color from the host nginx upstream config.
#    Looking for: `server 127.0.0.1:6002;  # backend-active`
ACTIVE_API_PORT=$(sudo grep -oE 'server 127\.0\.0\.1:[0-9]+; *# *backend-active' "$NGINX_CONF" \
                  | grep -oE '[0-9]+' | head -1 || true)
ACTIVE_WEB_PORT=$(sudo grep -oE 'server 127\.0\.0\.1:[0-9]+; *# *frontend-active' "$NGINX_CONF" \
                  | grep -oE '[0-9]+' | head -1 || true)

# Bootstrap: on the very first blue-green deploy the host nginx
# config doesn't yet have the marker comments. Default to blue
# being inactive, green to be the new active.
if [ -z "${ACTIVE_API_PORT}" ] || [ -z "${ACTIVE_WEB_PORT}" ]; then
  log "no active markers found in $NGINX_CONF — bootstrap deploy"
  ACTIVE_API_PORT=0
  ACTIVE_WEB_PORT=0
fi

# 2) Pick IDLE color.
if [ "${ACTIVE_API_PORT}" = "6002" ]; then
  ACTIVE_COLOR=blue;  IDLE_COLOR=green
  IDLE_API_PORT=6003; IDLE_WEB_PORT=3002
else
  ACTIVE_COLOR=green; IDLE_COLOR=blue
  IDLE_API_PORT=6002; IDLE_WEB_PORT=3001
fi
log "active=$ACTIVE_COLOR (api:$ACTIVE_API_PORT, web:$ACTIVE_WEB_PORT) → flipping to idle=$IDLE_COLOR (api:$IDLE_API_PORT, web:$IDLE_WEB_PORT)"

# 3) Pin tags. The IDLE side gets the new SHA. The ACTIVE side
#    keeps whatever it was running so we can roll back instantly
#    by just flipping the upstream back.
if [ "$IDLE_COLOR" = "blue" ]; then
  export ESTIA_TAG_BLUE="$ESTIA_TAG"
  export ESTIA_TAG_GREEN="${ESTIA_TAG_GREEN:-main}"
else
  export ESTIA_TAG_GREEN="$ESTIA_TAG"
  export ESTIA_TAG_BLUE="${ESTIA_TAG_BLUE:-main}"
fi
# market-watcher always runs the new SHA (single instance, swap-in-place).
export ESTIA_TAG="$ESTIA_TAG"

# 4) Pull + boot IDLE pair (and the watcher, which doesn't need
#    blue-green since it has no inbound traffic).
log "pulling images for $IDLE_COLOR + market-watcher"
$COMPOSE pull "backend-$IDLE_COLOR" "frontend-$IDLE_COLOR" market-watcher

log "booting $IDLE_COLOR + market-watcher"
$COMPOSE up -d --no-deps --pull never \
  "backend-$IDLE_COLOR" "frontend-$IDLE_COLOR" market-watcher

# 5) Wait for IDLE backend /api/health (60s budget).
log "waiting for backend-$IDLE_COLOR /api/health on 127.0.0.1:$IDLE_API_PORT"
HEALTH_OK=0
for i in $(seq 1 30); do
  if curl -fsS -m 2 "http://127.0.0.1:$IDLE_API_PORT/api/health" > /dev/null 2>&1; then
    HEALTH_OK=1
    log "✓ backend-$IDLE_COLOR healthy after ${i} attempts"
    break
  fi
  sleep 2
done
if [ "$HEALTH_OK" -ne 1 ]; then
  log "✗ backend-$IDLE_COLOR FAILED healthcheck — aborting deploy"
  log "old pair (active=$ACTIVE_COLOR) keeps serving; no flip happened"
  $COMPOSE stop "backend-$IDLE_COLOR" "frontend-$IDLE_COLOR" || true
  exit 1
fi

# 6) Atomic flip via sed + nginx -s reload.
log "flipping host nginx upstreams: api → :$IDLE_API_PORT, web → :$IDLE_WEB_PORT"
sudo sed -i \
  -e "s|server 127\\.0\\.0\\.1:[0-9]\\+; *# *backend-active|server 127.0.0.1:$IDLE_API_PORT; # backend-active|" \
  -e "s|server 127\\.0\\.0\\.1:[0-9]\\+; *# *backend-inactive|server 127.0.0.1:$ACTIVE_API_PORT; # backend-inactive|" \
  -e "s|server 127\\.0\\.0\\.1:[0-9]\\+; *# *frontend-active|server 127.0.0.1:$IDLE_WEB_PORT; # frontend-active|" \
  -e "s|server 127\\.0\\.0\\.1:[0-9]\\+; *# *frontend-inactive|server 127.0.0.1:$ACTIVE_WEB_PORT; # frontend-inactive|" \
  "$NGINX_CONF"

# Validate config before reloading — sed bug or broken template
# would break ALL traffic if we reload blindly.
if ! sudo nginx -t > /dev/null 2>&1; then
  log "✗ nginx -t failed — reverting sed and aborting"
  $COMPOSE stop "backend-$IDLE_COLOR" "frontend-$IDLE_COLOR" || true
  exit 1
fi

sudo nginx -s reload
log "✓ nginx reloaded — traffic now routing to $IDLE_COLOR"

# 7) Drain OLD: wait until no active connections to the old ports,
#    or 5-minute cap, whichever first. Connections on TCP from nginx
#    workers to the old upstream port are the ones we care about.
if [ "$ACTIVE_API_PORT" -gt 0 ]; then
  log "draining backend-$ACTIVE_COLOR (max ${DRAIN_MAX_SEC}s)"
  WAITED=0
  while [ "$WAITED" -lt "$DRAIN_MAX_SEC" ]; do
    # Count established TCP connections to the old port. `sport`
    # filters where the OLD container is the source (= server-side
    # of the connection from nginx's POV).
    CONNS=$(sudo ss -tn "sport = :$ACTIVE_API_PORT" 2>/dev/null \
            | tail -n +2 | grep -c ESTAB || true)
    if [ "${CONNS:-0}" -eq 0 ]; then
      log "✓ no active connections to :$ACTIVE_API_PORT, draining done"
      break
    fi
    log "  $CONNS active conn(s), waiting…"
    sleep "$DRAIN_POLL_SEC"
    WAITED=$((WAITED + DRAIN_POLL_SEC))
  done
fi

# 8) Stop OLD pair. SIGTERM grace is 30s per stop_grace_period in
#    the compose file, so any in-flight request that snuck in during
#    drain still has time to finish.
if [ "$ACTIVE_API_PORT" -gt 0 ]; then
  log "stopping old pair: backend-$ACTIVE_COLOR + frontend-$ACTIVE_COLOR"
  $COMPOSE stop "backend-$ACTIVE_COLOR" "frontend-$ACTIVE_COLOR" || true
fi

log "deploy complete: active color is now $IDLE_COLOR (api:$IDLE_API_PORT, web:$IDLE_WEB_PORT)"
