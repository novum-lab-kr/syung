"""버스 API 하루 호출 장부(위치 · 도착이 파일을 따로 쓴다). 여러 프로세스가 같이 써도 되게 flock 으로 센다."""
from __future__ import annotations

import fcntl
import json
import math
import os

from server.clock import day_bounds
from server.errors import BusError

NIGHT_END, NIGHT_WEIGHT = 5 * 60, 0.25   # KST 00~05시는 버스가 거의 없다: 호출 간격을 4배로 두고 아낀 몫을 낮에 쓴다


def pacing(now: float, midnight: float, left: int) -> float:
    """Seconds between calls so `left` calls last until midnight: the night (00–05 KST) counts
    NIGHT_WEIGHT of its length, so a night call comes 1/NIGHT_WEIGHT times as far apart."""
    night_end = midnight - 86400 + NIGHT_END * 60
    night = max(0.0, night_end - now)
    weighted = NIGHT_WEIGHT * night + (midnight - max(now, night_end))
    return weighted / max(1, left) / (NIGHT_WEIGHT if night else 1)


class QuotaLedger:
    """Count BEFORE I/O, atomically, including failures and across restarts/processes."""
    def __init__(self, config):
        self.path, self.limit, self.min_interval = config.quota_file, config.daily_limit, config.min_interval

    def _read(self, now: float) -> dict:
        day, _ = day_bounds(now)
        try:
            saved = json.loads(self.path.read_text())
        except FileNotFoundError:
            return {"day": day, "used": 0, "nextAt": 0}
        except (OSError, ValueError):
            raise BusError("quota_storage") from None
        if not isinstance(saved, dict) or not isinstance(saved.get("day"), str):
            raise BusError("quota_storage")
        if saved["day"] != day:
            return {"day": day, "used": 0, "nextAt": 0}
        if (type(saved.get("used")) is not int or saved["used"] < 0
                or not isinstance(saved.get("nextAt"), (int, float))
                or not math.isfinite(saved["nextAt"])):
            raise BusError("quota_storage")
        return saved

    def view(self, now: float) -> dict:
        saved = self._read(now)
        return {"day": saved["day"], "used": saved["used"], "limit": self.limit,
                "remaining": max(0, self.limit - saved["used"])}

    def reserve(self, now: float, *, paced: bool = True, reserve_calls: int = 0) -> tuple[bool, str, float]:
        """paced=False is only for an explicit, bounded static-data collection job.

        It still shares the same hard daily limit and advances the live poll gate.
        No HTTP request parameter can change this policy.
        """
        try:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            with self.path.with_suffix(".lock").open("a") as lock:
                fcntl.flock(lock, fcntl.LOCK_EX)
                saved = self._read(now)
                _, midnight = day_bounds(now)
                if saved["used"] >= self.limit - max(0, reserve_calls):
                    return False, "daily_limit", midnight
                if paced and now < saved["nextAt"]:
                    return False, "paced", saved["nextAt"]
                # GLOBAL spacing, not an independent allowance for each route/viewer.
                interval = max(self.min_interval, pacing(now, midnight, self.limit - saved["used"]))
                saved.update(used=saved["used"] + 1, nextAt=max(saved["nextAt"], now + interval))
                temporary = self.path.with_suffix(".tmp")
                with temporary.open("w") as output:
                    json.dump(saved, output, separators=(",", ":"))
                    output.flush()
                    os.fsync(output.fileno())
                temporary.replace(self.path)
                return True, "", saved["nextAt"]
        except OSError:
            raise BusError("quota_storage") from None
