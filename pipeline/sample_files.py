"""The collected live records on disk: one file a day (KST) per source, gzipped once the day is over.

/var/lib/subway-live/samples/YYYYMMDD.jsonl[.gz]    all-stations feed (sample_live_positions.py)
/var/lib/subway-live/position/YYYYMMDD.jsonl[.gz]   position feed (the proxy's bursts and overlay)
/var/lib/subway-live/bus/YYYYMMDD.jsonl[.gz]        bus positions the bus proxy fetched (compressed only)
The day being written stays plain; compress_old() gzips the earlier ones (~18× smaller) and every
reader goes through lines(), which reads either.
"""

from __future__ import annotations

import gzip
import os
from datetime import date
from pathlib import Path
from typing import Iterator

STATE = Path("/var/lib/subway-live")
SOURCES = ("samples", "position")
BUS = "bus"   # 버스 위치(server/store/records.py record_bus) — 지하철 학습(day_files)에는 넣지 않고 압축만 같이 한다


def lines(path: str | Path) -> Iterator[str]:
    p = Path(path)
    opener = gzip.open if p.suffix == ".gz" else open
    with opener(p, "rt", encoding="utf-8") as f:
        for row in f:
            if row.strip():
                yield row


def day_of(path: Path) -> date | None:
    stem = path.name.split(".", 1)[0]
    return date(int(stem[:4]), int(stem[4:6]), int(stem[6:8])) if len(stem) == 8 and stem.isdigit() else None


def day_files(d: date, state: Path = STATE) -> list[Path]:
    out = []
    for sub in SOURCES:
        for name in (f"{d:%Y%m%d}.jsonl", f"{d:%Y%m%d}.jsonl.gz"):
            if (state / sub / name).exists():
                out.append(state / sub / name)
                break
    return out


def all_days(state: Path = STATE) -> list[date]:
    return sorted({d for sub in SOURCES for p in (state / sub).glob("*.jsonl*") if (d := day_of(p))})


def compress_old(today: date, state: Path = STATE) -> list[str]:
    """gzip every plain day file before `today`; the original goes only once the copy reads back whole."""
    done = []
    for sub in (*SOURCES, BUS):
        for p in sorted((state / sub).glob("*.jsonl")):
            d = day_of(p)
            if d is None or d >= today:
                continue
            gz = p.with_name(p.name + ".gz")
            tmp = gz.with_name(gz.name + ".tmp")
            with open(p, "rb") as src, gzip.open(tmp, "wb", compresslevel=9) as dst:
                while chunk := src.read(1 << 20):
                    dst.write(chunk)
            with gzip.open(tmp, "rb") as check:
                size = sum(len(c) for c in iter(lambda: check.read(1 << 20), b""))
            if size != p.stat().st_size:
                tmp.unlink()
                raise OSError(f"{tmp}: {size} bytes back, {p.stat().st_size} written")
            os.replace(tmp, gz)
            p.unlink()
            done.append(f"{sub}/{gz.name}")
    return done
