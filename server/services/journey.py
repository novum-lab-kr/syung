"""길찾기 서비스: 탐색 일꾼 풀의 주인 · 실시간 열차를 붙여 plan 부르기.

탐색 자료(역 · 노선 · 버스 그래프)는 services/journey_graph.py 의 모듈 수준 읽기 전용 자료다. 그 모듈을 import 하면
자료를 읽으므로(~2 s) 여기서는 쓸 때 import 한다: 켤 때 배경의 warm() 이나 첫 길찾기 — 옛 코드와 같은 때.
일꾼은 forkserver 로 띄운 프로세스라 각자 그 모듈을 한 번 읽는다(_search_job 은 모듈 함수라야 피클된다) — warm() 이 일꾼에게도 미리 읽힌다
(2026-10-28: 전에는 일꾼을 띄우기만 해서 재시작 뒤 첫 길찾기가 일꾼마다 자료 읽기를 탐색 시간 안에서 치렀다).

탐색 줄 세우기(2026-11-09): 동시 요청이 일꾼 풀을 같이 쓴다. 전에는 낸 차례(FIFO)로 돌아 먼저 온 요청의 탐색 4~6개가 끝나야
다음 요청의 첫 탐색이 돌았다 — 5개가 몰리면 뒤 요청은 예산(4초) 안에 하나도 못 받아 '경로 없음'(운영 실측 2026-11-09).
이제 요청마다 몇 번째 탐색인지(rank)로 줄을 세워 모든 요청의 첫 탐색이 먼저 돌고, 일꾼에는 쉬는 만큼만 넘기며(workers 개),
요청이 끝났거나 시간이 지난 탐색은 돌리지 않는다.
"""
from __future__ import annotations

import heapq
import importlib
import itertools
import queue
import threading
import time
from datetime import datetime
from typing import TYPE_CHECKING, Any, cast

from server.clock import KST
from server.config import JourneyConfig

if TYPE_CHECKING:   # 타입만(실행 때 실시간 서비스를 부르지 않는다)
    from concurrent.futures import Future

    from server.services.live import SubwayLiveService


def _warm_worker() -> None:
    """일꾼 프로세스 안에서 탐색 자료를 읽어 두고 잠깐 붙잡는다(그동안 다른 일꾼이 다음 것을 받게)."""
    importlib.import_module("server.services.journey_graph")   # import 가 곧 자료 읽기
    time.sleep(0.5)


class _Task:
    """줄에 선 탐색 하나: 일꾼에 넘길 인자 · 멈출 시각 · 결과를 넣을 스트림의 받는 곳."""
    __slots__ = ("cancelled", "job", "out", "stop_at", "tid")

    def __init__(self, tid: int, job: tuple[Any, ...], stop_at: float, out: queue.Queue[tuple[int, dict[str, Any] | None]]):
        self.tid, self.job, self.stop_at, self.out, self.cancelled = tid, job, stop_at, out, False


class _PoolStream:
    """요청 하나의 탐색 통로(journey_graph.SearchStream): 넣은 차례가 곧 rank — 0 번째끼리 먼저, 그다음 1 번째끼리 …"""

    def __init__(self, planner: JourneyPlanner):
        self.planner = planner
        self.out: queue.Queue[tuple[int, dict[str, Any] | None]] = queue.Queue()
        self.tasks: list[_Task] = []

    def submit(self, job: tuple[Any, ...], stop_at: float) -> int:
        task = _Task(len(self.tasks), job, stop_at, self.out)
        self.planner._enqueue(len(self.tasks), task)   # pyright: ignore[reportPrivateUsage] — 같은 모듈의 짝
        self.tasks.append(task)
        return task.tid

    def next(self, timeout: float) -> tuple[int, dict[str, Any] | None] | None:
        try:
            return self.out.get(timeout=max(0.0, timeout))
        except queue.Empty:
            return None

    def close(self) -> None:
        for task in self.tasks:   # 아직 줄에 선 것은 돌리지 않는다(돌고 있는 것은 stop_at 에 멈춘다)
            task.cancelled = True


