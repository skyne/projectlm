#!/usr/bin/env bash
# Validate placements, offline composite, and (if viewer is up) browser capture.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

echo "== validate placements =="
python3 scripts/generate_assets/validate_placements.py

echo "== offline assembly preview =="
python3 scripts/generate_assets/compose_preview.py

if curl -sf "http://localhost:5180/" >/dev/null 2>&1 || curl -sf "http://localhost:5173/" >/dev/null 2>&1; then
  URL="${VIEWER_URL:-}"
  if [[ -z "$URL" ]]; then
    if curl -sf "http://localhost:5180/" >/dev/null 2>&1; then
      URL="http://localhost:5180"
    else
      URL="http://localhost:5173"
    fi
  fi
  echo "== browser capture ($URL) =="
  (cd viewer && VIEWER_URL="$URL" npm run capture:preview)
else
  echo "== skip browser capture (viewer not running on 5173/5180) =="
fi

echo "All visual checks passed."
