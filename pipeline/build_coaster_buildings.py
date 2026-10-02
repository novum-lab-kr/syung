#!/usr/bin/env python3
"""Building heights along the lines, for the 롤러코스터 → data/osm-tracks/coaster_buildings.bin + coaster_towers.json.

The map only loads buildings for the view, but the coaster's heights must be the same everywhere and always (trains
and track agree, nothing jumps as tiles load), so they are taken once from the OpenFreeMap z14 vector tiles
(layer `building`, `render_height`) over a corridor 700 m either side of every track shape and station.

coaster_buildings.bin, little-endian: "CBLD", u32 version 1, f64 x0, f64 y0, f64 cell (web mercator units 0..1, a
20 m cell at 37.5°N), u32 width, u32 height, u32 n, then n u32 cell indexes (iy * width + ix, ascending) and n u8
u16 heights (the highest building over the cell's centre, in m rounded up). Only cells with a building of 8 m or
more.
coaster_towers.json: [[lon, lat, footprint radius m, height m], ...] for buildings of 150 m or more (parts merged).
"""

from __future__ import annotations

import gzip
import json
import math
import struct
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SHAPES = ROOT / "data" / "osm-tracks" / "track_shapes.json"
OUT = ROOT / "data" / "osm-tracks" / "coaster_buildings.bin"
TOWERS = ROOT / "data" / "osm-tracks" / "coaster_towers.json"
TILES = Path.home() / ".cache" / "subway-coaster-tiles"   # downloaded tiles (not in git)
TILEJSON = "https://tiles.openfreemap.org/planet"
Z, PAD_M, CELL_M, MIN_H, TOWER_H = 14, 700, 20, 8, 150
UA = {"User-Agent": "syung-subway-map coaster build"}
MU = 1 / (40075016.686 * math.cos(math.radians(37.5)))   # mercator units a metre at 37.5°N


# ---- a small Mapbox Vector Tile reader (protobuf) ----
def varint(b: bytes, i: int) -> tuple[int, int]:
    r = s = 0
    while True:
        x = b[i]
        i += 1
        r |= (x & 0x7F) << s
        s += 7
        if x < 0x80:
            return r, i


def fields(b: bytes):
    i, n = 0, len(b)
    while i < n:
        k, i = varint(b, i)
        f, t = k >> 3, k & 7
        if t == 0:
            v, i = varint(b, i)
        elif t == 2:
            ln, i = varint(b, i)
            v = b[i:i + ln]
            i += ln
        elif t == 1:
            v, i = b[i:i + 8], i + 8
        elif t == 5:
            v, i = b[i:i + 4], i + 4
        else:
            raise ValueError(f"wire type {t}")
        yield f, v


def packed(b: bytes) -> list[int]:
    out, i = [], 0
    while i < len(b):
        v, i = varint(b, i)
        out.append(v)
    return out


def value(b: bytes):
    for f, v in fields(b):
        if f == 1:
            return v.decode()
        if f == 2:
            return struct.unpack("<f", v)[0]
        if f == 3:
            return struct.unpack("<d", v)[0]
        if f in (4, 5):
            return v
        if f == 6:
            return (v >> 1) ^ -(v & 1)
        if f == 7:
            return bool(v)
    return None


def rings(g: list[int]) -> list[list[tuple[int, int]]]:
    out, cur, x, y, i = [], [], 0, 0, 0
    while i < len(g):
        c = g[i]
        i += 1
        cmd, cnt = c & 7, c >> 3
        if cmd == 7:
            if cur:
                out.append(cur)
                cur = []
            continue
        for _ in range(cnt):
            dx, dy = g[i], g[i + 1]
            i += 2
            x += (dx >> 1) ^ -(dx & 1)
            y += (dy >> 1) ^ -(dy & 1)
            if cmd == 1 and cur:
                out.append(cur)
                cur = []
            cur.append((x, y))
    if cur:
        out.append(cur)
    return out


def buildings(data: bytes):
    """(render_height, rings in tile units, extent) of each building feature."""
    for f, v in fields(data):
        if f != 3:
            continue
        name, keys, vals, feats, ext = None, [], [], [], 4096
        for g, w in fields(v):
            if g == 1:
                name = w.decode()
            elif g == 3:
                keys.append(w.decode())
            elif g == 4:
                vals.append(value(w))
            elif g == 2:
                feats.append(w)
            elif g == 5:
                ext = w
        if name != "building":
            continue
        for fb in feats:
            tags, geom = [], []
            for g, w in fields(fb):
                if g == 2:
                    tags = packed(w)
                elif g == 4:
                    geom = packed(w)
            props = {keys[tags[k]]: vals[tags[k + 1]] for k in range(0, len(tags), 2)}
            h = props.get("render_height")
            if isinstance(h, (int, float)) and h >= MIN_H:
                yield float(h), rings(geom), ext


