#!/usr/bin/env bash
# Snapshot and restore ProjectLM career saves for testing.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SAVE="$ROOT/data/game_save.json"
FIXTURES="$ROOT/server/fixtures/saves"

usage() {
  cat <<'EOF'
Usage:
  ./scripts/savegame.sh snapshot [name]   Copy data/game_save.json → server/fixtures/saves/
  ./scripts/savegame.sh restore <name>    Copy fixture → data/game_save.json
  ./scripts/savegame.sh list              List available snapshots

Examples:
  ./scripts/savegame.sh snapshot
  ./scripts/savegame.sh snapshot my-test-state
  ./scripts/savegame.sh restore audi-skytech-round8-2026-06-07
  ./scripts/savegame.sh restore audi-skytech-round8-2026-06-07.json
EOF
}

slugify() {
  echo "$1" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-|-$//g'
}

write_meta() {
  local fixture="$1"
  node -e "
const fs = require('fs');
const path = process.argv[1];
const s = JSON.parse(fs.readFileSync(path, 'utf8'));
const id = path.split('/').pop().replace(/\.json$/, '');
const meta = {
  id,
  capturedAt: new Date().toISOString().slice(0, 10),
  teamName: s.teamName,
  seasonYear: s.seasonYear,
  currentRound: s.currentRound,
  setupComplete: s.setupComplete,
  budget: s.budget,
  fleetCount: s.fleet?.length ?? 0,
  activeCarId: s.activeCarId,
  playerEntryId: s.playerEntryId,
};
fs.writeFileSync(path.replace(/\.json$/, '.meta.json'), JSON.stringify(meta, null, 2) + '\n');
console.log(JSON.stringify(meta, null, 2));
" "$fixture"
}

cmd="${1:-}"
case "$cmd" in
  snapshot)
    if [[ ! -f "$SAVE" ]]; then
      echo "No save found at $SAVE" >&2
      exit 1
    fi
    mkdir -p "$FIXTURES"
    if [[ -n "${2:-}" ]]; then
      name="$(slugify "$2")"
    else
      meta="$(node -e "
const s = require('$SAVE');
const slug = (s.teamName || 'save')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '');
const date = new Date().toISOString().slice(0, 10);
console.log(\`\${slug}-round\${s.currentRound ?? 0}-\${date}\`);
")"
      name="$meta"
    fi
    dest="$FIXTURES/${name}.json"
    cp "$SAVE" "$dest"
    echo "Snapshot → $dest"
    write_meta "$dest"
    ;;
  restore)
    if [[ -z "${2:-}" ]]; then
      usage >&2
      exit 1
    fi
    base="${2%.json}"
    src="$FIXTURES/${base}.json"
    if [[ ! -f "$src" ]]; then
      echo "Fixture not found: $src" >&2
      exit 1
    fi
    mkdir -p "$(dirname "$SAVE")"
    cp "$src" "$SAVE"
    echo "Restored $src → $SAVE"
    echo "Restart the server (or send reload) to pick up the save."
    ;;
  list)
    if [[ ! -d "$FIXTURES" ]]; then
      echo "No snapshots yet."
      exit 0
    fi
    for meta in "$FIXTURES"/*.meta.json; do
      [[ -f "$meta" ]] || continue
      node -e "const m=require(process.argv[1]); console.log(m.id + ' — ' + m.teamName + ', round ' + m.currentRound + ' (' + m.capturedAt + ')');" "$meta"
    done
    ;;
  -h|--help|help|"")
    usage
    ;;
  *)
    echo "Unknown command: $cmd" >&2
    usage >&2
    exit 1
    ;;
esac