class JourneyPlanner:
    def __init__(self, config: JourneyConfig | None = None, *, live: SubwayLiveService | None = None):
        self.config = config or JourneyConfig.from_env()
        self.live = live   # SubwayLiveService: 곧 탈 열차를 실시간으로
        self._pool = None
        self._lock = threading.Lock()   # 줄 · 도는 수 · 풀 만들기
        self._waiting: list[tuple[int, int, _Task]] = []   # (rank, 줄 선 차례, 탐색) 힙
        self._running = 0
        self._seq = itertools.count()

    @staticmethod
    def _graph():
        from server.services import journey_graph   # 자료를 읽는다(처음 한 번)
        return journey_graph

    def _executor(self):
        # searches run side by side in worker processes (each loads the network once); inline when that fails
        with self._lock:
            if self._pool is None and self.config.workers:
                import multiprocessing
                from concurrent.futures import ProcessPoolExecutor
                # forkserver: a clean process to fork workers from (the proxy is threaded; forking it is not safe)
                self._pool = ProcessPoolExecutor(self.config.workers, mp_context=multiprocessing.get_context("forkserver"))
            return self._pool

    def open_stream(self) -> Any:
        """요청 하나의 탐색 통로(journey_graph.SearchStream) — 일꾼 풀이 없으면 여기서 차례로 돌리는 묶음 통로."""
        if self._executor():
            return _PoolStream(self)
        return self._graph()._BatchStream(self._run_inline)   # pyright: ignore[reportPrivateUsage] — 같은 서비스의 짝

    def _enqueue(self, rank: int, task: _Task) -> None:
        with self._lock:
            heapq.heappush(self._waiting, (rank, next(self._seq), task))
        self._dispatch()

    def _dispatch(self) -> None:
        """쉬는 일꾼만큼 줄 앞에서 넘긴다. 요청이 끝났거나 멈출 시각이 지난 것은 돌리지 않고 빈 결과로.
        넘기기(submit)는 잠금 밖에서 — 풀의 관리 스레드가 끝남 알림(_finished)을 부르며 이 잠금을 잡는다."""
        search_job = self._graph()._search_job   # pyright: ignore[reportPrivateUsage] — 일꾼에 피클로 보내려면 모듈 함수라야 한다(위 설명)
        while True:
            with self._lock:
                if self._running >= max(1, self.config.workers) or not self._waiting:
                    return
                task = heapq.heappop(self._waiting)[2]
                skip = task.cancelled or time.time() >= task.stop_at
                if not skip:
                    self._running += 1   # 자리를 먼저 잡는다
            if skip:
                task.out.put((task.tid, None))
                continue
            try:
                ex = self._executor()
                if ex is None:
                    raise RuntimeError("no pool")
                fut = ex.submit(search_job, task.job, task.stop_at)
            except Exception:   # a broken pool: drop it(다음 요청이 새로 띄운다) · 이 탐색은 빈 결과
                with self._lock:
                    self._running -= 1
                    self._pool = None
                task.out.put((task.tid, None))
                continue
            fut.add_done_callback(lambda done, task=task: self._finished(task, done))

    def _finished(self, task: _Task, fut: Future[dict[str, Any] | None]) -> None:
        with self._lock:
            self._running -= 1
        try:
            result = fut.result()
        except Exception:   # 일꾼이 죽었거나(풀 깨짐) 탐색이 실패 — 이 탐색만 빈 결과
            result = None
        task.out.put((task.tid, result))
        self._dispatch()

    def warm(self) -> None:
        """자료를 읽고 일꾼을 띄워 일꾼마다 자료를 읽혀 둔다(the first request would wait ~2 s)."""
        self._graph()
        ex = self._executor()
        if ex:
            for f in [ex.submit(_warm_worker) for _ in range(self.config.workers * 2)]:
                f.result()

    def _run_batch(self, jobs: list[tuple[Any, ...]], seconds: float) -> list[dict[str, Any] | None]:
        """탐색 여럿을 seconds 안에 — 끝나지 않은 것은 None. 일꾼 풀이면 다른 요청과 같은 줄에 선다(_PoolStream)."""
        if len(jobs) > 1 and self._executor():
            stream, end = _PoolStream(self), time.monotonic() + seconds
            ids = [stream.submit(job, time.time() + seconds) for job in jobs]
            results: dict[int, dict[str, Any] | None] = {}
            while len(results) < len(ids):
                done = stream.next(end - time.monotonic())
                if done is None:
                    break
                results[done[0]] = done[1]
            stream.close()
            return [results.get(i) for i in ids]
        return self._run_inline(jobs, seconds)

    def _run_inline(self, jobs: list[tuple[Any, ...]], seconds: float) -> list[dict[str, Any] | None]:
        search_job = self._graph()._search_job   # pyright: ignore[reportPrivateUsage] — 위와 같은 탐색 함수
        out, end = cast("list[dict[str, Any] | None]", []), time.monotonic() + seconds
        for j in jobs:
            out.append(search_job(j) if time.monotonic() < end else None)
        return out

    def plan(self, origin: tuple[float, float], dest: tuple[float, float], when: datetime,
             via: tuple[float, float] | None = None) -> dict[str, Any]:
        """when 이 지금 ±1시간이면 실시간 열차를 붙인다 — 들고 있는 지하철 캐시로 바로(지났으면 새로 받기는 배경에서,
        2026-10-28 결정 E: 길찾기가 서울 API 를 기다리지 않는다 · 실시간이 한 주기 늦을 수 있음). 그 밖의 시각이면 부르지 않는다.
        via: 경유지(있으면 출발 → 경유지 → 도착을 이어 붙인 길 — journey_graph.plan_via)."""
        near_now = abs((when - datetime.now(KST)).total_seconds()) < 3600
        live = self.live.all_lines_now() if self.live and near_now else cast("dict[str, Any]", {})
        if via is not None:
            return self._graph().plan_via(origin, via, dest, when, live, self._run_batch, self.config.workers, self.open_stream)
        return self._graph().plan(origin, dest, when, live, self._run_batch, self.config.workers, self.open_stream)

    def walk(self, origin: tuple[float, float], dest: tuple[float, float] | None = None,
             station: int | None = None) -> dict[str, Any] | None:
        """걷기 한 구간만(journey_graph.walk_leg) — 탐색 일꾼 · 실시간 열차를 쓰지 않는다."""
        return self._graph().walk_leg(origin, dest, station)