# ---- tiles ----
def merc(lon: float, lat: float) -> tuple[float, float]:
    return (lon + 180) / 360, (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2


def fetch(url: str, z: int, x: int, y: int) -> bytes:
    path = TILES / f"{z}-{x}-{y}.pbf"
    if path.exists():
        return path.read_bytes()
    for attempt in range(4):
        try:
            req = urllib.request.Request(url.format(z=z, x=x, y=y), headers=UA)
            b = urllib.request.urlopen(req, timeout=40).read()
            break
        except Exception:
            if attempt == 3:
                raise
            time.sleep(2 * (attempt + 1))
    if b[:2] == b"\x1f\x8b":
        b = gzip.decompress(b)
    path.write_bytes(b)
    return b


def corridor_tiles() -> set[tuple[int, int]]:
    d = json.loads(SHAPES.read_text(encoding="utf-8"))
    pts = [c for cs in d["edges"].values() for c in cs] + [c for c in d["stops"].values() if isinstance(c, list) and len(c) == 2 and isinstance(c[0], (int, float))]
    n, pad = 2 ** Z, PAD_M * MU
    out = set()
    for lon, lat in pts:
        x, y = merc(lon, lat)
        for ix in range(int((x - pad) * n), int((x + pad) * n) + 1):
            for iy in range(int((y - pad) * n), int((y + pad) * n) + 1):
                out.add((ix, iy))
    return out


def main() -> None:
    TILES.mkdir(parents=True, exist_ok=True)
    url = json.loads(urllib.request.urlopen(urllib.request.Request(TILEJSON, headers=UA), timeout=30).read())["tiles"][0]
    tiles = sorted(corridor_tiles())
    n, C = 2 ** Z, CELL_M * MU
    x0 = min(t[0] for t in tiles) / n
    y0 = min(t[1] for t in tiles) / n
    W = int((max(t[0] for t in tiles) + 1) / n / C - x0 / C) + 1
    H = int((max(t[1] for t in tiles) + 1) / n / C - y0 / C) + 1
    cells: dict[int, int] = {}
    towers: list[list[float]] = []
    print(f"{len(tiles)} tiles, grid {W}×{H}", file=sys.stderr)
    for k, (tx, ty) in enumerate(tiles):
        if k % 200 == 0:
            print(f"  {k}/{len(tiles)}", file=sys.stderr)
        for h, rs, ext in buildings(fetch(url, Z, tx, ty)):
            # tile units → mercator; each ring set filled even-odd (holes stay empty)
            M = [[((tx + px / ext) / n, (ty + py / ext) / n) for px, py in r] for r in rs]
            ys = [p[1] for r in M for p in r]
            xs = [p[0] for r in M for p in r]
            for iy in range(int((min(ys) - y0) / C), int((max(ys) - y0) / C) + 1):
                cy = y0 + (iy + .5) * C
                cross = []
                for r in M:
                    for i in range(len(r)):
                        (ax, ay), (bx, by) = r[i - 1], r[i]
                        if (ay > cy) != (by > cy):
                            cross.append(ax + (cy - ay) * (bx - ax) / (by - ay))
                cross.sort()
                for a, b in zip(cross[::2], cross[1::2]):
                    for ix in range(math.ceil((a - x0) / C - .5), math.floor((b - x0) / C - .5) + 1):
                        if 0 <= ix < W and 0 <= iy < H:
                            key = iy * W + ix
                            hh = math.ceil(h)
                            if cells.get(key, 0) < hh:
                                cells[key] = hh
            if h >= TOWER_H:
                cx, cy = sum(xs) / len(xs), sum(ys) / len(ys)
                rad = max(math.hypot(x - cx, y - cy) for x, y in zip(xs, ys)) / MU
                towers.append([cx, cy, rad, h])
    # tower parts (and the same tower in two tiles) within 80 m of a taller one join it
    towers.sort(key=lambda t: -t[3])
    merged: list[list[float]] = []
    for t in towers:
        m = next((m for m in merged if math.hypot(m[0] - t[0], m[1] - t[1]) / MU < 80), None)
        if m:
            m[2] = max(m[2], math.hypot(m[0] - t[0], m[1] - t[1]) / MU + t[2])
        else:
            merged.append(list(t))
    keys = sorted(cells)
    with OUT.open("wb") as f:
        f.write(b"CBLD" + struct.pack("<IdddIII", 1, x0, y0, C, W, H, len(keys)))
        f.write(struct.pack(f"<{len(keys)}I", *keys))
        f.write(struct.pack(f"<{len(keys)}H", *(cells[k] for k in keys)))
    out = []
    for x, y, rad, h in merged:
        lon = x * 360 - 180
        lat = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * y))))
        out.append([round(lon, 6), round(lat, 6), round(min(rad, 120)), round(h)])
    TOWERS.write_text(json.dumps(out, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"{len(keys)} cells, {OUT.stat().st_size // 1024} KB; {len(out)} towers", file=sys.stderr)


if __name__ == "__main__":
    main()
