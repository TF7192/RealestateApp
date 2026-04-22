#!/usr/bin/env bash
# Fetch the Hebrew-capable Noto Sans fonts the agreement-PDF renderer
# needs. Fonts are small (~25 KB each) and stable, but we keep them
# out of the deploy image's git history so worktrees without network
# access can be seeded explicitly by ops.
#
# Re-runs are idempotent: skips download if both files already exist.
#
# Usage (from repo root):
#   scripts/fetch-hebrew-fonts.sh
set -euo pipefail

DEST="backend/src/assets/fonts"
mkdir -p "$DEST"

REPO_BASE="https://github.com/googlefonts/noto-fonts/raw/main/hinted/ttf/NotoSansHebrew"
LICENSE_URL="https://raw.githubusercontent.com/googlefonts/noto-fonts/main/LICENSE"

download_if_missing () {
  local url="$1"
  local out="$2"
  if [[ -s "$out" ]]; then
    echo "skip $out (already present)"
    return 0
  fi
  echo "fetching $url → $out"
  curl -fsSL --retry 3 --max-time 30 -o "$out" "$url"
}

download_if_missing "$REPO_BASE/NotoSansHebrew-Regular.ttf" "$DEST/NotoSansHebrew-Regular.ttf"
download_if_missing "$REPO_BASE/NotoSansHebrew-Bold.ttf"    "$DEST/NotoSansHebrew-Bold.ttf"
download_if_missing "$LICENSE_URL"                          "$DEST/NotoSansHebrew-LICENSE.txt"

echo "ok — fonts are in $DEST"
