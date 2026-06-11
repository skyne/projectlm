#!/usr/bin/env bash
# Standalone track layout editor (dev tool — not shipped with the game viewer).
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$DIR/../.." && pwd)"
export PROJECTLM_ROOT="$ROOT"
export TRACK_EDITOR_PORT="${TRACK_EDITOR_PORT:-5190}"
export TRACK_EDITOR_API_PORT="${TRACK_EDITOR_API_PORT:-5191}"

cd "$DIR"
if [[ ! -d node_modules ]]; then
  npm install
fi

cleanup() {
  [[ -n "${API_PID:-}" ]] && kill "$API_PID" 2>/dev/null || true
  [[ -n "${VITE_PID:-}" ]] && kill "$VITE_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "[track-editor] API http://127.0.0.1:${TRACK_EDITOR_API_PORT}/api"
echo "[track-editor] UI  http://localhost:${TRACK_EDITOR_PORT}"

npx tsx src/api.ts &
API_PID=$!
sleep 0.4
npm run dev &
VITE_PID=$!
wait
