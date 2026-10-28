import { NEW_NAMES, createRouter, key, normStatus } from "./lib/routing.mjs";
import { seoulSun, sunPosition as sunPosition$1 } from "./lib/sun.mjs";
import { initJourney } from "./lib/journey-ui.mjs";
import "./npm/preact/dist/preact.mjs";
import "./npm/preact/jsx-runtime/dist/jsxRuntime.mjs";
import { clearJourney, drawJourney } from "./ui/journey_sheet.mjs";
import "./modes/basic/park.mjs";
import "./modes/coaster/metrics.mjs";
import { SEOUL_CITY_STYLE } from "./modes/basic/city.mjs";
import { createCoasterTrack } from "./modes/coaster/track.mjs";
import { createCoasterGeometry } from "./modes/coaster/geometry.mjs";
import { createCoasterMotion } from "./modes/coaster/motion.mjs";
import { COCKPIT_NEAR_M, nearMatrix, seatLabel, seatPickerHTML } from "./modes/coaster/first_person.mjs";
import { createCoasterRide } from "./modes/coaster/ride.mjs";
import { createStationSearch } from "./ui/search.mjs";
import { createBottomSheet } from "./ui/sheet.mjs";
import "./ui/station_sheet.mjs";
import { createPopups } from "./ui/popups.mjs";
import { clearBusSheet, drawBusSheet } from "./bus/sheet_view.mjs";
import { settingsMenu } from "./ui/settings_menu.mjs";
import { createJourneyMap } from "./ui/journey.mjs";
import { createTrainOverlay } from "./map/overlay.mjs";
import { addBasemap as addBasemap$1, registerExitLayers, registerLocationLayers, registerTransitLayers } from "./map/layers.mjs";
import { createMapTheme } from "./map/theme.mjs";
import "./modes/merge.mjs";
import { createModeRegistry } from "./modes/index.mjs";
import { createUserPrefs } from "./user/prefs.mjs";
import { CITY_FAMILY, NATIONS, STARCRAFT, createModeController } from "./modes/transition.mjs";
import "./modes/basic/palette.mjs";
import basic_default from "./modes/basic/index.mjs";
import simcity_default from "./modes/simcity/index.mjs";
import "./modes/joseon/style.mjs";
import joseon_default from "./modes/joseon/index.mjs";
import coaster_default from "./modes/coaster/index.mjs";
import "./modes/starcraft/style.mjs";
import starcraft_default from "./modes/starcraft/index.mjs";
import "./modes/retro/style.mjs";
import retro_default from "./modes/retro/index.mjs";
import "./modes/nations/greece.mjs";
import "./modes/nations/netherlands.mjs";
import "./modes/nations/paris.mjs";
import "./modes/nations/egypt.mjs";
import nations_default from "./modes/nations/index.mjs";
import { UNIT_SHAPES } from "./modes/starcraft/unit_shapes.mjs";
import { registerBusLook } from "./bus/mesh.mjs";
import { unitBusLook } from "./modes/starcraft/units.mjs";
import { SunShadowLayer, hull } from "./map/sun.mjs";
import { drawStationSigns, perspectiveRatio, signCollisionLayout, signRows, signTextSize } from "./lib/station_signs.mjs";
import { createStationLabels } from "./map/labels.mjs";
import { ExitPillars, StationNameLayer } from "./map/platform.mjs";
import { createTrainPlanner } from "./trains/plan.mjs";
import { createLiveFeed } from "./trains/live_feed.mjs";
import { buildingDepthClass, trainLayerClass } from "./trains/draw.mjs";
import { journeyCasingPaint, journeyRidePaint, journeyStopPaint } from "./lib/journey_map_style.mjs";
import { createBusLayer } from "./bus/layer.mjs";
import { AvatarRenderer, avatarScale, createMyMotion, registerAvatar } from "./map/avatar.mjs";
import { sprout_exports } from "./map/avatars/sprout.mjs";
import { builder_exports } from "./map/avatars/builder.mjs";
import { seonbi_exports } from "./map/avatars/seonbi.mjs";
import { visitor_exports } from "./map/avatars/visitor.mjs";
import { scv_exports } from "./map/avatars/scv.mjs";
import { drone_exports } from "./map/avatars/drone.mjs";
import { probe_exports } from "./map/avatars/probe.mjs";
import { buildChorongGlowMesh, buildChorongPostMesh, buildPalanquinMesh } from "./modes/joseon/palanquin.mjs";
import { COASTER_TRACK_FS, buildCoasterTrackMesh, coasterTrackVertexShader } from "./modes/coaster/track_mesh.mjs";
import { NightLayer } from "./modes/coaster/night.mjs";
import { addCityLayers, applyCityStyle, applyGroundTexture, cityPalette } from "./city/style.mjs";
import { CityLife } from "./city/life.mjs";
import { platformStroke } from "./lib/platform_stroke.mjs";
import { catchup, catchupAt } from "./lib/train_catchup.mjs";
import { closestPlatformPoint, extendStart, offsetCoords, trackStart } from "./lib/platform_route.mjs";
import { stops as stops$1 } from "./city/viaduct_snap.mjs";
import { CityViaduct } from "./city/viaduct.mjs";
import { __vitePreload } from "./_virtual/_vite/preload-helper.mjs";
import * as maplibregl from "./vendor/maplibre-gl.mjs";
// web/maplibre_runtime.mts
var modes = createModeRegistry([
	basic_default,
	simcity_default,
	joseon_default,
	coaster_default,
	...starcraft_default,
	retro_default,
	...nations_default
]);
registerAvatar("sprout", sprout_exports);
registerAvatar("builder", builder_exports);
registerAvatar("seonbi", seonbi_exports);
registerAvatar("visitor", visitor_exports);
registerAvatar("scv", scv_exports);
registerAvatar("drone", drone_exports);
registerAvatar("probe", probe_exports);
for (const k of [
	"siegeTank",
	"ultralisk",
	"reaver"
]) registerBusLook(k, unitBusLook(k));
registerBusLook("palanquin", {
	build: buildPalanquinMesh,
	carriers: true,
	headlights: false,
	stop: buildChorongPostMesh,
	stopGlow: buildChorongGlowMesh,
	stopGrowFrom: 18
});
var JOSEON_STYLE = modes.settings("joseon").city.pack;
var json = (id) => JSON.parse(document.getElementById(id).textContent);
var stations = json("stationData").map((s) => NEW_NAMES[s.name] ? {
	...s,
	name: NEW_NAMES[s.name]
} : s);
json("lineCounts");
var paths = json("linePaths");
var colors = {
	"1호선": "#0052A4",
	"2호선": "#00A84D",
	"3호선": "#EF7C1C",
	"4호선": "#00A5DE",
	"5호선": "#996CAC",
	"6호선": "#CD7C2F",
	"7호선": "#747F00",
	"8호선": "#E6186C",
	"9호선": "#BDB092",
	"GTX-A": "#9A6292",
	"경강선": "#0054A6",
	"경의중앙선": "#77C4A3",
	"경춘선": "#178C72",
	"공항철도": "#0090D2",
	"김포골드라인": "#AD8605",
	"서해선": "#8FC31F",
	"수인분당선": "#F5A200",
	"신림선": "#6789CA",
	"신분당선": "#D4003B",
	"에버라인선": "#6FB245",
	"우이신설선": "#B7C452",
	"의정부선": "#FDA600",
	"인천1호선": "#7CA8D5",
	"인천2호선": "#ED8B00"
};
var HOME = {
	center: [126.98, 37.53],
	zoom: 10
};
var LINE_GAP = 5;
var edgeKey = (a, b) => a < b ? `${a}:${b}` : `${b}:${a}`;
var { byId, stationByLine, route, learnDirections } = createRouter({
	stations,
	paths
});
var sunPosition = (date = window.__sunTime || /* @__PURE__ */ new Date()) => sunPosition$1(date);
var esc = (v) => String(v).replace(/[&<>"]/g, (c) => ({
	"&": "&amp;",
	"<": "&lt;",
	">": "&gt;",
	"\"": "&quot;"
})[c]);
var merc = (s) => s.m ??= maplibregl.MercatorCoordinate.fromLngLat([s.lon, s.lat]);
var edgeLines = /* @__PURE__ */ new Map();
Object.entries(paths).forEach(([line, chunks]) => chunks.forEach((ids) => ids.slice(1).forEach((b, i) => {
	const k = edgeKey(ids[i], b);
	if (!edgeLines.has(k)) edgeLines.set(k, /* @__PURE__ */ new Set());
	edgeLines.get(k).add(line);
})));
var edgeOffset = (line, a, b) => {
	const shared = [...edgeLines.get(edgeKey(a, b)) || [line]].sort((x, y) => x.localeCompare(y, "ko"));
	return (shared.indexOf(line) - (shared.length - 1) / 2) * LINE_GAP;
};
var shapes = {};
var stops = {};
var stopDirs = {};
var stopHalf = {};
var platformHalf = {};
var stopWidth = {};
var stopReach = {};
var stopPos = (line, s) => {
	const k = `${line}:${s.id}`, m = stops$1[k];
	return m ? [m[0], m[1]] : stops[k] || [s.lon, s.lat];
};
var stopMerc = /* @__PURE__ */ new Map();
var mercStop = (line, s) => {
	const k = `${line}:${s.id}`;
	let m = stopMerc.get(k);
	if (!m) {
		m = maplibregl.MercatorCoordinate.fromLngLat(stopPos(line, s));
		stopMerc.set(k, m);
	}
	return m;
};
function chaikin(pts, rounds = 3) {
	for (let r = 0; r < rounds && pts.length > 2; r++) {
		const out = [pts[0]];
		for (let i = 0; i < pts.length - 1; i++) {
			const a = pts[i], b = pts[i + 1];
			if (i > 0) out.push([a[0] * .75 + b[0] * .25, a[1] * .75 + b[1] * .25]);
			if (i < pts.length - 2) out.push([a[0] * .25 + b[0] * .75, a[1] * .25 + b[1] * .75]);
		}
		out.push(pts[pts.length - 1]);
		pts = out;
	}
	return pts;
}
var smoothCache = /* @__PURE__ */ new Map();
var edgeCoords = (line, lo, hi) => {
	const k = `${line}:${lo}:${hi}`;
	if (!shapes[k]) return [stopPos(line, byId.get(lo)), stopPos(line, byId.get(hi))];
	let c = smoothCache.get(k);
	if (!c) {
		c = chaikin(shapes[k]);
		smoothCache.set(k, c);
	}
	return c;
};
var basicRouteCache = /* @__PURE__ */ new Map();
var terminalStops = /* @__PURE__ */ new Set();
var stopLinks = /* @__PURE__ */ new Map();
for (const [line, chunks] of Object.entries(paths)) for (const ids of chunks) for (let i = 1; i < ids.length; i++) for (const [a, b] of [[ids[i - 1], ids[i]], [ids[i], ids[i - 1]]]) {
	const k = `${line}:${a}`;
	if (!stopLinks.has(k)) stopLinks.set(k, /* @__PURE__ */ new Set());
	stopLinks.get(k).add(b);
}
for (const [key, set] of stopLinks) if (set.size === 1) terminalStops.add(key);
var SLOT_EASE_M = 80;
function stopSlot(line, id, lo, hi) {
	let best = null;
	for (const n of stopLinks.get(`${line}:${id}`) || []) {
		const a = Math.min(id, n), b = Math.max(id, n), size = edgeLines.get(edgeKey(a, b))?.size || 1, o = a === lo && b === hi ? edgeOffset(line, a, b) : edgeOffset(line, a, b) * (id === hi === (id === a) ? 1 : -1);
		if (!best || size > best.size || size === best.size && Math.abs(o) < Math.abs(best.o)) best = {
			size,
			o
		};
	}
	return best ? best.o : edgeOffset(line, lo, hi);
}
function basicTrack(line, lo, hi) {
	const key = `${line}:${lo}:${hi}`, mid = edgeOffset(line, lo, hi), sLo = stopSlot(line, lo, lo, hi), sHi = stopSlot(line, hi, lo, hi), shifted = Boolean(mid || sLo || sHi), zoom = shifted ? map.getZoom() : 0;
	let cached = basicRouteCache.get(key);
	if (cached?.zoom === zoom) return cached;
	const hLo = (platformHalf[`${line}:${lo}`] || PLATFORM_HALF) + 5, hHi = (platformHalf[`${line}:${hi}`] || PLATFORM_HALF) + 5, ease = (t) => {
		t = Math.max(0, Math.min(1, t));
		return t * t * (3 - 2 * t);
	};
	const slot = (d, total) => {
		const a = 1 - ease((d - hLo) / SLOT_EASE_M), b = 1 - ease((total - d - hHi) / SLOT_EASE_M);
		return (sLo * a + sHi * b + mid * Math.max(0, 1 - a - b)) / Math.max(1, a + b);
	};
	const train = offsetCoords(cityCoords(line, lo, hi), sLo === mid && sHi === mid ? mid : slot, map.getZoom()), coords = [...train];
	const terminal = (id) => terminalStops.has(`${line}:${id}`);
	if (terminal(lo)) coords.unshift(extendStart(train, platformHalf[`${line}:${lo}`] || PLATFORM_HALF));
	if (terminal(hi)) coords.push(extendStart([...train].reverse(), platformHalf[`${line}:${hi}`] || PLATFORM_HALF));
	cached = {
		zoom,
		train,
		coords,
		shifted
	};
	basicRouteCache.set(key, cached);
	return cached;
}
function buildLineFeatures() {
	const features = [], drawn = /* @__PURE__ */ new Set(), kind = modeCtl.settings().track.kind;
	Object.entries(paths).forEach(([line, chunks]) => chunks.forEach((ids) => ids.slice(1).forEach((b, i) => {
		const lo = Math.min(ids[i], b), hi = Math.max(ids[i], b), id = `${line}:${lo}:${hi}`;
		if (drawn.has(id) || !byId.has(lo) || !byId.has(hi)) return;
		drawn.add(id);
		const coords = kind === "coaster" ? coasterPath(line, lo, hi).pts.map((q) => new maplibregl.MercatorCoordinate(q.x, q.y).toLngLat().toArray()) : kind === "viaduct" ? cityCoords(line, lo, hi) : basicTrack(line, lo, hi).coords;
		features.push({
			type: "Feature",
			properties: {
				line,
				color: colors[line],
				offset: kind === "ground" ? 0 : edgeOffset(line, lo, hi)
			},
			geometry: {
				type: "LineString",
				coordinates: coords
			}
		});
	})));
	return features;
}
var edgeGeom = /* @__PURE__ */ new Map();
function geom(line, a, b) {
	return modeCtl.settings().track.kind === "coaster" ? coasterPath(line, a, b) : cityGeom(line, a, b);
}
var cityCoords = (line, lo, hi) => cityViaduct.snapped(line, lo, hi) || edgeCoords(line, lo, hi);
function cityGeom(line, a, b) {
	const lo = Math.min(a, b), hi = Math.max(a, b), sn = cityViaduct.snapped(line, lo, hi);
	if (!sn) return realGeom(line, a, b);
	const id = `s:${line}:${lo}:${hi}`;
	let g = edgeGeom.get(id);
	if (g) return g;
	g = withCum(sn.map((c) => maplibregl.MercatorCoordinate.fromLngLat(c)));
	edgeGeom.set(id, g);
	return g;
}
function basicDrawGeom(line, a, b) {
	const lo = Math.min(a, b), hi = Math.max(a, b), track = basicTrack(line, lo, hi);
	if (!track.shifted) return cityGeom(line, a, b);
	const key = `b:${line}:${lo}:${hi}`;
	let g = edgeGeom.get(key);
	if (g?.track === track) return g;
	g = withCum(track.train.map((c) => maplibregl.MercatorCoordinate.fromLngLat(c)));
	g.track = track;
	edgeGeom.set(key, g);
	return g;
}
var withCum = (pts) => {
	const cum = [0];
	for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
	return {
		pts,
		cum,
		total: cum[cum.length - 1]
	};
};
function realGeom(line, a, b) {
	const lo = Math.min(a, b), hi = Math.max(a, b), id = `${line}:${lo}:${hi}`;
	let g = edgeGeom.get(id);
	if (g) return g;
	g = withCum(edgeCoords(line, lo, hi).map((c) => maplibregl.MercatorCoordinate.fromLngLat(c)));
	edgeGeom.set(id, g);
	return g;
}
function along(line, from, to, k) {
	if (from === to) {
		const m = mercStop(line, from);
		return {
			x: m.x,
			y: m.y,
			f: [0, -1]
		};
	}
	const g = modeCtl.settings().track.kind === "ground" ? basicDrawGeom(line, from.id, to.id) : geom(line, from.id, to.id), rev = from.id > to.id, d = (rev ? 1 - k : k) * g.total;
	let i = 1;
	while (i < g.pts.length - 1 && g.cum[i] < d) i++;
	const A = g.pts[i - 1], B = g.pts[i], seg = g.cum[i] - g.cum[i - 1] || 1, u = Math.max(0, Math.min(1, (d - g.cum[i - 1]) / seg));
	const len = Math.hypot(B.x - A.x, B.y - A.y) || 1, sign = rev ? -1 : 1;
	return {
		x: A.x + (B.x - A.x) * u,
		y: A.y + (B.y - A.y) * u,
		f: [sign * (B.x - A.x) / len, sign * (B.y - A.y) / len]
	};
}
var PLATFORM_HALF = 90;
function metresBetween(a, b) {
	return Math.hypot((b[0] - a[0]) * Math.cos(a[1] * Math.PI / 180), b[1] - a[1]) * 111320;
}
function trackFrom(line, s, n, dist) {
	const c = cityCoords(line, Math.min(s.id, n.id), Math.max(s.id, n.id)), pts = s.id < n.id ? c : [...c].reverse(), out = [pts[0]];
	let left = dist;
	for (let i = 1; i < pts.length && left > 0; i++) {
		const d = metresBetween(pts[i - 1], pts[i]);
		if (d >= left) {
			const u = left / d;
			out.push([pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * u, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * u]);
			left = 0;
		} else {
			out.push(pts[i]);
			left -= d;
		}
	}
	return out;
}
function neighbours(line, s) {
	for (const ids of paths[line] || []) {
		const i = ids.indexOf(s.id);
		if (i >= 0) return {
			prev: byId.get(ids[i - 1]),
			next: byId.get(ids[i + 1])
		};
	}
	return {};
}
function platformNeighbours(line, s) {
	const result = neighbours(line, s);
	for (const ids of paths[line] || []) {
		const i = ids.indexOf(s.id);
		if (i < 0) continue;
		const p = byId.get(ids[i - 1]), n = byId.get(ids[i + 1]);
		if (!result.prev && p && p !== result.next) result.prev = p;
		if (!result.next && n && n !== result.prev) result.next = n;
	}
	return result;
}
var STATION_WIDTH_STOPS = [
	[8, 6],
	[12, 11],
	[14, 16],
	[16, 24],
	[18, 28]
];
var stationWidthPx = (z) => {
	const S = STATION_WIDTH_STOPS;
	if (z <= S[0][0]) return S[0][1];
	for (let i = 1; i < S.length; i++) if (z <= S[i][0]) {
		const [z0, w0] = S[i - 1], [z1, w1] = S[i];
		return w0 + (w1 - w0) * (z - z0) / (z1 - z0);
	}
	return S[S.length - 1][1];
};
var stationRects = /* @__PURE__ */ new Map();
var PLATFORM_SCALE = .3;
var platformPx = (r, base) => {
	if (!r.widthM) return base;
	const lat = r.coords[0][1] * Math.PI / 180, mpp = 40075016.686 * Math.cos(lat) / (512 * 2 ** map.getZoom());
	return Math.max(base, Math.min(base * 2, r.widthM / mpp));
};
function buildStationFeatures() {
	const { platform, kind } = modeCtl.settings().track, ribbon = platform === "ribbon", ground = kind === "ground";
	return stations.flatMap((s) => s.lines.map((x) => {
		const line = x.name, { prev, next } = neighbours(line, s);
		prev ? trackFrom(line, s, prev, PLATFORM_HALF).reverse() : stopPos(line, s);
		next ? trackFrom(line, s, next, PLATFORM_HALF) : stopPos(line, s);
		if (ribbon) {
			const { prev, next } = platformNeighbours(line, s);
			const half = platformHalf[`${line}:${s.id}`] || PLATFORM_HALF;
			const from = (n) => {
				const lo = Math.min(s.id, n.id), hi = Math.max(s.id, n.id), t = ground ? basicTrack(line, lo, hi).train : cityCoords(line, lo, hi);
				return s.id < n.id ? t : [...t].reverse();
			};
			const incoming = prev ? from(prev) : null, outgoing = next ? from(next) : null;
			const bk = incoming ? trackStart(incoming, half).reverse() : outgoing ? [extendStart(outgoing, half), outgoing[0]] : [stopPos(line, s)];
			const ah = outgoing ? trackStart(outgoing, half) : incoming ? [incoming[0], extendStart(incoming, half)] : [stopPos(line, s)];
			const coords = [...bk, ...metresBetween(bk.at(-1), ah[0]) < .01 ? ah.slice(1) : ah], center = (outgoing || incoming)?.[0] || stopPos(line, s);
			const ref = next ? [s, next] : prev ? [prev, s] : null, offset = ground || !ref ? 0 : edgeOffset(line, ref[0].id, ref[1].id) * (ref[0].id < ref[1].id ? 1 : -1);
			stationRects.set(`${line}:${s.id}`, {
				coords,
				center,
				offset,
				widthM: stopWidth[`${line}:${s.id}`] || 0,
				plat: 1,
				half,
				reach: stopReach[`${line}:${s.id}`] || null
			});
			return {
				type: "Feature",
				properties: {
					id: s.id,
					name: s.name,
					line,
					lines: s.lines.map((y) => y.name).join("|"),
					color: colors[line],
					transfer: s.lines.length > 1 ? 1 : 0,
					offset
				},
				geometry: {
					type: "LineString",
					coordinates: coords
				}
			};
		}
		const c = stopPos(line, s), kx = Math.cos(c[1] * Math.PI / 180), M = 111320;
		const fit = (half) => {
			const bk = prev ? trackFrom(line, s, prev, half).reverse() : [c], ah = next ? trackFrom(line, s, next, half) : [c], raw = [...bk, ...ah.slice(1)], pts = [];
			for (let i = 0; i < raw.length; i++) {
				pts.push(raw[i]);
				if (i < raw.length - 1) {
					const a = raw[i], b = raw[i + 1], n = Math.ceil(metresBetween(a, b) / 5);
					for (let k = 1; k < n; k++) pts.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]);
				}
			}
			const xy = pts.map((p) => [(p[0] - c[0]) * kx * M, (p[1] - c[1]) * M]), mx = xy.reduce((t, p) => t + p[0], 0) / xy.length, my = xy.reduce((t, p) => t + p[1], 0) / xy.length;
			let sxx = 0, syy = 0, sxy = 0;
			for (const [x, y] of xy) {
				sxx += (x - mx) ** 2;
				syy += (y - my) ** 2;
				sxy += (x - mx) * (y - my);
			}
			const th = .5 * Math.atan2(2 * sxy, sxx - syy);
			let dx = Math.cos(th), dy = Math.sin(th);
			if (xy.length < 2 || !isFinite(th)) {
				dx = 1;
				dy = 0;
			}
			const e0 = xy[0], e1 = xy[xy.length - 1];
			if ((e1[0] - e0[0]) * dx + (e1[1] - e0[1]) * dy < 0) {
				dx = -dx;
				dy = -dy;
			}
			const dev = Math.max(0, ...xy.map(([x, y]) => Math.abs(-(x - mx) * dy + (y - my) * dx)));
			const t0 = -mx * dx - my * dy;
			return {
				dx,
				dy,
				cx: mx + dx * t0,
				cy: my + dy * t0,
				dev
			};
		};
		let h = stopHalf[`${line}:${s.id}`] || PLATFORM_HALF, f;
		const sm = stops$1[`${line}:${s.id}`], sd = sm?.length > 3 ? [sm[2], sm[3]] : stopDirs[`${line}:${s.id}`];
		if (sd) {
			let [ex, ey] = sd;
			const t = next || prev;
			if (t) {
				const tx = (t.lon - c[0]) * kx * M, ty = (t.lat - c[1]) * M, sg = next ? 1 : -1;
				if ((ex * tx + ey * ty) * sg < 0) {
					ex = -ex;
					ey = -ey;
				}
			}
			f = {
				dx: ex,
				dy: ey,
				cx: 0,
				cy: 0
			};
		} else {
			f = fit(h);
			while (f.dev > 6 && h > 30) {
				h -= 10;
				f = fit(h);
			}
		}
		const { dx, dy, cx: cxm, cy: cym } = f;
		const toLL = (x, y) => [c[0] + x / (kx * M), c[1] + y / M], coords = [toLL(cxm - dx * h, cym - dy * h), toLL(cxm + dx * h, cym + dy * h)];
		const ref = next ? [s, next] : prev ? [prev, s] : null, offset = ref ? edgeOffset(line, ref[0].id, ref[1].id) * (ref[0].id < ref[1].id ? 1 : -1) : 0;
		const ph = platformHalf[`${line}:${s.id}`];
		stationRects.set(`${line}:${s.id}`, {
			coords,
			offset,
			widthM: stopWidth[`${line}:${s.id}`] || 0,
			plat: ph ? Math.min(1, ph / h) : 1
		});
		return {
			type: "Feature",
			properties: {
				id: s.id,
				name: s.name,
				line,
				lines: s.lines.map((y) => y.name).join("|"),
				color: colors[line],
				transfer: s.lines.length > 1 ? 1 : 0,
				offset
			},
			geometry: {
				type: "LineString",
				coordinates: coords
			}
		};
	}));
}
var shapesReady = fetch("./track_shapes.json", { cache: "no-cache" }).then((r) => r.ok ? r.json() : {}).then((d) => {
	d = d || {};
	shapes = d.edges || (d.stops ? {} : d);
	stops = d.stops || {};
	stopDirs = d.stopDirs || {};
	stopHalf = d.stopHalf || {};
	platformHalf = d.platformHalf || {};
	stopWidth = d.stopWidth || {};
	stopReach = d.stopReach || {};
	smoothCache.clear();
	basicRouteCache.clear();
	stationRects.clear();
	edgeGeom.clear();
	coasterMotion.clear();
	coasterGeo.reset();
	stopMerc.clear();
	if (Object.keys(shapes).length) document.querySelector(".provenance")?.insertAdjacentHTML("beforeend", " 선로 형태는 © OpenStreetMap contributors 자료를 사용했습니다.");
	planner.rebuild();
}).catch(() => {});
var PHONE = matchMedia("(max-width:720px),(pointer:coarse)").matches;
var RIDE_PX = ((m) => m ? +m[1] : PHONE ? 1.5 : 0)(location.hash.match(/ridepx=([\d.]+)/));
var REDUCED = matchMedia("(prefers-reduced-motion: reduce)");
var TRAIN_FPS = 30;
var FOLLOW_FPS = 30;
var SAVER_FPS = 15;
var animFrame = [];
var trainTimer = 0;
var trainAt = 0;
var drawTrains = () => {};
var myLocation = null;
var saverOn = false;
var frameMs = () => 1e3 / (saverOn ? SAVER_FPS : TRAIN_FPS);
var frameStats = {
	trains: 0,
	signs: 0,
	signQueries: 0,
	mapRenders: 0
};
function trainFrameSoon(ms) {
	if (document.hidden) return;
	if (saverOn && ms > 0 && ms < 1e3 / SAVER_FPS) ms = 1e3 / SAVER_FPS;
	const at = performance.now() + ms;
	if (trainTimer && trainAt <= at) return;
	clearTimeout(trainTimer);
	trainAt = at;
	trainTimer = setTimeout(() => {
		trainTimer = 0;
		requestAnimationFrame(() => {
			if (!map.isMoving()) drawTrains();
		});
	}, ms);
}
document.addEventListener("visibilitychange", () => {
	if (!document.hidden) trainFrameSoon(0);
});
var map = new maplibregl.Map({
	container: "map",
	pixelRatio: Math.min(devicePixelRatio || 1, PHONE ? 2 : 3),
	localIdeographFontFamily: "\"Noto Sans KR\",\"Apple SD Gothic Neo\",\"Malgun Gothic\",sans-serif",
	...HOME,
	pitch: 35,
	bearing: 0,
	maxZoom: 20,
	minZoom: 7,
	zoomLevelsToOverscale: void 0,
	style: {
		version: 8,
		sources: {},
		layers: [{
			id: "background",
			type: "background",
			paint: { "background-color": "#edf2f1" }
		}]
	},
	attributionControl: false,
	canvasContextAttributes: { antialias: !location.hash.includes("noaa") }
});
var BASE_PR = map.getPixelRatio();
var BASE_FOV = map.getVerticalFieldOfView();
var busLayer = null;
map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
var me = createMyMotion();
var geolocate = new maplibregl.GeolocateControl({
	positionOptions: {
		enableHighAccuracy: true,
		maximumAge: 2e3
	},
	trackUserLocation: true,
	showAccuracyCircle: false,
	fitBoundsOptions: { maxZoom: 16 }
});
map.addControl(geolocate, "top-right");
var autoLocating = false;
var lastFix = null;
var geolocateButton = map.getContainer().querySelector(".maplibregl-ctrl-geolocate");
geolocateButton?.addEventListener("click", (ev) => {
	const cls = geolocateButton.classList;
	if (!cls.contains("maplibregl-ctrl-geolocate-active") || cls.contains("maplibregl-ctrl-geolocate-active-error")) return;
	ev.stopImmediatePropagation();
	if (cls.contains("maplibregl-ctrl-geolocate-waiting") || !lastFix) return;
	map.fitBounds(maplibregl.LngLatBounds.fromLngLat(new maplibregl.LngLat(lastFix.longitude, lastFix.latitude), lastFix.accuracy), {
		maxZoom: 16,
		bearing: map.getBearing()
	}, { geolocateSource: true });
}, true);
geolocate.on("error", (e) => {
	if (autoLocating) {
		autoLocating = false;
		return;
	}
	if (myLocation && e.code !== 1) return;
	updateLiveNotice("위치를 가져오지 못했어요. 브라우저의 위치 권한을 확인해 주세요.");
});
var METRO_AREA = [
	126.3,
	36.8,
	127.9,
	38.3
];
map.once("load", () => {
	if (!navigator.geolocation) return;
	navigator.geolocation.getCurrentPosition((pos) => {
		const { longitude: x, latitude: y } = pos.coords, [w, s, e, n] = METRO_AREA;
		if (x < w || x > e || y < s || y > n) return;
		autoLocating = true;
		geolocate.trigger();
	}, () => {}, {
		enableHighAccuracy: false,
		timeout: 8e3,
		maximumAge: 3e5
	});
});
geolocate.on("geolocate", (e) => {
	autoLocating = false;
	lastFix = e.coords;
	me.fix(e);
});
var selected = "all";
var trainsEnabled = true;
var ready = false;
var pendingLine = null;
var $ = (id) => document.getElementById(id);
var liveState = document.querySelector("#liveState span");
var planner = createTrainPlanner({
	stations,
	stationByLine,
	key,
	normStatus,
	route,
	merc,
	realGeom,
	geom,
	trainPose,
	mercStop,
	catchup,
	catchupAt,
	predictStops: () => modeCtl.settings().trains.predictStops,
	isRide: () => rider.ride,
	getTrains: () => feed.trains
});
var { age, clock } = planner;
var exits = {};
var exitCol = /* @__PURE__ */ new Map();
var EXIT_MINZOOM = 16;
var EXIT_MAX_M = 350;
var EXIT_PASSAGES = false;
var exitsReady = fetch("./exits.json", { cache: "no-cache" }).then((r) => r.ok ? r.json() : {}).then((d) => {
	exits = d || {};
}).catch(() => {});
function exitFeatures() {
	return Object.entries(exits).flatMap(([id, list]) => list.map(([lon, lat, ref, wc]) => ({
		type: "Feature",
		properties: {
			ref,
			wc: wc ?? -1,
			station: +id
		},
		geometry: {
			type: "Point",
			coordinates: [lon, lat]
		}
	})));
}
var smooth = (x) => x * x * (3 - 2 * x);
var modeCtl = createModeController({
	registry: modes,
	clock: () => clock(),
	prepare: (id) => prepareMode(id),
	onRequest: (want, now) => {
		showModeButtons(want);
		modeBusy.request(want, now);
	},
	onFail: (now) => {
		showModeButtons(now);
		modeBusy.end();
	},
	commit: (prev, next, o) => {
		commitMode(prev, next, o);
		modeBusy.committed(next);
		if (location.hash.includes("debug")) console.info("[mode]", prev, "→", next, modes.explain(next));
	}
});
var modeOn = modeCtl.flags;
var cityPack = () => modeCtl.settings().city.pack;
var CityBuildings;
var CityLandmarks;
var TurtleShips;
var UnitConvoy;
var LifeUnits;
var SkyUnits;
var CoasterTrain;
var RideTrack;
var SLEEPER_M;
var RideLayer;
var CoasterRidePlacement;
var sampleRideTracks;
var FestoonLayer;
var NightBloom;
var PixelPalette;
var kitReady = false;
var kitLoad = null;
var cityBuildings = null;
var cityLandmarks = null;
var cityOn = () => modeCtl.settings().city.enabled;
var MODE_KIT_DEPS = [
	"city/mesh",
	"modes/nations/models",
	"city/sign_text",
	"city/parts",
	"city/geom",
	"city/mvt",
	"city/through_buildings",
	"city/landmarks_data",
	"modes/coaster/badges",
	"modes/coaster/ride_sites",
	"modes/starcraft/building_models"
];
function loadModeKit() {
	if (!kitLoad) for (const n of MODE_KIT_DEPS) __vitePreload(() => import(`./${n}.mjs`), [], import.meta.url).catch(() => {});
	return kitLoad ??= Promise.all([
		__vitePreload(() => import("./city/buildings.mjs"), [], import.meta.url),
		__vitePreload(() => import("./city/landmarks.mjs"), [], import.meta.url),
		__vitePreload(() => import("./modes/joseon/turtle_ship.mjs"), [], import.meta.url),
		__vitePreload(() => import("./modes/coaster/train.mjs"), [], import.meta.url),
		__vitePreload(() => import("./modes/coaster/ride_track.mjs"), [], import.meta.url),
		__vitePreload(() => import("./modes/coaster/rides.mjs"), [], import.meta.url),
		__vitePreload(() => import("./modes/coaster/ride_placement.mjs"), [], import.meta.url),
		__vitePreload(() => import("./modes/joseon/hanok.mjs"), [], import.meta.url),
		__vitePreload(() => import("./modes/coaster/festoon.mjs"), [], import.meta.url),
		__vitePreload(() => import("./city/bloom.mjs"), [], import.meta.url),
		__vitePreload(() => import("./modes/starcraft/convoy.mjs"), [], import.meta.url),
		__vitePreload(() => import("./modes/starcraft/race_buildings.mjs"), [], import.meta.url),
		__vitePreload(() => import("./city/pixel_palette.mjs"), [], import.meta.url),
		__vitePreload(() => import("./modes/nations/parts.mjs"), [], import.meta.url),
		__vitePreload(() => import("./modes/starcraft/life_units.mjs"), [], import.meta.url),
		__vitePreload(() => import("./modes/starcraft/sky_units.mjs"), [], import.meta.url)
	]).then(([b, l, t, c, r, p, q, , f, nb, sc, , pp, , lu, sk]) => {
		({UnitConvoy} = sc);
		({PixelPalette} = pp);
		({LifeUnits} = lu);
		({SkyUnits} = sk);
		({FestoonLayer} = f);
		({NightBloom} = nb);
		({CityBuildings} = b);
		({CityLandmarks} = l);
		({TurtleShips} = t);
		({CoasterTrain} = c);
		({RideTrack, SLEEPER_M} = r);
		({RideLayer} = p);
		({CoasterRidePlacement, sampleRideTracks} = q);
		cityBuildings = new CityBuildings({ phone: PHONE });
		cityLandmarks = new CityLandmarks();
		kitReady = true;
		map.triggerRepaint();
	}).catch((e) => {
		kitLoad = null;
		console.warn("mode kit: failed to load", e);
		throw e;
	});
}
function cityXrayTargets() {
	const X = cityBuildings.P.xray;
	if (!X || !X.on) return null;
	const b = map.getBounds(), A = maplibregl.MercatorCoordinate.fromLngLat(b.getSouthWest()), B = maplibregl.MercatorCoordinate.fromLngLat(b.getNorthEast()), m = maplibregl.MercatorCoordinate.fromLngLat(map.getCenter()).meterInMercatorCoordinateUnits();
	const zoom = map.getZoom(), unit = 1 / (512 * 2 ** zoom), pad = (B.x - A.x) * .3, inV = (x, y) => x > A.x - pad && x < B.x + pad && y > B.y - pad && y < A.y + pad, out = [];
	for (const [k, r] of stationRects) {
		const c = r.coords, i = k.lastIndexOf(":"), line = k.slice(0, i), id = +k.slice(i + 1);
		const P = maplibregl.MercatorCoordinate.fromLngLat(c[0]), Q = maplibregl.MercatorCoordinate.fromLngLat(c[c.length - 1]), cx = (P.x + Q.x) / 2, cy = (P.y + Q.y) / 2;
		if (!inV(cx, cy)) continue;
		const h = cityViaduct.stationH(line, id) * m, box = {
			z0: h - X.platformBelowM * m,
			z1: h + X.platformAboveM * m,
			w: (Math.max(r.widthM || 0, 10) / 2 + X.platformMarginM) * m + Math.abs(r.offset || 0) * unit,
			m
		};
		if (r.center && c.length > 2) {
			const M = c.map((q) => maplibregl.MercatorCoordinate.fromLngLat(q)), cum = [0];
			for (let j = 1; j < M.length; j++) cum.push(cum[j - 1] + Math.hypot(M[j].x - M[j - 1].x, M[j].y - M[j - 1].y));
			const total = cum.at(-1), n = Math.max(1, Math.ceil(total / ((X.pieceM || 30) * m * .98)));
			let j = 1;
			const at = (s) => {
				while (j < M.length - 1 && cum[j] < s) j++;
				const A = M[j - 1], B = M[j], u = Math.max(0, Math.min(1, (s - cum[j - 1]) / (cum[j] - cum[j - 1] || 1)));
				return [A.x + (B.x - A.x) * u, A.y + (B.y - A.y) * u];
			};
			let a = at(0);
			for (let i = 1; i <= n; i++) {
				const b = at(total * i / n);
				out.push({
					id: "s" + k + ":" + i,
					ax: a[0],
					ay: a[1],
					bx: b[0],
					by: b[1],
					...box
				});
				a = b;
			}
			continue;
		}
		const dx = Q.x - P.x, dy = Q.y - P.y, d = Math.hypot(dx, dy) || 1e-12, L = Math.max(20 * m, d * Math.max(.1, Math.min(1, r.plat || 1))) / 2;
		out.push({
			id: "s" + k,
			ax: cx - dx / d * L,
			ay: cy - dy / d * L,
			bx: cx + dx / d * L,
			by: cy + dy / d * L,
			...box
		});
	}
	if (X.trains && trainsEnabled) {
		const bodyPx = trainBodyPx(zoom), lane = cityViaduct.train(zoom, bodyPx).lanePx;
		for (const plan of planner.plans) {
			const pose = trainPose(plan);
			if (!journeyMap.trainShown(plan, pose.dist)) continue;
			const q = trackPoint(plan, pose.dist);
			if (!inV(q.x, q.y)) continue;
			const half = Math.max(plan.cars * plan.carMetres * m, TRAIN_MIN_PX * unit) / 2, a = trackPoint(plan, pose.dist - half), e = trackPoint(plan, pose.dist + half);
			out.push({
				id: "t" + plan.id,
				ax: a.x,
				ay: a.y,
				bx: e.x,
				by: e.y,
				z0: q.h - X.trainBelowM * m,
				z1: q.h + X.trainAboveM * m,
				w: X.trainHalfWidthM * m + (Math.abs(q.off || 0) + lane + bodyPx) * unit,
				m
			});
		}
	}
	return out;
}
var prebuildOn = null;
var prebuildWant = () => prebuildOn ??= /(^|[^o])prebuild/.test(location.hash) ? true : location.hash.includes("noprebuild") ? false : ((v) => v ? v === "on" : !PHONE)(prefs.get("prebuild"));
function prebuildCity() {
	if (prebuildWant() && cityBuildings && !cityOn() && !document.hidden && cityBuildings.P.pack === modes.settings("simcity").city.pack) cityBuildings.prebuild(map);
}
function syncCity() {
	if (!ready || !cityBuildings) return;
	if (cityOn() && !map.getLayer("city-buildings")) map.addLayer(cityBuildings, map.getLayer("station-names") ? "station-names" : void 0);
	cityBuildings.set({
		on: cityOn(),
		tone: modeCtl.settings().city.tone,
		theme: effectiveTheme(),
		pack: cityPack(),
		night: { lights: nightNow().lights }
	});
	syncNightBloom();
}
var nightLook = {
	lights: true,
	bloom: true,
	ground: true,
	bloomTune: null
};
function nightNow() {
	const N = cityPack()?.night, on = !!N && cityOn() && effectiveTheme() === "dark";
	return {
		lights: on && nightLook.lights && !!N.lights,
		ground: on && nightLook.ground && !!N.ground,
		bloom: on && nightLook.bloom && !!N.bloom && (!PHONE || N.bloom.phone === true),
		N
	};
}
var mapBloom = {
	id: "city-night-bloom",
	type: "custom",
	renderingMode: "2d",
	fx: null,
	onAdd(m, gl) {
		this.gl = gl;
	},
	onRemove(m, gl) {
		this.fx?.dispose(gl);
		this.fx = null;
	},
	render(gl) {
		const n = nightNow();
		if (!n.bloom || !NightBloom) return;
		if (!this.fx) {
			this.fx = new NightBloom();
			this.fx.init(gl);
		}
		const B = {
			...n.N.bloom,
			...nightLook.bloomTune
		};
		this.fx.render(gl, {
			strength: B.strength,
			threshold: B.threshold,
			knee: B.knee,
			levels: B.levels,
			tint: hexRgb01(B.tint || "#FFFFFF")
		});
	}
};
var hexRgb01 = (h) => [
	1,
	3,
	5
].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
function syncNightBloom() {
	if (!ready) return;
	const on = nightNow().bloom && !!map.getLayer("city-buildings");
	if (on && !map.getLayer("city-night-bloom")) map.addLayer(mapBloom, map.getLayer("station-names") ? "station-names" : void 0);
	else if (!on && map.getLayer("city-night-bloom")) map.removeLayer("city-night-bloom");
}
function setNightLook(o) {
	Object.assign(nightLook, o || {});
	applyTheme();
	map.triggerRepaint();
	return { ...nightLook };
}
var cityViaduct = new CityViaduct({
	pack: SEOUL_CITY_STYLE,
	net: {
		paths,
		colors,
		geom,
		offset: edgeOffset,
		bodyPx: (z) => trainBodyPx(z),
		get byId() {
			return byId;
		},
		get rects() {
			return stationRects;
		},
		get exits() {
			return exits;
		}
	}
});
var coasterGeo = createCoasterGeometry({
	maplibregl,
	paths,
	byId,
	cityViaduct,
	edgeGeom,
	geom,
	cityGeom,
	withCum,
	metresBetween,
	smooth,
	onFresh: () => {
		coasterMotion.clear();
		coasterTrack.stale = true;
	}
});
var { coasterPath, rolled, CORK_HEART, coasterProfile, coasterAt, coasterGaps, coasterRises, inversion, loopD, corkOf, loadCoasterBuildings } = coasterGeo;
var warpNow = () => modeCtl.warpNow();
var coasterMotion = createCoasterMotion({
	geom,
	coasterAt,
	isCoaster: () => modeCtl.settings().track.kind === "coaster"
});
var { ridePace, toRide, fromRide } = coasterMotion;
var TRAIN_GAP_M = 20;
var spaced = /* @__PURE__ */ new Map();
var spacedAt = -1e9;
var spacedFor = null;
function trainPose(p) {
	const now = clock(), plans = planner.plans;
	if ((now === planner.frameClock ? now !== spacedAt : now - spacedAt > 10) || spacedFor !== plans) {
		spaceTrains();
		spacedAt = now;
		spacedFor = plans;
	}
	return spaced.get(p) || rawPose(p);
}
function spaceTrains() {
	spaced.clear();
	const groups = /* @__PURE__ */ new Map(), at = (e) => {
		const q = trackPoint(e.p, e.pose.dist);
		e.x = q.x;
		e.y = q.y;
		e.f = q.f;
	};
	for (const p of planner.plans) {
		const pose = rawPose(p);
		spaced.set(p, pose);
		if (p.seq.length < 2) continue;
		const m = mercStop(p.t.line, p.seq[0]).meterInMercatorCoordinateUnits(), k = `${p.t.line}|${p.t.direction}|${p.t.express ? 1 : 0}`, e = {
			p,
			pose,
			half: p.cars * p.carMetres * m / 2,
			m
		};
		at(e);
		if (!groups.has(k)) groups.set(k, []);
		groups.get(k).push(e);
	}
	for (const g of groups.values()) if (g.length > 1) for (let pass = 0; pass < 2; pass++) for (const a of g) for (const b of g) {
		if (a === b) continue;
		const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), need = a.half + b.half + TRAIN_GAP_M * a.m;
		if (d >= need) continue;
		const ahead = dx * (a.f[0] + b.f[0]) + dy * (a.f[1] + b.f[1]);
		if (ahead < 0 || ahead === 0 && a.p.id < b.p.id) continue;
		a.pose = {
			...a.pose,
			dist: Math.max(0, a.pose.dist - (need - d))
		};
		at(a);
		spaced.set(a.p, a.pose);
	}
}
function rawPose(p) {
	const S = modeCtl.settings();
	let el = age(p.t.receivedAt) + p.lead + (S.trains.timeWarp ? warpNow() : 0), ph = p.phases[p.phases.length - 1];
	for (const x of p.phases) {
		if (el < x.dur) {
			ph = x;
			break;
		}
		el -= x.dur;
	}
	const u = ph.dur === Infinity ? 1 : Math.min(1, el / ph.dur), e = ph.ease === "both" || ph.ease === true ? smooth(u) : ph.ease === "in" ? u * u : ph.ease === "out" ? 1 - (1 - u) * (1 - u) : u, k = S.track.kind === "coaster" && ph.from !== ph.to ? ridePace(p.t.line, ph.from.id, ph.to.id, ph.k0, ph.k1, e) : ph.k0 + (ph.k1 - ph.k0) * e;
	const i = Math.max(0, p.seq.indexOf(ph.from)), len = (p.cum[i + 1] ?? p.cum[i]) - p.cum[i];
	const dist = p.cum[i] + len * (ph.from === ph.to ? 0 : k), moving = ph.k0 !== ph.k1;
	if (p.hold != null) {
		let at = p.hold, creeping = false;
		if (p.creep) {
			const w = (clock() - p.creep.at) / p.creep.ms;
			if (w < 1) {
				at = p.creep.from + (p.hold - p.creep.from) * (p.creep.linear ? w : 1 - (1 - w) * (1 - w));
				creeping = true;
			} else p.creep = null;
		}
		if (dist < p.hold) return dist > at ? {
			dist,
			moving
		} : {
			dist: at,
			moving: creeping
		};
		if (creeping && at < dist && !p.creep.linear) p.glide = {
			c: catchup((dist - at) / mercStop(p.t.line, p.seq[0]).meterInMercatorCoordinateUnits()),
			at: clock()
		};
		p.hold = null;
		p.creep = null;
	}
	if (p.glide) {
		const g = catchupAt(p.glide.c, (clock() - p.glide.at) / 1e3);
		if (!g.done) return {
			dist: Math.max(0, dist - g.left * mercStop(p.t.line, p.seq[0]).meterInMercatorCoordinateUnits()),
			moving: true
		};
		p.glide = null;
	}
	return {
		dist,
		moving,
		stand: !moving && ph.dur !== Infinity ? {
			t: el,
			dur: ph.dur,
			st: ph.k0 === 0 ? ph.from : ph.to
		} : null
	};
}
function trackPoint(p, dist) {
	const { seq, cum } = p, line = p.t.line, kind = modeCtl.settings().track.kind;
	if (seq.length < 2 && kind === "ground") {
		const s = seq[0], { prev, next } = platformNeighbours(line, s), n = next || prev;
		if (n) {
			const q = next ? along(line, s, n, 0) : along(line, n, s, 1);
			return {
				...q,
				r: [-q.f[1], q.f[0]],
				off: 0,
				h: 0,
				roll: 0
			};
		}
	}
	if (seq.length < 2) {
		const m = mercStop(line, seq[0]);
		return {
			x: m.x,
			y: m.y,
			f: [0, -1],
			r: [1, 0],
			off: 0,
			h: kind !== "ground" ? cityViaduct.stationH(line, seq[0].id) * m.meterInMercatorCoordinateUnits() : 0
		};
	}
	const end = cum[cum.length - 1], d = Math.max(0, Math.min(end, dist)), over = dist - d;
	let i = 0;
	while (i < seq.length - 2 && cum[i + 1] < d) i++;
	const a = seq[i], b = seq[i + 1], len = cum[i + 1] - cum[i] || 1;
	let k = (d - cum[i]) / len, h = 0, lat = 0, roll = 0;
	const fw = a.id < b.id ? 1 : -1;
	if (kind === "coaster") {
		const lo = Math.min(a.id, b.id), hi = Math.max(a.id, b.id), g = geom(line, lo, hi), [sg, hh, la, ro] = coasterAt(line, lo, hi, (fw > 0 ? k : 1 - k) * g.total), q = g.total ? sg / g.total : 0;
		h = hh;
		lat = la * fw;
		roll = ro * fw;
		k = fw > 0 ? q : 1 - q;
	}
	const pt = along(line, a, b, k), f = pt.f, r = [-f[1], f[0]], x = pt.x + f[0] * over + r[0] * lat, y = pt.y + f[1] * over + r[1] * lat;
	const o = (j) => edgeOffset(line, seq[j].id, seq[j + 1].id) * (seq[j].id < seq[j + 1].id ? 1 : -1), B = 60 * (p.m ??= mercStop(line, seq[0]).meterInMercatorCoordinateUnits());
	let off = o(i);
	if (i > 0 && d - cum[i] < B) off += (o(i - 1) - off) * .5 * (1 - (d - cum[i]) / B);
	else if (i < seq.length - 2 && cum[i + 1] - d < B) off += (o(i + 1) - off) * .5 * (1 - (cum[i + 1] - d) / B);
	if (kind === "ground") off = 0;
	if (kind === "viaduct") h = cityViaduct.heightAt(line, a.id, b.id, k) * p.m;
	return {
		x,
		y,
		f,
		r,
		off,
		h,
		roll
	};
}
var lastPose = /* @__PURE__ */ new Map();
var BLEND_MS = 1200;
var TRAIN_CLOSE_M = 4.6;
var TRAIN_CLOSE_ZOOM = [16, 17];
var pxPerMetre = (z) => 512 * 2 ** z / (40075016.686 * Math.cos(37.5 * Math.PI / 180));
var farBodyPx = (z) => 15 + 13 * smooth(Math.max(0, Math.min(1, (z - 13) / 4)));
var bodyWidthPx = (z) => {
	const far = farBodyPx(z), k = smooth(Math.max(0, Math.min(1, (z - TRAIN_CLOSE_ZOOM[0]) / (TRAIN_CLOSE_ZOOM[1] - TRAIN_CLOSE_ZOOM[0]))));
	return k <= 0 ? far : far * (TRAIN_CLOSE_M * pxPerMetre(z) / far) ** k;
};
var TRAIN_MIN_PX = 36;
var laneOffsetPx = (z, body = bodyWidthPx(z)) => (1.5 + 2.5 * Math.max(0, Math.min(1, (z - 8) / 7))) / 2 + 3.5 + body / 2;
var coasterBodyPx = (z) => Math.min(bodyWidthPx(z), Math.max(7, 20 * pxPerMetre(z) / 1.6));
var trainBodyPx = (z) => modeCtl.settings().trains.body === "slim" ? coasterBodyPx(z) : bodyWidthPx(z);
var canRide = () => {
	const S = modeCtl.settings();
	return S.park.enabled && S.track.kind === "coaster";
};
function coasterCarFrame(P, tail, car, j, n, unit, bodyPx, lanePx, gap) {
	const A = P(tail + j * car + (j ? gap / 2 : 0)), B = P(tail + (j + 1) * car - (j < n - 1 ? gap / 2 : 0));
	const oa = (A.off + lanePx) * unit, ob = (B.off + lanePx) * unit;
	A.x += A.r[0] * oa;
	A.y += A.r[1] * oa;
	B.x += B.r[0] * ob;
	B.y += B.r[1] * ob;
	const dx = B.x - A.x, dy = B.y - A.y, dz = B.h - A.h, len = Math.hypot(dx, dy, dz);
	if (len < unit * .1) return null;
	const F = [
		dx / len,
		dy / len,
		dz / len
	], [R, U] = rolled(A.r, F, P(tail + (j + .5) * car).roll || 0);
	const [, U0] = rolled(A.r, F, 0), hc = CORK_HEART * bodyPx * unit;
	return {
		fr: [
			A.x + (U0[0] - U[0]) * hc,
			A.y + (U0[1] - U[1]) * hc,
			A.h + (U0[2] - U[2]) * hc,
			F[0],
			F[1],
			F[2],
			R[0],
			R[1],
			R[2],
			U[0],
			U[1],
			U[2]
		],
		L: len / unit
	};
}
function coasterRailFrames(P, d0, d1, step, unit, bodyPx, lanePx, front = d0, m = 1) {
	const on = (d) => {
		const q = P(d), o = (q.off + lanePx) * unit;
		q.x += q.r[0] * o;
		q.y += q.r[1] * o;
		return q;
	}, hc = CORK_HEART * bodyPx * unit, out = [];
	let A = on(d0);
	for (let d = d0; d <= d1 + 1e-12; d += step) {
		const B = on(d + step), dx = B.x - A.x, dy = B.y - A.y, dz = B.h - A.h, len = Math.hypot(dx, dy, dz);
		if (len > unit * .01) {
			const F = [
				dx / len,
				dy / len,
				dz / len
			], [R, U] = rolled(A.r, F, A.roll || 0), [, U0] = rolled(A.r, F, 0);
			out.push({
				p: [
					A.x + (U0[0] - U[0]) * hc,
					A.y + (U0[1] - U[1]) * hc,
					A.h + (U0[2] - U[2]) * hc
				],
				F,
				R,
				U,
				d: (d - front) / m
			});
		}
		A = B;
	}
	if (out.length) out[out.length - 1].end = true;
	return out;
}
function blendShift(plan, mid) {
	if (!plan.blend) return null;
	const w = (clock() - plan.blend.at) / BLEND_MS;
	if (w >= 1) {
		plan.blend = null;
		return null;
	}
	const e = 1 - smooth(w);
	return [(plan.blend.x - mid.x) * e, (plan.blend.y - mid.y) * e];
}
var destLabel = (t) => {
	const d = String(t.destination || "");
	return !d ? "" : /순환$/.test(d) ? `${d.replace(/순환$/, "")} 방면(순환)` : `${d}행`;
};
var hexRGB = (v) => [
	parseInt(v.slice(1, 3), 16) / 255,
	parseInt(v.slice(3, 5), 16) / 255,
	parseInt(v.slice(5, 7), 16) / 255
];
var sheetUI = createBottomSheet({
	map,
	maplibregl,
	planner,
	trackPoint,
	trainPose,
	laneOffsetPx,
	animFrame,
	FOLLOW_FPS,
	fitRoute: (bottom) => fitRoute(bottom),
	live: {
		get frameMs() {
			return frameMs();
		},
		get journey() {
			return journey;
		},
		get routeBounds() {
			return journeyMap.routeBounds;
		},
		get busLayer() {
			return busLayer;
		},
		get rider() {
			return rider;
		},
		get stopRide() {
			return stopRide;
		}
	}
});
var { sheet, sheetBody, followBtn, openSheet, openSheetView, closeSheet, sheetBusy, sheetPad, trainLngLat, follow, followBusStart, followSoon } = sheetUI;
var journeyMap = createJourneyMap({
	map,
	maplibregl,
	colors,
	byId,
	cityCoords,
	stopPos,
	cityViaduct,
	sheetPad,
	journeyCasingPaint,
	journeyRidePaint,
	journeyStopPaint,
	live: {
		get busLayer() {
			return busLayer;
		},
		get settings() {
			return modeCtl.settings();
		},
		get stationAlpha() {
			return stationAlpha;
		},
		set stationAlpha(v) {
			stationAlpha = v;
		}
	}
});
var { rideCoords, showRoute, fitRoute, clearRoute, setSubwayOff, setRouteOpacity, focusRoute } = journeyMap;
var journey = initJourney({
	openSheetView,
	drawJourney,
	clearJourney,
	closeSheet: () => closeSheet(),
	map,
	colors,
	myLocation: () => myLocation,
	button: document.getElementById("routeButton"),
	showRoute: (...a) => {
		showRoute(...a);
		refreshLive();
	},
	clearRoute: () => {
		clearRoute();
		refreshLive();
	}
});
var rider = createCoasterRide({
	map,
	maplibregl,
	RIDE_PX,
	planner,
	colors,
	cityViaduct,
	sheetBody,
	closeSheet,
	showTrainPopup: (plan) => showTrainPopup(plan),
	applyTheme,
	effectiveTheme,
	coasterBodyPx,
	TRAIN_MIN_PX,
	mercStop,
	trainPose,
	trackPoint,
	blendShift,
	toRide,
	fromRide,
	coasterCarFrame,
	coasterRailFrames,
	riderState: (plan) => riderState(plan),
	trainLngLat,
	stopFollowing: () => {
		sheetUI.easing = false;
		sheetUI.following = null;
	},
	isCoaster: canRide,
	getSheetTrain: () => sheetUI.sheetTrain,
	getSleeperM: () => SLEEPER_M
});
var { riding, rideRows, startRide, stopRide, rideFrame, rideBar } = rider;
animFrame.push(rideFrame);
if (location.hash.includes("fps")) {
	const o = document.createElement("pre");
	o.style.cssText = "position:fixed;z-index:99;left:4px;bottom:4px;margin:0;padding:6px 8px;font:11px/1.35 ui-monospace,monospace;background:rgba(0,0,0,.78);color:#fff;border-radius:8px;pointer-events:none;white-space:pre";
	document.body.append(o);
	const iv = [], js = [], cam = [], r = map._render.bind(map);
	let last = 0, shown = 0;
	map._render = (...a) => {
		const t = performance.now();
		if (last) iv.push(t - last);
		last = t;
		const x = r(...a);
		js.push(performance.now() - t);
		return x;
	};
	animFrame[animFrame.indexOf(rideFrame)] = () => {
		const t = performance.now();
		rideFrame();
		if (rider.ride) cam.push(performance.now() - t);
	};
	const ms = (a) => a.length ? Math.max(...a).toFixed(0) : "-", avg = (a) => a.length ? (a.reduce((x, y) => x + y, 0) / a.length).toFixed(1) : "-";
	let f0 = { ...frameStats };
	setInterval(() => {
		const now = performance.now(), s = now - shown;
		shown = now;
		const f1 = { ...frameStats }, per = (k) => ((f1[k] - f0[k]) * 1e3 / s).toFixed(0);
		f0 = f1;
		o.textContent = `${rider.ride ? "탑승 중" : "지도"} ${(iv.length * 1e3 / s).toFixed(0)} fps · 늦은 프레임 ${iv.filter((x) => x > 20).length} / ${iv.filter((x) => x > 34).length} · 가장 긴 간격 ${ms(iv)} ms\n지도 JS 평균 ${avg(js)} · 최장 ${ms(js)} ms · 카메라 ${avg(cam)} / ${ms(cam)} ms · ${devicePixelRatio}x(그림 ${map.getPixelRatio()}x) ${innerWidth}×${innerHeight}${cityBuildings ? ((i) => `\n건물 지음 ${i.built}개 · 짓기 ${(i.buildMs / 1e3).toFixed(1)} s · 들고 있는 것 ${i.ready}타일 ${(i.bytes / 1e6).toFixed(0)} MB · 미리 짓기 ${prebuildWant() ? "켬" : "끔"}`)(cityBuildings.info()) : ""}\n열차 층 ${per("trains")} · 이름표 ${per("signs")} · 이름표 조회 ${per("signQueries")} 번/초 · 절전 ${saverOn ? "켬" : "끔"}`;
		iv.length = js.length = cam.length = 0;
	}, 1e3);
}
map.on("movestart", (e) => {
	if (rider.ride && e.originalEvent) stopRide(false);
});
var { trainState, riderState, trainSheetHTML, rawFeedHTML, showTrainPopup, pickTrain, liveNotice, updateLiveNotice, arrivalText, arrivalRank, showStationPopup } = createPopups({
	map,
	maplibregl,
	planner,
	colors,
	esc,
	age,
	destLabel,
	trainPose,
	trackPoint,
	mercStop,
	TRAIN_MIN_PX,
	trainBodyPx,
	canRide,
	laneOffsetPx,
	cityViaduct,
	seatPickerHTML,
	seatLabel,
	rideRows,
	rider,
	openSheet,
	openSheetView,
	follow,
	sheetUI,
	sheetBody,
	followBtn,
	live: {
		trainShown: (p, d) => journeyMap.trainShown(p, d),
		get settings() {
			return modeCtl.settings();
		},
		get trainsEnabled() {
			return trainsEnabled;
		},
		get subwayOff() {
			return journeyMap.subwayOff;
		},
		get exits() {
			return exits;
		},
		get feed() {
			return feed;
		}
	}
});
(() => {
	const c = document.createElement("canvas").getContext("2d"), cache = /* @__PURE__ */ new Map();
	return (t, px) => {
		const k = px.toFixed(1) + t;
		let w = cache.get(k);
		if (w == null) {
			c.font = `700 ${px}px "Noto Sans KR",sans-serif`;
			w = c.measureText(t).width;
			cache.set(k, w);
		}
		return w;
	};
})();
var hexRGB3 = (v) => [
	parseInt(v.slice(1, 3), 16) / 255,
	parseInt(v.slice(3, 5), 16) / 255,
	parseInt(v.slice(5, 7), 16) / 255
];
var trainLive = {
	trainShown: (p, d) => journeyMap.trainShown(p, d),
	journeyTrain: (p) => journeyMap.journeyTrain(p),
	get kitReady() {
		return kitReady;
	},
	get RideTrack() {
		return RideTrack;
	},
	get CoasterTrain() {
		return CoasterTrain;
	},
	get TurtleShips() {
		return TurtleShips;
	},
	get UnitConvoy() {
		return UnitConvoy;
	},
	get SkyUnits() {
		return SkyUnits;
	},
	unitLength: (k) => UNIT_SHAPES[k]?.len ?? 1,
	get myLocation() {
		return me.shown() || myLocation;
	},
	get trainsEnabled() {
		return trainsEnabled;
	},
	get subwayOff() {
		return journeyMap.subwayOff;
	},
	get settings() {
		return modeCtl.settings();
	},
	get sheetTrain() {
		return sheetUI.sheetTrain;
	},
	get sunTrainShadow() {
		return sunTrainShadow;
	},
	get following() {
		return sheetUI.following;
	},
	get easing() {
		return sheetUI.easing;
	},
	get rider() {
		return rider;
	},
	get riding() {
		return riding;
	}
};
var TrainLayer = trainLayerClass({
	map,
	JOSEON_STYLE,
	planner,
	coasterBodyPx,
	bodyWidthPx,
	TRAIN_MIN_PX,
	cityViaduct,
	laneOffsetPx,
	maplibregl,
	trainPose,
	trackPoint,
	mercStop,
	blendShift,
	lastPose,
	toRide,
	hexRGB,
	colors,
	fromRide,
	coasterCarFrame,
	smooth,
	sunPosition,
	followSoon,
	trainFrameSoon,
	TRAIN_FPS,
	live: trainLive
});
var BuildingDepth = buildingDepthClass({
	cityOn,
	map,
	PHONE,
	maplibregl,
	live: trainLive
});
var exitPillars = new ExitPillars({
	map,
	maplibregl,
	stations,
	exitCol,
	colors,
	hexRGB3,
	EXIT_MINZOOM,
	document,
	getExits: () => exits,
	getSelected: () => selected,
	getLook: () => modeCtl.settings().map.exitLook
});
var coasterTrack = createCoasterTrack({
	buildCoasterTrackMesh,
	coasterTrackVertexShader,
	COASTER_TRACK_FS,
	map,
	maplibregl,
	HOME,
	paths,
	byId,
	colors,
	geom,
	coasterProfile,
	coasterAt,
	coasterRises,
	loopD,
	corkOf,
	rolled,
	CORK_HEART,
	edgeOffset,
	hexRGB,
	coasterBodyPx,
	cityViaduct,
	PHONE,
	trainFrameSoon,
	isCoaster: () => modeCtl.settings().track.kind === "coaster",
	getSelected: () => selected,
	getJourney: () => journeyMap.journeyRides()
});
var stationAlpha = 1;
var stationNames = new StationNameLayer({
	map,
	maplibregl,
	stationRects,
	exitCol,
	cityViaduct,
	colors,
	hexRGB3,
	stationWidthPx,
	platformPx,
	PLATFORM_SCALE,
	closestPlatformPoint,
	platformStroke,
	EXIT_MINZOOM,
	EXIT_MAX_M,
	EXIT_PASSAGES,
	document,
	matchMedia: (q) => matchMedia(q),
	getLabels: () => stationLabels.list,
	getSelected: () => selected,
	getExits: () => exits,
	getStationAlpha: () => stationAlpha,
	getTrack: () => modeCtl.settings().track
});
var stationLabels = createStationLabels({
	map,
	stations,
	stationRects,
	colors,
	getSelected: () => selected
});
var scheduleLabels = stationLabels.schedule;
function rebuildLabels() {
	stationLabels.rebuild();
}
function filterLine(line) {
	if (!ready) {
		pendingLine = line;
		return;
	}
	selected = line;
	map.setFilter("routes", line === "all" ? null : [
		"==",
		["get", "line"],
		line
	]);
	for (const id of ["stations", "stations-casing"]) map.setFilter(id, line === "all" ? null : [
		"==",
		["get", "line"],
		line
	]);
	rebuildLabels();
	const visible = stations.filter((s) => line === "all" || s.lines.some((x) => x.name === line));
	$("mapTitle").textContent = line === "all" ? `${stations.length}개 역 노드 전체 보기` : `${line} · ${visible.length}개 역`;
	$("status").textContent = `${line === "all" ? "전체 노선" : line} · ${visible.length}개 역 위치와 역명을 표시합니다.`;
	feed.reset();
	planner.clear();
	lastPose.clear();
	map.triggerRepaint();
	if (line === "all") map.jumpTo(HOME);
	else {
		const b = new maplibregl.LngLatBounds();
		visible.forEach((s) => b.extend([s.lon, s.lat]));
		map.fitBounds(b, {
			padding: 60,
			maxZoom: 13
		});
	}
	refreshLive(true);
}
var feed = createLiveFeed({
	journeyLines: () => journeyMap.rideLines(),
	map,
	stations,
	liveState,
	getSelected: () => selected,
	getSheetTrain: () => sheetUI.sheetTrain,
	hasPlans: () => planner.plans.length > 0,
	age,
	updateLiveNotice,
	onTrains: (trains) => {
		learnDirections(trains);
		planner.replacePlans(trains.map(planner.planTrain).filter(Boolean));
		lastPose.clear();
		return planner.plans.length;
	},
	onClear: () => {
		planner.clear();
		lastPose.clear();
		map.triggerRepaint();
	}
});
function refreshLive(force = false) {
	return feed.refresh(force);
}
map.on("load", () => {
	registerTransitLayers({
		map,
		shapesReady,
		buildLineFeatures,
		buildStationFeatures,
		basicRouteCache,
		rebuildLabels,
		stationNames,
		STATION_WIDTH_STOPS,
		PHONE,
		signCollisionLayout,
		live: { get track() {
			return modeCtl.settings().track;
		} }
	});
	createTrainOverlay({
		map,
		maplibregl,
		signTextSize,
		rider,
		perspectiveRatio,
		signRows,
		drawStationSigns,
		effectiveTheme,
		REDUCED,
		TRAIN_FPS,
		TrainLayer,
		BuildingDepth,
		cityOn,
		cityXrayTargets,
		mapPalette,
		coasterGeo,
		coasterTrack,
		geom,
		edgeOffset,
		coasterBodyPx,
		trainBodyPx,
		cityViaduct,
		CORK_HEART,
		PHONE,
		trainFrameSoon,
		CityLife,
		CITY_STYLE: SEOUL_CITY_STYLE,
		cityPack,
		$,
		sunPosition,
		NightLayer,
		journeyMap,
		exitPillars,
		RIDE_ZOOM: 18,
		nearMatrix,
		COCKPIT_NEAR_M,
		AvatarRenderer,
		avatarScale,
		AVATAR_MINZOOM: 15,
		live: {
			get me() {
				return me;
			},
			get frameStats() {
				return frameStats;
			},
			get frameMs() {
				return frameMs();
			},
			get trainFrameDue() {
				return trainTimer ? trainAt : Infinity;
			},
			get LifeUnits() {
				return LifeUnits;
			},
			get night() {
				return nightNow();
			},
			get bloomTune() {
				return nightLook.bloomTune;
			},
			get NightBloom() {
				return NightBloom;
			},
			get PixelPalette() {
				return PixelPalette;
			},
			get CoasterRidePlacement() {
				return CoasterRidePlacement;
			},
			get FestoonLayer() {
				return FestoonLayer;
			},
			get RideLayer() {
				return RideLayer;
			},
			get busLayer() {
				return busLayer;
			},
			get cityBuildings() {
				return cityBuildings;
			},
			get cityLandmarks() {
				return cityLandmarks;
			},
			get settings() {
				return modeCtl.settings();
			},
			get kitReady() {
				return kitReady;
			},
			get sampleRideTracks() {
				return sampleRideTracks;
			},
			get selected() {
				return selected;
			},
			get stationAlpha() {
				return stationAlpha;
			},
			get drawTrains() {
				return drawTrains;
			},
			set drawTrains(v) {
				drawTrains = v;
			},
			get wallsNow() {
				return wallsNow;
			},
			set wallsNow(v) {
				wallsNow = v;
			}
		}
	});
	registerLocationLayers({
		map,
		geolocate,
		dotMaxzoom: 15,
		live: {
			get myLocation() {
				return myLocation;
			},
			set myLocation(v) {
				myLocation = v;
			}
		}
	});
	map.on("click", (e) => {
		if (rider.ride) return;
		if (map.queryRenderedFeatures(e.point, { layers: ["stations", "stations-casing"] }).length) return;
		const pl = pickTrain(e.point);
		if (pl) showTrainPopup(pl);
		else if (busLayer?.selectAt(e.point)) {
			if (busLayer.selection?.kind === "bus") followBusStart(busLayer.selection.id);
		} else if (!sheetBusy()) closeSheet();
	});
	map.on("click", "stations", (e) => {
		if (rider.ride) return;
		const pl = pickTrain(e.point);
		if (pl) {
			showTrainPopup(pl);
			return;
		}
		const p = e.features[0].properties;
		showStationPopup(byId.get(+p.id), e.lngLat);
	});
	map.on("mouseenter", "stations", () => map.getCanvas().style.cursor = "pointer");
	map.on("mouseleave", "stations", () => map.getCanvas().style.cursor = "");
	ready = true;
	map.once("idle", () => {
		const go = () => loadModeKit().then(prebuildCity).catch(() => {});
		"requestIdleCallback" in window ? requestIdleCallback(go, { timeout: 4e3 }) : setTimeout(go, 1500);
	});
	map.on("idle", () => {
		if (kitReady) "requestIdleCallback" in window ? requestIdleCallback(prebuildCity, { timeout: 3e3 }) : setTimeout(prebuildCity, 500);
	});
	map.addControl(new maplibregl.AttributionControl({ compact: false }), "bottom-left");
	let sunTimer = 0;
	const sunSoon = () => {
		clearTimeout(sunTimer);
		sunTimer = setTimeout(() => {
			if (!map.isMoving()) updateSun();
		}, 400);
	};
	map.on("moveend", sunSoon);
	map.on("sourcedata", (e) => {
		if (e.sourceId === "ofm" && e.isSourceLoaded && e.tile) sunSoon();
	});
	addBasemap();
	busLayer = createBusLayer({
		map,
		phone: PHONE,
		frameMs,
		requestRender: () => trainFrameSoon(0),
		getExitCoordinates: () => Object.values(exits).flat(),
		onSelect: (view) => {
			sheetUI.following = null;
			sheetUI.followBus = null;
			sheetUI.sheetTrain = null;
			followBtn.hidden = true;
			const token = openSheetView((body) => {
				drawBusSheet(body, view);
				return () => clearBusSheet(body);
			}, "bus");
			return (next) => {
				if (sheetUI.sheetToken !== token) return;
				const focused = sheetBody.contains(document.activeElement);
				drawBusSheet(sheetBody, next);
				if (focused) sheetBody.querySelector("h3")?.focus({ preventScroll: true });
			};
		},
		onRouteSelect: (leg, { fit } = {}) => {
			setSubwayOff(!!leg);
			if (leg) showRoute({ legs: [leg] }, true, fit ?? busLayer?.selection?.kind !== "bus");
			else if (journeyMap.busRouteFocus) {
				journeyMap.displayedRoute = null;
				journeyMap.busRouteFocus = false;
				journeyMap.routeBounds = null;
				map.getSource("journey")?.setData({
					type: "FeatureCollection",
					features: []
				});
				focusRoute(false);
			}
		},
		onFollow: (id) => {
			if (id) followBusStart(id, { zoom: 17 });
			else sheetUI.followBus = null;
		},
		followedBus: () => sheetUI.followBus,
		sheetPad,
		onFollowView: (on) => {
			sheetUI.tuck(on);
			document.body.classList.toggle("bus-following", on);
		},
		onClear: () => {
			if (sheetBody.querySelector(".bus-detail")) closeSheet();
		}
	});
	window.__subwayWebGL.busLayer = busLayer;
	registerExitLayers({
		map,
		exitsReady,
		exitFeatures,
		EXIT_MINZOOM
	});
	applyTheme();
	map.getContainer().append(liveNotice);
	map.getContainer().parentElement.append(sheet, rideBar);
	if (pendingLine) filterLine(pendingLine);
	else {
		rebuildLabels();
		refreshLive(true);
	}
});
createStationSearch({
	map,
	stations,
	colors,
	esc,
	input: $("search"),
	list: $("searchList"),
	getSelected: () => selected,
	showStationPopup
});
var svg = (d) => `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
var ICONS = {
	auto: svg("<path d=\"M12 3a9 9 0 0 1 0 18z\" fill=\"currentColor\" stroke=\"none\"/><circle cx=\"12\" cy=\"12\" r=\"9\"/>"),
	zoom: svg("<circle cx=\"10.5\" cy=\"10.5\" r=\"6\"/><path d=\"m15 15 5 5\"/>"),
	coaster: svg("<path d=\"M2 18c3 0 4-11 7.5-11S12 14 15 14s3.5-6 7-6\"/><path d=\"M5 21v-5M9.5 21V9M15 21v-5M20 21v-10\"/>"),
	speed: svg("<path d=\"M4 17a8 8 0 1 1 16 0\"/><path d=\"m12 17 4-5\"/>")
};
document.head.insertAdjacentHTML("beforeend", `<style>
/* map / trains / theme sit in their own MapLibre control group under +/−, same size and look */
.maplibregl-ctrl-group .map-toggle,.maplibregl-ctrl-group .train-toggle{position:static!important;min-width:0!important;width:29px!important;height:29px!important;padding:0!important;margin:0;border:0!important;border-radius:0!important;box-shadow:none!important;background:transparent!important;color:#33434a!important;display:grid!important;place-items:center}
.maplibregl-ctrl-group .map-toggle svg,.maplibregl-ctrl-group .train-toggle svg{width:17px;height:17px}
.maplibregl-ctrl-group .map-toggle+.map-toggle,.maplibregl-ctrl-group .map-toggle+.train-toggle,.maplibregl-ctrl-group .train-toggle+.map-toggle{border-top:1px solid #ddd!important}
html[data-theme=dark] .maplibregl-ctrl-group .map-toggle+.map-toggle,html[data-theme=dark] .maplibregl-ctrl-group .map-toggle+.train-toggle,html[data-theme=dark] .maplibregl-ctrl-group .train-toggle+.map-toggle{border-top-color:#2b3a40!important}
.maplibregl-ctrl-group .map-toggle[aria-pressed=false],.maplibregl-ctrl-group .train-toggle[aria-pressed=false]{color:#a3b0b4!important}
html[data-theme=dark] .maplibregl-ctrl-group .map-toggle,html[data-theme=dark] .maplibregl-ctrl-group .train-toggle{color:#dbe5e8!important}
html[data-theme=dark] .maplibregl-ctrl-group .map-toggle[aria-pressed=false],html[data-theme=dark] .maplibregl-ctrl-group .train-toggle[aria-pressed=false]{color:#61737a!important}
.webgl-zoom{display:flex;align-items:center;gap:3px;padding:4px 7px!important;font-variant-numeric:tabular-nums}
.webgl-zoom svg{width:14px;height:14px}
.legend{display:none}   /* legend removed; data sources stay in the side panel */
</style>`);
var wallsNow = () => {};
var prefs = createUserPrefs();
saverOn = prefs.get("saver") === "on" || location.hash.includes("saver");
var theme = createMapTheme({
	map,
	$,
	menu: settingsMenu,
	seoulSun,
	cityPalette,
	applyCityStyle: (m, o) => applyCityStyle(m, {
		...o,
		groundLight: nightNow().ground
	}),
	applyGroundTexture,
	syncCity,
	updateSun,
	focusRoute,
	journeyMap,
	rider,
	prefs,
	live: {
		get settings() {
			return modeCtl.settings();
		},
		get busLayer() {
			return busLayer;
		},
		get ready() {
			return ready;
		}
	}
});
function effectiveTheme() {
	return theme.effectiveTheme();
}
function mapPalette(t) {
	return t === void 0 ? theme.mapPalette() : theme.mapPalette(t);
}
function applyTheme() {
	syncPixels();
	return theme.applyTheme();
}
var pixelSize = null;
var fovNow = null;
function syncPixels() {
	const M = modeCtl.settings().map, X = M.pixel, size = X.enabled ? X.size : 0;
	if (size !== pixelSize) {
		pixelSize = size;
		const d = globalThis.devicePixelRatio || 1;
		map.setPixelRatio(size ? d / Math.max(1, Math.round(size * d)) : BASE_PR);
		map.getContainer().classList.toggle("pixel-art", !!size);
	}
	const fov = M.fov ?? null;
	if (fov !== fovNow) {
		const was = fovNow;
		fovNow = fov;
		map.setVerticalFieldOfView(fov ?? BASE_FOV);
		if (fov != null && was == null && ready) map.easeTo({
			bearing: 45,
			pitch: 55,
			duration: 700
		});
	}
	if (!ready) return;
	if (!!size && X.palette !== "none") {
		if (!map.getLayer("retro-pixels")) map.addLayer(mapPixels);
		else map.moveLayer("retro-pixels");
	} else if (map.getLayer("retro-pixels")) map.removeLayer("retro-pixels");
}
var mapPixels = {
	id: "retro-pixels",
	type: "custom",
	renderingMode: "2d",
	fx: null,
	onAdd() {},
	onRemove(m, gl) {
		this.fx?.dispose(gl);
		this.fx = null;
	},
	render(gl) {
		const X = modeCtl.settings().map.pixel;
		if (!X.enabled || X.palette === "none" || !PixelPalette) return;
		if (!this.fx) {
			this.fx = new PixelPalette();
			this.fx.init(gl);
		}
		this.fx.render(gl, {
			palette: X.palette,
			outline: X.outline
		});
	}
};
var sunTrainShadow = [1.1, 1.5];
var sunShadows = new SunShadowLayer();
function updateSun() {
	if (!ready) return;
	const { elevation: el, azimuth: az } = sunPosition(), up = el > 1, dark = effectiveTheme() === "dark", S = modeCtl.settings();
	const K = S.sun.light === "park" && S.map.park[dark ? "dark" : "light"];
	try {
		map.setLight({
			anchor: "map",
			position: [
				1.4,
				up ? az : 0,
				up ? Math.max(10, 90 - el) : 20
			],
			intensity: K ? K.lightK : up ? .55 : .3,
			color: K ? K.light : dark ? "#9fb4c8" : "#ffffff"
		});
	} catch {}
	const sh = up ? Math.min(7, 1.6 / Math.tan(el * Math.PI / 180)) : 1.2, away = (az + 180) * Math.PI / 180;
	sunTrainShadow = up ? [Math.sin(away) * sh, -Math.cos(away) * sh] : [.8, 1.1];
	if (!up || map.getZoom() < 14.5 || !map.getLayer("bm-bld3d") || map.getLayoutProperty("bm-bld3d", "visibility") === "none") {
		sunShadows.set(null, 0);
		map.triggerRepaint();
		return;
	}
	const k = 1 / Math.tan(el * Math.PI / 180), ux = Math.sin(away), uy = Math.cos(away), seen = /* @__PURE__ */ new Set(), tris = [];
	const O = maplibregl.MercatorCoordinate.fromLngLat(map.getCenter());
	for (const f of map.querySourceFeatures("ofm", { sourceLayer: "building" })) {
		const h0 = +(f.properties.render_height ?? 10), h = S.sun.lowHouseM != null && h0 < S.city.pack.hanok.tall.towerMinH ? S.sun.lowHouseM : h0, g = f.geometry;
		if (!h || !g) continue;
		const rings = g.type === "Polygon" ? [g.coordinates[0]] : g.type === "MultiPolygon" ? g.coordinates.map((p) => p[0]) : [];
		for (const ring of rings) {
			if (!ring || ring.length < 3) continue;
			const key = ring[0][0].toFixed(6) + ring[0][1].toFixed(6) + h;
			if (seen.has(key)) continue;
			seen.add(key);
			const len = Math.min(S.city.enabled ? +(S.city.pack.lighting?.shadow?.maxLengthM ?? 80) : 250, h * Math.min(k, 3.5)), kx = Math.cos(ring[0][1] * Math.PI / 180), dx = ux * len / (111320 * kx), dy = uy * len / 111320;
			const pts = [];
			for (const [x, y] of ring) {
				pts.push([x, y]);
				pts.push([x + dx, y + dy]);
			}
			const hp = hull(pts).map((q) => {
				const m = maplibregl.MercatorCoordinate.fromLngLat(q);
				return [m.x - O.x, m.y - O.y];
			});
			for (let i = 1; i < hp.length - 1; i++) tris.push(...hp[0], ...hp[i], ...hp[i + 1]);
		}
	}
	const fade = Math.max(0, Math.min(1, (el - 2) / 13));
	const phone = matchMedia("(max-width:720px),(pointer:coarse)").matches ? .35 : 1;
	const cityA = cityOn() ? +(cityPack().modes?.[S.city.tone]?.shadowOpacity?.[dark ? "dark" : "light"] ?? .14) : null;
	sunShadows.color = cityA != null ? hexRGB3(cityPack().lighting?.shadow?.color || "#394D4B") : null;
	sunShadows.set({
		data: new Float32Array(tris),
		ox: O.x,
		oy: O.y
	}, cityA != null ? cityA * fade * phone : Math.min(S.map.paletteKind === "park-city" ? mapPalette().shadow : .34, .14 + el / 150) * fade * (dark ? .55 : 1) * phone);
	map.triggerRepaint();
}
applyTheme();
function addBasemap() {
	addBasemap$1({
		map,
		sunShadows,
		PHONE,
		CITY_STYLE: SEOUL_CITY_STYLE,
		addCityLayers,
		applyTheme
	});
}
function prepareMode(id) {
	if (id === "basic") return true;
	if (id === "coaster") return coasterGeo.bld && kitReady ? true : Promise.all([loadCoasterBuildings(), loadModeKit()]);
	return kitReady ? true : loadModeKit();
}
var modeBusy = (() => {
	let el = null, bar = null, text = null, timer = 0, t0 = 0, want = null, phase = "";
	const label = (id) => modes.list().find((d) => d.id === id)?.label ?? id;
	const ro = (w) => {
		const c = w.charCodeAt(w.length - 1) - 44032;
		return c >= 0 && c < 11172 && c % 28 && c % 28 !== 8 ? "으로" : "로";
	};
	function show(sub, frac) {
		if (!el) {
			el = document.createElement("div");
			el.className = "mode-busy";
			el.setAttribute("role", "status");
			el.innerHTML = "<b></b><span></span><i><em></em></i>";
			document.body.append(el);
			text = el.querySelector("span");
			bar = el.querySelector("em");
		}
		el.querySelector("b").textContent = `${label(want)}${ro(label(want))} 바꾸는 중`;
		text.textContent = sub;
		el.classList.toggle("mode-busy--wait", frac == null);
		bar.style.width = frac == null ? "" : `${Math.round(Math.max(.06, frac) * 100)}%`;
		el.hidden = false;
	}
	function end() {
		clearInterval(timer);
		timer = 0;
		phase = "";
		if (el) el.hidden = true;
	}
	function tick() {
		if (phase === "prepare") {
			if (modeCtl.desired !== want) end();
			return;
		}
		const B = cityBuildings;
		if (!cityOn() || !B?.shown() || performance.now() - t0 > 2e4) return end();
		const { ready, total } = B.progress();
		if (total && ready >= total) return end();
		show(total ? `건물 짓는 중 ${ready}/${total}` : "건물 짓는 중", total ? ready / total : null);
	}
	return {
		request(id, now) {
			want = id;
			if (id === now) {
				end();
				return;
			}
			phase = "prepare";
			t0 = performance.now();
			show(id === "coaster" && !coasterGeo.bld ? "롤코 자료 받는 중" : "모드 자료 받는 중", null);
			clearInterval(timer);
			timer = setInterval(tick, 200);
		},
		committed(id) {
			if (id !== want) return;
			phase = "build";
			t0 = performance.now();
			if (!timer) timer = setInterval(tick, 200);
			tick();
		},
		end
	};
})();
function showModeButtons(want) {
	settingsMenu.press("toggleSimcity", want === "simcity");
	settingsMenu.press("toggleJoseon", want === "joseon");
	settingsMenu.press("toggleRetro", want === "retro");
	showNation(want);
	settingsMenu.press("toggleCoaster", want === "coaster");
	showRace(want);
}
var lastRace = "terran";
function showRace(want) {
	const on = STARCRAFT.includes(want);
	if (on) lastRace = want;
	settingsMenu.press("toggleStarcraft", on);
	settingsMenu.hide("starcraftRace", !on);
	settingsMenu.race(want);
}
function commitMode(prev, next, { speed } = {}) {
	if (next === "coaster") {
		applyCoaster(true, speed ?? (prev === "coaster" ? modeCtl.speed : 1));
		return;
	}
	if (prev === "coaster") applyCoaster(false);
	if (next === "basic") {
		if (CITY_FAMILY.includes(prev)) applySimcity(false);
		return;
	}
	applySimcity(true, next);
}
function applyCoaster(on, speed) {
	if (!on) stopRide(false);
	if (on && modeCtl.current !== "basic" && modeCtl.current !== "coaster") {
		modeCtl.enter("basic");
		settingsMenu.press("toggleSimcity", false);
		settingsMenu.press("toggleJoseon", false);
		showRace("coaster");
	}
	const was = modeCtl.current === "coaster";
	modeCtl.enter(on ? "coaster" : "basic");
	modeCtl.setSpeed(on ? speed : 1);
	settingsMenu.press("toggleCoaster", on);
	settingsMenu.hide("coasterSpeed", !on);
	settingsMenu.speed(modeCtl.speed, modeCtl.speed > 1 ? "실제보다 앞서 달려요" : "실시간");
	if (was !== on) {
		stopMerc.clear();
		cityViaduct.setGaps(on ? coasterGaps : null);
		setRouteOpacity();
		map.getSource("routes")?.setData({
			type: "FeatureCollection",
			features: buildLineFeatures()
		});
		planner.rebuild();
		lastPose.clear();
		if (map.getSource("stations")) {
			map.getSource("stations").setData({
				type: "FeatureCollection",
				features: buildStationFeatures()
			});
			rebuildLabels();
		}
		if (journeyMap.displayedRoute) showRoute(journeyMap.displayedRoute.plan, journeyMap.displayedRoute.busSelection, false);
		if (on && map.getPitch() < 40) map.easeTo({
			pitch: 60,
			zoom: Math.max(map.getZoom(), 14.5),
			duration: 900
		});
		applyTheme();
		updateSun();
		wallsNow();
	}
	map.triggerRepaint();
}
function applySimcity(on, id = "simcity") {
	const was = modeCtl.settings(), next = on ? id : "basic", same = modeCtl.current === next;
	modeCtl.enter(next);
	const now = modeCtl.settings();
	if (now.track === was.track) {
		if (now.trains.predictStops !== was.trains.predictStops) {
			planner.rebuild();
			lastPose.clear();
		}
		if (!same) {
			applyTheme();
			updateSun();
			map.triggerRepaint();
		}
		return;
	}
	setRouteOpacity();
	planner.rebuild();
	lastPose.clear();
	map.getSource("routes")?.setData({
		type: "FeatureCollection",
		features: buildLineFeatures()
	});
	if (map.getSource("stations")) {
		map.getSource("stations").setData({
			type: "FeatureCollection",
			features: buildStationFeatures()
		});
		rebuildLabels();
	}
	applyTheme();
	updateSun();
	wallsNow();
	map.triggerRepaint();
}
function offFamily(ids) {
	if (ids.includes(modeCtl.current)) return modeCtl.request("basic");
	if (ids.includes(modeCtl.desired)) modeCtl.cancel();
}
function setCoaster(on, speed) {
	return on ? modeCtl.request("coaster", { speed }) : offFamily(["coaster"]);
}
function setSimcity(on, asJoseon = false) {
	return on ? modeCtl.request(asJoseon ? "joseon" : "simcity") : offFamily(["simcity", "joseon"]);
}
function setStarcraft(on, race) {
	return on ? modeCtl.request(race ?? lastRace) : offFamily(STARCRAFT);
}
function setRetro(on) {
	return on ? modeCtl.request("retro") : offFamily(["retro"]);
}
var lastNation = NATIONS[0];
function showNation(want) {
	const on = NATIONS.includes(want);
	if (on) lastNation = want;
	settingsMenu.press("toggleNation", on);
	settingsMenu.hide("nationRow", !on);
	settingsMenu.nation(want);
}
function setNation(on, id) {
	return on ? modeCtl.request(id ?? lastNation) : offFamily(NATIONS);
}
settingsMenu.on({
	switches: {
		toggleSimcity: () => setSimcity(modeCtl.desired !== "simcity"),
		toggleJoseon: () => setSimcity(modeCtl.desired !== "joseon", true),
		toggleStarcraft: () => setStarcraft(!STARCRAFT.includes(modeCtl.desired)),
		toggleRetro: () => setRetro(modeCtl.desired !== "retro"),
		toggleNation: () => setNation(!NATIONS.includes(modeCtl.desired)),
		toggleCoaster: () => setCoaster(modeCtl.desired !== "coaster")
	},
	nation: (id) => setNation(true, id),
	race: (race) => setStarcraft(true, race),
	speed: (speed) => setCoaster(true, speed)
});
var setJoseon = (on) => setSimcity(on, true);
{
	const show = () => settingsMenu.press("togglePrebuild", prebuildWant());
	show();
	settingsMenu.on({ switches: { togglePrebuild: () => {
		prebuildOn = !prebuildWant();
		prefs.set("prebuild", prebuildOn ? "on" : "off");
		show();
		if (prebuildOn) prebuildCity();
	} } });
}
{
	const show = () => settingsMenu.press("toggleSaver", saverOn);
	show();
	settingsMenu.on({ switches: { toggleSaver: () => {
		saverOn = !saverOn;
		prefs.set("saver", saverOn ? "on" : "off");
		show();
		trainFrameSoon(0);
	} } });
}
{
	{
		const z = $("zoomBadge"), show = () => {
			z.textContent = "z" + map.getZoom().toFixed(1);
		};
		map.on("zoom", show);
		show();
	}
	$("refreshButton").onclick = (e) => {
		e.currentTarget.classList.add("spin");
		setTimeout(() => location.reload(), 250);
	};
	const btn = $("settingsButton"), panel = $("settingsPanel");
	settingsMenu.icons(ICONS.coaster, ICONS.speed);
	const isOpen = () => !panel.hidden && panel.classList.contains("open");
	const root = $("menuRoot"), back = $("menuBack"), title = $("settingsTitle"), pages = [...panel.querySelectorAll(".menu-page")];
	let pageFrom = null;
	const slide = (el, cls) => {
		el.classList.remove("menu-in", "menu-out");
		if (!slideMs) return;
		el.offsetWidth;
		el.classList.add(cls);
	};
	const showPage = (id, animate = true) => {
		const page = id ? $(id) : null;
		for (const p of pages) p.hidden = p !== page;
		root.hidden = !!page;
		back.hidden = !page;
		title.textContent = page ? page.getAttribute("aria-label") || page.querySelector("h3")?.textContent || "" : "메뉴";
		if (!animate) return;
		if (page) {
			slide(page, "menu-in");
			back.focus({ preventScroll: true });
		} else {
			slide(root, "menu-out");
			pageFrom?.focus({ preventScroll: true });
		}
		panel.querySelector(".menu-body").scrollTop = 0;
	};
	for (const item of root.querySelectorAll("[data-menu-page]")) item.onclick = () => {
		pageFrom = item;
		showPage(item.dataset.menuPage);
	};
	back.onclick = () => showPage(null);
	const slideMs = matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 260;
	let closeTimer = 0;
	const setOpen = (o) => {
		clearTimeout(closeTimer);
		btn.setAttribute("aria-expanded", String(o));
		if (o) {
			showPage(null, false);
			panel.classList.remove("open");
			panel.hidden = false;
			panel.offsetWidth;
			panel.classList.add("open");
			$("settingsClose").focus({ preventScroll: true });
			return;
		}
		panel.classList.remove("open");
		closeTimer = setTimeout(() => {
			if (!panel.classList.contains("open")) panel.hidden = true;
		}, slideMs);
	};
	const close = () => {
		if (!isOpen()) return;
		setOpen(false);
		btn.focus({ preventScroll: true });
	};
	btn.onclick = (e) => {
		e.stopPropagation();
		setOpen(!isOpen());
	};
	$("settingsClose").onclick = close;
	document.addEventListener("click", (e) => {
		if (isOpen() && !panel.contains(e.target)) setOpen(false);
	});
	document.addEventListener("keydown", (e) => {
		if (!isOpen()) return;
		if (e.key === "Escape") {
			close();
			return;
		}
		if (e.key !== "Tab") return;
		const items = [...panel.querySelectorAll("button:not([disabled]),a[href],input")].filter((el) => el.offsetParent);
		if (!items.length) return;
		const first = items[0], last = items[items.length - 1];
		if (e.shiftKey && document.activeElement === first) {
			e.preventDefault();
			last.focus();
		} else if (!e.shiftKey && document.activeElement === last) {
			e.preventDefault();
			first.focus();
		}
	});
}
{
	let started = false;
	const go = () => {
		if (started) return;
		started = true;
		__vitePreload(() => import("./user/account.mjs").then((m) => m.initAccount({ colors })), [], import.meta.url).catch(() => {});
	};
	if (location.hash.includes("login=")) go();
	else {
		map.once("idle", () => "requestIdleCallback" in window ? requestIdleCallback(go, { timeout: 4e3 }) : setTimeout(go, 1500));
		for (const type of ["pointerdown", "click"]) document.getElementById("settingsButton")?.addEventListener(type, go, { once: true });
	}
}
map.on("move", scheduleLabels);
map.on("resize", scheduleLabels);
feed.start();
window.__subwayWebGL = {
	map,
	me,
	setNightLook,
	get nightLook() {
		return { ...nightLook };
	},
	get nightDebug() {
		return {
			night: nightNow(),
			mapLayer: !!map.getLayer("city-night-bloom"),
			mapFx: !!mapBloom.fx,
			mapErr: mapBloom.fx ? map.painter.context.gl.getError() : null,
			order: map.getStyle().layers.map((l) => l.id).slice(-12)
		};
	},
	modeSettings: (name) => modes.settings(name),
	explainMode: (name) => modes.explain(name),
	get cityBuildings() {
		return cityBuildings;
	},
	loadModeKit,
	cityViaduct,
	setSimcity,
	setJoseon,
	setStarcraft,
	setCoaster,
	setRetro,
	get retro() {
		return modeCtl.current === "retro";
	},
	setNation,
	get nation() {
		return NATIONS.includes(modeCtl.current) ? modeCtl.current : null;
	},
	get simcity() {
		return modeOn.simcity;
	},
	get joseon() {
		return modeOn.joseon;
	},
	get starcraft() {
		return modeOn.starcraft ? modeCtl.current : null;
	},
	get coaster() {
		return modeOn.coaster;
	},
	refreshLive,
	updateSun,
	applyTheme,
	sunPosition,
	trackPoint,
	edgeCoords,
	coasterRises,
	coasterProfile,
	inversion,
	loopD,
	get paths() {
		return paths;
	},
	get byId() {
		return byId;
	},
	get plans() {
		return planner.plans;
	},
	get renderer() {
		return map.getCanvas().getContext("webgl2") ? "webgl2" : "none";
	},
	showTrainPopup,
	startRide,
	stopRide,
	get ride() {
		return rider.ride;
	},
	get c88() {
		return CoasterTrain.last;
	},
	get ships() {
		return TurtleShips.last;
	},
	get convoy() {
		return UnitConvoy?.last ?? null;
	},
	get frames() {
		return { ...frameStats };
	},
	get sky() {
		return SkyUnits?.last ?? null;
	},
	rideFrame,
	set rideSeat(v) {
		rider.seat = v;
	}
};
