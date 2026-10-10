"""탐색 자료·일꾼 없이 가짜 서비스와 검색 함수로 /route · /place 계약을 확인한다."""

import unittest
import urllib.error
from datetime import datetime
from types import SimpleNamespace
from unittest.mock import Mock, patch

from server.clock import KST
from server.config import JourneyConfig
from server.routes import journey as journey_routes
from server.services import places


NOW = datetime(2026, 10, 10, 12, 34, 56, tzinfo=KST)
COORD_ERROR = "출발지와 도착지 좌표가 필요해요 (from=위도,경도&to=위도,경도)"
TIME_ERROR = "시각은 YYYY-MM-DDTHH:MM 형식이에요"
COORDS = {"from": ["37.5,127.0"], "to": ["37.6,127.1"]}


class FixedDatetime(datetime):
    @classmethod
    def now(cls, tz=None):
        return NOW.astimezone(tz) if tz else NOW.replace(tzinfo=None)


class JourneyRoutesTest(unittest.TestCase):
    def setUp(self):
        # JourneyPlanner 를 만들지 않아 그래프 JSON 읽기나 풀 생성을 하지 않는다.
        self.planner = SimpleNamespace(plan=Mock(return_value={"ok": True, "plans": []}))
        self.searcher = SimpleNamespace(search=Mock(return_value={"ok": True, "places": []}))
        self.services = SimpleNamespace(journey=self.planner, places=self.searcher)
        self.datetime_patch = patch.object(journey_routes, "datetime", FixedDatetime)
        self.datetime_patch.start()
        self.addCleanup(self.datetime_patch.stop)

    def test_route_requires_two_numeric_coordinates_at_each_end(self):
        cases = [{}, {"from": COORDS["from"]}, {"to": COORDS["to"]}]
        for name in ("from", "to"):
            for value in ("", "서울,127", "37.5", "37.5,127,0", "37.5,"):
                cases.append({**COORDS, name: [value]})
        for query in cases:
            with self.subTest(query=query):
                self.assertEqual(journey_routes.route(self.services, query),
                                 ({"ok": False, "error": COORD_ERROR}, 400))
        self.planner.plan.assert_not_called()

    def test_route_checks_coordinates_before_time(self):
        self.assertEqual(journey_routes.route(self.services, {"at": ["잘못된 시각"]}),
                         ({"ok": False, "error": COORD_ERROR}, 400))
        self.planner.plan.assert_not_called()

    def test_route_rejects_invalid_time_with_original_message(self):
        for at in ("2026-10-10", "2026-13-10T12:00", "2026-10-10T25:00", "2026-10-10T12:00:00"):
            with self.subTest(at=at):
                self.assertEqual(journey_routes.route(self.services, {**COORDS, "at": [at]}),
                                 ({"ok": False, "error": TIME_ERROR}, 400))
        self.planner.plan.assert_not_called()

    def test_route_defaults_to_fixed_kst_time(self):
        for query in (COORDS, {**COORDS, "at": ["   "]}):
            with self.subTest(query=query):
                body, status = journey_routes.route(self.services, query)
                self.assertEqual(status, 200)
                self.assertIs(body, self.planner.plan.return_value)
                self.planner.plan.assert_called_with((37.5, 127.0), (37.6, 127.1), NOW)

    def test_route_uses_first_values_and_strips_explicit_time(self):
        query = {"from": ["37.5,127", "bad"], "to": ["37.6,127.1", "bad"],
                 "at": [" 2026-10-11T08:30 ", "bad"]}
        self.assertEqual(journey_routes.route(self.services, query)[1], 200)
        self.planner.plan.assert_called_once_with((37.5, 127.0), (37.6, 127.1),
                                                  datetime(2026, 10, 11, 8, 30, tzinfo=KST))

    def test_route_without_a_plan_still_returns_200(self):
        result = {"ok": False, "error": "이어지는 경로를 찾지 못했어요", "plans": []}
        self.planner.plan.return_value = result
        body, status = journey_routes.route(self.services, COORDS)
        self.assertIs(body, result)
        self.assertEqual(status, 200)

    def test_place_requires_nonempty_search(self):
        for query in ({}, {"q": [""]}, {"q": [" \t "]}):
            with self.subTest(query=query):
                self.assertEqual(journey_routes.place(self.services, query),
                                 ({"ok": False, "error": "검색어가 필요해요"}, 400))
        self.searcher.search.assert_not_called()

    def test_place_strips_and_limits_first_search_value(self):
        self.assertEqual(journey_routes.place(self.services, {"q": ["  " + "역" * 90 + "  ", "ignored"]})[1], 200)
        self.searcher.search.assert_called_once_with("역" * 80, None)

    def test_place_parses_near_without_rejecting_wrong_length(self):
        for near, expected in ((None, None), ("", None), ("서울,127", None),
                               ("37.5,127", (37.5, 127.0)), ("37.5", (37.5,)),
                               ("37.5,127,0", (37.5, 127.0, 0.0))):
            with self.subTest(near=near):
                query = {"q": ["역"]}
                if near is not None:
                    query["near"] = [near, "ignored"]
                self.assertEqual(journey_routes.place(self.services, query)[1], 200)
                self.searcher.search.assert_called_with("역", expected)

    def test_place_returns_search_body_with_200_or_503(self):
        for result, expected_status in (({"ok": True, "places": []}, 200),
                                        ({"ok": False, "error": "장소 검색 실패: offline"}, 503)):
            with self.subTest(result=result):
                self.searcher.search.return_value = result
                body, status = journey_routes.place(self.services, {"q": ["역"]})
                self.assertIs(body, result)
                self.assertEqual(status, expected_status)


