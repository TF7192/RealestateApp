#!/usr/bin/env bash
# Slack perf reporter — every INTERVAL seconds (default 900 = 15 min)
# queries Prometheus for the latency quantiles over the last 15 min
# and posts a summary to SLACK_WEBHOOK_URL.
#
# All env from /etc/.env (passed in by docker compose env_file):
#   SLACK_WEBHOOK_URL   (required)
#   PROMETHEUS_URL      default http://prometheus:9090
#   PERF_INTERVAL       default 900 (sec)
#   PERF_LABEL_TAG      default "Estia prod"  — included in Slack message
#
# If SLACK_WEBHOOK_URL is unset, logs a warning every loop and noops.
set -uo pipefail

INTERVAL="${PERF_INTERVAL:-900}"
PROM="${PROMETHEUS_URL:-http://prometheus:9090}"
TAG="${PERF_LABEL_TAG:-Estia prod}"

log() { echo "[$(date -u +%FT%TZ)] $*"; }

q() {
  # Returns the first scalar/instant-vector value, or "n/a" on miss.
  local query="$1"
  local out
  out=$(curl -fsS --max-time 5 --data-urlencode "query=${query}" "${PROM}/api/v1/query" 2>/dev/null || true)
  echo "${out}" | jq -r '.data.result[0].value[1] // "n/a"' 2>/dev/null || echo "n/a"
}

# Format a number-of-seconds → ms with 0 decimals, or "n/a".
fmtms() {
  if [ "$1" = "n/a" ] || [ -z "$1" ]; then echo "n/a"; return; fi
  awk -v v="$1" 'BEGIN{ printf("%dms", v*1000) }'
}
fmtnum() {
  if [ "$1" = "n/a" ] || [ -z "$1" ]; then echo "n/a"; return; fi
  awk -v v="$1" 'BEGIN{ printf("%.2f", v) }'
}
fmtint() {
  if [ "$1" = "n/a" ] || [ -z "$1" ]; then echo "n/a"; return; fi
  awk -v v="$1" 'BEGIN{ printf("%d", v) }'
}

post_slack() {
  local body="$1"
  if [ -z "${SLACK_WEBHOOK_URL:-}" ]; then
    log "SLACK_WEBHOOK_URL unset — skipping post"
    return 0
  fi
  curl -fsS --max-time 8 -X POST -H 'Content-type: application/json' \
       --data "${body}" "${SLACK_WEBHOOK_URL}" >/dev/null \
    || log "slack post failed"
}

while true; do
  # ── Window: the last 15 minutes ────────────────────────────────
  P50=$(q 'histogram_quantile(0.5,  sum by (le) (rate(http_request_duration_seconds_bucket{job="estia-backend"}[15m])))')
  P95=$(q 'histogram_quantile(0.95, sum by (le) (rate(http_request_duration_seconds_bucket{job="estia-backend"}[15m])))')
  P99=$(q 'histogram_quantile(0.99, sum by (le) (rate(http_request_duration_seconds_bucket{job="estia-backend"}[15m])))')
  REQS=$(q 'sum(increase(http_requests_total{job="estia-backend"}[15m]))')
  ERRS=$(q 'sum(increase(http_requests_total{job="estia-backend",status=~"5.."}[15m]))')
  ERR_RATE=$(q 'sum(rate(http_requests_total{job="estia-backend",status=~"5.."}[15m])) / sum(rate(http_requests_total{job="estia-backend"}[15m]))')

  # Slowest 3 routes by p95
  SLOW_ROUTES=$(curl -fsS --max-time 5 --data-urlencode \
    'query=topk(3, histogram_quantile(0.95, sum by (route, le) (rate(http_request_duration_seconds_bucket{job="estia-backend"}[15m]))))' \
    "${PROM}/api/v1/query" 2>/dev/null \
    | jq -r '.data.result[]? | "\(.metric.route // "?") \(.value[1])"' \
    | awk '{ printf("%s:%dms ", $1, $2*1000) }')

  # Postgres + EC2 health
  PG_CONN=$(q 'sum(pg_stat_activity_count{datname="estia"})')
  PG_LONGEST=$(q 'pg_stat_activity_max_tx_duration{datname="estia"}')
  CPU=$(q '100 - (avg(rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)')
  MEM=$(q '100 * (1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes))')

  # Active firing alerts (just count + names)
  ALERTS=$(curl -fsS --max-time 3 "${PROM}/api/v1/alerts" 2>/dev/null \
    | jq -r '.data.alerts[]? | select(.state=="firing") | .labels.alertname' \
    | sort -u | paste -sd ',' -)
  ALERTS="${ALERTS:-(none)}"

  TEXT=$(cat <<EOF
*${TAG}* — last 15 min

\`\`\`
requests       $(fmtint "${REQS}")
errors (5xx)   $(fmtint "${ERRS}")  ($(awk -v r="${ERR_RATE}" 'BEGIN{ if (r=="n/a") print "n/a"; else printf("%.2f%%", r*100) }'))
p50 latency    $(fmtms "${P50}")
p95 latency    $(fmtms "${P95}")
p99 latency    $(fmtms "${P99}")

slowest p95    ${SLOW_ROUTES:-(no data)}
postgres conn  $(fmtint "${PG_CONN}") / 79
longest tx     $(fmtnum "${PG_LONGEST}")s
EC2 CPU        $(awk -v v="${CPU}" 'BEGIN{ if (v=="n/a") print "n/a"; else printf("%.0f%%", v) }')
EC2 mem        $(awk -v v="${MEM}" 'BEGIN{ if (v=="n/a") print "n/a"; else printf("%.0f%%", v) }')
firing alerts  ${ALERTS}
\`\`\`
EOF
)

  PAYLOAD=$(jq -nc --arg text "${TEXT}" '{ text: $text }')
  post_slack "${PAYLOAD}"
  log "posted: p50=$(fmtms "${P50}") p95=$(fmtms "${P95}") reqs=$(fmtint "${REQS}") errs=$(fmtint "${ERRS}") alerts=${ALERTS}"

  sleep "${INTERVAL}"
done
