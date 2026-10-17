#!/bin/bash
# Full-quality frame renders + offline game audio for a list of shots, one browser at a time.
#   tools/video/render_all.sh <module> <frames-root> shot1 shot2 ...
# (needs the Vite dev server: npx vite --port 5245 --host 127.0.0.1)
cd "$(dirname "$0")/../.."
mod=$1; root=$2; shift 2
for s in "$@"; do
  out=$root/$s
  mkdir -p "$out"
  echo "[$(date +%H:%M:%S)] render $s"
  timeout 14400 node tools/video/render.mjs "$mod" "$s" --out "$out" > "$out/render.log" 2>&1
  grep -E "done:|Error|error" "$out/render.log" | head -6
  timeout 1800 node tools/video/sfx.mjs "$out" 2>&1 | tail -2
done
echo "[$(date +%H:%M:%S)] all done"
