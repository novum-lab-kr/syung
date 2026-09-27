#!/usr/bin/env bash
# Publish the map: web/ + the built data files → a static folder served by the web server.
# Usage: deploy/deploy.sh [target ...]   (default: the current production folder)
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
TARGETS=("$@")
[ ${#TARGETS[@]} -eq 0 ] && TARGETS=(/var/www/syung)   # syung.nol-meok.cloud
for d in "${TARGETS[@]}"; do
  mkdir -p "$d/vendor"
  cp "$ROOT/web/index.html" "$ROOT/web/maplibre_runtime.mjs" "$ROOT/web/site.webmanifest" "$ROOT/web/syung.css" "$d/"
  mkdir -p "$d/brand" && cp "$ROOT"/web/brand/* "$d/brand/"
  cp "$ROOT"/web/vendor/* "$d/vendor/"
  mkdir -p "$d/lib" && cp "$ROOT"/web/lib/*.mjs "$d/lib/"
  cp "$ROOT/data/osm-tracks/track_shapes.json" "$ROOT/data/osm-tracks/exits.json" "$ROOT/data/ktdb-gtfs-2025/edge_times.json" "$d/"
  # live timing: the nightly retrained copy (pipeline/retrain_live_timing.py) when there is one
  if [ -f /var/lib/subway-live/live-timing.json ]; then cp /var/lib/subway-live/live-timing.json "$d/"; else cp "$ROOT/data/live-timing.json" "$d/"; fi
  echo "deployed → $d"
done
