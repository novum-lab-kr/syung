"""길찾기 탐색 줄 세우기(services/journey.py)와 끝나는 대로 받기(journey_graph._gather) — 2026-11-09 동시 요청 '경로 없음'.

동시 요청이 일꾼 풀을 같이 쓸 때 먼저 온 요청의 탐색이 다 끝나야 뒤 요청이 돌던 것(FIFO)을 요청마다 몇 번째 탐색인지로 줄 세운다.
일꾼 풀은 가짜(넘긴 것을 적어 두고 시험이 하나씩 끝낸다)라 프로세스를 띄우지 않는다.
"""
import time
import unittest
from concurrent.futures import Future
from datetime import datetime
from unittest.mock import patch

from server.clock import KST
from server.config import JourneyConfig
from server.services import journey_graph as graph
from server.services.journey import JourneyPlanner


class FakePool:
    """submit 을 적어 두기만 — 시험이 finish() 로 하나씩 끝낸다."""

    def __init__(self):
        self.started: list[tuple[str, Future]] = []

    def submit(self, fn, job, stop_at):
        fut: Future = Future()
        self.started.append((job[0], fut))
        return fut

    def finish(self, index: int, result=None) -> None:
        self.started[index][1].set_result(result)


def planner_with(pool: FakePool, workers: int) -> JourneyPlanner:
    planner = JourneyPlanner(JourneyConfig(workers=workers))
    planner._pool = pool   # 가짜 풀(진짜 일꾼을 띄우지 않는다)
    return planner


class FairQueueTest(unittest.TestCase):
    def test_every_request_gets_its_first_search_before_anyone_gets_a_second(self):
        pool = FakePool()
        planner = planner_with(pool, workers=1)
        a, b = planner.open_stream(), planner.open_stream()
        later = time.time() + 60
        for name in ("a0", "a1", "a2"):
            a.submit((name,), later)
        for name in ("b0", "b1", "b2"):
            b.submit((name,), later)
        for i in range(6):   # 일꾼 하나: 하나 끝나면 다음 하나
            pool.finish(i)
        self.assertEqual([name for name, _fut in pool.started], ["a0", "b0", "a1", "b1", "a2", "b2"])

    def test_only_as_many_as_workers_run_and_results_come_back_by_id(self):
        pool = FakePool()
        planner = planner_with(pool, workers=2)
        stream = planner.open_stream()
        ids = [stream.submit((f"j{i}",), time.time() + 60) for i in range(4)]
        self.assertEqual(len(pool.started), 2)
        pool.finish(1, {"arrive": 1})
        self.assertEqual(stream.next(1.0), (ids[1], {"arrive": 1}))
        self.assertEqual(len(pool.started), 3)   # 끝난 자리에 다음 것

    def test_a_closed_request_does_not_run_what_is_still_waiting(self):
        pool = FakePool()
        planner = planner_with(pool, workers=1)
        done, other = planner.open_stream(), planner.open_stream()
        later = time.time() + 60
        done.submit(("d0",), later)
        done.submit(("d1",), later)
        other.submit(("o0",), later)
        done.close()
        pool.finish(0)
        pool.finish(1)
        self.assertEqual([name for name, _fut in pool.started], ["d0", "o0"])

    def test_a_search_past_its_stop_time_is_not_started(self):
        pool = FakePool()
        planner = planner_with(pool, workers=1)
        stream = planner.open_stream()
        stream.submit(("now",), time.time() + 60)
        late = stream.submit(("late",), time.time() - 1)
        pool.finish(0)
        self.assertEqual([name for name, _fut in pool.started], ["now"])
        self.assertEqual(stream.next(1.0)[0], 0)
        self.assertEqual(stream.next(1.0), (late, None))


class SlowStream:
    """첫 결과가 delay 초 뒤에야 오는 통로(일꾼이 다른 요청으로 바쁠 때)."""

    def __init__(self, delay: float):
        self.t0, self.delay, self.jobs = time.monotonic(), delay, []

    def submit(self, job, stop_at):
        self.jobs.append(job)
        return len(self.jobs) - 1

    def next(self, timeout):
        wait = self.t0 + self.delay - time.monotonic()
        if wait > timeout:
            time.sleep(max(0.0, timeout))
            return None
        time.sleep(max(0.0, wait))
        self.delay = 0.0
        if not self.jobs:
            return None
        self.jobs.pop()
        return len(self.jobs), {"arrive": 100.0, "legs": [{"type": "walk", "seconds": 60}]}

    def close(self):
        pass


class GraceTest(unittest.TestCase):
    WHEN = datetime(2026, 11, 9, 14, 0, tzinfo=KST)

    def gather(self, delay: float, grace: float):
        with patch.object(graph, "BUS", None):
            return graph._gather(self.WHEN, {}, {}, (37.5, 127.0), {}, SlowStream(delay), 3, 0.05, grace)

    def test_waits_a_little_longer_only_when_nothing_was_found(self):
        found, _searches = self.gather(delay=0.15, grace=0.5)
        self.assertEqual(len(found), 1)

    def test_without_grace_the_budget_still_ends_it(self):
        found, _searches = self.gather(delay=0.15, grace=0.0)
        self.assertEqual(found, [])


class FirstSearchTest(unittest.TestCase):
    """버스 자료가 있으면 가장 싼 지하철만 탐색을 맨 먼저 낸다 — 동시 요청이 몰려도 요청마다 첫 차례로 이것부터 끝난다(2026-11-27)."""

    def test_subway_only_search_goes_first(self):
        stream = SlowStream(delay=10.0)   # 아무것도 끝나지 않는다 — 낸 차례만 본다
        with patch.object(graph, "BUS", ["가짜 버스 자료"]):
            graph._gather(datetime(2026, 11, 9, 14, 0, tzinfo=KST), {}, {}, (37.5, 127.0), {}, stream, 3, 0.05)
        self.assertEqual([job[6] for job in stream.jobs],
                         [frozenset({"subway"}), frozenset({"subway", "bus"}), frozenset({"subway", "bus"}), frozenset({"bus"})])


if __name__ == "__main__":
    unittest.main()
