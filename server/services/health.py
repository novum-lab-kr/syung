"""이상 감지(GET /api/health): 지금 값이 평소와 다른지 — 관제탑이 5분마다 읽어 휴대폰으로 알린다.

바깥 API 를 부르지 않는다. 이미 가진 값으로만 본다:
- 노선별 열차 수: subway-sampler 기록(30초마다 /live 전 노선, 사람이 안 봐도 늘 돈다). 최근 10분에 사건이 있던 열차 수를
  같은 운행일 종류(평일 · 토 · 일휴) · 같은 10분 칸의 평소(지난 기록의 가운데 값)와 비교해, 평소 5대 이상인 칸에서 50% 아래면 이상.
  위치 기록(position/)은 사람이 보는 노선만 읽어 노선마다 비는 날이 많아 평소 기준으로 쓰지 않았다.
- 위치 피드: 같은 순간 전 역 도착의 대수와 비교(평소 약 85%). 10분 넘게 50% 아래면 이상(7호선 2026-10-12: 3대 / 51대).
  사람이 안 보는 노선은 jobs/position_probe 가 위치 피드 예산 안에서 돌아가며 읽는다.
- 원본 오류가 10분 넘게 이어짐 · 오늘 호출 한도 바닥 · 기록이 10분 넘게 멈춤.
checks 는 정상이어도 늘 같은 key 로 다 넣는다(관제탑이 '정상으로 돌아왔어요'를 보낸다). 글에는 숫자와 이름만.
"""
from __future__ import annotations

import statistics
import threading
import time
from datetime import date, datetime, timedelta

from server.clock import KST
from server.services.live import LINE_NAMES, POSITION_PARTIAL_MIN, SubwayLiveService
from server.store.live_samples import SLOT_SECONDS, SLOTS, LiveSamples, service_slot

WINDOW = 600            # 10분
LOW_SHARE = .5          # 평소의 50% 아래
MIN_USUAL = 5           # 평소가 이보다 적은 칸은 보지 않는다
BASELINE_DAYS = 42      # 평소 기준은 최근 6주
MIN_DAYS = 2            # 같은 종류의 날이 이만큼은 있어야 평소로 친다
REPORT_SECONDS = 60     # 공개 주소라 한 번 만든 답을 1분 동안 준다
# 2026년 공휴일 · 대체 공휴일(일휴로 친다) — 해가 바뀌면 더한다
HOLIDAYS = {
    "2026-01-01", "2026-02-16", "2026-02-17", "2026-02-18", "2026-03-01", "2026-03-02", "2026-05-05",
    "2026-05-24", "2026-05-25", "2026-06-03", "2026-06-06", "2026-08-15", "2026-08-17", "2026-09-24",
    "2026-09-25", "2026-09-26", "2026-10-03", "2026-10-05", "2026-10-09", "2026-12-25",
}
LINES = list(dict.fromkeys(LINE_NAMES.values()))


def day_kind(service_day: str) -> str:
    d = date.fromisoformat(service_day)
    if service_day in HOLIDAYS or d.weekday() == 6:
        return "sunday"
    return "saturday" if d.weekday() == 5 else "weekday"


def _clock(timestamp: float) -> str:
    return datetime.fromtimestamp(timestamp, KST).strftime("%H:%M")


def _share(count: float, usual: float) -> int:
    return round(100 * count / usual) if usual else 0


