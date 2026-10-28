"""길찾기 서비스: 탐색 일꾼 풀의 주인 · 실시간 열차를 붙여 plan 부르기.

탐색 자료(역 · 노선 · 버스 그래프)는 services/journey_graph.py 의 모듈 수준 읽기 전용 자료다. 그 모듈을 import 하면
자료를 읽으므로(~2 s) 여기서는 쓸 때 import 한다: 켤 때 배경의 warm() 이나 첫 길찾기 — 옛 코드와 같은 때.
일꾼은 forkserver 로 띄운 프로세스라 각자 그 모듈을 한 번 읽는다(_search_job 은 모듈 함수라야 피클된다) — warm() 이 일꾼에게도 미리 읽힌다
(2026-10-28: 전에는 일꾼을 띄우기만 해서 재시작 뒤 첫 길찾기가 일꾼마다 자료 읽기를 탐색 시간 안에서 치렀다).
"""
from __future__ import annotations

import importlib
import time
from datetime import datetime
from typing import TYPE_CHECKING, Any, cast

from server.clock import KST
from server.config import JourneyConfig

if TYPE_CHECKING:   # 타입만(실행 때 실시간 서비스를 부르지 않는다)
    from server.services.live import SubwayLiveService


def _warm_worker() -> None:
    """일꾼 프로세스 안에서 탐색 자료를 읽어 두고 잠깐 붙잡는다(그동안 다른 일꾼이 다음 것을 받게)."""
    importlib.import_module("server.services.journey_graph")   # import 가 곧 자료 읽기
    time.sleep(0.5)


class JourneyPlanner:
    def __init__(self, config: JourneyConfig | None = None, *, live: SubwayLiveService | None = None):
        self.config = config or JourneyConfig.from_env()
        self.live = live   # SubwayLiveService: 곧 탈 열차를 실시간으로
        self._pool = None

    @staticmethod
    def _graph():
        from server.services import journey_graph   # 자료를 읽는다(처음 한 번)
        return journey_graph

    def _executor(self):
        # searches run side by side in worker processes (each loads the network once); inline when that fails
        if self._pool is None and self.config.workers:
            import multiprocessing
            from concurrent.futures import ProcessPoolExecutor
            # forkserver: a clean process to fork workers from (the proxy is threaded; forking it is not safe)
            self._pool = ProcessPoolExecutor(self.config.workers, mp_context=multiprocessing.get_context("forkserver"))
        return self._pool

    def warm(self) -> None:
        """자료를 읽고 일꾼을 띄워 일꾼마다 자료를 읽혀 둔다(the first request would wait ~2 s)."""
        self._graph()
        ex = self._executor()
        if ex:
            for f in [ex.submit(_warm_worker) for _ in range(self.config.workers * 2)]:
                f.result()

    def _run_batch(self, jobs: list[tuple[Any, ...]], seconds: float) -> list[dict[str, Any] | None]:
        search_job = self._graph()._search_job   # pyright: ignore[reportPrivateUsage] — 일꾼에 피클로 보내려면 모듈 함수라야 한다(위 설명)
        ex = self._executor()
        if ex and len(jobs) > 1:
            try:
                futs = [ex.submit(search_job, j) for j in jobs]
                end, out = time.monotonic() + seconds, cast("list[dict[str, Any] | None]", [])
                for f in futs:
                    try:
                        out.append(f.result(timeout=max(0.01, end - time.monotonic())))
                    except TimeoutError:
                        f.cancel()
                        out.append(None)
                return out
            except Exception:   # a broken pool: drop it, search here
                self._pool = None
        out, end = cast("list[dict[str, Any] | None]", []), time.monotonic() + seconds
        for j in jobs:
            out.append(search_job(j) if time.monotonic() < end else None)
        return out

    def plan(self, origin: tuple[float, float], dest: tuple[float, float], when: datetime) -> dict[str, Any]:
        """when 이 지금 ±1시간이면 실시간 열차를 붙인다 — 들고 있는 지하철 캐시로 바로(지났으면 새로 받기는 배경에서,
        2026-10-28 결정 E: 길찾기가 서울 API 를 기다리지 않는다 · 실시간이 한 주기 늦을 수 있음). 그 밖의 시각이면 부르지 않는다."""
        near_now = abs((when - datetime.now(KST)).total_seconds()) < 3600
        live = self.live.all_lines_now() if self.live and near_now else cast("dict[str, Any]", {})
        return self._graph().plan(origin, dest, when, live, self._run_batch, self.config.workers)
