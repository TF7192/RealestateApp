#!/usr/bin/env bash
# Run scenario A (workday) + scenario B (stampede) at 7 fixed VU
# levels each: 10/20/30/50/100/150/200. Per-level k6 summary JSON
# stored under perf/benchmarks-2026-05-01-final/ladder/.
#
# Operator must:
#   1. Have raised RATE_LIMIT_MAX_PER_MIN on prod beforehand
#   2. Have a fresh .auth/perf.json from scripts/perf-preflight.sh
#
# Each level runs to completion before the next starts so per-level
# metrics aren't blurred by ramp transitions. Total wall time ~50 min.
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$REPO/perf/benchmarks-2026-05-01-final/ladder"
mkdir -p "$OUT"

LEVELS=(10 20 30 50 100 150 200)
WORKDAY_DURATION="${WORKDAY_DURATION:-4m}"
FLOOD_DURATION="${FLOOD_DURATION:-90s}"

export ALLOW_RUN=1
export BASE_URL="${BASE_URL:-https://estia.co.il}"
export ESTIA_TOKEN="$(jq -r .estia_token "$REPO/.auth/perf.json")"
export SEED_PROPERTY_ID="$(jq -r .seed_property_id "$REPO/.auth/perf.json")"
export SEED_LEAD_ID="$(jq -r .seed_lead_id "$REPO/.auth/perf.json")"

run_one() {
  local kind="$1" level="$2" duration="$3" scenario="$4"
  local tag="${kind}-${level}vu"
  echo
  echo "════════════════════════════════════════════════════════════════"
  echo " [$kind] FIXED_VUS=$level  duration=$duration"
  echo "════════════════════════════════════════════════════════════════"
  FIXED_VUS="$level" DURATION="$duration" k6 run \
    --summary-export="$OUT/${tag}.json" \
    --no-color "$REPO/perf/load-tests/scenarios/$scenario" \
    > "$OUT/${tag}.log" 2>&1 || echo "  (exit $? — likely thresholds, data preserved)"
  # Recover per-tag duration percentiles by parsing the log's
  # http_req_duration{endpoint:X} lines, since summary-export drops them.
  echo "  done → $OUT/${tag}.json + ${tag}.log"
}

echo "Phase A — workday"
for L in "${LEVELS[@]}"; do
  run_one "workday" "$L" "$WORKDAY_DURATION" "agent-day-fixed-vu.js"
  sleep 10  # cooldown between levels so caches re-populate cleanly
done

echo
echo "Phase B — stampede"
for L in "${LEVELS[@]}"; do
  run_one "stampede" "$L" "$FLOOD_DURATION" "dashboard-flood.js"
  sleep 10
done

echo
echo "All done. Summarize with: node scripts/perf-stress-ladder-summary.mjs"
