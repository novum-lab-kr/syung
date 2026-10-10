"""KST 날짜 · 시각 도우미(서울시 API 의 하루 한도는 한국 날짜로 돈다)."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

KST = timezone(timedelta(hours=9))


def iso(timestamp: float) -> str:
    return datetime.fromtimestamp(timestamp, timezone.utc).isoformat()


def day_bounds(now: float) -> tuple[str, float]:
    local = datetime.fromtimestamp(now, KST)
    midnight = (local + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
    return local.date().isoformat(), midnight.timestamp()


def kst_today() -> str:
    return datetime.now(KST).strftime("%Y-%m-%d")   # the key's daily quota runs on Korean days
