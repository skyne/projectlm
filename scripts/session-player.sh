#!/usr/bin/env bash
# Agent-friendly wrapper for the ProjectLM live session player CLI.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TOOL_DIR="$ROOT/tools/session-player"

if [[ ! -d "$TOOL_DIR/node_modules" ]]; then
  npm install --prefix "$TOOL_DIR" --ignore-scripts >/dev/null
fi

PROJECTLM_WS_PORT="${PROJECTLM_WS_PORT:-${PORT:-9785}}"
export PROJECTLM_WS_URL="${PROJECTLM_WS_URL:-ws://localhost:${PROJECTLM_WS_PORT}}"

exec npm run player --prefix "$TOOL_DIR" -- "$@"
