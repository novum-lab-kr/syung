"""/api/weather: 격자 변환 · 발표시각 · 코드 매핑 · 10분 캐시 · 키 없음 · 기상청 실패 · 키 인코딩(가짜 기상청 — 바깥 호출 없음)."""

import threading
import unittest
import urllib.parse
from datetime import datetime
from types import SimpleNamespace
from unittest.mock import patch

from server.clock import KST
from server.config import WeatherConfig
from server.routes import weather as weather_routes
from server.services import weather
from server.sources import kma
from server.sources.kma import KmaError

NOW = datetime(2026, 10, 29, 23, 50, tzinfo=KST)


def ncst_rows(**values):
    base = {"T1H": "12.3", "RN1": "0", "PTY": "0", "WSD": "2.1", "REH": "50"}
    base.update(values)
    return [{"baseDate": "20261029", "baseTime": "2300", "category": key, "obsrValue": value} for key, value in base.items()]


def fcst_rows(sky="1", lgt="0"):
    rows = []
    for time_text, sky_value in (("0000", sky), ("0100", "4")):   # 가장 이른 시각이 지금과 가깝다
        rows += [{"category": "SKY", "fcstDate": "20261030", "fcstTime": time_text, "fcstValue": sky_value},
                 {"category": "LGT", "fcstDate": "20261030", "fcstTime": time_text, "fcstValue": lgt}]
    return rows


class Fake:
    def __init__(self, ncst=None, fcst=None):
        self.calls = []
        self.ncst_rows, self.fcst_rows = ncst or ncst_rows(), fcst or fcst_rows()

    def ncst(self, key, date, time_text, nx, ny):
        self.calls.append(("ncst", key, date, time_text, nx, ny))
        if isinstance(self.ncst_rows, Exception):
            raise self.ncst_rows
        return self.ncst_rows

    def fcst(self, key, date, time_text, nx, ny):
        self.calls.append(("fcst", key, date, time_text, nx, ny))
        if isinstance(self.fcst_rows, Exception):
            raise self.fcst_rows
        return self.fcst_rows


def service(fake, key="secret-key", clock=lambda: NOW, monotonic=None):
    return weather.WeatherService(WeatherConfig(kma_key=key), ncst=fake.ncst, fcst=fake.fcst, clock=clock, monotonic=monotonic)


class ConfigTest(unittest.TestCase):
    def read(self, **env):
        with patch.dict("os.environ", env, clear=True):
            return WeatherConfig.from_env().kma_key

    def test_key_choice_and_decoding(self):
        self.assertEqual(self.read(), "")
        self.assertEqual(self.read(SEOUL_BUS_SERVICE_KEY="bus+key/=="), "bus+key/==")   # Decoding 그대로
        self.assertEqual(self.read(SEOUL_BUS_SERVICE_KEY="bus%2Bkey%2F%3D%3D"), "bus+key/==")   # Encoding 은 한 번 푼다
        self.assertEqual(self.read(KMA_SERVICE_KEY="own", SEOUL_BUS_SERVICE_KEY="bus"), "own")   # 따로 주면 그것


class GridTest(unittest.TestCase):
    def test_known_points(self):
        self.assertEqual(weather.to_grid(37.5663, 126.9779), (60, 127))   # 서울시청 — 가이드 예시와 같은 칸
        self.assertEqual(weather.to_grid(35.1796, 129.0756), (98, 76))    # 부산
        self.assertEqual(weather.to_grid(33.4996, 126.5312), (53, 38))    # 제주

    def test_grid_range(self):
        self.assertTrue(weather.in_grid(60, 127))
        self.assertFalse(weather.in_grid(*weather.to_grid(0.0, 0.0)))   # 한반도 밖


class BaseTimeTest(unittest.TestCase):
    def test_observation_after_ten_minutes(self):
        self.assertEqual(weather.ncst_base(datetime(2026, 10, 29, 6, 10, tzinfo=KST)).strftime("%H%M"), "0600")
        self.assertEqual(weather.ncst_base(datetime(2026, 10, 29, 6, 9, tzinfo=KST)).strftime("%H%M"), "0500")
        self.assertEqual(weather.ncst_base(datetime(2026, 10, 30, 0, 5, tzinfo=KST)).strftime("%Y%m%d%H%M"), "202610292300")

    def test_forecast_after_forty_five_minutes(self):
        self.assertEqual(weather.fcst_base(datetime(2026, 10, 29, 6, 45, tzinfo=KST)).strftime("%H%M"), "0630")
        self.assertEqual(weather.fcst_base(datetime(2026, 10, 29, 6, 44, tzinfo=KST)).strftime("%H%M"), "0530")
        self.assertEqual(weather.fcst_base(datetime(2026, 10, 30, 0, 20, tzinfo=KST)).strftime("%Y%m%d%H%M"), "202610292330")


