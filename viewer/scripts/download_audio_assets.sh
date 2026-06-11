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

download_music() {
  local id="$1" dest="$2"
  curl -fsSL -A "$UA" -e "$REF" -o "$dest" "https://assets.mixkit.co/music/${id}/${id}.mp3"
}

download_music 614 "$OUT/music/menu-ambient.mp3"
download_music 127 "$OUT/music/menu-valley-sunset.mp3"
download_music 139 "$OUT/music/menu-spirit-woods.mp3"
download_music 251 "$OUT/music/menu-zanarkand.mp3"
download_music 292 "$OUT/music/menu-relax-beat.mp3"
download_music 749 "$OUT/music/menu-relaxation-05.mp3"
download_music 138 "$OUT/music/menu-forest-treasure.mp3"
download_music 324 "$OUT/music/menu-smooth-meditation.mp3"

download_music 676 "$OUT/music/race-tension.mp3"
download_music 51 "$OUT/music/race-sports-highlights.mp3"
download_music 706 "$OUT/music/race-games-music.mp3"
download_music 80 "$OUT/music/race-daredevil.mp3"
download_music 124 "$OUT/music/race-techno-fest.mp3"
download_music 126 "$OUT/music/race-trap-electro.mp3"
download_music 777 "$OUT/music/race-a-game.mp3"
download_music 50 "$OUT/music/race-rought-ready.mp3"

download_music 76 "$OUT/music/briefing-epic-games.mp3"
download_music 724 "$OUT/music/briefing-placeit-world.mp3"
download_music 464 "$OUT/music/briefing-sci-fi-score.mp3"
download_music 871 "$OUT/music/briefing-fright-night.mp3"
download_music 188 "$OUT/music/briefing-echoes.mp3"
download_music 565 "$OUT/music/briefing-fallen.mp3"
download_music 538 "$OUT/music/briefing-nield-grohm.mp3"

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
if command -v ffmpeg >/dev/null 2>&1; then
  ffmpeg -y -i "$tmp_pass" -t 5.5 -af "afade=t=out:st=4.5:d=1" "$PASS/car-pass-ambience.wav" >/dev/null 2>&1
else
  cp "$tmp_pass" "$PASS/car-pass-ambience.wav"
fi
rm -f "$tmp_pass"

echo "Audio assets refreshed in $OUT"
