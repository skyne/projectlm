#!/usr/bin/env bash
# Extract Motorsport Manager car meshes → merged GLB prototype (+ optional viewer).
#
# Usage (repo root):
#   tools/mm-extract/run.sh
#   tools/mm-extract/run.sh --game-dir ~/.steam/steam/steamapps/common/MotorsportManager
#   tools/mm-extract/run.sh --workshop-id 1234567890 --all-meshes
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
VENV="$SCRIPT_DIR/.venv"
OUT_ROOT="${MM_OUT:-$REPO_ROOT/tmp/mm-assets}"
GAME_DIR="${MM_GAME_DIR:-/mnt/data/Games/steamapps/common/Motorsport Manager}"
WORKSHOP_ARGS=()
EXTRACT_ARGS=()
MERGE=1
OPEN_HINT=1
WAIT=0

wait_for_install() {
  local dir="$1"
  local marker="$dir/MM_Data/resources.assets"
  echo "Waiting for Steam download: $dir"
  while [[ ! -f "$marker" ]]; do
    local size
    size="$(du -sh "$dir" 2>/dev/null | awk '{print $1}')"
    size="${size:-0}"
    if [[ -f "$dir/../..//appmanifest_415200.acf" ]]; then
      :
    fi
    if [[ -f "/mnt/data/Games/steamapps/appmanifest_415200.acf" ]]; then
      local dl total
      dl="$(grep -m1 '"BytesDownloaded"' /mnt/data/Games/steamapps/appmanifest_415200.acf | awk '{print $2}' | tr -d '"')"
      total="$(grep -m1 '"BytesToDownload"' /mnt/data/Games/steamapps/appmanifest_415200.acf | awk '{print $2}' | tr -d '"')"
      if [[ -n "$dl" && -n "$total" && "$total" != "0" ]]; then
        local pct=$((dl * 100 / total))
        echo "  … ${pct}% (${size} on disk)"
      else
        echo "  … queued (${size} on disk)"
      fi
    else
      echo "  … ${size} on disk"
    fi
    sleep 30
  done
  echo "Download looks complete."
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --game-dir)
      GAME_DIR="$2"
      shift 2
      ;;
    --wait)
      WAIT=1
      shift
      ;;
    --output)
      OUT_ROOT="$2"
      shift 2
      ;;
    --workshop-id)
      WORKSHOP_ARGS+=(--workshop-id "$2")
      shift 2
      ;;
    --all-meshes)
      EXTRACT_ARGS+=(--all-meshes)
      shift
      ;;
    --no-merge)
      MERGE=0
      shift
      ;;
    --extract-only)
      MERGE=0
      shift
      ;;
    -h|--help)
      sed -n '2,12p' "$0"
      exit 0
      ;;
    *)
      echo "Unknown arg: $1" >&2
      exit 1
      ;;
  esac
done

cd "$REPO_ROOT"

if [[ "$WAIT" -eq 1 ]]; then
  wait_for_install "$GAME_DIR"
fi

if [[ ! -d "$VENV" ]]; then
  echo "Creating Python venv in tools/mm-extract/.venv …"
  python3 -m venv "$VENV"
  "$VENV/bin/pip" install -q -r "$SCRIPT_DIR/requirements.txt"
fi

EXTRACT_CMD=(
  "$VENV/bin/python" "$SCRIPT_DIR/extract_meshes.py"
  --output "$OUT_ROOT"
)
[[ -n "$GAME_DIR" ]] && EXTRACT_CMD+=(--game-dir "$GAME_DIR")
EXTRACT_CMD+=("${WORKSHOP_ARGS[@]}" "${EXTRACT_ARGS[@]}")

echo "==> Extracting Unity meshes"
"${EXTRACT_CMD[@]}"

MANIFEST="$OUT_ROOT/manifest.json"
GLB="$OUT_ROOT/export/car_prototype.glb"

if [[ "$MERGE" -eq 1 ]]; then
  if ! command -v blender >/dev/null 2>&1; then
    echo "Blender not found; skipping GLB merge. Install blender or use --extract-only." >&2
  else
    bash "$SCRIPT_DIR/build_previews.sh"
  fi
fi

VIEWER_OUT="$OUT_ROOT/viewer"
GLB="$OUT_ROOT/export/car_formula.glb"

echo ""
echo "Done."
echo "  manifest: $MANIFEST"
[[ -f "$GLB" ]] && echo "  formula:  $OUT_ROOT/export/car_formula.glb"
[[ -f "$OUT_ROOT/export/car_lmp.glb" ]] && echo "  lmp:      $OUT_ROOT/export/car_lmp.glb"
[[ -f "$OUT_ROOT/export/car_gt.glb" ]] && echo "  gt:       $OUT_ROOT/export/car_gt.glb"
if [[ -f "$VIEWER_OUT/index.html" ]]; then
  echo ""
  echo "Preview (from repo root):"
  echo "  cd $VIEWER_OUT && python3 -m http.server 8765"
  echo "  open http://localhost:8765"
fi
