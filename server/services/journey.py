"""길찾기 서비스: 탐색 일꾼 풀의 주인 · 실시간 열차를 붙여 plan 부르기.

탐색 자료(역 · 노선 · 버스 그래프)는 services/journey_graph.py 의 모듈 수준 읽기 전용 자료다. 그 모듈을 import 하면
자료를 읽으므로(~2 s) 여기서는 쓸 때 import 한다: 켤 때 배경의 warm() 이나 첫 길찾기 — 옛 코드와 같은 때.
일꾼은 forkserver 로 띄운 프로세스라 각자 그 모듈을 한 번 읽는다(_search_job 은 모듈 함수라야 피클된다).
"""
from __future__ import annotations

import time
from datetime import datetime

from server.clock import KST
from server.config import JourneyConfig


class JourneyPlanner:
    def __init__(self, config: JourneyConfig | None = None, *, live=None):
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
        """자료를 읽고 일꾼을 띄워 둔다(the first request would wait ~2 s)."""
        self._graph()
        ex = self._executor()
        if ex:
            for f in [ex.submit(time.sleep, 0.5) for _ in range(self.config.workers * 2)]:
                f.result()

    def _run_batch(self, jobs: list[tuple], seconds: float) -> list[dict | None]:
        search_job = self._graph()._search_job
        ex = self._executor()
        if ex and len(jobs) > 1:
            try:
                futs = [ex.submit(search_job, j) for j in jobs]
                end, out = time.monotonic() + seconds, []
                for f in futs:
                    try:
                        out.append(f.result(timeout=max(0.01, end - time.monotonic())))
                    except TimeoutError:
                        f.cancel()
                        out.append(None)
                return out
            except Exception:   # a broken pool: drop it, search here
                self._pool = None
        out, end = [], time.monotonic() + seconds
        for j in jobs:
            out.append(search_job(j) if time.monotonic() < end else None)
        return out

    def plan(self, origin: tuple[float, float], dest: tuple[float, float], when: datetime) -> dict:
        """when 이 지금 ±1시간이면 실시간 열차를 붙인다(지하철 캐시가 지났으면 늘 한 번 새로 받는다)."""
        lines = self.live.all_lines() if self.live else {}
        live = lines if abs((when - datetime.now(KST)).total_seconds()) < 3600 else {}
        return self._graph().plan(origin, dest, when, live, self._run_batch, self.config.workers)
