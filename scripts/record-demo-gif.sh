#!/usr/bin/env bash
# Render a short synthetic OpenKlip-style demo GIF for the README.
# Usage: bash scripts/record-demo-gif.sh [--dry-run]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${ROOT}/docs/demo.gif"
WIDTH=640
FPS=12
DURATION=6

if [[ "${1:-}" == "--dry-run" ]]; then
  echo "Would write ${OUT} (${WIDTH}px wide, ${DURATION}s @ ${FPS}fps)"
  echo "ffmpeg -y -f lavfi -i color=c=0x111111:s=${WIDTH}x360:d=${DURATION} ..."
  echo "ffmpeg palettegen/paletteuse pipeline"
  exit 0
fi

command -v ffmpeg >/dev/null 2>&1 && FFMPEG=ffmpeg || FFMPEG=""
if [[ -z "${FFMPEG}" && -x "${ROOT}/node_modules/ffmpeg-static/ffmpeg" ]]; then
  FFMPEG="${ROOT}/node_modules/ffmpeg-static/ffmpeg"
fi
if [[ -z "${FFMPEG}" ]]; then
  echo "ffmpeg not found; install ffmpeg or run npm install in the repo root."
  exit 1
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# Synthetic preview strip: dark background + moving accent bar (no project required).
"${FFMPEG}" -hide_banner -loglevel error -y \
  -f lavfi -i "color=c=0x111111:s=${WIDTH}x360:d=${DURATION}" \
  -f lavfi -i "color=c=0x3b82f6:s=120x8:d=${DURATION}" \
  -filter_complex "[1:v]format=rgba,colorchannelmixer=aa=0.9[bar];[0:v][bar]overlay=x='mod(t*80\\,${WIDTH}-120)':y=280:format=auto,drawtext=text='OpenKlip':fontcolor=white:fontsize=28:x=24:y=24,drawtext=text='transcript-first edit loop':fontcolor=0xaaaaaa:fontsize=16:x=24:y=60,fps=${FPS}" \
  -pix_fmt yuv420p "${TMP}/preview.mp4"

"${FFMPEG}" -hide_banner -loglevel error -y -i "${TMP}/preview.mp4" \
  -vf "fps=${FPS},scale=${WIDTH}:-1:flags=lanczos,split[s0][s1];[s0]palettegen=stats_mode=diff[p];[s1][p]paletteuse=dither=bayer:bayer_scale=3" \
  -loop 0 "${OUT}"

echo "Wrote ${OUT}"
