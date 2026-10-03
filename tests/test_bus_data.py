"""python3 -m unittest discover -s tests -p 'test_bus_*.py'"""
import io
import json
import tempfile
import unittest
import zipfile
from pathlib import Path

from pipeline.bus_build_static import ROOT, build, route_type, stop_from_row, xlsx_rows
from pipeline.bus_fetch_paths import geometry, route_signature
from server.bus_live_proxy import BusError


def stop(sid="100000001", name="정류소", lng="126.98", lat="37.57", ars="00001"):
    return {"NODE_ID": sid, "정류소명": name, "X좌표": lng, "Y좌표": lat, "ARS_ID": ars}


def seq(order, sid="100000001", name="100", rid="100100001"):
    return {**stop(sid), "ROUTE_ID": rid, "노선명": name, "순번": str(order)}


class StaticBuildTest(unittest.TestCase):
    def test_order_gaps_and_repeated_stop_are_preserved(self):
        services = [{"노선번호": "100", "유형": "간선"}]
        routes, stops, stats = build(services, [stop()], [seq(4), seq(1), seq(2, "100000002")])
        self.assertEqual(routes[0]["stopSequences"], [1, 2, 4])
        self.assertEqual(routes[0]["stopIds"], ["100000001", "100000002", "100000001"])
        self.assertEqual(routes[0]["path"][0], [126.98, 37.57])
        self.assertEqual(stops[0]["arsId"], "00001")
        self.assertEqual(stats["servedStopsOutsideMaster"], 1)
        self.assertEqual(stats["routesWithSequenceGaps"], ["100100001"])

    def test_missing_route_and_duplicate_sequence_fail(self):
        with self.assertRaises(ValueError):
            build([{"노선번호": "100", "유형": "간선"}], [], [])
        with self.assertRaises(ValueError):
            build([{"노선번호": "100", "유형": "간선"}], [], [seq(1), seq(1)])

    def test_night_services_do_not_pull_in_airport_or_village(self):
        self.assertEqual(route_type({"노선번호": "N13", "유형": ""}), ("night", None, "#2563eb", "name"))
        self.assertEqual(route_type({"노선번호": "심야A21", "유형": ""})[0], "night")
        self.assertIsNone(route_type({"노선번호": "N6000", "유형": "공항"}))
        self.assertIsNone(route_type({"노선번호": "강남01", "유형": "마을"}))
        self.assertEqual(route_type({"노선번호": "0017", "유형": "지선"})[0], "branch")

    def test_coordinates_and_ids_are_validated(self):
        for value in ("NaN", "inf", "200000", "37.57"):
            with self.subTest(value=value), self.assertRaises(ValueError):
                stop_from_row(stop(lng=value))
        with self.assertRaises(ValueError):
            stop_from_row(stop(sid="ARS12345"))
        self.assertEqual(stop_from_row(stop(ars="1234"))["arsId"], "01234")

    def test_xlsx_sparse_cells_inline_strings_and_leading_zero(self):
        xml = '''<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>
        <row r="1"><c r="A1" t="inlineStr"><is><t>id</t></is></c><c r="C1" t="inlineStr"><is><t>name</t></is></c></row>
        <row r="2"><c r="A2" t="s"><v>0</v></c><c r="C2" t="inlineStr"><is><t>역 앞</t></is></c></row>
        <row r="3"><c r="A3"><v>42</v></c></row></sheetData></worksheet>'''
        strings = '<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><si><t>0017</t></si></sst>'
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "test.xlsx"
            with zipfile.ZipFile(path, "w") as archive:
                archive.writestr("xl/worksheets/sheet1.xml", xml)
                archive.writestr("xl/sharedStrings.xml", strings)
            self.assertEqual(list(xlsx_rows(path)), [{"id": "0017", "name": "역 앞"}, {"id": "42", "name": ""}])

    def test_generated_contract_and_coverage(self):
        routes = json.loads((ROOT / "data/bus/routes.json").read_text())
        stops = json.loads((ROOT / "data/bus/stops.json").read_text())
        manifest = json.loads((ROOT / "data/bus/manifest.json").read_text())
        by_stop = {s["id"]: s for s in stops["stops"]}
        self.assertEqual(routes["schemaVersion"], 1)
        self.assertEqual(manifest["counts"]["missingRouteNames"], [])
        self.assertGreater(len(routes["routes"]), 400)
        self.assertIn("N13", {r["name"] for r in routes["routes"]})
        self.assertIn("0017", {r["name"] for r in routes["routes"]})
        self.assertEqual(len(routes["routes"]), len({r["id"] for r in routes["routes"]}))
        for route in routes["routes"]:
            self.assertEqual(len(route["stopSequences"]), len(route["stopIds"]))
            self.assertIn(route["pathSource"], ("stops", "api"))
            west, south, east, north = route["bbox"]
            for point in route["path"]:
                self.assertTrue(west <= point[0] <= east and south <= point[1] <= north)
            for sid in route["stopIds"]:
                self.assertIn(sid, by_stop)
                self.assertTrue(west <= by_stop[sid]["lng"] <= east and south <= by_stop[sid]["lat"] <= north)
            if route["pathSource"] == "stops":
                self.assertEqual(len(route["path"]), len(route["stopIds"]))
                for sid, point in zip(route["stopIds"], route["path"]):
                    self.assertEqual(point, [by_stop[sid]["lng"], by_stop[sid]["lat"]])
            else:
                self.assertIn("pathFetchedAt", route)
                self.assertGreaterEqual(len(route["path"]), 2)


class OfficialGeometryTest(unittest.TestCase):
    def rows(self, points):
        return [{"no": str(i), "gpsX": str(x), "gpsY": str(y)} for i, (x, y) in enumerate(points)]

    def test_sort_and_simplify_without_erasing_turns(self):
        points = [[126.98, 37.57], [126.981, 37.57], [126.982, 37.57], [126.982, 37.58]]
        self.assertEqual(geometry(list(reversed(self.rows(points)))), [points[0], points[2], points[3]])

    def test_u_turn_and_closed_loop_survive(self):
        for points in ([[126.98, 37.57], [126.983, 37.57], [126.981, 37.57]],
                       [[126.98, 37.57], [126.99, 37.57], [126.99, 37.58], [126.98, 37.57]]):
            self.assertEqual(geometry(self.rows(points)), points)

    def test_invalid_path_is_rejected_whole_without_bridging(self):
        for rows in ([], self.rows([[126.98, 37.57]]), self.rows([[126.98, 37.57], [float('nan'), 37.57]]),
                     [{"no": "1", "gpsX": "200000", "gpsY": "400000"}],
                     [{"no": "1", "gpsX": "126.98", "gpsY": "37.57"}]*2):
            with self.subTest(rows=rows), self.assertRaises(BusError):
                geometry(rows)

    def test_stop_sequence_change_invalidates_cache_signature(self):
        route = {"id": "100100001", "stopIds": ["100000001", "100000002"], "stopSequences": [1, 2]}
        self.assertNotEqual(route_signature(route), route_signature({**route, "stopSequences": [1, 3]}))


if __name__ == "__main__":
    unittest.main()
