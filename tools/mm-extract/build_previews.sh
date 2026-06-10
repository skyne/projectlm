#!/usr/bin/env bash
# Build textured formula / LMP / GT GLB previews from game assemblies.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
OUT_ROOT="${MM_OUT:-$REPO_ROOT/tmp/mm-assets}"
MANIFEST="$OUT_ROOT/manifest.json"
EXPORT="$OUT_ROOT/export"
VIEWER="$OUT_ROOT/viewer"
ASSEMBLED="$OUT_ROOT/raw/assembled"
TEXTURES="$OUT_ROOT/raw/textures"
GAME_DIR="${MM_GAME_DIR:-/mnt/data/Games/steamapps/common/Motorsport Manager}"
VENV="$SCRIPT_DIR/.venv/bin/python"

if [[ ! -f "$MANIFEST" ]]; then
  echo "Missing $MANIFEST — run tools/mm-extract/run.sh --extract-only first." >&2
  exit 1
fi

mkdir -p "$EXPORT" "$VIEWER" "$ASSEMBLED"

export_car() {
  local car="$1"
  local outfile="$2"
  local length="${3:-4.9}"
  local asm_dir="$ASSEMBLED/$car"

  echo "==> Export assembly: $car"
  "$VENV" "$SCRIPT_DIR/export_assembly.py" \
    --game-dir "$GAME_DIR" \
    --car "$car" \
    --output "$asm_dir" \
    --textures "$TEXTURES"

  echo "==> Blender assemble: $car"
  blender --background --python "$SCRIPT_DIR/assemble_textured_glb.py" -- \
    --assembly "$asm_dir/assembly.json" \
    --output "$outfile" \
    --target-length "$length"
}

export_car lmp "$EXPORT/car_lmp.glb" 4.95
export_car gt "$EXPORT/car_gt.glb" 4.85
export_car formula "$EXPORT/car_formula.glb" 4.6

BUILD_STAMP="$(date +%s)"
sed "s/__BUILD_STAMP__/$BUILD_STAMP/" "$SCRIPT_DIR/viewer/index.html" > "$VIEWER/index.html"
cp "$EXPORT"/car_*.glb "$VIEWER/"

echo ""
echo "Previews ready in $VIEWER"
echo "  cd $VIEWER && python3 -m http.server 8765"
