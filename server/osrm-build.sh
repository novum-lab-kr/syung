#!/usr/bin/env bash
# OSRM foot routing for South Korea (OpenStreetMap, Geofabrik extract) — built for 슝 walking times
set -euo pipefail
cd /var/lib/osrm
IMG=ghcr.io/project-osrm/osrm-backend:v6.0.0
echo "$(date -u +%T) download"; curl -fsSL -o south-korea-latest.osm.pbf https://download.geofabrik.de/asia/south-korea-latest.osm.pbf
ls -la south-korea-latest.osm.pbf
docker pull -q $IMG
echo "$(date -u +%T) extract"; docker run --rm -v /var/lib/osrm:/data $IMG osrm-extract -p /opt/foot.lua /data/south-korea-latest.osm.pbf
echo "$(date -u +%T) partition"; docker run --rm -v /var/lib/osrm:/data $IMG osrm-partition /data/south-korea-latest.osrm
echo "$(date -u +%T) customize"; docker run --rm -v /var/lib/osrm:/data $IMG osrm-customize /data/south-korea-latest.osrm
echo "$(date -u +%T) done"
