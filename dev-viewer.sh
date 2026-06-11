#!/usr/bin/env bash
# Build and run the ProjectLM web viewer stack (native addon + WS server + Vite).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export PROJECTLM_ROOT="$ROOT"
PID_FILE="$ROOT/.dev-viewer.pid"
NATIVE_DIR="$ROOT/bindings/node"
NATIVE_NODE="$NATIVE_DIR/build/Release/projectlm_native.node"

# Cursor/agent sandboxes set npm_config_devdir to a temp path; incremental gyp then
# breaks when you run ./dev-viewer.sh in a normal shell. Pin headers under the repo.
if [[ "${npm_config_devdir:-}" == *cursor-sandbox-cache* ]]; then
  unset npm_config_devdir
fi
export npm_config_devdir="${npm_config_devdir:-$ROOT/.cache/node-gyp}"
mkdir -p "$npm_config_devdir"

SERVER_PORT="${PROJECTLM_WS_PORT:-${PORT:-9785}}"
VIEWER_PORT="${VIEWER_PORT:-5173}"
SKIP_BUILD=false
FORCE_PORTS=false
FORCE_REBUILD=false

usage() {
  cat <<EOF
Usage: $(basename "$0") [options]

Ensure deps and the Node native addon are up to date, then start the WS server
and Vite viewer. Open http://localhost:${VIEWER_PORT} when ready.

Options:
  --no-build    Skip all build/install steps (start servers only)
  --rebuild     Force a full native addon rebuild (node-gyp rebuild)
  --force       Stop processes on the target ports before starting
  -h, --help    Show this help

Environment:
  PORT          WebSocket server port (default: 9785)
  PROJECTLM_WS_PORT  Same as PORT (takes precedence)
  DEV_HTTP_PORT Dev session-log API port (default: PORT + 1)
  VIEWER_PORT   Vite dev server port (default: 5173)
  PROJECTLM_ROOT  Repo root (set automatically)
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-build) SKIP_BUILD=true; shift ;;
    --rebuild) FORCE_REBUILD=true; shift ;;
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
  local pids
  pids="$(lsof -t -iTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"
  if [[ -n "$pids" ]]; then
    # Kill listener and parent (e.g. tsx watch respawns children if only the child dies).
    for pid in $pids; do
      local ppid
      ppid="$(ps -o ppid= -p "$pid" 2>/dev/null | tr -d ' ' || true)"
      kill "$pid" 2>/dev/null || true
      [[ -n "$ppid" && "$ppid" != "1" ]] && kill "$ppid" 2>/dev/null || true
    done
    sleep 0.4
    pids="$(lsof -t -iTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"
    [[ -n "$pids" ]] && kill -9 $pids 2>/dev/null || true
  elif command -v fuser >/dev/null 2>&1; then
    fuser -k "${port}/tcp" >/dev/null 2>&1 || true
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

npm_needs_install() {
  local dir="$1"
  [[ ! -d "$dir/node_modules" ]] && return 0
  local stamp="$dir/node_modules/.package-lock.json"
  if [[ -f "$stamp" ]]; then
    [[ "$dir/package-lock.json" -nt "$stamp" ]] && return 0
    [[ "$dir/package.json" -nt "$stamp" ]] && return 0
    return 1
  fi
  [[ "$dir/package.json" -nt "$dir/node_modules" ]] && return 0
  [[ -f "$dir/package-lock.json" && "$dir/package-lock.json" -nt "$dir/node_modules" ]] && return 0
  return 1
}

ensure_npm_deps() {
  local dir="$1"
  local label="$2"
  shift 2
  if npm_needs_install "$dir"; then
    echo "==> Installing ${label} dependencies..."
    npm install --prefix "$dir" "$@"
  else
    echo "==> ${label} dependencies up to date"
  fi
}

native_needs_build() {
  [[ ! -f "$NATIVE_NODE" ]] && return 0
  find "$ROOT/src" "$NATIVE_DIR" \
    \( -name '*.cpp' -o -name '*.hpp' -o -name 'binding.gyp' -o -name 'addon.cpp' \) \
    -newer "$NATIVE_NODE" -print -quit | grep -q .
}

native_gyp_stale() {
  [[ ! -d "$NATIVE_DIR/build" ]] && return 1
  grep -rq 'cursor-sandbox-cache' "$NATIVE_DIR/build" 2>/dev/null
}

ensure_native_addon() {
  # gypfile:true runs node-gyp rebuild on every npm install — skip scripts here.
  ensure_npm_deps "$NATIVE_DIR" "native addon" --ignore-scripts

  if [[ "$FORCE_REBUILD" == true ]] || native_gyp_stale; then
    if native_gyp_stale; then
      echo "==> Native build used a stale sandbox cache — cleaning and rebuilding..."
    else
      echo "==> Rebuilding Node native addon (full rebuild)..."
    fi
    rm -rf "$NATIVE_DIR/build"
    npm run build --prefix "$NATIVE_DIR"
    return
  fi

  if native_needs_build; then
    echo "==> Building Node native addon..."
    npm run build --prefix "$NATIVE_DIR"
  else
    echo "==> Native addon up to date"
  fi
}

require_cmd npm
require_cmd node

if [[ "$SKIP_BUILD" == false ]]; then
  ensure_native_addon
  # file:../bindings/node would also trigger a native rebuild without --ignore-scripts.
  ensure_npm_deps "$ROOT/server" "server" --ignore-scripts
  ensure_npm_deps "$ROOT/viewer" "viewer"
else
  echo "==> Skipping build (--no-build)"
fi

stop_previous

if port_in_use "$SERVER_PORT" && [[ "$FORCE_PORTS" != true ]]; then
  base="$SERVER_PORT"
  picked=""
  for try in $(seq "$base" $((base + 10))); do
    if ! port_in_use "$try"; then
      picked="$try"
      break
    fi
  done
  if [[ -n "$picked" ]]; then
    echo "==> Port $SERVER_PORT in use — using ws://localhost:${picked} instead"
    SERVER_PORT="$picked"
  fi
fi

HTTP_PORT="${DEV_HTTP_PORT:-$((SERVER_PORT + 1))}"

require_port "$SERVER_PORT" "WS server" "PORT"
require_port "$HTTP_PORT" "dev session log API" "DEV_HTTP_PORT"
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
PROJECTLM_WS_PORT="$SERVER_PORT" PORT="$SERVER_PORT" DEV_HTTP_PORT="$HTTP_PORT" npm run start --prefix "$ROOT/server" &
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
PROJECTLM_WS_PORT="$SERVER_PORT" PORT="$SERVER_PORT" VIEWER_PORT="$VIEWER_PORT" npm run dev --prefix "$ROOT/viewer" -- --port "$VIEWER_PORT" --strictPort &
VIEWER_PID=$!
echo "$VIEWER_PID" >> "$PID_FILE"

echo ""
echo "Viewer ready: http://localhost:${VIEWER_PORT}"
echo "Press Ctrl+C to stop server and viewer."
echo ""

wait "$VIEWER_PID"
