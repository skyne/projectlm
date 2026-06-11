#!/usr/bin/env bash
# Save live session checkpoint, rebuild native + server, restart with --restore.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export PROJECTLM_ROOT="$ROOT"

SERVER_PORT="${PROJECTLM_WS_PORT:-${PORT:-9785}}"
HTTP_PORT="${DEV_HTTP_PORT:-$((SERVER_PORT + 1))}"
CHECKPOINT="${DEV_CHECKPOINT_PATH:-$ROOT/server/data/dev_checkpoint.json}"
SKIP_BUILD=false
SAVE_ONLY=false

usage() {
  cat <<EOF
Usage: $(basename "$0") [options]

Dev loop for sim/server work: POST checkpoint save, stop server, rebuild, start with --restore.

Options:
  --no-build     Skip native/server rebuild (restart only)
  --save-only    Save checkpoint and exit (no restart)
  --checkpoint <path>  Checkpoint file (default: server/data/dev_checkpoint.json)
  -h, --help     Show this help

Environment:
  PROJECTLM_WS_PORT / PORT   WebSocket port (default: 9785)
  DEV_HTTP_PORT              Dev API port (default: PORT + 1)
  DEV_CHECKPOINT_PATH        Checkpoint JSON path
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-build) SKIP_BUILD=true; shift ;;
    --save-only) SAVE_ONLY=true; shift ;;
    --checkpoint)
      CHECKPOINT="$2"
      shift 2
      ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage >&2; exit 1 ;;
  esac
done

save_checkpoint() {
  if ! command -v curl >/dev/null 2>&1; then
    echo "error: curl required to save checkpoint" >&2
    exit 1
  fi
  echo "==> Saving dev checkpoint via http://127.0.0.1:${HTTP_PORT}/dev/checkpoint/save ..."
  local resp
  resp="$(curl -sf -X POST "http://127.0.0.1:${HTTP_PORT}/dev/checkpoint/save" 2>&1)" || {
    echo "error: checkpoint save failed — is the server running with an active session?" >&2
    echo "$resp" >&2
    exit 1
  }
  echo "$resp"
}

stop_server() {
  if [[ -f "$ROOT/.dev-viewer.pid" ]]; then
    while read -r pid; do
      [[ -n "$pid" ]] && kill "$pid" 2>/dev/null || true
    done <"$ROOT/.dev-viewer.pid"
    rm -f "$ROOT/.dev-viewer.pid"
  fi
  if command -v lsof >/dev/null 2>&1; then
    lsof -tiTCP:"$SERVER_PORT" -sTCP:LISTEN 2>/dev/null | xargs -r kill 2>/dev/null || true
  fi
  sleep 0.3
}

if [[ "$SAVE_ONLY" == true ]]; then
  save_checkpoint
  exit 0
fi

if curl -sf "http://127.0.0.1:${HTTP_PORT}/dev/checkpoint" >/dev/null 2>&1; then
  save_checkpoint || echo "==> No checkpoint saved (no active session?)"
else
  echo "==> Server not reachable on dev API — skipping checkpoint save"
fi

stop_server

if [[ "$SKIP_BUILD" == false ]]; then
  echo "==> Rebuilding native addon..."
  npm run build --prefix "$ROOT/bindings/node"
  echo "==> Building server..."
  npm run build --prefix "$ROOT/server"
fi

mkdir -p "$(dirname "$CHECKPOINT")"
echo "==> Starting server with --restore ..."
PROJECTLM_WS_PORT="$SERVER_PORT" PORT="$SERVER_PORT" DEV_HTTP_PORT="$HTTP_PORT" \
  npm run start --prefix "$ROOT/server" -- --restore "$CHECKPOINT"
