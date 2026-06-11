#!/usr/bin/env bash
# Headless server + session-player functional suite for CI/nightly.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PORT="${PROJECTLM_WS_PORT:-9786}"
export PROJECTLM_WS_PORT="$PORT"
export PROJECTLM_WS_URL="ws://localhost:${PORT}"
export TIME_SCALE="${TIME_SCALE:-50}"
export WATCH_SEC="${WATCH_SEC:-12}"

echo "== Build native + server =="
if [[ ! -f build/bin/projectlm_tests ]]; then
  make -j"$(nproc)"
fi
if [[ ! -f bindings/node/build/Release/projectlm_native.node ]]; then
  (cd bindings/node && npm run build)
fi
(cd server && npm run build)

SERVER_PID=""
cleanup() {
  if [[ -n "$SERVER_PID" ]] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

echo "== Start server on port ${PORT} =="
(cd server && PROJECTLM_WS_PORT="$PORT" npm start) &
SERVER_PID=$!

echo "== Wait for server readiness =="
HTTP_PORT="${DEV_HTTP_PORT:-$((PORT + 1))}"
ready=0
for _ in $(seq 1 45); do
  if curl -sf "http://127.0.0.1:${HTTP_PORT}/dev/session-logs" >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 1
done
if [[ "$ready" -ne 1 ]]; then
  echo "Server did not become ready (ws=${PORT}, http=${HTTP_PORT})" >&2
  exit 1
fi

echo "== Session-player CI suite =="
if [[ ! -d tools/session-player/node_modules ]]; then
  npm install --prefix tools/session-player --ignore-scripts >/dev/null
fi
npm run test:ci --prefix tools/session-player

echo "E2E suite passed."
