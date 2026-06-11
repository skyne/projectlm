#!/usr/bin/env bash
# Run unit + integration tests for all three layers (sim, server, viewer).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "== C++ sim =="
make test

echo "== Native bindings =="
(cd bindings/node && npm run build && npm test)

echo "== Server =="
(cd server && npm run build && npm test)

echo "== Viewer =="
(cd viewer && npm run build && npm test)

echo "All test tiers passed."
