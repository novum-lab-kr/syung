#!/usr/bin/env bash
# Publish the map: web/ + the built data files → a static folder served by the web server.
# Usage: deploy/deploy.sh [target ...]   (default: the current production folder)
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
TARGETS=("$@")
[ ${#TARGETS[@]} -eq 0 ] && TARGETS=(/var/www/syung)   # syung.novum-lab.com
for d in "${TARGETS[@]}"; do
  mkdir -p "$d/vendor"
  cp "$ROOT/web/index.html" "$ROOT/web/learning.html" "$ROOT/web/login.html" "$ROOT/web/maplibre_runtime.mjs" "$ROOT/web/site.webmanifest" "$ROOT/web/syung.css" "$d/"
  # learning.html (+ learning.json from the nightly retrain) is owner-only: Caddy basic_auth
  mkdir -p "$d/brand" && cp "$ROOT"/web/brand/* "$d/brand/"
  cp "$ROOT"/web/vendor/* "$d/vendor/"
  mkdir -p "$d/lib" && cp "$ROOT"/web/lib/*.mjs "$d/lib/"
  # 본체에서 나눈 화면 코드 폴더
  for sub in trains map modes modes/basic modes/simcity modes/joseon modes/coaster ui; do mkdir -p "$d/$sub" && cp "$ROOT/web/$sub/"*.mjs "$d/$sub/"; done
  # bus: keep the v1 static URLs separate from the journey planner's bus.json.
  if [ -f "$ROOT/data/bus/routes.json" ]; then
    mkdir -p "$d/data/bus"
    cp "$ROOT"/data/bus/*.json "$d/data/bus/"
  fi
  cp "$ROOT/data/osm-tracks/track_shapes.json" "$ROOT/data/osm-tracks/exits.json" "$ROOT/data/ktdb-gtfs-2025/edge_times.json" "$d/"
  cp "$ROOT/data/osm-tracks/coaster_buildings.bin" "$ROOT/data/osm-tracks/coaster_towers.json" "$d/"   # 롤러코스터: building heights along the lines
  # live timing: the nightly retrained copy (pipeline/retrain_live_timing.py) when there is one
  if [ -f /var/lib/subway-live/live-timing.json ]; then cp /var/lib/subway-live/live-timing.json "$d/"; else cp "$ROOT/data/live-timing.json" "$d/"; fi
  echo "deployed → $d"
done
