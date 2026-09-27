#!/usr/bin/env bash
# Publish the map: web/ + the built data files → a static folder served by the web server.
# Usage: deploy/deploy.sh [target ...]   (default: the current production folder)
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
TARGETS=("$@")
[ ${#TARGETS[@]} -eq 0 ] && TARGETS=(/var/www/syung)   # syung.nol-meok.cloud
for d in "${TARGETS[@]}"; do
  mkdir -p "$d/vendor"
  cp "$ROOT/web/index.html" "$ROOT/web/maplibre_runtime.mjs" "$ROOT/web/site.webmanifest" "$d/"
  mkdir -p "$d/brand" && cp "$ROOT"/web/brand/* "$d/brand/"
  cp "$ROOT"/web/vendor/* "$d/vendor/"
  mkdir -p "$d/lib" && cp "$ROOT"/web/lib/*.mjs "$d/lib/"
  cp "$ROOT/data/osm-tracks/track_shapes.json" "$ROOT/data/osm-tracks/exits.json" "$ROOT/data/ktdb-gtfs-2025/edge_times.json" "$d/"
  echo "deployed → $d"
done
