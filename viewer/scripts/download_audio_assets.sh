#!/usr/bin/env bash
# Fetches royalty-free audio used by the viewer. Re-run to refresh assets.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/public/audio"
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
REF="https://mixkit.co/"

mkdir -p "$OUT"/{music,sfx/ui,sfx/pass-by,licenses}

if [[ ! -f "$OUT/sfx/ui/click.ogg" ]]; then
  tmp="$(mktemp -d)"
  curl -fsSL -o "$tmp/kenney.zip" "https://opengameart.org/sites/default/files/kenney_interfaceSounds.zip"
  unzip -q -o "$tmp/kenney.zip" -d "$tmp/kenney"
  k="$tmp/kenney/Audio"
  cp "$k/select_004.ogg" "$OUT/sfx/ui/click.ogg"
  cp "$k/confirmation_001.ogg" "$OUT/sfx/ui/confirm.ogg"
  cp "$k/error_001.ogg" "$OUT/sfx/ui/error.ogg"
  cp "$k/toggle_002.ogg" "$OUT/sfx/ui/toggle.ogg"
  cp "$tmp/kenney/License.txt" "$OUT/licenses/KENNEY_INTERFACE_SOUNDS.txt"
  rm -rf "$tmp"
fi

curl -fsSL -A "$UA" -e "$REF" -o "$OUT/music/menu-ambient.mp3" "https://assets.mixkit.co/music/614/614.mp3"
curl -fsSL -A "$UA" -e "$REF" -o "$OUT/music/race-tension.mp3" "https://assets.mixkit.co/music/676/676.mp3"

resolve_mixkit_sfx() {
  local id="$1"
  curl -fsSL -A "$UA" "https://mixkit.co/free-sound-effects/download/${id}/" \
    | grep -oE 'https://assets\.mixkit\.co/active_storage/sfx/[0-9]+/[0-9]+\.wav' \
    | head -1
}

download_wav() {
  local id="$1" dest="$2"
  local url
  url="$(resolve_mixkit_sfx "$id")"
  [[ -n "$url" ]] || { echo "No WAV URL for Mixkit $id" >&2; exit 1; }
  curl -fsSL -L -A "$UA" -e "$REF" -o "$dest" "$url"
  file "$dest" | grep -q 'WAVE audio' || { echo "Not audio: $dest" >&2; exit 1; }
}

curl -fsSL -L -A "$UA" -e "$REF" -o "$OUT/music/race-worldbeat.wav" "$(resolve_mixkit_sfx 466)"
curl -fsSL -L -A "$UA" -e "$REF" -o "$OUT/sfx/crowd-cheer.wav" "$(resolve_mixkit_sfx 462)"
curl -fsSL -L -A "$UA" -e "$REF" -o "$OUT/sfx/stadium-crowd.wav" "$(resolve_mixkit_sfx 2111)"
curl -fsSL -L -A "$UA" -e "$REF" -o "$OUT/sfx/whistle-start.wav" "$(resolve_mixkit_sfx 615)"

PASS="$OUT/sfx/pass-by"
download_wav 1538 "$PASS/car-fast-driveby.wav"
download_wav 1484 "$PASS/car-swoosh.wav"
tmp_pass="$PASS/.pass-full.wav"
download_wav 1554 "$tmp_pass"
ffmpeg -y -i "$tmp_pass" -t 5.5 -af "afade=t=out:st=4.5:d=1" "$PASS/car-pass-ambience.wav" >/dev/null 2>&1
rm -f "$tmp_pass"

echo "Audio assets refreshed in $OUT"
