import { BusRenderer, busMercator, busModelScale, busPostScale, busStopGrowFrom, projectBusPoint } from "./mesh.mjs";
import { buildBusPath, busKstHour, busLeadDistance, busMotionDistance, busPaceLead, busPathPasses, busPathSlice, busPointAt, contains, intersects, nextBusMotion, retimeBusMotion, snapBusToPath, validCoordinate } from "./motion.mjs";
import { BusRoadNetwork, busLinePointAt, busMetresPerPixel } from "./roads.mjs";
import { journeyCasingPaint, journeyRidePaint, journeyStopPaint } from "../lib/journey_map_style.mjs";
// web/bus/layer.mts
var BUS_LOOKS = {
	bus: {
		widthK: 1.12,
		halfWidth: .56,
		growFrom: 18,
		sizeK: 1.6
	},
	palanquin: {
		widthK: 1.3,
		halfWidth: .65,
		growFrom: 17,
		sizeK: 1
	}
};
var BUS_ZOOM = {
	routes: 0,
	buses: 15,
	stops: 15,
	labels: 16
};
var BUS_ROAD_LINE = {
	from: 14,
	to: 15
};
var lodOpacity = [
	"interpolate",
	["linear"],
	["zoom"],
	BUS_ROAD_LINE.from,
	1,
	BUS_ROAD_LINE.to,
	[
		"match",
		["get", "lod"],
		"plan",
		0,
		1
	]
];
var JOURNEY_APPROACH_M = 5e3;
var BUS_TYPES = {
	trunk: {
		name: "간선",
		light: "#3567C8",
		dark: "#7FAAFF"
	},
	branch: {
		name: "지선",
		light: "#328044",
		dark: "#7AC98C"
	},
	express: {
		name: "광역",
		light: "#C74744",
		dark: "#FA9991"
	},
	circular: {
		name: "순환",
		light: "#916900",
		dark: "#E8C455"
	},
	night: {
		name: "심야",
		light: "#3567C8",
		dark: "#7FAAFF"
	},
	airport: {
		name: "공항",
		light: "#63747B",
		dark: "#A4B5BB"
	},
	village: {
		name: "마을",
		light: "#328044",
		dark: "#7AC98C"
	},
	other: {
		name: "버스",
		light: "#63747B",
		dark: "#A4B5BB"
	}
};
var SOURCE_ROUTES = "bus-routes";
var LAYERS = [
	"bus-route-casing",
	"bus-route-road",
	"bus-route-approx",
	"bus-route-stop"
];
var STALE_MS = 12e4;
var EXPIRE_MS = 6e5;
var MOTION_SLACK_MS = 2e3;
var VIEW_MAX_WAIT_MS = 1e3;
var SOURCE_CHECK = "bus-check";
var CHECK_LAYERS = ["bus-check-line", "bus-check-label"];
var collection = (features) => ({
	type: "FeatureCollection",
	features
});
var feature = (type, coordinates, properties) => ({
	type: "Feature",
	geometry: {
		type,
		coordinates
	},
	properties
});
var text = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({
	"&": "&amp;",
	"<": "&lt;",
	">": "&gt;",
	"\"": "&quot;",
	"'": "&#39;"
})[c]);
var timestamp = (value) => typeof value === "string" && Number.isFinite(Date.parse(value)) ? Date.parse(value) : null;
var boundsArray = (bounds) => [
	bounds.getWest(),
	bounds.getSouth(),
	bounds.getEast(),
	bounds.getNorth()
];
var padded = (b) => {
	const x = (b[2] - b[0]) * .12, y = (b[3] - b[1]) * .12;
	return [
		b[0] - x,
		b[1] - y,
		b[2] + x,
		b[3] + y
	];
};
var boundsOf = (points) => points.reduce((b, p) => [
	Math.min(b[0], p[0]),
	Math.min(b[1], p[1]),
	Math.max(b[2], p[0]),
	Math.max(b[3], p[1])
], [
	Infinity,
	Infinity,
	-Infinity,
	-Infinity
]);
var color = (route, theme) => (BUS_TYPES[route.type] || BUS_TYPES.other)[theme];
var routeBadge = (route) => `<span class="bus-num${[...String(route.name)].length > 4 ? " bus-num-long" : ""}" style="--c:${color(route, "light")}">${text(route.name)}</span>`;
var typeName = (route) => (BUS_TYPES[route.type] || BUS_TYPES.other).name;
var badgeView = (route) => ({
	name: String(route.name ?? ""),
	long: [...String(route.name)].length > 4,
	color: color(route, "light")
});
var ARRIVAL_POLL_MS = 3e4;
var ARRIVAL_POLLS = 10;
function arrivalParts(bus) {
	let message = String(bus?.message || "").trim(), last = !!bus?.last;
	if (message.includes("[막차]")) {
		last = true;
		message = message.replace(/\[막차\]\s*/g, "");
	}
	const where = message.match(/\[([^\]]+)\]\s*$/);
	return {
		when: (where ? message.slice(0, where.index) : message).trim().replace(/^(\d+)분(\d+초)?\s*후$/, "$1분 후").replace(/^\d+초\s*후$/, "곧 도착") || "도착 정보 없음",
		detail: [where?.[1], last && "막차"].filter(Boolean).join(" · ")
	};
}
function stepPhase(id) {
	let h = 2166136261;
	for (const c of String(id)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
	return (h >>> 0) / 4294967296;
}
function arrivalRank(row) {
	const first = row?.buses?.[0], message = String(first?.message || ""), seconds = Number.isFinite(first?.seconds) ? first.seconds : 0;
	if (!first || /운행종료/.test(message)) return 3e6;
	if (/곧 도착/.test(message)) return Math.min(999, Math.max(0, seconds)) / 1e3;
	return seconds > 0 && /분|초/.test(message) ? seconds : 2e6;
}
var isSoon = (row) => /곧 도착/.test(String(row?.buses?.[0]?.message || ""));
var isEnded = (row) => /운행종료/.test(String(row?.buses?.[0]?.message || ""));
function countdownText(seconds) {
	const s = Math.max(0, Math.round(seconds));
	return s <= 0 ? "도착 중" : s < 60 ? `${s}초` : `${Math.floor(s / 60)}분 ${String(s % 60).padStart(2, "0")}초`;
}
var rgb = (hex) => [
	1,
	3,
	5
].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
function stopType(data, id) {
	const count = /* @__PURE__ */ new Map();
	for (const route of data.routesByStop.get(id) || []) count.set(route.type, (count.get(route.type) || 0) + 1);
	let best = "other", most = 0;
	for (const type of Object.keys(BUS_TYPES)) if ((count.get(type) || 0) > most) {
		best = type;
		most = count.get(type);
	}
	return best;
}
function prepareBusData(routes, stops) {
	if (routes?.schemaVersion !== 1 || stops?.schemaVersion !== 1 || !Array.isArray(routes.routes) || !Array.isArray(stops.stops)) throw new Error("Unsupported bus data");
	const stopById = /* @__PURE__ */ new Map(), routeById = /* @__PURE__ */ new Map(), routesByStop = /* @__PURE__ */ new Map();
	for (const stop of stops.stops) {
		if (typeof stop.id !== "string" || !validCoordinate([stop.lng, stop.lat])) continue;
		stopById.set(stop.id, {
			...stop,
			name: String(stop.name || "이름 없는 정류장")
		});
	}
	for (const raw of routes.routes) {
		if (typeof raw.id !== "string" || !Array.isArray(raw.path) || raw.path.length < 2 || !raw.path.every(validCoordinate)) continue;
		const stopEntries = Array.isArray(raw.stopIds) ? raw.stopIds.map((id, i) => ({
			id,
			sequence: raw.stopSequences?.[i]
		})).filter((s) => stopById.has(s.id)) : [];
		const route = {
			...raw,
			name: String(raw.name || raw.id),
			type: BUS_TYPES[raw.type] ? raw.type : "other",
			stopIds: stopEntries.map((s) => s.id),
			stopSequences: stopEntries.map((s) => Number.isInteger(s.sequence) ? s.sequence : null),
			bbox: boundsOf(raw.path),
			approximate: raw.pathSource !== "api",
			geometry: null
		};
		routeById.set(route.id, route);
		for (const id of new Set(route.stopIds)) {
			if (!routesByStop.has(id)) routesByStop.set(id, []);
			routesByStop.get(id).push(route);
		}
	}
	return {
		routeById,
		stopById,
		routesByStop,
		source: routes.source
	};
}
function visibleBusRoutes(data, box, selected = null) {
	const found = [], cx = (box[0] + box[2]) / 2, cy = (box[1] + box[3]) / 2;
	for (const route of data.routeById.values()) {
		if (!intersects(route.bbox, box)) continue;
		const parts = [];
		let part = null, rank = Infinity;
		for (let i = 1; i < route.path.length; i++) {
			const a = route.path[i - 1], b = route.path[i];
			if (!intersects([
				Math.min(a[0], b[0]),
				Math.min(a[1], b[1]),
				Math.max(a[0], b[0]),
				Math.max(a[1], b[1])
			], box)) {
				part = null;
				continue;
			}
			if (!part) {
				part = [a];
				parts.push(part);
			}
			part.push(b);
			const dx = (b[0] - a[0]) * .8, dy = b[1] - a[1], l2 = dx * dx + dy * dy;
			const t = l2 ? Math.max(0, Math.min(1, ((cx - a[0]) * .8 * dx + (cy - a[1]) * dy) / l2)) : 0;
			rank = Math.min(rank, ((a[0] + (b[0] - a[0]) * t - cx) * .8) ** 2 + (a[1] + (b[1] - a[1]) * t - cy) ** 2);
		}
		if (parts.length) found.push({
			route,
			parts,
			rank: route.id === selected ? -1 : rank
		});
	}
	return found.sort((a, b) => a.rank - b.rank || a.route.id.localeCompare(b.route.id));
}
function busRequestURL(routeIds, selected = null) {
	const ids = [...new Set(routeIds)].slice(0, 8);
	const query = new URLSearchParams({ routes: ids.join(",") });
	if (selected && ids.includes(selected)) query.set("focus", selected);
	return `/api/bus/live?${query}`;
}
var POLL_SLACK_MS = 2e3;
var POLL_MIN_MS = 5e3;
var POLL_MAX_MS = 6e4;
var busRouteRefreshMs = (state) => state && [
	"fresh",
	"cached",
	"stale"
].includes(state.status) && Number.isFinite(state.retryAfterSeconds) ? Math.min(POLL_MAX_MS, Math.max(POLL_MIN_MS, state.retryAfterSeconds * 1e3 + POLL_SLACK_MS)) : null;
function busPollDelay(payload, ids = []) {
	const base = Math.min(POLL_MAX_MS, Math.max(15e3, (Number(payload?.pollAfterSeconds) || 30) * 1e3));
	return ids.length ? Math.min(...ids.map((id) => busRouteRefreshMs(payload?.routes?.[id]) ?? base)) : base;
}
function busRoutesNearStops(data, box, chosen = [], screen = null) {
	const priority = [...new Set(chosen)].filter((id) => data.routeById.has(id));
	if (priority.length) return priority.slice(0, 8);
	const cx = (box[0] + box[2]) / 2, cy = (box[1] + box[3]) / 2, rank = /* @__PURE__ */ new Map();
	for (const stop of data.stopById.values()) if (contains(box, [stop.lng, stop.lat])) {
		const point = screen?.project([stop.lng, stop.lat]);
		if (point && (point.x < 0 || point.y < 0 || point.x > screen.width || point.y > screen.height)) continue;
		const d = point ? (point.x - screen.width / 2) ** 2 + (point.y - screen.height / 2) ** 2 : ((stop.lng - cx) * .8) ** 2 + (stop.lat - cy) ** 2;
		for (const route of data.routesByStop.get(stop.id) || []) rank.set(route.id, Math.min(rank.get(route.id) ?? Infinity, d));
	}
	return [...rank].sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0])).slice(0, 8).map(([id]) => id);
}
function busJoinLines(stop, planEnd, roadEnd) {
	const out = [];
	if (roadDistance(stop, planEnd) >= 1.5) out.push({
		lod: "plan",
		coordinates: [stop, planEnd]
	});
	if (roadEnd && roadDistance(stop, roadEnd) >= 1.5) out.push({
		lod: "road",
		coordinates: [stop, roadEnd]
	});
	return out;
}
function roadDistance(a, b) {
	return Math.hypot((b[0] - a[0]) * Math.cos(a[1] * Math.PI / 180), b[1] - a[1]) * 111320;
}
function snappedAt(snapped, distance) {
	const S = snapped.samples, i = Math.max(0, Math.min(S.length - 2, Math.floor(distance / snapped.step))), a = S[i], b = S[Math.min(S.length - 1, i + 1)];
	const t = Math.max(0, Math.min(1, (distance - a.distance) / (b.distance - a.distance || 1)));
	return {
		...a,
		distance,
		coordinate: a.coordinate.map((v, k) => v + (b.coordinate[k] - v) * t)
	};
}
function journeyBusRouteIds(data, legs) {
	if (!data) return [];
	const ids = [];
	for (const leg of legs) {
		if (leg.type !== "bus") continue;
		if (data.routeById.has(String(leg.routeId))) {
			ids.push(String(leg.routeId));
			continue;
		}
		const matches = [...data.routeById.values()].filter((r) => r.name === String(leg.route));
		if (matches.length !== 1 || !leg.path?.length) continue;
		const path = buildBusPath(matches[0].path);
		if (path && [leg.path[0], leg.path.at(-1)].every((p) => snapBusToPath(path, p, { maxError: 350 }))) ids.push(matches[0].id);
	}
	return [...new Set(ids)].slice(0, 8);
}
var journeyRanges = /* @__PURE__ */ new WeakMap();
function journeyBusRange(line, leg) {
	if (!line || !leg) return null;
	let cache = journeyRanges.get(leg);
	if (!cache) journeyRanges.set(leg, cache = /* @__PURE__ */ new Map());
	if (cache.has(line)) return cache.get(line);
	const ride = buildBusPath(leg.path);
	let best = null;
	if (ride) for (const a of busPathPasses(line, ride.points[0])) for (const b of busPathPasses(line, ride.points.at(-1))) {
		if (b.distance <= a.distance) continue;
		let score = Math.abs(b.distance - a.distance - ride.total) + a.error + b.error;
		for (const q of [
			.25,
			.5,
			.75
		]) score += snapBusToPath(line, busPointAt(ride, ride.total * q).coordinate, {
			min: a.distance,
			max: b.distance,
			maxError: Infinity
		})?.error ?? Infinity;
		if (!best || score < best.score) best = {
			score,
			range: [a.distance, b.distance]
		};
	}
	cache.set(line, best?.range || null);
	return best?.range || null;
}
function placeStopPosts(features, exits, view) {
	const { project, width, height, zoom, unit, origin, bearing = 0, phone = false, selected = null, tint = null, growFrom = null } = view, posts = [], hits = [];
	const grow = growFrom == null ? 1 : 2 ** Math.max(0, zoom - growFrom);
	const bounds = (points) => [
		Math.min(...points.map((p) => p.x)),
		Math.min(...points.map((p) => p.y)),
		Math.max(...points.map((p) => p.x)),
		Math.max(...points.map((p) => p.y))
	];
	const pad = (r, x, y = x) => [
		r[0] - x,
		r[1] - y,
		r[2] + x,
		r[3] + y
	];
	const hitBox = (r, minimum) => {
		const cx = (r[0] + r[2]) / 2, cy = (r[1] + r[3]) / 2, w = Math.max(minimum, r[2] - r[0] + 6), h = Math.max(minimum, r[3] - r[1] + 6);
		return [
			cx - w / 2,
			cy - h / 2,
			cx + w / 2,
			cy + h / 2
		];
	};
	const occupied = [], exitHeight = (20 + Math.max(0, Math.min(2, zoom - 16)) * 8) * grow, exitHalf = (11 + 6 * Math.max(0, Math.min(1, (zoom - 16) / 2))) * grow / 2 + 2;
	for (const coordinate of exits) {
		const world = busMercator(coordinate), base = project(world, 0), top = project(world, exitHeight * unit);
		if (base && top) occupied.push(pad(bounds([base, top]), exitHalf, 5));
	}
	const scale = busPostScale(zoom) * grow, c = Math.cos(bearing), s = Math.sin(bearing);
	const candidates = features.map((f) => ({
		f,
		world: busMercator(f.geometry.coordinates)
	}));
	candidates.sort((a, b) => Number(b.f.properties.id === selected) - Number(a.f.properties.id === selected) || (a.world[0] - origin[0]) ** 2 + (a.world[1] - origin[1]) ** 2 - ((b.world[0] - origin[0]) ** 2 + (b.world[1] - origin[1]) ** 2));
	const placed = [];
	const fits = (world) => {
		const points = [];
		for (const x of [-7.5, 7.5]) for (const y of [-7.5, 7.5]) for (const z of [0, 25.5]) {
			const p = project([world[0] + (c * x - s * y) * scale * unit, world[1] + (s * x + c * y) * scale * unit], z * scale * unit);
			if (p) points.push(p);
		}
		if (points.length !== 8) return null;
		const rectangle = bounds(points);
		if (!intersects(rectangle, [
			0,
			0,
			width,
			height
		])) return null;
		const spacing = pad(rectangle, 2), base = project(world, 0), postWidth = rectangle[2] - rectangle[0];
		return {
			world,
			rectangle,
			spacing,
			base,
			exit: occupied.find((r) => intersects(spacing, r)),
			crowded: zoom < 16 ? placed.some((q) => intersects(spacing, q.spacing)) : placed.some((q) => Math.hypot(q.base.x - base.x, q.base.y - base.y) < postWidth / 2)
		};
	};
	for (const { f, world } of candidates) {
		let spot = fits(world);
		if (spot && (spot.exit || spot.crowded && zoom >= 16)) {
			const block = spot.exit || placed.find((q) => Math.hypot(q.base.x - spot.base.x, q.base.y - spot.base.y) < (spot.rectangle[2] - spot.rectangle[0]) / 2)?.rectangle;
			const away = Math.sign(spot.rectangle[0] + spot.rectangle[2] - (block[0] + block[2])) || 1;
			nudge: for (const k of [
				1,
				1.5,
				2,
				2.5
			]) for (const side of [away, -away]) {
				const d = 15 * k * side * scale * unit, moved = fits([world[0] + c * d, world[1] + s * d]);
				if (moved && !moved.exit && !moved.crowded) {
					spot = moved;
					break nudge;
				}
			}
			if (spot.exit || spot.crowded) spot = null;
		}
		if (!spot || spot.exit || spot.crowded) continue;
		const touch = hitBox(spot.rectangle, phone ? 44 : 28);
		placed.push(spot);
		posts.push({
			world: spot.world,
			yaw: bearing,
			scale,
			rgb: tint ? tint(f) : [
				.25,
				.29,
				.3
			],
			selected: selected === f.properties.id
		});
		hits.push({
			id: f.properties.id,
			x: (touch[0] + touch[2]) / 2,
			y: (touch[1] + touch[3]) / 2,
			bounds: touch,
			visualBounds: spot.rectangle
		});
		if (posts.length >= (phone ? 700 : 1400)) break;
	}
	return {
		posts,
		hits
	};
}
function createBusLayer(options) {
	return new BusLayer(options);
}
var BusLayer = class {
	constructor({ map, phone = false, beforeId = "routes", onSelect = () => {}, onClear = () => {}, onRelease = () => {}, fetcher = fetch, requestRender = () => map.triggerRepaint?.(), getExitCoordinates = () => [], onRouteSelect = () => {}, onFollow = () => {}, followedBus = () => null, sheetPad = () => 0, onFollowView = () => {}, frameMs = () => 0 }) {
		this.map = map;
		this.phone = phone;
		this.frameMs = frameMs;
		this.beforeId = beforeId;
		this.onSelect = onSelect;
		this.onClear = onClear;
		this.onRelease = onRelease;
		this.fetcher = (...args) => fetcher(...args);
		this.requestRender = requestRender;
		this.getExitCoordinates = getExitCoordinates;
		this.renderer = new BusRenderer();
		this.stopHits = [];
		this.requested = [];
		this.journeyLegs = [];
		this.journeyIds = [];
		this.roads = new BusRoadNetwork();
		this.onRouteSelect = onRouteSelect;
		this.onFollow = onFollow;
		this.followedBus = followedBus;
		this.sheetPad = sheetPad;
		this.onFollowView = onFollowView;
		this.followOn = false;
		this.followUI = null;
		this.followKeys = {};
		this.stopView = null;
		this.stopFollow = null;
		this.stopCamera = null;
		this.theme = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
		this.enabled = false;
		this.disposed = false;
		this.data = null;
		this.visible = [];
		this.fleet = /* @__PURE__ */ new Map();
		this.hits = [];
		this.selectedRoute = null;
		this.selection = null;
		this.updateDetail = null;
		this.mode = "unavailable";
		this.status = "";
		this.pollMs = 3e4;
		this.rtt = 500;
		this.frame = 0;
		this.frameTimer = 0;
		this.pollTimer = 0;
		this.viewTimer = 0;
		this.moveSince = null;
		this.freshnessTimer = 0;
		this.detailAt = 0;
		this.paces = /* @__PURE__ */ new Map();
		this.paceIndex = null;
		this.reduced = matchMedia("(prefers-reduced-motion: reduce)");
		this.nearby = document.getElementById("inspectNearbyBus");
		this.notice = document.createElement("p");
		this.notice.className = "bus-notice";
		this.notice.hidden = true;
		this.notice.setAttribute("role", "status");
		map.getContainer().append(this.notice);
		this.check = /buslines/.test(globalThis.location?.hash || "");
		this.installLayers();
		this.move = () => {
			clearTimeout(this.viewTimer);
			const now = performance.now();
			this.moveSince ??= now;
			if (now - this.moveSince >= VIEW_MAX_WAIT_MS) {
				this.moveSince = null;
				this.refreshView();
				return;
			}
			this.viewTimer = setTimeout(() => {
				this.moveSince = null;
				this.refreshView();
			}, 200);
		};
		this.visibility = () => {
			this.stopLive();
			if (!document.hidden) this.refreshView();
			else this.clearScene();
		};
		this.motionChanged = () => {
			this.stopAnimation();
			this.draw();
		};
		this.zoom = () => {
			if (!this.active()) this.stopLive();
			if (this.lineZoom < BUS_ROAD_LINE.from && this.roadLinesPending()) this.roadSoon(0);
			this.draw();
			this.updateStatus();
		};
		this.inspect = () => this.inspectNearby();
		this.routeClick = (event) => {
			const button = event.target.closest?.(".bus-detail [data-bus-route], .bus-detail [data-bus-refresh], .bus-detail [data-bus-stop-view]");
			if (!button) return;
			if (button.dataset.busRefresh !== void 0) {
				this.refreshArrivals();
				return;
			}
			if (button.dataset.busStopView !== void 0) {
				this.stopViewAction(button.dataset.busStopView);
				return;
			}
			this.pressRoute(button.dataset.busRoute);
		};
		this.stopNote = "";
		this.followNote = (text) => {
			clearTimeout(this.stopNoteTimer);
			this.stopNote = text;
			if (text) this.stopNoteTimer = setTimeout(() => {
				this.stopNote = "";
				this.refreshDetail();
				this.renderFollowUI();
			}, 3e3);
		};
		this.remove = () => this.destroy();
		this.roadSoon = (ms) => {
			clearTimeout(this.roadTimer);
			this.roadTimer = setTimeout(() => {
				if (!map.isMoving?.() || this.roadLinesPending()) this.refreshView();
			}, ms);
		};
		this.roadData = (e) => {
			if (e.sourceId === "ofm" && e.isSourceLoaded) this.roadSoon(250);
		};
		map.on("moveend", this.move);
		map.on("zoom", this.zoom);
		map.on("remove", this.remove);
		map.on("sourcedata", this.roadData);
		document.addEventListener("visibilitychange", this.visibility);
		this.reduced.addEventListener("change", this.motionChanged);
		document.addEventListener("click", this.routeClick);
		this.nearby?.addEventListener("click", this.inspect);
		this.setEnabled(false);
		if (this.check) this.loadStatic();
	}
	installLayers() {
		const map = this.map;
		map.addSource(SOURCE_ROUTES, {
			type: "geojson",
			data: collection([]),
			tolerance: 0,
			maxzoom: 18
		});
		const layout = {
			"line-cap": "round",
			"line-join": "round"
		}, ride = [
			"==",
			["get", "kind"],
			"ride"
		];
		map.addLayer({
			id: LAYERS[0],
			type: "line",
			source: SOURCE_ROUTES,
			filter: ride,
			layout,
			paint: {
				...journeyCasingPaint({ thin: true }),
				"line-opacity": lodOpacity
			}
		});
		for (const approximate of [false, true]) map.addLayer({
			id: approximate ? LAYERS[2] : LAYERS[1],
			type: "line",
			source: SOURCE_ROUTES,
			filter: [
				"all",
				ride,
				[
					"==",
					["get", "approximate"],
					approximate
				]
			],
			layout,
			paint: {
				...journeyRidePaint({ thin: true }),
				"line-opacity": lodOpacity,
				...approximate ? { "line-dasharray": [2, 2] } : {}
			}
		});
		map.addLayer({
			id: LAYERS[3],
			type: "circle",
			source: SOURCE_ROUTES,
			filter: [
				"==",
				["get", "kind"],
				"stop"
			],
			paint: {
				...journeyStopPaint(),
				"circle-opacity": lodOpacity,
				"circle-stroke-opacity": lodOpacity
			}
		});
		this.raiseRoute();
		if (this.check) this.installCheckLayers();
	}
	installCheckLayers() {
		const map = this.map, before = map.getLayer(this.beforeId) ? this.beforeId : void 0;
		map.addSource(SOURCE_CHECK, {
			type: "geojson",
			data: collection([]),
			tolerance: 0
		});
		const line = [
			"==",
			["geometry-type"],
			"LineString"
		];
		map.addLayer({
			id: CHECK_LAYERS[0],
			type: "line",
			source: SOURCE_CHECK,
			filter: line,
			layout: {
				"line-cap": "round",
				"line-join": "round"
			},
			paint: {
				"line-color": ["get", "color"],
				"line-opacity": .75,
				"line-width": [
					"interpolate",
					["linear"],
					["zoom"],
					10,
					.8,
					14,
					1.6,
					17,
					3
				]
			}
		}, before);
		map.addLayer({
			id: CHECK_LAYERS[1],
			type: "symbol",
			source: SOURCE_CHECK,
			minzoom: 14,
			filter: line,
			layout: {
				"symbol-placement": "line",
				"symbol-spacing": 260,
				"text-field": ["get", "name"],
				"text-font": ["Noto Sans Bold"],
				"text-size": 11
			},
			paint: {
				"text-color": ["get", "color"],
				"text-halo-color": "#ffffff",
				"text-halo-width": 1.6
			}
		}, before);
	}
	renderCheck() {
		if (!this.check || !this.data) return;
		const box = this.box, detail = !!box && this.map.getZoom() >= BUS_ZOOM.buses && !!this.map.querySourceFeatures;
		if (!detail && this.checkDetail === false) return;
		this.checkDetail = detail;
		const features = [];
		for (const route of this.data.routeById.values()) {
			const properties = {
				routeId: route.id,
				name: route.name,
				color: color(route, this.theme)
			}, line = this.lineGeometry(route);
			if (!detail || !line) {
				features.push(feature("LineString", line?.points || route.path, properties));
				continue;
			}
			if (!intersects(route.bbox, box)) continue;
			let part = [];
			const flush = () => {
				if (part.length > 1) features.push(feature("LineString", part, properties));
				part = [];
			};
			for (const p of this.roads.snapLine(line, box).samples) if (contains(box, p.coordinate)) part.push(p.coordinate);
			else flush();
			flush();
		}
		this.map.getSource(SOURCE_CHECK)?.setData(collection(features));
	}
	setTheme(theme) {
		if (this.disposed) return;
		this.theme = theme === "dark" ? "dark" : "light";
		this.checkDetail = null;
		this.renderStatic();
		this.renderCheck();
		this.draw();
		this.refreshDetail();
	}
	setEnabled(enabled) {
		if (this.disposed) return;
		this.enabled = !!enabled;
		if (!this.enabled && !this.chosenIds().length) {
			this.stopLive();
			this.fleet.clear();
			this.hits = [];
		}
		this.refreshView();
		this.draw();
		this.updateStatus();
	}
	async loadStatic() {
		if (this.loading || this.data || this.disposed) return;
		this.loading = true;
		this.status = "";
		const controller = new AbortController();
		this.staticController = controller;
		this.updateStatus();
		try {
			const read = async (url) => {
				const r = await this.fetcher(url, { signal: controller.signal });
				if (!r.ok) throw new Error("Bus data unavailable");
				return r.json();
			};
			const results = await Promise.all([read("/data/bus/routes.json"), read("/data/bus/stops.json")]);
			if (controller.signal.aborted || this.disposed) return;
			this.data = prepareBusData(...results);
			this.loading = false;
			this.journeyIds = journeyBusRouteIds(this.data, this.journeyLegs);
			this.renderCheck();
			this.refreshView();
		} catch (error) {
			if (!controller.signal.aborted) {
				this.loading = false;
				this.status = "버스 노선을 불러오지 못했어요 · 새로고침해 주세요";
				this.updateStatus();
			}
		} finally {
			if (this.staticController === controller) this.staticController = null;
		}
	}
	refreshView() {
		if (this.disposed || document.hidden) return;
		if (this.map.getZoom() < BUS_ZOOM.routes) {
			this.stopLive();
			this.visible = [];
			this.renderStatic();
			this.updateStatus();
			return;
		}
		if (!this.data) {
			if (this.map.getZoom() >= BUS_ZOOM.stops || this.journeyLegs.length) this.loadStatic();
			return;
		}
		this.box = padded(boundsArray(this.map.getBounds()));
		this.visible = visibleBusRoutes(this.data, this.box, this.selectedRoute);
		if (this.map.getZoom() >= Math.min(BUS_ZOOM.buses, BUS_ROAD_LINE.from) && (this.enabled || this.check || this.chosenIds().length)) try {
			this.roads.update(this.map.querySourceFeatures?.("ofm", { sourceLayer: "transportation" }) || []);
		} catch {}
		this.exitCoordinates = this.getExitCoordinates().filter((p) => contains(this.box, p));
		const canvas = this.map.getCanvas(), screen = this.map.project ? {
			project: (p) => this.map.project(p),
			width: canvas.clientWidth,
			height: canvas.clientHeight
		} : null;
		this.requested = this.enabled || this.chosenIds().length ? busRoutesNearStops(this.data, boundsArray(this.map.getBounds()), this.chosenIds(), screen) : [];
		this.renderStatic();
		this.renderCheck();
		this.draw();
		this.updateStatus();
		const ids = this.requested, key = `${ids.join(",")}|${this.selectedRoute || this.journeyIds[0] || ""}`;
		if (!this.active() || !ids.length) {
			this.stopLive();
			return;
		}
		if (key !== this.requestKey) {
			this.stopLive();
			this.requestKey = key;
			this.pollLive();
		} else if (!this.liveController && !this.pollTimer) this.pollLive();
		if (!this.freshnessTimer) this.freshnessTimer = setInterval(() => this.checkFreshness(), 3e4);
	}
	renderStatic() {
		if (this.disposed) return;
		const features = [], stopFeatures = [], chosen = new Set(this.chosenIds()), zoom = this.map.getZoom();
		this.lineZoom = zoom;
		this.roadLines = false;
		const drawRoute = (route, markers, range = null, joins = null) => {
			const properties = {
				routeId: route.id,
				name: route.name,
				color: color(route, this.theme),
				kind: "ride",
				selected: true,
				approximate: route.approximate
			};
			const line = this.lineGeometry(route), road = line && zoom >= BUS_ROAD_LINE.from && this.map.querySourceFeatures ? this.snappedLine(route, line) : null;
			const snapped = road?.samples.some((p) => p.width != null) ? road : null;
			if (range && !line) range = null;
			if (snapped) this.roadLines = true;
			const plan = snapped ? {
				...properties,
				lod: "plan"
			} : properties, ends = [];
			if (snapped) {
				const samples = range ? [
					snappedAt(snapped, range[0]),
					...snapped.samples.filter((p) => p.distance > range[0] && p.distance < range[1]),
					snappedAt(snapped, range[1])
				] : snapped.samples;
				let part = [], width = samples[0]?.width;
				const flush = () => {
					if (part.length > 1) features.push(feature("LineString", part, {
						...properties,
						lod: "road",
						...width ? { laneWidth: width } : {}
					}));
				};
				for (const p of samples) {
					if (p.width !== width) {
						flush();
						part = part.length ? [part.at(-1)] : [];
						width = p.width;
					}
					part.push(p.coordinate);
				}
				flush();
			}
			features.push(feature("LineString", range ? busPathSlice(line, ...range) : line?.points || route.path, plan));
			if (range && joins) {
				const roadWidth = snapped?.samples.find((p) => p.width != null)?.width;
				[[joins[0], range[0]], [joins[1], range[1]]].forEach(([stop, distance]) => {
					const joined = busJoinLines(stop, busPointAt(line, distance).coordinate, snapped ? snappedAt(snapped, distance).coordinate : null);
					for (const join of joined) features.push(join.lod === "plan" ? feature("LineString", join.coordinates, plan) : feature("LineString", join.coordinates, {
						...properties,
						lod: "road",
						...roadWidth ? { laneWidth: roadWidth } : {}
					}));
				});
			}
			for (const marker of markers) {
				const snap = marker.distance != null ? { distance: marker.distance } : line && snapBusToPath(line, marker.coordinate, { maxError: 80 });
				if (snapped) {
					const on = snap && (marker.distance != null ? snappedAt(snapped, snap.distance) : snapped.samples[Math.min(snapped.samples.length - 1, Math.round(snap.distance / snapped.step))]).coordinate;
					ends.push(feature("Point", on || marker.coordinate, {
						...properties,
						lod: "road",
						kind: "stop"
					}));
				}
				const at = snap && busPointAt(line, snap.distance).coordinate;
				ends.push(feature("Point", at || marker.coordinate, {
					...plan,
					kind: "stop"
				}));
			}
			features.push(...ends);
		};
		for (const id of chosen) {
			const route = this.data?.routeById.get(id);
			if (!route) continue;
			const path = this.geometry(route), legs = this.journeyLegs.filter((l) => journeyBusRouteIds(this.data, [l]).includes(id));
			const ranges = legs.map((l) => journeyBusRange(path, l));
			if (legs.length && ranges.every(Boolean)) legs.forEach((l, i) => drawRoute(route, ranges[i].map((distance) => ({ distance })), ranges[i], [l.path[0], l.path.at(-1)]));
			else drawRoute(route, legs.flatMap((l) => [l.path[0], l.path.at(-1)].map((coordinate) => ({ coordinate }))));
		}
		for (const leg of this.journeyLegs) if (!journeyBusRouteIds(this.data, [leg]).length) {
			leg.displayRoute ??= {
				id: "",
				name: String(leg.route),
				path: leg.path,
				type: "other",
				approximate: leg.shaped !== true,
				stopIds: []
			};
			drawRoute(leg.displayRoute, [leg.path[0], leg.path.at(-1)].map((coordinate) => ({ coordinate })));
		}
		if (this.data && this.box && this.map.getZoom() >= BUS_ZOOM.stops) for (const [id, stop] of this.data.stopById) {
			if (contains(this.box, [stop.lng, stop.lat])) stopFeatures.push(feature("Point", this.kerbside(stop), {
				id,
				name: stop.name,
				type: stopType(this.data, id)
			}));
			if (stopFeatures.length >= (this.phone ? 700 : 1400)) break;
		}
		this.map.getSource(SOURCE_ROUTES)?.setData(collection(features));
		this.raiseRoute();
		this.stopFeatures = stopFeatures;
	}
	roadLinesPending() {
		return !this.disposed && !!this.data && this.map.getZoom() >= BUS_ROAD_LINE.from && !this.roadLines && this.chosenIds().length > 0;
	}
	async pollLive() {
		clearTimeout(this.pollTimer);
		this.pollTimer = 0;
		if (this.liveController || !this.active() || !this.requested.length) return;
		const ids = this.requested, controller = new AbortController();
		this.liveController = controller;
		const timeout = setTimeout(() => controller.abort(), 12e3), started = performance.now();
		try {
			const r = await this.fetcher(busRequestURL(ids, this.selectedRoute || this.journeyIds[0]), {
				cache: "no-store",
				signal: controller.signal
			});
			if (!r.ok) throw new Error("Bus live unavailable");
			const payload = await r.json();
			this.rtt = this.rtt * .7 + Math.min(5e3, performance.now() - started) * .3;
			if (!controller.signal.aborted && this.active()) this.setLiveData(payload, ids);
		} catch {
			if (this.liveController === controller && this.active()) {
				this.mode = "error";
				this.pollMs = 15e3;
				for (const bus of this.fleet.values()) this.freeze(bus);
				this.updateStatus();
				this.refreshDetail();
				this.draw();
			}
		} finally {
			clearTimeout(timeout);
			if (this.liveController === controller) {
				this.liveController = null;
				if (this.active()) this.pollTimer = setTimeout(() => this.pollLive(), this.pollMs);
			}
		}
	}
	kerbside(stop) {
		if (stop.kerb?.version !== this.roads.version) stop.kerb = {
			version: this.roads.version,
			coordinate: this.roads.kerbside([stop.lng, stop.lat])
		};
		return stop.kerb.coordinate;
	}
	snappedLine(route, line) {
		if (route.snapped?.version !== this.roads.version) route.snapped = this.roads.snapLine(line);
		return route.snapped;
	}
	lineGeometry(route) {
		return this.geometry(route);
	}
	geometry(route) {
		if (route.geometry) return route.geometry;
		const path = buildBusPath(route.line) || buildBusPath(route.path);
		if (!path) return null;
		let previous = 0;
		path.stops = route.stopIds.map((id) => {
			const stop = this.data.stopById.get(id);
			previous = snapBusToPath(path, [stop.lng, stop.lat], {
				hint: previous,
				min: previous,
				maxError: 1e3
			})?.distance ?? previous;
			return {
				stop,
				distance: previous
			};
		});
		route.geometry = path;
		return path;
	}
	setLiveData(payload, requested = this.requested) {
		if (!this.data || this.disposed) return;
		if (payload?.schemaVersion !== 1 || !Array.isArray(payload.buses)) throw new Error("Unsupported bus live data");
		const now = performance.now(), wall = Date.now(), seen = /* @__PURE__ */ new Set(), allowed = new Set(requested);
		this.mode = [
			"live",
			"mock",
			"unavailable"
		].includes(payload.mode) ? payload.mode : "unavailable";
		this.routeStates = payload.routes || {};
		this.pollMs = busPollDelay(payload, requested);
		for (const row of payload.buses) {
			const route = this.data.routeById.get(row.routeId);
			if (!route || !allowed.has(row.routeId) || typeof row.id !== "string" || !validCoordinate([row.lng, row.lat])) continue;
			const path = this.geometry(route);
			if (!path) continue;
			const state = payload.routes?.[row.routeId] || {}, previous = this.fleet.get(row.id);
			const received = timestamp(row.receivedAt), fetched = timestamp(state.fetchedAt) ?? timestamp(payload.fetchedAt);
			const observed = received ?? fetched;
			if (previous?.observed != null && observed != null && observed < previous.observed) {
				seen.add(row.id);
				continue;
			}
			const age = Math.max(0, observed == null ? 0 : wall - observed, Number(state.ageSeconds || 0) * 1e3);
			if (age > EXPIRE_MS) continue;
			const stale = [
				"error",
				"deferred",
				"unavailable"
			].includes(state.status) || age > STALE_MS || observed == null;
			let min = 0, max = path.total;
			const seq = Number.isInteger(row.stopSequence) ? route.stopSequences.indexOf(row.stopSequence) : -1;
			if (seq >= 0 && path.stops[seq] && path.stops[seq + 1]) {
				min = Math.max(0, path.stops[seq].distance - 50);
				max = Math.min(path.total, path.stops[seq + 1].distance + 50);
			}
			const options = {
				hint: previous?.snapped ?? previous?.motion.to ?? null,
				min,
				max,
				heading: row.heading,
				maxError: route.approximate ? 700 : 250
			};
			const snap = snapBusToPath(path, [row.lng, row.lat], options);
			if (!snap) continue;
			seen.add(row.id);
			const same = previous && previous.observed === observed && Math.abs((previous.snapped ?? previous.motion.to) - snap.distance) < 1;
			const interval = (busRouteRefreshMs(state) ?? this.pollMs) + this.rtt + MOTION_SLACK_MS;
			const history = same ? previous.history : previous?.snapped == null || observed == null || previous.observed == null ? [] : [...previous.history, {
				t: previous.observed,
				d: previous.snapped
			}].filter((h) => observed - h.t <= 12e4 && h.d <= snap.distance + 30);
			const pace = this.paceFor(row.routeId), hourPace = pace && observed != null ? pace.hours[busKstHour(observed)] : null;
			const target = stale || observed == null ? snap.distance : busPaceLead(hourPace, pace?.bin, snap.distance, observed, wall + interval) ?? busLeadDistance(history, snap.distance, observed, wall + interval, path.stops.map((s) => s.distance));
			const bus = {
				row,
				route,
				path,
				motion: same ? retimeBusMotion(previous.motion, now, interval) : nextBusMotion(previous?.motion, target, now, {
					interval,
					reduced: this.reduced.matches,
					stale,
					hold: true
				}),
				observed,
				fetched,
				received,
				stale,
				receivedWall: wall,
				snapped: snap.distance,
				history,
				mock: payload.mode === "mock" || row.mock === true || row.id.startsWith("mock:"),
				status: state.status
			};
			if (stale) this.freeze(bus);
			this.fleet.set(row.id, bus);
		}
		for (const [id, bus] of this.fleet) if (allowed.has(bus.route.id) && !seen.has(id)) this.fleet.delete(id);
		else if (wall - bus.receivedWall > EXPIRE_MS) this.fleet.delete(id);
		this.updateStatus();
		this.refreshDetail();
		this.draw();
	}
	paceFor(id) {
		const known = this.paces.get(id);
		if (known !== void 0) return known instanceof Promise ? null : known;
		const json = (url) => Promise.resolve().then(() => this.fetcher(url, { cache: "no-store" })).then((r) => r?.ok ? r.json() : null);
		this.paceIndex ??= json("/data/bus/pace/index.json").then((j) => new Set(Array.isArray(j?.routes) ? j.routes : [])).catch(() => /* @__PURE__ */ new Set());
		const pending = this.paceIndex.then((ids) => ids.has(id) ? json(`/data/bus/pace/${encodeURIComponent(id)}.json`) : null).then((j) => j?.schemaVersion === 1 && j.bin > 0 && j.hours && typeof j.hours === "object" ? {
			bin: j.bin,
			hours: j.hours
		} : null).catch(() => null).then((v) => {
			this.paces.set(id, v);
		});
		this.paces.set(id, pending);
		return null;
	}
	freeze(bus) {
		bus.stale = true;
		bus.motion = {
			...bus.motion,
			from: bus.motion.to,
			duration: 0
		};
	}
	checkFreshness() {
		const now = Date.now();
		for (const [id, bus] of this.fleet) {
			const age = now - (bus.observed ?? bus.receivedWall);
			if (age > EXPIRE_MS) this.fleet.delete(id);
			else if (age > STALE_MS) this.freeze(bus);
		}
		this.updateStatus();
		this.refreshDetail();
		this.draw();
	}
	chosenIds() {
		return this.selectedRoute ? [this.selectedRoute] : this.journeyIds;
	}
	journeyEnds() {
		if (this.selectedRoute || !this.journeyLegs.length || !this.data) return null;
		if (this.ends?.legs === this.journeyLegs && this.ends.data === this.data) return this.ends.map;
		const map = /* @__PURE__ */ new Map();
		for (const leg of this.journeyLegs) for (const id of journeyBusRouteIds(this.data, [leg])) {
			const range = journeyBusRange(this.geometry(this.data.routeById.get(id)), leg);
			if (!map.has(id)) map.set(id, []);
			map.get(id).push(range ? [range[0] - JOURNEY_APPROACH_M, range[1]] : [-Infinity, Infinity]);
		}
		this.ends = {
			legs: this.journeyLegs,
			data: this.data,
			map
		};
		return map;
	}
	active() {
		return !this.disposed && !document.hidden && (!!this.selectedRoute || this.journeyIds.length > 0 || (this.enabled || this.chosenIds().length > 0) && this.map.getZoom() >= BUS_ZOOM.buses);
	}
	stopAnimation() {
		clearTimeout(this.frameTimer);
		cancelAnimationFrame(this.frame);
		this.frameTimer = 0;
		this.frame = 0;
	}
	stopLive() {
		clearTimeout(this.pollTimer);
		this.pollTimer = 0;
		this.stopAnimation();
		clearInterval(this.freshnessTimer);
		this.freshnessTimer = 0;
		this.liveController?.abort();
		this.liveController = null;
		this.requestKey = null;
	}
	clearScene() {
		this.hits = [];
		this.stopHits = [];
	}
	selectedLeg() {
		const r = this.data?.routeById.get(this.selectedRoute);
		return r ? {
			type: "bus",
			routeId: r.id,
			route: r.name,
			path: r.path,
			color: color(r, this.theme)
		} : null;
	}
	raiseRoute() {
		const before = this.map.getLayer("city-buildings") ? "city-buildings" : this.map.getLayer("bm-bld3d") ? "bm-bld3d" : void 0;
		if (this.map.moveLayer) {
			for (const id of LAYERS) if (this.map.getLayer(id)) this.map.moveLayer(id, before);
		}
	}
	refreshAnimatedDetail(now) {
		const selectedBus = this.selection?.kind === "bus" ? this.fleet.get(this.selection.id) : null;
		if (!selectedBus) return false;
		const completedAt = selectedBus.motion.startedAt + selectedBus.motion.duration;
		if (now - this.detailAt >= 1e3 || now >= completedAt && this.detailAt < completedAt) {
			this.detailAt = now;
			this.refreshDetail();
		}
		return !this.reduced.matches && !selectedBus.stale && now < completedAt;
	}
	draw() {
		if (this.disposed) return;
		this.refreshAnimatedDetail(performance.now());
		this.requestRender();
	}
	render(gl, matrix, occlude = 0) {
		this.clearScene();
		if (this.disposed || document.hidden || !this.data || this.map.getZoom() < BUS_ZOOM.stops && !this.active()) {
			this.renderer.stats = {
				vehicles: 0,
				stops: 0,
				drawCalls: 0
			};
			return;
		}
		const now = performance.now(), wall = Date.now(), zoom = this.map.getZoom(), canvas = this.map.getCanvas();
		const width = canvas.clientWidth, height = canvas.clientHeight, unit = 1 / (512 * 2 ** zoom), box = boundsArray(this.map.getBounds());
		const origin = busMercator([(box[0] + box[2]) / 2, (box[1] + box[3]) / 2]), vehicles = [], posts = [], view = padded(box);
		const project = (world, z) => projectBusPoint(matrix, world[0], world[1], z, width, height);
		const bounds = (points) => [
			Math.min(...points.map((p) => p.x)),
			Math.min(...points.map((p) => p.y)),
			Math.max(...points.map((p) => p.x)),
			Math.max(...points.map((p) => p.y))
		];
		const hitBox = (r, minimum) => {
			const cx = (r[0] + r[2]) / 2, cy = (r[1] + r[3]) / 2, w = Math.max(minimum, r[2] - r[0] + 6), h = Math.max(minimum, r[3] - r[1] + 6);
			return [
				cx - w / 2,
				cy - h / 2,
				cx + w / 2,
				cy + h / 2
			];
		};
		let moving = false;
		const allowed = new Set(this.chosenIds().length ? this.chosenIds() : this.requested), ends = this.journeyEnds();
		if (this.active()) for (const bus of [...this.fleet.values()].sort((a, b) => Number(b.row.id === this.selection?.id) - Number(a.row.id === this.selection?.id))) {
			if (!allowed.has(bus.route.id) || wall - bus.receivedWall > EXPIRE_MS) continue;
			if (bus.observed != null && wall - bus.observed > STALE_MS) this.freeze(bus);
			const distance = this.reduced.matches ? bus.motion.to : busMotionDistance(bus.motion, now);
			if (ends && !(ends.get(bus.route.id) || [[-Infinity, Infinity]]).some(([a, b]) => distance >= a && distance <= b + 30)) continue;
			const overview = zoom < BUS_ZOOM.buses || !this.map.querySourceFeatures, pose = overview ? busPointAt(bus.path, distance) : busLinePointAt(this.snappedLine(bus.route, bus.path), distance);
			if (!pose || !contains(view, pose.coordinate)) continue;
			const L = BUS_LOOKS[this.look] || BUS_LOOKS.bus;
			const fit = pose.laneWidth * .88 / (L.widthK * busMetresPerPixel(zoom, pose.coordinate[1]));
			const near = (z, f) => Math.min(busModelScale(z), Math.max(busModelScale(BUS_ZOOM.buses), f)), grow = 2 ** (zoom - (L.growFrom ?? 17));
			const routeView = overview && this.selectedRoute === bus.route.id;
			const scale = routeView ? busModelScale(zoom) * 1.5 : overview ? busModelScale(zoom) : (L.growFrom && zoom > L.growFrom ? near(L.growFrom, fit / grow) * grow : near(zoom, fit)) * (L.sizeK || 1);
			const world = busMercator(pose.coordinate), yaw = (pose.heading - 90) * Math.PI / 180;
			const c = Math.cos(yaw), s = Math.sin(yaw), corners = [];
			for (const x of [-1.55, 1.55]) for (const y of [-L.halfWidth, L.halfWidth]) for (const z of [0, 1.35]) {
				const q = project([world[0] + (c * x - s * y) * scale * unit, world[1] + (s * x + c * y) * scale * unit], z * scale * unit);
				if (q) corners.push(q);
			}
			if (corners.length !== 8) continue;
			const rectangle = bounds(corners);
			if (!intersects(rectangle, [
				0,
				0,
				width,
				height
			])) continue;
			const p = project(world, .7 * scale * unit), selected = this.selection?.kind === "bus" && this.selection.id === bus.row.id || this.stopFollow === bus.row.id;
			const run = !this.reduced.matches && !bus.stale && now < bus.motion.startedAt + bus.motion.duration;
			const body = routeView ? rgb(color(bus.route, this.theme)).map((v) => v * (this.theme === "dark" ? .65 : .88)) : rgb(bus.route.type === "circular" ? "#EAB308" : color(bus.route, this.theme));
			vehicles.push({
				world,
				yaw,
				scale,
				rgb: body,
				alpha: bus.stale ? .55 : 1,
				label: bus.route.name,
				selected: routeView ? this.stopFollow === bus.row.id ? 3 : 2 : selected,
				moving: run,
				phase: stepPhase(bus.row.id)
			});
			this.hits.push({
				x: p.x,
				y: p.y,
				bounds: hitBox(rectangle, this.phone ? 44 : 24),
				bus,
				coordinate: pose.coordinate,
				heading: pose.heading,
				laneWidth: pose.laneWidth,
				scale
			});
			if (run || selected) moving = true;
			if (vehicles.length >= (this.phone ? 160 : 320)) break;
		}
		const placement = placeStopPosts(zoom < BUS_ZOOM.stops ? [] : this.stopFeatures || [], this.exitCoordinates || [], {
			project,
			width,
			height,
			zoom,
			unit,
			origin,
			bearing: (this.map.getBearing?.() || 0) * Math.PI / 180,
			phone: this.phone,
			selected: this.selection?.id,
			tint: (f) => rgb(color({ type: f.properties.type }, this.theme)),
			growFrom: busStopGrowFrom(this.look)
		});
		posts.push(...placement.posts);
		this.stopHits.push(...placement.hits);
		this.renderer.render(gl, matrix, {
			origin,
			unit,
			pitch: (this.map.getPitch?.() || 0) * Math.PI / 180,
			dark: this.theme === "dark",
			vehicles,
			stops: posts,
			occlude,
			look: this.look,
			time: now / 1e3
		});
		moving = this.refreshAnimatedDetail(now) || moving;
		if (moving && this.active() && !this.frameTimer && !this.frame) this.frameTimer = setTimeout(() => {
			this.frameTimer = 0;
			this.draw();
		}, Math.max(1e3 / (this.phone ? 24 : 30), this.frameMs() || 0));
	}
	approachingBus(route, stopId) {
		const stops = route?.stopIds ? this.geometry(route)?.stops || [] : [], now = performance.now();
		let best = null, gap = Infinity;
		for (const bus of this.fleet.values()) {
			if (bus.route.id !== route.id || bus.stale) continue;
			const d = this.reduced.matches ? bus.motion.to : busMotionDistance(bus.motion, now);
			for (const s of stops) if (s.stop.id === stopId && s.distance - d >= -15 && s.distance - d < gap) {
				gap = s.distance - d;
				best = bus.row.id;
			}
		}
		return best;
	}
	vehiclePosition(id) {
		const bus = this.fleet.get(id);
		if (!bus || !this.active()) return null;
		const zoom = this.map.getZoom(), distance = this.reduced.matches ? bus.motion.to : busMotionDistance(bus.motion, performance.now());
		return (zoom < BUS_ZOOM.buses || !this.map.querySourceFeatures ? busPointAt(bus.path, distance) : busLinePointAt(this.snappedLine(bus.route, bus.path), distance))?.coordinate || null;
	}
	selectAt(point) {
		if (!this.data) return false;
		let nearest = null, distance = Infinity;
		for (const hit of this.hits) {
			const d = Math.hypot(hit.x - point.x, hit.y - point.y);
			if (contains(hit.bounds, [point.x, point.y]) && d < distance) {
				nearest = hit;
				distance = d;
			}
		}
		if (nearest) {
			this.select({
				kind: "bus",
				id: nearest.bus.row.id
			}, nearest.bus.route.id);
			return true;
		}
		if (this.map.getZoom() < BUS_ZOOM.stops) return false;
		const stop = this.stopHits.filter((h) => contains(h.bounds, [point.x, point.y])).sort((a, b) => Math.hypot(a.x - point.x, a.y - point.y) - Math.hypot(b.x - point.x, b.y - point.y))[0];
		if (stop) {
			this.select({
				kind: "stop",
				id: stop.id
			}, null);
			return true;
		}
		const route = this.map.queryRenderedFeatures([[point.x - 4, point.y - 4], [point.x + 4, point.y + 4]], { layers: [...LAYERS.slice(0, 2), ...this.check ? CHECK_LAYERS.slice(0, 1) : []] }).find((f) => f.properties.lod !== "plan");
		if (route) {
			const id = route.properties.routeId;
			this.select({
				kind: "route",
				id
			}, id);
			return true;
		}
		return false;
	}
	inspectNearby() {
		const c = this.map.getCanvas(), centre = {
			x: c.clientWidth / 2,
			y: c.clientHeight / 2
		};
		const hit = [...this.stopHits].sort((a, b) => Math.hypot(a.x - centre.x, a.y - centre.y) - Math.hypot(b.x - centre.x, b.y - centre.y))[0];
		if (hit) this.select({
			kind: "stop",
			id: hit.id
		}, null);
		else if (this.stopFeatures?.length) {
			const stops = this.stopFeatures.map((f) => ({
				f,
				p: this.map.project(f.geometry.coordinates)
			}));
			stops.sort((a, b) => Math.hypot(a.p.x - centre.x, a.p.y - centre.y) - Math.hypot(b.p.x - centre.x, b.p.y - centre.y));
			this.select({
				kind: "stop",
				id: stops[0].f.properties.id
			}, null);
		} else if (this.visible[0]) this.select({
			kind: "route",
			id: this.visible[0].route.id
		}, this.visible[0].route.id);
		else return;
		const panel = document.getElementById("settingsPanel");
		if (panel) panel.hidden = true;
		document.getElementById("settingsButton")?.setAttribute("aria-expanded", "false");
		this.restoreFocus = document.getElementById("settingsButton");
		document.querySelector(".bus-detail h3")?.focus({ preventScroll: true });
	}
	select(selection, routeId) {
		this.stopView = null;
		this.stopFollow = null;
		this.stopCamera = null;
		this.followNote?.("");
		if (routeId) {
			this.journeyLegs = [];
			this.journeyIds = [];
		}
		this.selection = selection;
		this.selectedRoute = routeId;
		this.stopArrivals();
		if (selection?.kind === "stop") {
			this.loadArrivals();
			this.arrivalTick = setInterval(() => this.tickArrivals(), 1e3);
		}
		this.updateDetail = this.onSelect(this.detailView()) || null;
		this.refreshView();
		this.onRouteSelect(this.selectedLeg());
		this.renderFollowUI();
	}
	clearSelection({ journey = false } = {}) {
		if (!this.selection && !this.selectedRoute && !(journey && this.journeyLegs.length)) return;
		if (document.activeElement?.closest?.(".bus-detail")) this.restoreFocus?.focus({ preventScroll: true });
		this.restoreFocus = null;
		this.selection = null;
		this.selectedRoute = null;
		this.updateDetail = null;
		this.stopView = null;
		this.stopFollow = null;
		this.stopCamera = null;
		this.followNote?.("");
		if (journey) {
			this.journeyLegs = [];
			this.journeyIds = [];
		}
		this.stopArrivals();
		if (!this.enabled && !this.chosenIds().length) {
			this.stopLive();
			this.fleet.clear();
		}
		this.refreshView();
		this.renderStatic();
		this.draw();
		this.onRouteSelect(null);
		this.renderFollowUI();
		this.onRelease();
	}
	pressRoute(id) {
		if (!this.data?.routeById.has(id)) return;
		this.journeyLegs = [];
		this.journeyIds = [];
		if (this.selection?.kind === "stop") {
			this.stopRoute(id);
			return;
		}
		this.selectedRoute = this.selectedRoute === id ? null : id;
		this.onFollow(null);
		this.refreshView();
		this.refreshDetail();
		this.onRouteSelect(this.selectedLeg());
	}
	setJourney(legs) {
		if (this.selection) this.onRelease();
		this.selection = null;
		this.selectedRoute = null;
		this.updateDetail = null;
		this.stopArrivals();
		this.journeyLegs = (legs || []).filter((l) => l.type === "bus" && Array.isArray(l.path) && l.path.length > 1 && l.path.every(validCoordinate));
		this.journeyIds = this.data ? journeyBusRouteIds(this.data, this.journeyLegs) : [];
		this.refreshView();
	}
	refreshDetail() {
		if (this.selection && this.updateDetail) this.updateDetail(this.detailView());
		this.renderFollowUI();
	}
	followChanged() {
		if (this.selection?.kind === "stop") this.refreshDetail();
		else this.renderFollowUI();
	}
	stopRoute(id) {
		if (!this.stopCamera && this.map.getCenter) {
			const m = this.map;
			this.stopCamera = {
				center: m.getCenter(),
				zoom: m.getZoom(),
				bearing: m.getBearing?.() ?? 0,
				pitch: m.getPitch?.() ?? 0
			};
		}
		const changed = this.selectedRoute !== id;
		this.selectedRoute = id;
		this.stopFollow = this.approachingBus(this.data.routeById.get(id), this.selection.id);
		this.stopView = this.stopFollow ? "follow" : "route";
		if (changed) this.refreshView();
		this.renderFollowUI();
		this.onRouteSelect(this.selectedLeg(), { fit: !this.stopFollow });
		this.onFollow(this.stopFollow);
		this.refreshDetail();
		this.draw();
		document.querySelector(".bus-detail .bus-follow button")?.focus({ preventScroll: true });
	}
	stopViewAction(what) {
		if (!this.selectedRoute || this.selection?.kind !== "stop") return;
		if (what === "follow") {
			if (!this.approachingBus(this.data.routeById.get(this.selectedRoute), this.selection.id)) {
				this.followNote("곧 올 버스 위치가 아직 없어요");
				this.renderFollowUI();
				return;
			}
			this.stopRoute(this.selectedRoute);
			return;
		}
		if (what === "route") {
			this.stopView = "route";
			this.onFollow(null);
			this.renderFollowUI();
			this.onRouteSelect(this.selectedLeg(), { fit: true });
			this.refreshDetail();
			return;
		}
		const cam = this.stopCamera, stop = this.data.stopById.get(this.selection.id);
		this.selectedRoute = null;
		this.stopFollow = null;
		this.stopView = null;
		this.stopCamera = null;
		this.onFollow(null);
		this.refreshView();
		this.onRouteSelect(null);
		this.refreshDetail();
		this.draw();
		if (stop) this.map.easeTo?.({
			center: [stop.lng, stop.lat],
			zoom: Math.min(18, Math.max(16, cam?.zoom ?? 16.5)),
			bearing: cam?.bearing ?? 0,
			pitch: cam?.pitch ?? 0,
			padding: {
				top: 0,
				bottom: this.sheetPad(),
				left: 0,
				right: 0
			},
			duration: 600
		});
		document.querySelector(".bus-detail h3")?.focus({ preventScroll: true });
	}
	followView() {
		return this.selection?.kind === "stop" && (this.stopView === "follow" && !!this.stopFollow || this.stopView === "route") && !!this.data?.routeById.get(this.selectedRoute);
	}
	renderFollowUI() {
		const on = this.followView();
		if (on !== this.followOn) {
			this.followOn = on;
			this.followExpanded = false;
			this.onFollowView(on);
		}
		if (!on) {
			if (this.followUI) this.followUI.hidden = true;
			this.followKeys = {};
			return;
		}
		if (!this.followUI) {
			const make = (tag, cls, attrs = {}) => {
				const n = document.createElement(tag);
				n.className = cls;
				for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
				return n;
			};
			const el = this.followUI = make("div", "bus-follow-ui"), panel = make("div", "bfu-panel");
			const parts = this.followParts = {
				summary: make("div", "bfu-summary", { role: "status" }),
				details: make("div", "bfu-details"),
				controls: make("div", "bfu-controls")
			};
			panel.append(parts.summary, parts.details, parts.controls);
			el.append(panel);
			el.addEventListener("click", (e) => {
				if (e.target.closest?.("[data-bfu-more]")) {
					this.followExpanded = !this.followExpanded;
					this.renderFollowUI();
					return;
				}
				const b = e.target.closest?.("[data-bus-stop-view]");
				if (b) this.stopViewAction(b.dataset.busStopView);
			});
			this.map.getContainer?.().append(el);
		}
		const el = this.followUI, parts = this.followParts;
		el.hidden = false;
		const route = this.data.routeById.get(this.selectedRoute), stop = this.data.stopById.get(this.selection.id), bus = this.fleet.get(this.stopFollow);
		const following = this.followedBus() === this.stopFollow, now = performance.now();
		const stops = this.geometry(route)?.stops || [], d = bus ? this.reduced.matches ? bus.motion.to : busMotionDistance(bus.motion, now) : null;
		const target = d == null ? null : stops.find((s) => s.stop.id === stop.id && s.distance >= d - 15);
		const ahead = target ? stops.filter((s) => s.distance > d + 15 && s.distance <= target.distance) : [];
		const row = this.arrivals?.stopId === stop.id ? this.arrivals.rows?.find((r) => r.routeId === route.id) : null, first = row?.buses?.[0];
		const secs = first?.etaAt ? (first.etaAt - Date.now()) / 1e3 : null;
		const eta = isSoon(row) || secs != null && secs <= 45 ? "곧 도착" : secs != null ? `약 ${Math.max(1, Math.ceil(secs / 60))}분` : first ? arrivalParts(first).when : "";
		const age = bus?.observed != null ? Math.max(0, Math.round((Date.now() - bus.observed) / 1e3)) : null;
		const set = (key, html) => {
			if (this.followKeys[key] !== html) {
				this.followKeys[key] = html;
				parts[key].innerHTML = html;
			}
		};
		const open = !!this.followExpanded, whole = this.stopView === "route";
		const more = `<button type="button" class="bfu-more${whole ? " icon" : ""}" data-bfu-more aria-expanded="${open}" aria-label="${text(route.name)}번 방면 · 다음 정류장 · 위치 자료 ${open ? "접기" : "펼치기"}">${whole ? "" : `<span>${open ? "접기" : "자세히"}</span>`}<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button>`;
		const ends = route.start && route.end ? `${text(route.start)} ↔ ${text(route.end)}` : "노선 전체";
		set("summary", whole ? `<div class="bfu-line">${routeBadge(route)}<b class="bfu-stop">${ends}</b>${more}</div><div class="bfu-line2"><span class="bfu-lead"><b>${text(stop.name)}</b> ${this.stopFollow ? eta ? `<b class="bfu-eta-s">${text(eta)}</b>` : "" : "· 위치 확인 불가"}</span>${this.stopNote ? `<span class="bfu-sub"><b class="bfu-note">${text(this.stopNote)}</b></span>` : this.stopFollow && ahead.length ? `<span class="bfu-sub">${ahead.length}정거장 전</span>` : ""}</div>` : `<div class="bfu-line">${routeBadge(route)}<b class="bfu-stop">${text(stop.name)}</b><span class="bfu-to">까지</span>${eta ? `<b class="bfu-eta">${text(eta)}</b>` : ""}</div><div class="bfu-line2"><span class="bfu-lead">${ahead.length ? `${ahead.length}정거장 전` : ""}</span><span class="bfu-state${following ? "" : " off"}"><i aria-hidden="true"></i>${following ? "따라가는 중" : "따라가기 멈춤"}</span>${more}</div>`);
		const next = ahead[0]?.stop.name, running = [...this.fleet.values()].filter((b) => b.route.id === route.id && !b.stale).length;
		set("details", open ? `<p><b>${text(route.name)}번${row?.direction ? ` · ${text(row.direction)} 방면` : ""}</b></p>${route.start && route.end ? `<p>${ends}</p>` : ""}${next ? `<p>다음 정류장 · ${text(next)}</p>` : ""}${whole && running ? `<p>지금 다니는 버스 ${running}대</p>` : ""}${age != null ? `<p>위치 자료 ${age < 60 ? `${age}초` : `${Math.round(age / 60)}분`} 전에 받음</p>` : ""}<p>실제 위치는 20~60초 늦을 수 있어요.</p>` : "");
		parts.details.hidden = !open;
		const btn = (what, label, cls, aria) => `<button type="button" data-bus-stop-view="${what}" class="${cls}"${aria ? ` aria-label="${text(aria)}"` : ""}>${label}</button>`;
		set("controls", whole ? btn("follow", "버스 따라가기", "primary", `${route.name}번 곧 올 버스 따라가기`) + btn("stop", "정류장으로", "outline") : following ? btn("route", "노선 전체", "primary") + btn("stop", "정류장으로", "outline") : btn("follow", "다시 따라가기", "primary", `${route.name}번 다시 따라가기`) + btn("route", "노선 전체", "outline") + btn("stop", "정류장으로", "outline"));
	}
	followLine(rowOf) {
		const route = this.selectedRoute && this.data?.routeById.get(this.selectedRoute);
		if (!route || !this.stopView) return null;
		const following = !!this.stopFollow && this.followedBus() === this.stopFollow;
		const state = !this.stopFollow ? "곧 올 버스 위치를 아직 확인할 수 없어요" : following ? "따라가는 중" : this.stopView === "follow" ? "따라가기 멈춤" : "노선 전체";
		const btn = (what, label, aria = "") => ({
			what,
			label,
			aria
		});
		const paused = !following && this.stopView === "follow" && !!this.stopFollow;
		const buttons = [
			following ? btn("route", "노선 전체") : btn("follow", paused ? "다시 따라가기" : "버스 따라가기", `${route.name}번 곧 올 버스 따라가기`),
			...paused ? [btn("route", "노선 전체")] : [],
			btn("stop", "정류장으로")
		];
		return {
			following,
			badge: badgeView(route),
			state,
			arrival: rowOf(route.id),
			buttons
		};
	}
	async loadArrivals(fresh = false) {
		clearTimeout(this.arrivalTimer);
		this.arrivalTimer = 0;
		const stop = this.selection?.kind === "stop" ? this.data?.stopById.get(this.selection.id) : null;
		if (!stop) return;
		if (!stop.arsId) {
			this.arrivals = {
				stopId: stop.id,
				state: "none",
				rows: [],
				count: 0
			};
			return;
		}
		const previous = this.arrivals?.stopId === stop.id ? this.arrivals : null;
		const schedule = () => {
			const wait = ["error", "stale"].includes(this.arrivals.state) ? 6e3 : ARRIVAL_POLL_MS;
			if (this.selection?.kind === "stop" && this.selection.id === stop.id && this.arrivals.count < ARRIVAL_POLLS) this.arrivalTimer = setTimeout(() => this.loadArrivals(), wait);
		};
		if (previous && document.hidden) {
			schedule();
			return;
		}
		this.arrivals = {
			...previous,
			stopId: stop.id,
			rows: previous?.rows || [],
			state: previous?.state || "loading",
			count: (previous?.count || 0) + 1
		};
		this.arrivalController?.abort();
		const controller = this.arrivalController = new AbortController(), timeout = setTimeout(() => controller.abort(), 12e3);
		try {
			const body = await (await this.fetcher(`/api/bus/live?stop=${encodeURIComponent(stop.arsId)}${fresh ? "&fresh=1" : ""}`, {
				cache: "no-store",
				signal: controller.signal
			})).json();
			if (controller !== this.arrivalController) return;
			if (body?.schemaVersion !== 1 || !Array.isArray(body.arrivals)) throw new Error("Unsupported bus arrival data");
			const got = Date.now(), age = Number(body.ageSeconds) || 0;
			const rows = body.arrivals.filter((a) => a && typeof a.routeId === "string").map((a) => ({
				...a,
				buses: (a.buses || []).map((b) => ({
					...b,
					etaAt: Number.isFinite(b?.seconds) && b.seconds > 0 ? got + (b.seconds - age) * 1e3 : null
				}))
			}));
			this.arrivals = {
				...this.arrivals,
				state: body.status,
				mode: body.mode,
				rows,
				fetchedAt: timestamp(body.fetchedAt),
				code: body.errors?.[0]?.code || ""
			};
		} catch {
			if (controller !== this.arrivalController) return;
			this.arrivals = {
				...this.arrivals,
				state: this.arrivals.rows.length ? "stale" : "error",
				code: ""
			};
		} finally {
			clearTimeout(timeout);
			if (controller === this.arrivalController) {
				this.arrivalController = null;
				schedule();
			}
		}
		this.refreshDetail();
	}
	refreshArrivals() {
		if (!this.arrivals || this.arrivals.state === "none") return;
		this.arrivals.count = 0;
		this.loadArrivals(true);
		this.refreshDetail();
	}
	tickArrivals() {
		this.renderFollowUI();
		const sheet = document.querySelector?.(".bus-detail .bus-stop");
		if (!sheet) return;
		for (const el of sheet.querySelectorAll("[data-eta]")) {
			const left = countdownText((Number(el.dataset.eta) - Date.now()) / 1e3), node = el.firstChild;
			if (node?.nodeType === 3 && !node.nextSibling) {
				if (node.nodeValue !== left) node.nodeValue = left;
			} else if (el.textContent !== left) el.textContent = left;
		}
		const icon = sheet.querySelector("[data-track-route]"), stop = this.selection?.kind === "stop" ? this.selection.id : null;
		const route = icon && this.data?.routeById.get(icon.dataset.trackRoute);
		if (route && stop) icon.style.left = `${this.approach(route, stop).ratio * 50}%`;
	}
	stopArrivals() {
		clearInterval(this.arrivalTick);
		this.arrivalTick = 0;
		clearTimeout(this.arrivalTimer);
		this.arrivalTimer = 0;
		const controller = this.arrivalController;
		this.arrivalController = null;
		controller?.abort();
		this.arrivals = null;
	}
	approach(route, stopId) {
		const stops = (route?.stopIds ? this.geometry(route) : null)?.stops || [];
		const now = performance.now(), found = [];
		stops.forEach((s, i) => {
			if (i > 0 && s.stop.id === stopId) found.push(i);
		});
		let best = {
			i: found[0],
			ratio: null
		};
		if (route?.id === this.selectedRoute) for (const i of found) {
			const from = stops[i - 1].distance, to = stops[i].distance;
			if (!(to > from)) continue;
			for (const bus of this.fleet.values()) {
				if (bus.route.id !== route.id || bus.stale) continue;
				const d = this.reduced.matches ? bus.motion.to : busMotionDistance(bus.motion, now);
				if (d >= from - 20 && d <= to + 5 && (best.ratio == null || (d - from) / (to - from) > best.ratio)) best = {
					i,
					ratio: (d - from) / (to - from)
				};
			}
		}
		return {
			prev: best.i ? stops[best.i - 1]?.stop.name : "",
			next: best.i ? stops[best.i + 1]?.stop.name : "",
			ratio: best.ratio == null ? .52 : Math.max(.06, Math.min(.96, best.ratio))
		};
	}
	stopSheet(stop, routes, mock) {
		const a = this.arrivals?.stopId === stop.id ? this.arrivals : null;
		const rows = new Map((a?.rows || []).map((row) => [row.routeId, row])), known = new Set(routes.map((r) => r.id));
		const answered = a && [
			"fresh",
			"cached",
			"stale",
			"mock"
		].includes(a.state), waiting = !a || a.state === "loading";
		const clock = a?.fetchedAt == null ? "" : new Date(a.fetchedAt).toLocaleTimeString("ko-KR", {
			hour: "2-digit",
			minute: "2-digit",
			second: "2-digit",
			hourCycle: "h23",
			timeZone: "Asia/Seoul"
		});
		const note = !a || waiting ? "" : a.state === "none" ? "이 정류장은 도착 정보가 없어요." : a.state === "unavailable" ? "지금은 도착 정보를 쓸 수 없어요." : a.mode === "mock" ? "예시 데이터 · 실제 운행 정보 아님" : a.state === "stale" ? "도착 정보 갱신 지연 · 마지막으로 받은 정보예요." : answered ? "" : a.code === "daily_limit" ? "오늘 도착 정보 조회 한도를 다 썼어요." : "도착 정보를 불러오지 못했어요.";
		const items = [...routes.map((route) => ({
			route,
			row: rows.get(route.id),
			live: true
		})), ...[...rows.values()].filter((row) => !known.has(row.routeId)).map((row) => ({
			route: {
				id: row.routeId,
				name: row.name,
				type: row.type
			},
			row,
			live: false
		}))];
		items.sort((x, y) => arrivalRank(x.row) - arrivalRank(y.row));
		const soon = items.filter((i) => isSoon(i.row)), ended = items.filter((i) => isEnded(i.row)), list = items.filter((i) => !isEnded(i.row));
		let hero = null;
		if (soon.length) {
			const lead = soon[0], near = this.approach(lead.live ? lead.route : null, stop.id), one = soon.length === 1;
			const nextBus = one && lead.row.buses?.[1] ? arrivalParts(lead.row.buses[1]).when : "";
			const width = (name) => {
				const chars = [...String(name)], long = chars.length > 4;
				return (long ? 12 : 16) + chars.reduce((w, c) => w + (c.charCodeAt(0) < 128 ? 9 : 15), 0) * (long ? 13 / 16 : 1) + 5;
			};
			const fits = (list) => list.reduce((w, i) => w + width(i.route.name), 0) <= 300;
			let shown = soon;
			if (!fits(soon)) {
				shown = [];
				for (const i of soon) {
					if (!fits([...shown, i]) || shown.reduce((w, x) => w + width(x.route.name), 0) + width(i.route.name) > 256) break;
					shown.push(i);
				}
			}
			const next = nextBus === "곧 도착" ? "다음 버스도 곧 도착" : /분 후$/.test(nextBus) ? `다음 ${nextBus.replace(/ 후$/, "")}` : "";
			hero = {
				one,
				button: one && lead.live,
				routeId: lead.route.id,
				pressed: lead.route.id === this.selectedRoute,
				badges: (one ? [lead] : shown).map((i) => badgeView(i.route)),
				more: one ? 0 : soon.length - shown.length,
				direction: lead.row.direction ? `${lead.row.direction} 방면` : typeName(lead.route),
				onMap: lead.live && lead.route.id === this.selectedRoute,
				next,
				trackRoute: lead.live ? lead.route.id : null,
				ratio: near.ratio,
				prev: near.prev || "",
				stop: stop.name,
				after: near.next || ""
			};
		}
		const rowView = ({ route, row, live }) => {
			const first = row?.buses?.[0], parts = first ? arrivalParts(first) : null;
			const where = parts?.detail.split(" · ").filter((t) => t !== "막차" && t !== "0번째 전").join(" · ") || "";
			const tag = parts?.detail.includes("막차") ? "막차" : live ? "" : "지도 없음";
			const time = waiting && !row ? { kind: "wait" } : !row ? { kind: "none" } : isSoon(row) ? { kind: "soon" } : first?.etaAt ? {
				kind: "eta",
				where,
				at: Math.round(first.etaAt),
				left: countdownText((first.etaAt - Date.now()) / 1e3)
			} : {
				kind: "away",
				text: parts.when
			};
			return {
				routeId: route.id,
				live,
				pressed: route.id === this.selectedRoute,
				badge: badgeView(route),
				direction: row?.direction ? `${row.direction} 방면` : typeName(route),
				tag,
				time
			};
		};
		const followLine = this.followLine((id) => {
			const r = rows.get(id), first = r?.buses?.[0];
			return [r?.direction ? `${r.direction} 방면` : "", isSoon(r) ? "곧 도착" : first ? arrivalParts(first).when : ""].filter(Boolean).join(" · ");
		});
		return {
			kind: "stop",
			name: stop.name,
			arsId: stop.arsId || "",
			compact: this.stopView === "follow" && !!followLine,
			refresh: stop.arsId ? {
				clock,
				loading: !!this.arrivalController
			} : null,
			followLine,
			note,
			stopNote: this.stopNote,
			mock,
			hero,
			rows: list.map(rowView),
			ended: ended.map(({ route, live }) => ({
				routeId: route.id,
				name: route.name ?? "",
				live,
				pressed: route.id === this.selectedRoute
			}))
		};
	}
	detailView() {
		const selection = this.selection;
		if (!selection) return null;
		if (selection.kind === "stop") {
			const stop = this.data.stopById.get(selection.id);
			if (!stop) return null;
			const routes = this.data.routesByStop.get(stop.id) || [];
			const chosen = this.data.routeById.get(this.selectedRoute);
			const mock = !!chosen && (this.mode === "mock" || [...this.fleet.values()].some((b) => b.route.id === chosen.id && b.mock));
			return this.stopSheet(stop, routes, mock);
		}
		const bus = selection.kind === "bus" ? this.fleet.get(selection.id) : null;
		const route = bus?.route || this.data.routeById.get(this.selectedRoute);
		if (!route) return null;
		const head = {
			kind: "route",
			typeName: BUS_TYPES[route.type].name,
			typeColor: color(route, this.theme),
			name: route.name,
			approx: !!route.approximate
		};
		if (!bus) return {
			...head,
			grid: null,
			note: selection.kind === "bus" ? "이 버스의 최신 위치를 확인하지 못했어요." : `${route.stopIds.length}개 정류장`
		};
		const position = busMotionDistance(bus.motion, performance.now());
		const next = bus.path.stops.find((s) => s.distance > position + 8)?.stop;
		const clock = bus.received ?? bus.fetched;
		const time = clock == null ? "확인되지 않음" : new Date(clock).toLocaleTimeString("ko-KR", {
			hour: "2-digit",
			minute: "2-digit",
			second: "2-digit",
			timeZone: "Asia/Seoul"
		});
		const state = bus.mock ? "예시 데이터 · 실제 운행 정보 아님" : bus.stale ? "위치 갱신 지연 · 마지막 위치" : "마지막 수신 위치를 연결해 보여요";
		return {
			...head,
			grid: {
				next: next?.name || "정보 없음",
				onPath: !!next,
				clockLabel: bus.received ? "수신 시각" : "조회 시각",
				time
			},
			note: state
		};
	}
	updateStatus() {
		if (this.disposed) return;
		const zoom = this.map.getZoom();
		const delayed = this.mode === "error" || Object.values(this.routeStates || {}).some((s) => [
			"stale",
			"deferred",
			"error"
		].includes(s.status));
		if (this.nearby) {
			this.nearby.hidden = false;
			this.nearby.disabled = !this.stopFeatures?.length || zoom < BUS_ZOOM.stops;
		}
		const chosen = new Set(this.chosenIds()), approximate = this.visible.some((v) => chosen.has(v.route.id) && v.route.approximate), mock = this.mode === "mock" || [...this.fleet.values()].some((b) => b.mock);
		const notice = this.status || (mock ? "버스 예시 데이터 · 실제 운행 정보 아님" : delayed ? "버스 위치 갱신 지연" : "");
		this.notice.textContent = [notice, approximate ? `${notice ? "" : "버스 · "}정류장 연결선` : ""].filter(Boolean).join(" · ");
		this.notice.hidden = !(this.enabled || chosen.size || this.journeyLegs.length) || !this.active() || !this.notice.textContent;
	}
	destroy() {
		if (this.disposed) return;
		this.stopLive();
		this.stopArrivals();
		clearTimeout(this.viewTimer);
		clearTimeout(this.roadTimer);
		clearTimeout(this.stopNoteTimer);
		this.staticController?.abort();
		this.disposed = true;
		this.map.off("moveend", this.move);
		this.map.off("zoom", this.zoom);
		this.map.off("remove", this.remove);
		this.map.off("sourcedata", this.roadData);
		document.removeEventListener("visibilitychange", this.visibility);
		this.reduced.removeEventListener("change", this.motionChanged);
		document.removeEventListener("click", this.routeClick);
		this.nearby?.removeEventListener("click", this.inspect);
		this.renderer.dispose();
		this.notice.remove();
		this.fleet.clear();
	}
};
export { BUS_ROAD_LINE, BUS_TYPES, BUS_ZOOM, arrivalParts, busJoinLines, busPollDelay, busRequestURL, busRouteRefreshMs, busRoutesNearStops, countdownText, createBusLayer, journeyBusRange, journeyBusRouteIds, placeStopPosts, prepareBusData, stopType, visibleBusRoutes };
