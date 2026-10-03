#!/usr/bin/env python3
"""Upgrade bus paths to official road geometry, retaining the static v1 contract.

Requires approval for data.go.kr service 15000193, using SEOUL_BUS_SERVICE_KEY.
Default: at most 450 calls, one per second, leave 100 calls in the shared daily
budget. Every attempt is recorded BEFORE network I/O. Cache survives interruption.
    python3 pipeline/bus_fetch_paths.py --env-file /etc/subway-live.env
    python3 pipeline/bus_fetch_paths.py --offline
Use --refresh after rebuilding monthly stop sequences to refresh road geometry.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import shlex
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from pipeline.bus_build_static import write_json  # noqa: E402
from server.bus_live_proxy import BusError, Config, QuotaLedger, iso, parse_payload  # noqa: E402

API_URL = "http://ws.bus.go.kr/api/rest/busRouteInfo/getRoutePath"


def route_signature(route: dict) -> str:
    return hashlib.sha256(json.dumps([route["id"], route["stopIds"], route.get("stopSequences")],
                                    separators=(",", ":")).encode()).hexdigest()


def geometry(rows: list[dict], tolerance: float = 3) -> list[list[float]]:
    """WGS84 points in official order, simplified by finite-segment distance."""
    try:
        ordered = sorted(rows, key=lambda row: int(row["no"]))
        numbers = [int(row["no"]) for row in ordered]
        if len(numbers) != len(set(numbers)):
            raise ValueError("duplicate path sequence")
        points = []
        for row in ordered:
            point = [round(float(row["gpsX"]), 6), round(float(row["gpsY"]), 6)]
            if not (all(math.isfinite(v) for v in point) and 124 < point[0] < 132 and 33 < point[1] < 40):
                raise ValueError("invalid WGS84 point")
            if not points or point != points[-1]:
                points.append(point)
    except (KeyError, TypeError, ValueError, OverflowError):
        raise BusError("invalid_payload") from None
    if len(points) < 2:
        raise BusError("invalid_payload")
    factor_x = 111_320 * math.cos(math.radians(points[0][1]))
    xy = [(p[0] * factor_x, p[1] * 111_320) for p in points]
    keep, stack = {0, len(points) - 1}, [(0, len(points) - 1)]
    while stack:
        left, right = stack.pop()
        ax, ay = xy[left]
        dx, dy = xy[right][0] - ax, xy[right][1] - ay
        length_squared = dx * dx + dy * dy
        best, index = tolerance * tolerance, None
        for i in range(left + 1, right):
            px, py = xy[i]
            projection = max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / length_squared)) if length_squared else 0
            distance = (px - ax - projection * dx) ** 2 + (py - ay - projection * dy) ** 2
            if distance > best:
                best, index = distance, i
        if index is not None:
            keep.add(index)
            stack.extend(((left, index), (index, right)))
    return [points[i] for i in sorted(keep)]


def fetch(route_id: str, config: Config) -> list[dict]:
    query = urllib.parse.urlencode({"serviceKey": urllib.parse.unquote(config.key),
                                   "busRouteId": route_id, "resultType": "json"})
    request = urllib.request.Request(API_URL + "?" + query, headers={"User-Agent": "syung-bus-static/1.0"})
    try:
        with urllib.request.urlopen(request, timeout=config.timeout) as response:
            raw = response.read(2_000_001)
    except urllib.error.HTTPError as error:
        raise BusError("upstream_auth" if error.code in (401, 403) else
                       "upstream_quota" if error.code == 429 else "upstream_error") from None
    except (OSError, urllib.error.URLError, ValueError):
        raise BusError("upstream_error") from None
    return parse_payload(raw)


def load_key(env_file: Path | None) -> str:
    key = os.environ.get("SEOUL_BUS_SERVICE_KEY", "").strip()
    if env_file:
        for line in env_file.read_text().splitlines():
            name, separator, value = line.partition("=")
            if separator and name.strip() == "SEOUL_BUS_SERVICE_KEY":
                parts = shlex.split(value, comments=True)
                key = parts[0] if parts else ""
    return key


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--env-file", type=Path)
    parser.add_argument("--out", type=Path, default=ROOT / "data/bus")
    parser.add_argument("--cache", type=Path, default=ROOT / "build/bus-source/api-paths")
    parser.add_argument("--offline", action="store_true")
    parser.add_argument("--refresh", action="store_true")
    parser.add_argument("--max-calls", type=int, default=450)
    parser.add_argument("--reserve", type=int, default=100, help="leave this many calls for live positions")
    parser.add_argument("--interval", type=float, default=1, help="minimum seconds between attempts (at least 1)")
    args = parser.parse_args()
    config = Config.from_env()
    config.key = load_key(args.env_file)
    if not args.offline and not config.key:
        parser.error("SEOUL_BUS_SERVICE_KEY is required; use --env-file or --offline")
    ledger = QuotaLedger(config)
    payload = json.loads((args.out / "routes.json").read_text())
    stops_payload = json.loads((args.out / "stops.json").read_text())
    manifest = json.loads((args.out / "manifest.json").read_text())
    args.cache.mkdir(parents=True, exist_ok=True)
    calls, errors, upgraded, points_before, points_after, next_request = 0, [], 0, 0, 0, 0
    for index, route in enumerate(payload["routes"]):
        rid = route["id"]
        cache_path = args.cache / f"{rid}.json"
        cached = None
        try:
            if cache_path.exists() and not args.refresh:
                candidate = json.loads(cache_path.read_text())
                if (candidate.get("routeId") == rid
                        and candidate.get("stopSignature", route_signature(route)) == route_signature(route)
                        and candidate.get("fetchedAt", "")[:10] >= payload["source"]["updatedAt"]):
                    geometry(candidate["rows"])
                    cached = candidate
            if cached is None:
                if args.offline or calls >= max(0, args.max_calls):
                    continue
                now = time.time()
                if ledger.view(now)["remaining"] <= max(0, args.reserve):
                    break
                if next_request > now:
                    time.sleep(min(30, next_request - now))
                allowed, reason, _ = ledger.reserve(time.time(), paced=False, reserve_calls=max(0, args.reserve))
                if not allowed:
                    break
                calls += 1
                next_request = time.time() + max(1, min(30, args.interval))
                rows = fetch(rid, config)
                geometry(rows)
                cached = {"routeId": rid, "stopSignature": route_signature(route), "fetchedAt": iso(time.time()), "rows": rows}
                temporary = cache_path.with_suffix(".tmp")
                temporary.write_text(json.dumps(cached, ensure_ascii=False, separators=(",", ":")))
                temporary.replace(cache_path)
            path = geometry(cached["rows"])
            route.update(path=path, pathSource="api", pathFetchedAt=cached["fetchedAt"])
            # Include stop extents too, since curb coordinates can lie outside the road centreline.
            west, south, east, north = route["bbox"]
            route["bbox"] = [min(west, min(p[0] for p in path)), min(south, min(p[1] for p in path)),
                             max(east, max(p[0] for p in path)), max(north, max(p[1] for p in path))]
            upgraded += 1
            points_before += len(cached["rows"])
            points_after += len(path)
        except (BusError, ValueError, KeyError, OSError) as error:
            code = error.code if isinstance(error, BusError) else "invalid_payload"
            errors.append({"routeId": rid, "code": code})
            if code in ("upstream_auth", "upstream_quota", "quota_storage"):
                break
        if (index + 1) % 25 == 0:
            print(json.dumps({"processed": index + 1, "total": len(payload["routes"]), "upstreamCalls": calls,
                              "officialPaths": upgraded, "errors": len(errors)}, ensure_ascii=False), flush=True)
    now = iso(time.time())
    road_count = sum(route["pathSource"] == "api" for route in payload["routes"])
    path_info = {"url": API_URL, "collectedAt": now, "officialRoutes": road_count,
                 "approximateRoutes": len(payload["routes"]) - road_count, "simplificationMetres": 3,
                 "inputPoints": points_before, "outputPoints": points_after}
    payload["source"]["paths"] = path_info
    payload["generatedAt"] = now
    manifest["source"] = payload["source"]
    manifest["generatedAt"] = now
    manifest["pathQuality"] = path_info
    manifest["pathErrors"] = errors
    manifest["files"]["routes.json"] = write_json(args.out / "routes.json", payload)
    # Stop file is unchanged, but retain its published byte count/checksum.
    assert stops_payload["schemaVersion"] == payload["schemaVersion"] == 1
    write_json(args.out / "manifest.json", manifest)
    print(json.dumps({"pathQuality": path_info, "upstreamCalls": calls, "errors": errors,
                      "quota": ledger.view(time.time()), "files": manifest["files"]}, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