class HealthService:
    def __init__(self, live: SubwayLiveService, samples: LiveSamples, *, clock=time.time):
        self.live, self.samples, self.clock = live, samples, clock
        self.lock = threading.Lock()
        self.usual: dict[tuple[str, str], list[float]] = {}   # (일 종류, 노선) → 10분 칸마다 평소 열차 수(None = 기록 부족)
        self.covered: dict[str, list[float]] = {}   # 일 종류 → 칸마다 기록이 있던 날 수
        self.baseline_day = ""
        self.report_cache: tuple[float, dict] | None = None

    # ---- 평소 기준 ------------------------------------------------------------------------

    def refresh_baseline(self, pause: float = 0.0, sleep=time.sleep) -> None:
        """지난 기록 파일(오늘 것 빼고 최근 BASELINE_DAYS 일)로 평소 기준을 다시 만든다. 하루 요약은 store 가 남겨 두 번 읽지 않는다."""
        today = datetime.fromtimestamp(self.clock(), KST)
        oldest = (today - timedelta(days=BASELINE_DAYS + 1)).strftime("%Y%m%d")
        merged: dict[str, dict[str, list[int]]] = {}
        for name in self.samples.files():
            if not oldest <= name < today.strftime("%Y%m%d"):
                continue
            for service, lines in self.samples.day_counts(name).items():
                day = merged.setdefault(service, {})
                for line, slots in lines.items():
                    old = day.get(line)
                    day[line] = slots if old is None else [max(a, b) for a, b in zip(old, slots)]
            if pause:
                sleep(pause)   # 서버 CPU 제한: 파일 사이에 쉰다
        values: dict[tuple[str, str], list[list[int]]] = {}
        covered: dict[str, list[int]] = {}
        for service, lines in merged.items():
            kind = day_kind(service)
            if not lines:
                continue
            cover = covered.setdefault(kind, [0] * SLOTS)
            # 그 칸에 어느 노선이든 기록이 있던 날만 친다(샘플러가 멈춘 칸은 0 대가 아니라 '기록 없음')
            alive = [any(slots[i] for slots in lines.values()) for i in range(len(cover))]
            for i, on in enumerate(alive):
                cover[i] += on
            for line in LINES:
                slots = lines.get(line)
                rows = values.setdefault((kind, line), [[] for _ in alive])
                for i, on in enumerate(alive):
                    if on:
                        rows[i].append(slots[i] if slots else 0)
        usual = {key: [statistics.median(v) if len(v) >= MIN_DAYS else None for v in rows] for key, rows in values.items()}
        with self.lock:
            self.usual, self.covered, self.baseline_day = usual, covered, today.strftime("%Y-%m-%d")
            self.report_cache = None

    # ---- 지금 답 --------------------------------------------------------------------------

    def report(self) -> dict:
        now = self.clock()
        with self.lock:
            if self.report_cache and now - self.report_cache[0] < REPORT_SECONDS:
                return self.report_cache[1]
        events = self.samples.recent_events(now, WINDOW * 7)
        checks = [self._feed(now), self._samples(now, events), self._quota()]
        checks += [self._line(line, now, events) for line in LINES]
        checks += [self._position(line, now) for line in LINES]
        body = {"ok": all(c["ok"] for c in checks), "checkedAt": datetime.fromtimestamp(now, KST).isoformat(timespec="seconds"),
                "baselineDay": self.baseline_day or None, "checks": checks}
        with self.lock:
            self.report_cache = (now, body)
        return body

    def _usual(self, line: str, at: float) -> float | None:
        service, slot = service_slot(at)
        rows = self.usual.get((day_kind(service), line))
        return rows[slot] if rows else None

    def _feed(self, now: float) -> dict:
        live, since = self.live, self.live.all_error_since
        if since and now - since >= WINDOW and not live.quiet():
            last = f", 마지막 성공 {_clock(live.all_ok_at)}" if live.all_ok_at else ""
            return {"key": "source:all", "ok": False, "text": f"서울시 실시간 원본이 {_clock(since)}부터 계속 오류예요({int((now - since) // 60)}분{last})"}
        text = f"서울시 실시간 원본 정상({_clock(live.all_ok_at)} 받음)" if live.all_ok_at else "서울시 실시간 원본: 켠 뒤 아직 받지 않음"
        return {"key": "source:all", "ok": True, "text": text}

    def _samples(self, now: float, events: list) -> dict:
        last = max((e[0] for e in events), default=None)
        usual = sum(u for line in LINES if (u := self._usual(line, now - WINDOW / 2)))
        if (last is None or now - last >= WINDOW) and usual >= MIN_USUAL and not self.live.quiet():
            since = f"마지막 {_clock(last)}" if last else f"{WINDOW * 7 // 60}분 넘게"
            return {"key": "feed:samples", "ok": False, "text": f"실시간 열차 기록이 10분 넘게 멈췄어요({since})"}
        return {"key": "feed:samples", "ok": True, "text": f"실시간 열차 기록 정상({_clock(last)})" if last else "실시간 열차 기록 없음(운행 시간 아님)"}

    def _quota(self) -> dict:
        q, p = self.live.quota_view(), self.live.position_used
        used = f"{q['used']} / {q['limit']}, 위치 피드 {p['calls']} / {self.live.config.position_budget}"
        if q["used"] >= q["limit"]:
            return {"key": "quota:daily", "ok": False, "text": f"오늘 서울시 호출 한도가 바닥났어요({used})"}
        return {"key": "quota:daily", "ok": True, "text": f"오늘 서울시 호출 {used}"}

    def _line(self, line: str, now: float, events: list) -> dict:
        key = f"live:{line}"
        if self.live.quiet():
            return {"key": key, "ok": True, "text": f"{line} 운행 시간 아님"}
        usual = self._usual(line, now - WINDOW / 2)
        if usual is None:
            return {"key": key, "ok": True, "text": f"{line} 평소 기준이 아직 없어요"}
        count = len({e[2] for e in events if e[1] == line and e[0] > now - WINDOW})
        if usual < MIN_USUAL:
            return {"key": key, "ok": True, "text": f"{line} 평소 열차가 적은 시간이라 보지 않아요({count}대 / 평소 약 {round(usual)}대)"}
        if count >= LOW_SHARE * usual:
            return {"key": key, "ok": True, "text": f"{line} 실시간 열차 {count}대(평소 약 {round(usual)}대)"}
        # 언제부터: 5분씩 거슬러 10분 칸이 계속 모자랐던 처음. 5분 전 칸도 모자라야(15분째) 이상 — 지난 18일 기록에서
        # 한 칸만 모자란 것은 첫차 · 막차 무렵에 40번 남짓 있었고, 이어진 것은 신분당선 0대 30분 · 우이신설선 아침 두 번뿐이었다
        since, streak = now - WINDOW, 1
        for back in range(1, 7):
            end = now - back * SLOT_SECONDS / 2
            u = self._usual(line, end - WINDOW / 2)
            n = len({e[2] for e in events if e[1] == line and end - WINDOW < e[0] <= end})
            if u is None or u < MIN_USUAL or n >= LOW_SHARE * u:
                break
            since, streak = end - WINDOW, streak + 1
        if streak < 2:
            return {"key": key, "ok": True, "text": f"{line} 실시간 열차 {count}대(평소 약 {round(usual)}대 · 모자람 확인 중)"}
        if count == 0:
            return {"key": key, "ok": False, "text": f"{line} 실시간 열차가 10분 넘게 안 들어와요(평소 약 {round(usual)}대, {_clock(since)}부터)"}
        return {"key": key, "ok": False, "text": f"{line} 실시간 열차가 평소의 {_share(count, usual)}%예요({count}대 / 평소 약 {round(usual)}대, {_clock(since)}부터)"}

    def _position(self, line: str, now: float) -> dict:
        key = f"position:{line}"
        rows = [r for r in self.live.position_checks.get(line, []) if r[0] > now - 3600 and r[2] >= POSITION_PARTIAL_MIN]
        if not rows:
            return {"key": key, "ok": True, "text": f"{line} 위치 정보: 최근 1시간 확인 없음"}
        at, count, listed = rows[-1]
        streak = []   # 마지막부터 거슬러 이어서 모자랐던 확인들
        for r in reversed(rows):
            if r[1] >= LOW_SHARE * r[2]:
                break
            streak.append(r)
        if streak and at - streak[-1][0] >= WINDOW:
            return {"key": key, "ok": False, "text": f"{line} 위치 정보가 도착 정보의 {_share(count, listed)}%만 와요({count}대 / {listed}대, {_clock(streak[-1][0])}부터)"}
        note = " · 모자람 확인 중" if streak else ""
        return {"key": key, "ok": True, "text": f"{line} 위치 정보 {count}대(도착 정보 {listed}대, {_clock(at)} 확인{note})"}