class ServiceTest(unittest.TestCase):
    def test_codes_are_mapped(self):
        fake = Fake(ncst_rows(PTY="3", RN1="0.5", T1H="-2.0", WSD="4.4"), fcst_rows(sky="3", lgt="1.5"))
        body = service(fake).lookup(37.5663, 126.9779)
        self.assertEqual((body["ok"], body["nx"], body["ny"]), (True, 60, 127))
        self.assertEqual((body["tempC"], body["sky"], body["precip"], body["rainMm"], body["windMs"], body["lightning"]),
                         (-2.0, "cloudy", "snow", 0.5, 4.4, True))
        self.assertTrue(body["observedAt"].startswith("2026-10-29T23:00"))
        self.assertEqual(fake.calls[0][2:4], ("20261029", "2300"))   # 23:50 → 23시 실황
        self.assertEqual(fake.calls[1][2:4], ("20261029", "2330"))   # 23:50 → 23시30분 예보

    def test_every_precip_code(self):
        expected = {"0": "none", "1": "rain", "2": "rain_snow", "3": "snow", "4": "rain", "5": "drizzle", "6": "sleet_drizzle", "7": "flurry"}
        for code, name in expected.items():
            body = service(Fake(ncst_rows(PTY=code))).lookup(37.5, 127.0)
            self.assertEqual(body["precip"], name, code)
        self.assertEqual(service(Fake(fcst=fcst_rows(sky="4"))).lookup(37.5, 127.0)["sky"], "overcast")
        self.assertEqual(service(Fake(fcst=fcst_rows(sky="1"))).lookup(37.5, 127.0)["sky"], "clear")

    def test_missing_value_is_none(self):
        body = service(Fake(ncst_rows(T1H="-999"))).lookup(37.5, 127.0)
        self.assertIsNone(body["tempC"])

    def test_same_cell_is_cached_ten_minutes(self):
        fake, clock = Fake(), [0.0]
        svc = service(fake, monotonic=lambda: clock[0])
        svc.lookup(37.5663, 126.9779)
        svc.lookup(37.5665, 126.9780)   # 같은 칸
        self.assertEqual(len(fake.calls), 2)
        clock[0] = 601
        svc.lookup(37.5663, 126.9779)
        self.assertEqual(len(fake.calls), 4)

    def test_no_key_means_no_weather_and_no_call(self):
        fake = Fake()
        with patch("builtins.print") as printed:
            self.assertEqual(service(fake, key="").lookup(37.5, 127.0), {"ok": False})
        self.assertEqual(fake.calls, [])
        self.assertEqual(printed.call_count, 1)

    def test_kma_failure_is_quiet_and_never_logs_the_key(self):
        fake = Fake(ncst=KmaError("30"))
        with patch("builtins.print") as printed:
            svc = service(fake)
            self.assertEqual(svc.lookup(37.5, 127.0), {"ok": False})
            svc.lookup(35.1, 129.0)   # 다른 칸 · 같은 이유는 한 번만 적는다
        self.assertEqual(printed.call_count, 1)
        self.assertNotIn("secret-key", str(printed.call_args))
        self.assertIn("30", str(printed.call_args))

    def test_no_data_retries_one_hour_earlier(self):
        fake = Fake()
        original = fake.ncst

        def flaky(key, date, time_text, nx, ny):
            if time_text == "2300":
                raise KmaError(kma.NO_DATA)
            return original(key, date, time_text, nx, ny)

        body = weather.WeatherService(WeatherConfig(kma_key="k"), ncst=flaky, fcst=fake.fcst, clock=lambda: NOW).lookup(37.5, 127.0)
        self.assertTrue(body["ok"])
        self.assertTrue(body["observedAt"].startswith("2026-10-29T22:00"))

    def test_out_of_grid_is_none(self):
        self.assertIsNone(service(Fake()).lookup(0.0, 0.0))

    def test_unprojectable_edges_do_not_crash(self):
        fake = Fake()
        for lat in (-90.0, 90.0, -89.99, 89.99):
            self.assertIsNone(service(fake).lookup(lat, 127.0), lat)
        self.assertEqual(fake.calls, [])

    def test_concurrent_same_cell_calls_kma_once(self):
        gate, started = threading.Event(), threading.Event()
        fake = Fake()
        original = fake.ncst

        def slow_ncst(*args):
            started.set()
            gate.wait(5)
            return original(*args)

        svc = weather.WeatherService(WeatherConfig(kma_key="secret-key"), ncst=slow_ncst, fcst=fake.fcst, clock=lambda: NOW)
        results = []
        workers = [threading.Thread(target=lambda: results.append(svc.lookup(37.5665, 126.9780))) for _ in range(4)]
        workers[0].start()
        started.wait(5)
        for worker in workers[1:]:
            worker.start()
        gate.set()
        for worker in workers:
            worker.join(5)
        self.assertEqual(len(fake.calls), 2)   # 실황 1 + 예보 1
        self.assertEqual(len(results), 4)
        self.assertTrue(all(body["ok"] for body in results))


