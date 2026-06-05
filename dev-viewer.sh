#!/usr/bin/env bash
# Build and run the ProjectLM web viewer stack (native addon + WS server + Vite).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export PROJECTLM_ROOT="$ROOT"
PID_FILE="$ROOT/.dev-viewer.pid"

SERVER_PORT="${PORT:-8765}"
VIEWER_PORT="${VIEWER_PORT:-5173}"
SKIP_BUILD=false
FORCE_PORTS=false

usage() {
  cat <<EOF
Usage: $(basename "$0") [options]

Build the sim core, Node native addon, and npm deps; then start the WS server
and Vite viewer. Open http://localhost:${VIEWER_PORT} when ready.

Options:
  --no-build    Skip make / make native / npm install (start servers only)
  --force       Stop processes on the target ports before starting
  -h, --help    Show this help

Environment:
  PORT          WebSocket server port (default: 8765)
  VIEWER_PORT   Vite dev server port (default: 5173)
  PROJECTLM_ROOT  Repo root (set automatically)
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-build) SKIP_BUILD=true; shift ;;
    --force) FORCE_PORTS=true; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage >&2; exit 1 ;;
  esac
done

port_in_use() {
  local port="$1"
  if command -v ss >/dev/null 2>&1; then
    ss -tlnH "sport = :$port" 2>/dev/null | grep -q .
  elif command -v lsof >/dev/null 2>&1; then
    lsof -iTCP:"$port" -sTCP:LISTEN -t >/dev/null 2>&1
  else
    return 1
  fi
}

port_owner() {
  local port="$1"
  if command -v ss >/dev/null 2>&1; then
    ss -tlnpH "sport = :$port" 2>/dev/null | sed -n '1p'
  elif command -v lsof >/dev/null 2>&1; then
    lsof -iTCP:"$port" -sTCP:LISTEN 2>/dev/null | sed -n '2p'
  fi
}

free_port() {
  local port="$1"
  if command -v fuser >/dev/null 2>&1; then
    fuser -k "${port}/tcp" >/dev/null 2>&1 || true
  else
    local pids
    pids="$(lsof -t -iTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"
    [[ -n "$pids" ]] && kill $pids 2>/dev/null || true
  fi
  sleep 0.2
}

stop_previous() {
  if [[ ! -f "$PID_FILE" ]]; then
    return 0
  fi
  echo "==> Stopping previous dev-viewer processes..."
  while read -r pid; do
    [[ -n "$pid" ]] && kill "$pid" 2>/dev/null || true
  done < "$PID_FILE"
  rm -f "$PID_FILE"
  sleep 0.3
}

require_port() {
  local port="$1"
  local label="$2"
  local env_hint="$3"

  if ! port_in_use "$port"; then
    return 0
  fi

  if [[ "$FORCE_PORTS" == true ]]; then
    echo "==> Freeing port $port ($label)..."
    free_port "$port"
    if port_in_use "$port"; then
      echo "error: could not free port $port ($label)" >&2
      exit 1
    fi
    return 0
  fi

  echo "error: port $port is already in use ($label)." >&2
  local owner
  owner="$(port_owner "$port" || true)"
  [[ -n "$owner" ]] && echo "       $owner" >&2
  echo "       Stop the process, run with --force, or use: ${env_hint}=<port> $0" >&2
  exit 1
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "error: required command not found: $1" >&2
    exit 1
  fi
}

require_cmd make
require_cmd npm
require_cmd node

if [[ "$SKIP_BUILD" == false ]]; then
  echo "==> Building C++ sim (make)..."
  make -C "$ROOT"

  echo "==> Building Node native addon (make native)..."
  make -C "$ROOT" native

  echo "==> Installing server dependencies..."
  npm install --prefix "$ROOT/server"

  echo "==> Installing viewer dependencies..."
  npm install --prefix "$ROOT/viewer"
else
  echo "==> Skipping build (--no-build)"
fi

stop_previous
require_port "$SERVER_PORT" "WS server" "PORT"
require_port "$VIEWER_PORT" "Vite viewer" "VIEWER_PORT"

SERVER_PID=""
VIEWER_PID=""

cleanup() {
  local code=$?
  [[ -n "$VIEWER_PID" ]] && kill "$VIEWER_PID" 2>/dev/null || true
  [[ -n "$SERVER_PID" ]] && kill "$SERVER_PID" 2>/dev/null || true
  rm -f "$PID_FILE"
  wait 2>/dev/null || true
  exit "$code"
}
trap cleanup EXIT INT TERM

echo "==> Starting WS server on ws://localhost:${SERVER_PORT}..."
PORT="$SERVER_PORT" npm run start --prefix "$ROOT/server" &
SERVER_PID=$!
echo "$SERVER_PID" > "$PID_FILE"

for _ in $(seq 1 30); do
  if port_in_use "$SERVER_PORT"; then
    break
  fi
  sleep 0.1
done
if ! port_in_use "$SERVER_PORT"; then
  echo "error: server failed to start on port $SERVER_PORT" >&2
  exit 1
fi

echo "==> Starting Vite viewer on http://localhost:${VIEWER_PORT}..."
PORT="$SERVER_PORT" VIEWER_PORT="$VIEWER_PORT" npm run dev --prefix "$ROOT/viewer" -- --port "$VIEWER_PORT" --strictPort &
VIEWER_PID=$!
echo "$VIEWER_PID" >> "$PID_FILE"

echo ""
echo "Viewer ready: http://localhost:${VIEWER_PORT}"
echo "Press Ctrl+C to stop server and viewer."
echo ""

wait "$VIEWER_PID"
