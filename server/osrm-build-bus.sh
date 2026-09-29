#!/usr/bin/env bash
# OSRM bus-road routing for South Korea: the car profile with bus/psv access (bus lanes, bus-only
# roads) — used offline by pipeline/build_bus_shapes.py to draw bus routes along roads.
# Reads the foot build's extract (server/osrm-build.sh); profile: server/osrm-bus.lua
set -euo pipefail
mkdir -p /var/lib/osrm/bus && cp "$(dirname "$0")/osrm-bus.lua" /var/lib/osrm/bus/bus.lua
[ -d /var/lib/osrm/bus/lib ] || docker run --rm -v /var/lib/osrm/bus:/out ghcr.io/project-osrm/osrm-backend:v6.0.0 cp -r /opt/lib /out/
cd /var/lib/osrm/bus
IMG=ghcr.io/project-osrm/osrm-backend:v6.0.0
ln -f ../south-korea-latest.osm.pbf south-korea-latest.osm.pbf
echo "$(date -u +%T) extract"; docker run --rm -v /var/lib/osrm/bus:/data $IMG osrm-extract -p /data/bus.lua /data/south-korea-latest.osm.pbf
echo "$(date -u +%T) partition"; docker run --rm -v /var/lib/osrm/bus:/data $IMG osrm-partition /data/south-korea-latest.osrm
echo "$(date -u +%T) customize"; docker run --rm -v /var/lib/osrm/bus:/data $IMG osrm-customize /data/south-korea-latest.osrm
echo "$(date -u +%T) done"
# shapes: run the router only while building them
#   docker run -d --rm --name osrm-bus -p 127.0.0.1:5001:5000 -v /var/lib/osrm/bus:/data $IMG osrm-routed --algorithm mld --max-matching-size 500 /data/south-korea-latest.osrm
#   python3 pipeline/build_bus_shapes.py && docker stop osrm-bus && systemctl restart subway-live