class RouteTest(unittest.TestCase):
    def test_bad_coordinates(self):
        services = SimpleNamespace(weather=service(Fake()))
        for query in ({}, {"lat": ["x"], "lng": ["127"]}, {"lat": ["99"], "lng": ["127"]}, {"lat": ["nan"], "lng": ["127"]}):
            body, status = weather_routes.weather(services, query)
            self.assertEqual((status, body["error"]["code"]), (400, "bad_coordinates"), query)

    def test_ok_and_out_of_range(self):
        services = SimpleNamespace(weather=service(Fake()))
        body, status = weather_routes.weather(services, {"lat": ["37.5663"], "lng": ["126.9779"]})
        self.assertEqual((status, body["ok"]), (200, True))
        for lat in ("0", "-90", "90"):
            body, status = weather_routes.weather(services, {"lat": [lat], "lng": ["0"]})
            self.assertEqual((status, body["error"]["code"]), (400, "out_of_range"), lat)


class SourceTest(unittest.TestCase):
    def reply(self, payload):
        class Reply:
            def __enter__(self_inner):
                return self_inner

            def __exit__(self_inner, *args):
                return False

            def read(self_inner, *args):
                return payload.encode()
        return Reply()

    def test_key_is_encoded_once(self):
        seen = {}

        def fake_open(request, timeout):
            seen["url"] = request.full_url
            return self.reply('{"response":{"header":{"resultCode":"00","resultMsg":"NORMAL_SERVICE"},"body":{"items":{"item":[{"category":"T1H","obsrValue":"1"}]}}}}')

        with patch("urllib.request.urlopen", fake_open):
            rows = kma.ultra_ncst("ab+/=cd", "20261029", "2300", 60, 127)
        self.assertEqual(rows, [{"category": "T1H", "obsrValue": "1"}])
        query = urllib.parse.parse_qs(urllib.parse.urlsplit(seen["url"]).query)
        self.assertEqual(query["serviceKey"], ["ab+/=cd"])   # 한 번만 인코딩 → 풀면 원래 키
        self.assertIn("ab%2B%2F%3Dcd", seen["url"])
        self.assertEqual((query["base_time"], query["nx"], query["ny"], query["dataType"]), (["2300"], ["60"], ["127"], ["JSON"]))
        self.assertTrue(seen["url"].startswith("https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getUltraSrtNcst?"))

    def test_error_bodies(self):
        gateway = '{"OpenAPI_ServiceResponse":{"cmmMsgHeader":{"errMsg":"SERVICE_KEY_IS_NOT_REGISTERED_ERROR","returnReasonCode":"30"}}}'
        nodata = '{"response":{"header":{"resultCode":"03","resultMsg":"NODATA_ERROR"}}}'
        for payload, code in ((gateway, "30"), (nodata, "03"), ("<xml/>", "FORMAT")):
            with patch("urllib.request.urlopen", lambda request, timeout, payload=payload: self.reply(payload)):
                with self.assertRaises(KmaError) as caught:
                    kma.ultra_fcst("k", "20261029", "2330", 60, 127)
            self.assertEqual(caught.exception.code, code)
            self.assertNotIn("k", str(caught.exception).replace("KMA", ""))


if __name__ == "__main__":
    unittest.main()