class PlaceSearchTest(unittest.TestCase):
    def setUp(self):
        self.now = 1000.0
        self.fake_search = Mock(return_value=[{"name": "역", "lat": 37.5, "lng": 127.0}])
        self.service = places.PlaceSearch(JourneyConfig(kakao_key="fixture-key"), search=self.fake_search)
        self.clock_patch = patch.object(places.time, "time", side_effect=lambda: self.now)
        self.clock_patch.start()
        self.addCleanup(self.clock_patch.stop)

    def test_same_key_is_cached_until_but_not_at_600_seconds(self):
        first = self.service.search("역", (37.5, 127.0))
        self.now += 599.999
        self.assertEqual(self.service.search("역", (37.5, 127.0)), first)
        self.fake_search.assert_called_once_with("fixture-key", "역", (37.5, 127.0))
        self.now = 1600.0
        second_places = [{"name": "갱신"}]
        self.fake_search.return_value = second_places
        self.assertEqual(self.service.search("역", (37.5, 127.0)), {"ok": True, "places": second_places})
        self.assertEqual(self.fake_search.call_count, 2)
        self.now = 2199.999
        self.assertEqual(self.service.search("역", (37.5, 127.0))["places"], second_places)
        self.assertEqual(self.fake_search.call_count, 2)

    def test_query_and_raw_near_are_both_part_of_cache_key(self):
        for q, near in (("역", None), ("다른 역", None), ("역", (37.5, 127.0)),
                        ("역", (37.6, 127.0)), ("역", (37.5,))):
            self.service.search(q, near)
            self.service.search(q, near)
        self.assertEqual(self.fake_search.call_count, 5)

    def test_near_length_other_than_two_searches_without_location(self):
        for near in (None, (), (37.5,), (37.5, 127.0, 0.0)):
            with self.subTest(near=near):
                self.service.search("역", near)
                self.fake_search.assert_called_with("fixture-key", "역", None)
        self.service.search("역", (37.5, 127.0))
        self.fake_search.assert_called_with("fixture-key", "역", (37.5, 127.0))

    def test_cache_is_cleared_only_when_already_over_5000(self):
        self.service.cache = {f"old-{i}": (self.now, []) for i in range(5000)}
        self.service.search("첫 검색", None)
        self.assertEqual(len(self.service.cache), 5001)
        self.assertIn("old-0", self.service.cache)
        # 한도를 넘었어도 유효한 hit 는 전체 캐시를 비우지 않는다.
        self.service.search("첫 검색", None)
        self.assertEqual(len(self.service.cache), 5001)
        self.assertEqual(self.fake_search.call_count, 1)
        self.service.search("둘째 검색", None)
        self.assertEqual(set(self.service.cache), {"둘째 검색|None"})
        self.assertEqual(self.fake_search.call_count, 2)

    def test_empty_results_are_cached(self):
        self.fake_search.return_value = []
        for _ in range(2):
            self.assertEqual(self.service.search("없는 역", None), {"ok": True, "places": []})
        self.fake_search.assert_called_once()

    def test_expected_errors_are_not_cached_and_do_not_clear_existing_cache(self):
        self.service.cache = {f"old-{i}": (self.now, []) for i in range(5001)}
        for error in (OSError("offline"), ValueError("bad json"), RuntimeError("no key"),
                      urllib.error.URLError("unreachable")):
            with self.subTest(error=type(error).__name__):
                self.fake_search.side_effect = error
                body = self.service.search("실패", None)
                self.assertEqual(body, {"ok": False, "error": f"장소 검색 실패: {error}"})
                self.assertEqual(len(self.service.cache), 5001)
                self.assertNotIn("실패|None", self.service.cache)
        self.fake_search.side_effect = None
        self.assertTrue(self.service.search("실패", None)["ok"])
        self.assertEqual(self.fake_search.call_count, 5)
        self.assertEqual(set(self.service.cache), {"실패|None"})

    def test_cache_age_starts_before_search_finishes(self):
        def slow_search(*args):
            self.now += 590
            return []
        self.fake_search.side_effect = slow_search
        self.service.search("역", None)
        self.assertEqual(self.service.cache["역|None"][0], 1000.0)
        self.now = 1600.0
        self.service.search("역", None)
        self.assertEqual(self.fake_search.call_count, 2)


if __name__ == "__main__":
    unittest.main()
