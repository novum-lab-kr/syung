import { Fragment as M, createRef as $, render as K } from "../npm/preact/dist/preact.mjs";
import { jsx as a } from "../npm/preact/jsx-runtime/dist/jsxRuntime.mjs";
import { useEffect as A, useRef as T } from "../npm/preact/hooks/dist/hooks.mjs";
import { batchSize, busLabel, closeCell, compareRows, dayLabel, elapsed, fmt, lineGraph, lineStations, motionChunks, nearest, rideLine, rideTitle, ridingView, shotLine } from "./debug_data.mjs";
// web/admin/debug.tsx
var store = {
	get(key, fallback) {
		try {
			const value = localStorage.getItem(key);
			return value ? JSON.parse(value) : fallback;
		} catch {
			return fallback;
		}
	},
	set(key, value) {
		try {
			localStorage.setItem(key, JSON.stringify(value));
		} catch {}
	}
};
var QUEUE = "syung-debug-queue";
var RIDE = "syung-debug-ride";
var view = {
	login: false,
	tab: "ride",
	lines: null,
	linesFailed: false,
	line: "",
	station: "",
	train: "",
	busno: "",
	vehicle: "",
	routes: [],
	pressed: null,
	riding: false,
	ridingText: null,
	time: "0:00",
	gpsText: "-",
	motionText: "-",
	log: [],
	thumbs: [],
	note: "",
	sendDisabled: true,
	status: {
		text: "",
		cls: "status"
	},
	recent: null
};
var main = document.querySelector("main");
var tabs = document.querySelector("nav.tabs");
var filesRef = $();
var dayRef = $();
function set(patch) {
	view = {
		...view,
		...patch
	};
	K(/* @__PURE__ */ a(Tabs, {}), tabs);
	K(/* @__PURE__ */ a(DebugPage, {}), main);
}
var showLogin = (on) => set({ login: on });
var field = (name) => (event) => set({ [name]: event.currentTarget.value });
var queue = store.get(QUEUE, []);
var sending = false;
function push(event) {
	const entry = {
		...event,
		ride: ride.id,
		mode: ride.mode,
		t: Date.now()
	};
	if (ride.mode === "subway") Object.assign(entry, {
		line: ride.line,
		train: ride.train || void 0
	});
	else Object.assign(entry, {
		routeId: ride.routeId,
		routeName: ride.routeName,
		vehicle: ride.vehicle || void 0
	});
	if (gps.last && Date.now() - gps.last.t < 15e3 && event.kind !== "gps") Object.assign(entry, {
		lat: gps.last.lat,
		lng: gps.last.lng,
		acc: gps.last.acc
	});
	queue.push(entry);
	store.set(QUEUE, queue);
	set({});
	return entry;
}
async function flush() {
	if (sending || !queue.length || !navigator.onLine) return;
	sending = true;
	const batch = queue.slice(0, batchSize(queue));
	try {
		const response = await fetch("/api/admin/debug/ride", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ events: batch }),
			credentials: "same-origin"
		});
		if (response.status === 401) showLogin(true);
		else if (response.ok || response.status === 400) {
			showLogin(false);
			queue = queue.slice(batch.length);
			store.set(QUEUE, queue);
		}
	} catch {} finally {
		sending = false;
		set({});
	}
}
setInterval(flush, 15e3);
addEventListener("online", flush);
document.addEventListener("visibilitychange", () => {
	if (document.visibilityState === "hidden") flush();
	else if (ride.id) keepAwake();
});
var gps = {
	watch: null,
	last: null,
	sentAt: 0,
	points: 0
};
function startGps() {
	if (!navigator.geolocation || gps.watch != null) return;
	gps.watch = navigator.geolocation.watchPosition((position) => {
		const coords = position.coords;
		gps.last = {
			t: Date.now(),
			lat: coords.latitude,
			lng: coords.longitude,
			acc: coords.accuracy
		};
		set({ gpsText: `${Math.round(coords.accuracy)}m` });
		if (ride.id && Date.now() - gps.sentAt >= 4500) {
			gps.sentAt = Date.now();
			gps.points++;
			push({
				kind: "gps",
				lat: coords.latitude,
				lng: coords.longitude,
				acc: coords.accuracy,
				speed: coords.speed ?? void 0,
				heading: Number.isFinite(coords.heading) ? coords.heading : void 0
			});
		}
	}, () => {
		set({ gpsText: "없음" });
	}, {
		enableHighAccuracy: true,
		maximumAge: 2e3,
		timeout: 2e4
	});
}
function stopGps() {
	if (gps.watch != null) navigator.geolocation.clearWatch(gps.watch);
	gps.watch = null;
}
var lock = null;
async function keepAwake() {
	try {
		lock = await navigator.wakeLock?.request("screen");
	} catch {}
}
var motion = {
	on: false,
	bins: [],
	cur: null,
	samples: 0,
	since: 0
};
var setMotion = (text) => {
	set({ motionText: text });
};
async function startMotion() {
	if (motion.on || motion.asking) return;
	if (typeof DeviceMotionEvent === "undefined") return setMotion("없음");
	motion.asking = true;
	try {
		const ask = DeviceMotionEvent.requestPermission;
		if (typeof ask === "function" && await ask() !== "granted") return setMotion("거부");
	} catch {
		return setMotion("눌러 켜기");
	} finally {
		motion.asking = false;
	}
	motion.on = true;
	motion.since = Date.now();
	motion.samples = 0;
	addEventListener("devicemotion", onMotion);
	setMotion("대기");
}
function stopMotion() {
	if (!motion.on) return;
	removeEventListener("devicemotion", onMotion);
	motion.on = false;
	sendMotion(true);
	setMotion("-");
}
function onMotion(event) {
	const slot = Math.floor(Date.now() / 100) * 100, gravity = event.accelerationIncludingGravity || {}, linear = event.acceleration || {}, turn = event.rotationRate || {};
	const values = [
		gravity.x,
		gravity.y,
		gravity.z,
		linear.x,
		linear.y,
		linear.z,
		turn.alpha,
		turn.beta,
		turn.gamma
	];
	if (!motion.cur || motion.cur.slot !== slot) {
		closeBin();
		motion.cur = {
			slot,
			sum: values.map(() => 0),
			n: values.map(() => 0)
		};
	}
	const cell = motion.cur;
	values.forEach((value, index) => {
		if (Number.isFinite(value)) {
			cell.sum[index] += value;
			cell.n[index]++;
		}
	});
	motion.samples++;
}
function closeBin() {
	if (motion.cur) motion.bins.push(closeCell(motion.cur));
	motion.cur = null;
}
function sendMotion(all = false) {
	if (all) closeBin();
	if (!ride.id || !motion.bins.length) return;
	for (const chunk of motionChunks(motion.bins, Date.now())) push({
		kind: "motion",
		m: chunk
	});
	motion.bins = [];
	setMotion(`${Math.round(motion.samples / Math.max(1, (Date.now() - motion.since) / 1e3))}Hz`);
}
setInterval(sendMotion, 5e3);
var stations = /* @__PURE__ */ new Map();
var neighbors = /* @__PURE__ */ new Map();
var onLine = (line) => lineStations(stations, neighbors, line);
async function loadSubway() {
	const [html, edges] = await Promise.all([fetch("/index.html").then((response) => response.text()), fetch("/edge_times.json").then((response) => response.json())]);
	const doc = new DOMParser().parseFromString(html, "text/html");
	for (const station of JSON.parse(doc.getElementById("stationData").textContent)) stations.set(station.id, station);
	const graph = lineGraph(Object.keys(edges.edges));
	neighbors = graph.neighbors;
	set({
		lines: graph.lines,
		line: store.get("syung-debug-line", graph.lines[0]) || graph.lines[0]
	});
}
var stationByName = (line, name) => onLine(line).find((station) => station.name === name.trim());
var nearStation = () => navigator.geolocation?.getCurrentPosition((position) => {
	const best = nearest(onLine(view.line), position.coords.latitude, position.coords.longitude);
	if (best) set({ station: best.name });
}, () => alert("GPS 를 못 받았어요(지하일 수 있어요). 역 이름을 직접 골라 주세요."), {
	enableHighAccuracy: true,
	timeout: 1e4
});
var busPick = null;
var busTimer;
async function findBus() {
	const name = view.busno.trim();
	busPick = null;
	set({});
	if (!name) {
		set({
			routes: [],
			pressed: null
		});
		return;
	}
	const response = await fetch(`/api/admin/debug/bus-route?name=${encodeURIComponent(name)}`, { credentials: "same-origin" });
	if (response.status === 401) return showLogin(true);
	const { routes = [] } = await response.json();
	set({
		routes,
		pressed: null
	});
	if (routes.length === 1) pickBus(0);
}
function pickBus(index) {
	busPick = view.routes[index];
	set({ pressed: index });
}
var mode = "subway";
var ride = store.get(RIDE, {});
var startable = () => mode === "subway" ? !!stationByName(view.line, view.station) : !!busPick;
var save = () => store.set(RIDE, ride);
var say = (text) => set({ log: [`${fmt(Date.now())} ${text}`, ...view.log] });
function start() {
	startMotion();
	for (const key of Object.keys(ride)) delete ride[key];
	Object.assign(ride, {
		id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
		mode,
		startedAt: Date.now(),
		moving: false
	});
	if (mode === "subway") {
		const station = stationByName(view.line, view.station);
		Object.assign(ride, {
			line: view.line,
			train: view.train.trim(),
			path: [station.id]
		});
		push({
			kind: "start",
			station: station.name
		});
	} else {
		Object.assign(ride, {
			routeId: busPick.id,
			routeName: busPick.name,
			vehicle: view.vehicle.trim(),
			stops: 0
		});
		push({ kind: "start" });
	}
	save();
	set({ log: [] });
	say("탑승 시작");
	enterRiding();
	flush();
}
function enterRiding() {
	set({ riding: true });
	startGps();
	keepAwake();
	startMotion();
	paintRide();
	if (ride.mode === "bus") {
		pollBus();
		clearInterval(pollTimer);
		pollTimer = setInterval(pollBus, 3e4);
	}
	if (ride.mode === "subway") {
		pollSubway();
		clearInterval(pollTimer);
		pollTimer = setInterval(pollSubway, 2e4);
	}
}
function pollSubway() {
	if (ride.mode === "subway" && ride.line && !document.hidden) fetch(`/api/live?lines=${encodeURIComponent(ride.line)}`, { cache: "no-store" }).catch(() => {});
}
function pollBus() {
	if (ride.mode === "bus" && ride.routeId) fetch(`/api/bus/live?routes=${ride.routeId}&focus=${ride.routeId}`, { cache: "no-store" }).catch(() => {});
}
var nextPick = null;
var pollTimer;
function paintRide() {
	if (!ride.id) return;
	const text = ridingView(ride, stations, neighbors, nextPick);
	nextPick = text.nextPick;
	set({ ridingText: text });
}
function act() {
	if (navigator.vibrate) navigator.vibrate(30);
	if (ride.mode === "subway") {
		const path = ride.path, here = stations.get(path.at(-1))?.name;
		if (ride.moving) {
			const next = nextPick == null ? void 0 : stations.get(nextPick);
			push({
				kind: "arrive",
				station: next?.name
			});
			path.push(nextPick);
			ride.moving = false;
			say(`${next?.name} 도착`);
		} else {
			push({
				kind: "depart",
				station: here
			});
			ride.moving = true;
			say(`${here} 출발`);
		}
	} else if (ride.moving) {
		ride.stops = (ride.stops || 0) + 1;
		push({ kind: "arrive" });
		ride.moving = false;
		say("정류장 도착");
	} else {
		push({ kind: "depart" });
		ride.moving = true;
		say("출발");
	}
	save();
	paintRide();
	flush();
}
function mark() {
	const note = prompt("무엇이 이상했나요? (비워도 돼요)") ?? null;
	if (note === null) return;
	push({
		kind: "mark",
		note
	});
	say(`표시${note ? `: ${note}` : ""}`);
	flush();
}
function undo() {
	const index = queue.findLastIndex((event) => event.ride === ride.id && (event.kind === "arrive" || event.kind === "depart"));
	if (index < 0) {
		push({
			kind: "mark",
			note: "바로 앞 도착 · 출발 취소"
		});
		say("이미 보낸 것 — 취소 표시를 남겼어요");
	} else {
		const event = queue.splice(index, 1)[0];
		store.set(QUEUE, queue);
		say(`${event.kind === "arrive" ? "도착" : "출발"} 취소`);
	}
	if (ride.mode === "subway") {
		if (ride.moving) ride.moving = false;
		else if (ride.path.length > 1) {
			nextPick = ride.path.pop();
			ride.moving = true;
		}
	} else ride.moving = !ride.moving;
	save();
	paintRide();
}
async function end() {
	if (!confirm("탑승 기록을 끝낼까요?")) return;
	stopMotion();
	push({ kind: "end" });
	clearInterval(pollTimer);
	stopGps();
	lock?.release?.().catch(() => {});
	for (const key of Object.keys(ride)) delete ride[key];
	save();
	await flush();
	set({ riding: false });
}
setInterval(() => {
	if (ride.id) set({ time: elapsed(Date.now() - ride.startedAt) });
}, 1e3);
var picked = [];
function showPicked() {
	set({
		thumbs: picked.map((file) => file.type.startsWith("image/") ? URL.createObjectURL(file) : null),
		sendDisabled: !picked.length
	});
}
var deviceState = () => ({
	ua: navigator.userAgent,
	w: innerWidth,
	h: innerHeight,
	dpr: devicePixelRatio,
	theme: document.documentElement.dataset.theme,
	ride: ride.id ? {
		id: ride.id,
		mode: ride.mode,
		line: ride.line || ride.routeName,
		at: ride.mode === "subway" ? stations.get(ride.path.at(-1))?.name : void 0
	} : void 0,
	gps: gps.last ? {
		lat: +gps.last.lat.toFixed(5),
		lng: +gps.last.lng.toFixed(5),
		acc: Math.round(gps.last.acc)
	} : void 0,
	at: (/* @__PURE__ */ new Date()).toISOString()
});
async function send() {
	set({ sendDisabled: true });
	const status = (text, kind = "") => set({ status: {
		text,
		cls: `status ${kind}`
	} });
	const note = view.note.trim(), state = JSON.stringify(deviceState());
	try {
		for (let index = 0; index < picked.length; index++) {
			status(`올리는 중… ${index + 1}/${picked.length}`);
			const file = picked[index], response = await fetch(`/api/admin/debug/shot?note=${encodeURIComponent(note)}&state=${encodeURIComponent(state)}`, {
				method: "POST",
				headers: { "Content-Type": file.type || "application/octet-stream" },
				body: file,
				credentials: "same-origin"
			});
			if (response.status === 401) {
				showLogin(true);
				throw new Error("로그인이 필요해요");
			}
			if (!response.ok) throw new Error((await response.json().catch(() => null))?.error?.message || `오류 ${response.status}`);
		}
		picked = [];
		showPicked();
		set({ note: "" });
		status("올렸어요. 헤르메스 창에 \"올렸어\"라고 알려 주세요.", "ok");
	} catch (error) {
		status(`못 올렸어요: ${error.message}`, "bad");
		set({ sendDisabled: !picked.length });
	}
}
var loads = 0;
async function loadRecent() {
	const pick = dayRef.current?.value;
	const response = await fetch(`/api/admin/debug/recent${pick ? `?day=${pick}` : ""}`, { credentials: "same-origin" });
	if (response.status === 401) return showLogin(true);
	set({ recent: {
		...await response.json(),
		load: ++loads
	} });
}
function openTab(tab) {
	set({ tab });
	if (tab === "list") loadRecent();
}
function Tabs() {
	const tab = (id, label) => /* @__PURE__ */ a("button", {
		role: "tab",
		id: `tab-${id}`,
		"aria-selected": view.tab === id,
		"aria-controls": id,
		onClick: () => openTab(id),
		children: label
	});
	return /* @__PURE__ */ a(M, { children: [
		tab("ride", "탑승 기록"),
		tab("shot", "캡처 올리기"),
		tab("list", "올린 것")
	] });
}
function MotionChart({ ride }) {
	const plotRef = T(null);
	const points = (ride.series || []).filter((point) => Number.isFinite(point[0]) && Number.isFinite(point[1]));
	const drawable = points.length > 0 && typeof uPlot !== "undefined";
	A(() => {
		if (!drawable) return;
		const plot = plotRef.current, css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
		const times = points.map((point) => point[0] / 1e3), up = points.map((point) => Math.max(0, point[1])), down = points.map((point) => Math.min(0, point[1]));
		const top = Math.max(1, ...points.map((point) => Math.abs(point[1]))) * 1.15, good = css("--good"), bad = css("--bad");
		const marks = (chart) => {
			const { ctx } = chart, dpr = devicePixelRatio || 1, size = 6 * dpr;
			const outside = (px) => px < chart.bbox.left - 1 || px > chart.bbox.left + chart.bbox.width + 1;
			const tri = (at, kind, below) => {
				const px = chart.valToPos(at / 1e3, "x", true);
				if (outside(px)) return;
				const tipY = below ? chart.bbox.top + chart.bbox.height - size - 2 : chart.bbox.top + size + 2, dir = below ? -1 : 1;
				ctx.beginPath();
				ctx.moveTo(px - size, tipY - dir * size);
				ctx.lineTo(px + size, tipY - dir * size);
				ctx.lineTo(px, tipY + dir * size * .8);
				ctx.closePath();
				ctx.lineWidth = 2 * dpr;
				ctx.strokeStyle = kind === "depart" ? good : bad;
				if (below) ctx.stroke();
				else {
					ctx.fillStyle = kind === "depart" ? good : bad;
					ctx.fill();
				}
			};
			const line = (at, kind) => {
				const px = chart.valToPos(at / 1e3, "x", true);
				if (outside(px)) return;
				ctx.beginPath();
				ctx.moveTo(px, chart.bbox.top);
				ctx.lineTo(px, chart.bbox.top + chart.bbox.height);
				ctx.lineWidth = 2 * dpr;
				ctx.strokeStyle = kind === "depart" ? good : bad;
				ctx.stroke();
			};
			ctx.save();
			const zero = chart.valToPos(0, "y", true);
			ctx.beginPath();
			ctx.setLineDash([4 * dpr, 4 * dpr]);
			ctx.moveTo(chart.bbox.left, zero);
			ctx.lineTo(chart.bbox.left + chart.bbox.width, zero);
			ctx.lineWidth = dpr;
			ctx.strokeStyle = css("--secondary");
			ctx.stroke();
			ctx.setLineDash([]);
			for (const tap of ride.taps || []) line(tap.t, tap.kind);
			for (const event of ride.sensor || []) tri(event.t, event.kind, true);
			ctx.restore();
		};
		const two = (value) => String(value).padStart(2, "0");
		const hms = (seconds) => {
			const date = /* @__PURE__ */ new Date(seconds * 1e3);
			return `${two(date.getHours())}:${two(date.getMinutes())}:${two(date.getSeconds())}`;
		};
		let resize;
		const build = () => {
			const width = Math.max(260, plot.clientWidth || 320);
			const chart = new uPlot({
				width,
				height: 170,
				legend: { show: false },
				cursor: {
					y: false,
					drag: {
						x: false,
						y: false
					}
				},
				scales: {
					x: { time: false },
					y: { range: [-top, top] }
				},
				axes: [{
					stroke: css("--secondary"),
					grid: { show: false },
					ticks: { stroke: css("--rule") },
					values: (_, values) => values.map(hms),
					space: 90,
					font: "11px system-ui"
				}, { show: false }],
				series: [
					{},
					{
						stroke: good,
						fill: `${good}33`,
						width: 2,
						fillTo: 0,
						points: { show: false }
					},
					{
						stroke: bad,
						fill: `${bad}33`,
						width: 2,
						fillTo: 0,
						points: { show: false }
					}
				],
				hooks: { draw: [marks] }
			}, [
				times,
				up,
				down
			], plot);
			resize = () => chart.setSize({
				width: Math.max(260, plot.clientWidth),
				height: 170
			});
			addEventListener("resize", resize);
		};
		const frame = requestAnimationFrame(build);
		return () => {
			cancelAnimationFrame(frame);
			if (resize) removeEventListener("resize", resize);
		};
	}, []);
	return /* @__PURE__ */ a("figure", {
		class: "motion-chart",
		children: [
			/* @__PURE__ */ a("figcaption", {
				class: "motion-chart__note",
				children: "위로 솟으면 출발, 아래로 꺼지면 브레이크예요."
			}),
			/* @__PURE__ */ a("div", {
				class: "motion-chart__plot",
				ref: plotRef,
				children: drawable ? null : "센서 기록이 없어요."
			}),
			/* @__PURE__ */ a("p", {
				class: "motion-chart__legend",
				children: [
					/* @__PURE__ */ a("span", { children: [/* @__PURE__ */ a("i", { children: "│" }), " 내가 누름"] }),
					/* @__PURE__ */ a("span", { children: [/* @__PURE__ */ a("i", { children: "△" }), " 센서"] }),
					/* @__PURE__ */ a("span", { children: [/* @__PURE__ */ a("i", {
						style: "color:var(--good)",
						children: "●"
					}), " 출발"] }),
					/* @__PURE__ */ a("span", { children: [/* @__PURE__ */ a("i", {
						style: "color:var(--bad)",
						children: "●"
					}), " 도착"] })
				]
			})
		]
	});
}
function RideItem({ ride }) {
	return /* @__PURE__ */ a("li", { children: [
		/* @__PURE__ */ a("b", { children: rideTitle(ride) }),
		/* @__PURE__ */ a("br", {}),
		/* @__PURE__ */ a("small", { children: rideLine(ride) }),
		((ride.taps || []).length > 0 || (ride.sensor || []).length > 0) && /* @__PURE__ */ a("table", {
			class: "cmp",
			children: [/* @__PURE__ */ a("thead", { children: /* @__PURE__ */ a("tr", { children: [
				/* @__PURE__ */ a("th", { children: "역" }),
				/* @__PURE__ */ a("th", {}),
				/* @__PURE__ */ a("th", { children: "누름" }),
				/* @__PURE__ */ a("th", { children: "센서" }),
				/* @__PURE__ */ a("th", { children: "차이" })
			] }) }), /* @__PURE__ */ a("tbody", { children: compareRows(ride).map((row) => /* @__PURE__ */ a("tr", { children: row.map((text, index) => /* @__PURE__ */ a("td", {
				class: index === 4 ? "d" : void 0,
				children: text
			})) })) })]
		}),
		(ride.series || []).length > 0 && /* @__PURE__ */ a(MotionChart, { ride })
	] });
}
function Recently() {
	const recent = view.recent;
	if (!recent) return /* @__PURE__ */ a(M, { children: [/* @__PURE__ */ a("div", {
		class: "box",
		children: [/* @__PURE__ */ a("div", {
			class: "row day-row",
			children: [/* @__PURE__ */ a("h2", { children: "탑승 기록" }), /* @__PURE__ */ a("select", {
				id: "ride-day",
				"aria-label": "날짜",
				ref: dayRef,
				onChange: loadRecent
			})]
		}), /* @__PURE__ */ a("ul", {
			class: "list",
			id: "rides"
		})]
	}), /* @__PURE__ */ a("div", {
		class: "box",
		children: [/* @__PURE__ */ a("h2", { children: "최근 캡처" }), /* @__PURE__ */ a("ul", {
			class: "list",
			id: "shots"
		})]
	})] });
	const { day = "", days = [], rides = [], shots = [], load } = recent;
	return /* @__PURE__ */ a(M, { children: [/* @__PURE__ */ a("div", {
		class: "box",
		children: [/* @__PURE__ */ a("div", {
			class: "row day-row",
			children: [/* @__PURE__ */ a("h2", { children: "탑승 기록" }), /* @__PURE__ */ a("select", {
				id: "ride-day",
				"aria-label": "날짜",
				ref: dayRef,
				onChange: loadRecent,
				children: days.map((each) => /* @__PURE__ */ a("option", {
					value: each,
					selected: each === day,
					children: dayLabel(each, days)
				}, `${load}:${each}`))
			})]
		}), /* @__PURE__ */ a("ul", {
			class: "list",
			id: "rides",
			children: rides.length ? rides.map((ride, index) => /* @__PURE__ */ a(RideItem, { ride }, `${load}:${index}`)) : /* @__PURE__ */ a("li", {
				class: "muted",
				children: [day === days[0] ? "오늘은" : "이날은", " 기록이 없어요."]
			})
		})]
	}), /* @__PURE__ */ a("div", {
		class: "box",
		children: [/* @__PURE__ */ a("h2", { children: "최근 캡처" }), /* @__PURE__ */ a("ul", {
			class: "list",
			id: "shots",
			children: shots.length ? shots.map((shot) => /* @__PURE__ */ a("li", { children: [
				/* @__PURE__ */ a("b", { children: shot.note || "(메모 없음)" }),
				/* @__PURE__ */ a("br", {}),
				/* @__PURE__ */ a("small", { children: shotLine(shot) })
			] })) : /* @__PURE__ */ a("li", {
				class: "muted",
				children: "아직 없어요."
			})
		})]
	})] });
}
function DebugPage() {
	const text = view.ridingText;
	let lineOptions = view.lines?.map((line) => /* @__PURE__ */ a("option", { children: line }));
	if (view.linesFailed) lineOptions = [/* @__PURE__ */ a("option", { children: "역 자료를 못 받았어요" })];
	return /* @__PURE__ */ a(M, { children: [
		/* @__PURE__ */ a("p", {
			class: "login",
			id: "login",
			hidden: !view.login,
			children: [
				"로그인이 풀렸어요. ",
				/* @__PURE__ */ a("a", {
					href: "/admin/login.html?next=%2Fadmin%2Fdebug",
					children: "다시 로그인"
				}),
				"하면 쌓아 둔 기록을 이어서 보내요."
			]
		}),
		/* @__PURE__ */ a("section", {
			id: "ride",
			role: "tabpanel",
			hidden: view.tab !== "ride",
			children: [/* @__PURE__ */ a("div", {
				class: "box",
				id: "setup",
				hidden: view.riding,
				children: [
					/* @__PURE__ */ a("h2", { children: "무엇을 타나요?" }),
					/* @__PURE__ */ a("div", {
						class: "seg",
						children: [/* @__PURE__ */ a("button", {
							id: "m-subway",
							"aria-pressed": mode === "subway",
							onClick: () => {
								mode = "subway";
								set({});
							},
							children: "지하철"
						}), /* @__PURE__ */ a("button", {
							id: "m-bus",
							"aria-pressed": mode === "bus",
							onClick: () => {
								mode = "bus";
								set({});
							},
							children: "버스"
						})]
					}),
					/* @__PURE__ */ a("div", {
						id: "subway-setup",
						hidden: mode !== "subway",
						children: [
							/* @__PURE__ */ a("label", {
								for: "line",
								children: "노선"
							}),
							/* @__PURE__ */ a("select", {
								id: "line",
								value: view.lines && !view.linesFailed ? view.line : void 0,
								onChange: (event) => {
									store.set("syung-debug-line", event.currentTarget.value);
									set({ line: event.currentTarget.value });
								},
								children: lineOptions
							}),
							/* @__PURE__ */ a("label", {
								for: "station",
								children: "지금 탄 역"
							}),
							/* @__PURE__ */ a("div", {
								class: "row",
								children: [/* @__PURE__ */ a("input", {
									id: "station",
									list: "stations",
									placeholder: "역 이름",
									autocomplete: "off",
									value: view.station,
									onInput: field("station")
								}), /* @__PURE__ */ a("button", {
									class: "btn ghost",
									id: "near",
									style: "margin:0;flex:0 0 auto;width:auto;padding:0 14px",
									onClick: nearStation,
									children: "가까운 역"
								})]
							}),
							/* @__PURE__ */ a("datalist", {
								id: "stations",
								children: view.lines && onLine(view.line).map((station) => /* @__PURE__ */ a("option", { value: station.name }))
							}),
							/* @__PURE__ */ a("label", {
								for: "train",
								children: "열차 번호(모르면 비워 두세요)"
							}),
							/* @__PURE__ */ a("input", {
								id: "train",
								inputmode: "numeric",
								placeholder: "예: 7123",
								value: view.train,
								onInput: field("train")
							})
						]
					}),
					/* @__PURE__ */ a("div", {
						id: "bus-setup",
						hidden: mode !== "bus",
						children: [
							/* @__PURE__ */ a("label", {
								for: "busno",
								children: "버스 번호"
							}),
							/* @__PURE__ */ a("input", {
								id: "busno",
								inputmode: "text",
								placeholder: "예: 3011",
								autocomplete: "off",
								value: view.busno,
								onInput: (event) => {
									field("busno")(event);
									clearTimeout(busTimer);
									busTimer = setTimeout(findBus, 300);
								}
							}),
							/* @__PURE__ */ a("div", {
								class: "chips",
								id: "busroutes",
								children: view.routes.map((route, index) => /* @__PURE__ */ a("button", {
									"aria-pressed": view.pressed === index,
									onClick: () => pickBus(index),
									children: busLabel(route)
								}))
							}),
							/* @__PURE__ */ a("label", {
								for: "vehicle",
								children: "차량 번호(모르면 비워 두세요)"
							}),
							/* @__PURE__ */ a("input", {
								id: "vehicle",
								placeholder: "예: 서울70사1234 뒤 4자리",
								value: view.vehicle,
								onInput: field("vehicle")
							})
						]
					}),
					/* @__PURE__ */ a("button", {
						class: "btn",
						id: "start",
						disabled: !startable(),
						onClick: start,
						children: "탑승 시작"
					}),
					/* @__PURE__ */ a("p", {
						class: "muted",
						style: "margin-top:10px",
						children: "탑승 중에는 화면을 켜 두세요(GPS가 꺼지지 않게). 지하에서 끊겨도 기기에 쌓았다가 다시 연결되면 보내요."
					})
				]
			}), /* @__PURE__ */ a("div", {
				class: "box",
				id: "riding",
				hidden: !view.riding,
				children: [
					/* @__PURE__ */ a("div", {
						class: "now",
						children: [
							/* @__PURE__ */ a("small", {
								id: "ride-what",
								children: text?.what
							}),
							/* @__PURE__ */ a("b", {
								id: "ride-where",
								children: text?.where
							}),
							/* @__PURE__ */ a("small", {
								id: "ride-phase",
								children: text?.phase
							})
						]
					}),
					/* @__PURE__ */ a("div", {
						class: "chips",
						id: "nexts",
						hidden: text ? text.nextsHidden : true,
						children: text?.nexts.map((next) => /* @__PURE__ */ a("button", {
							"aria-pressed": next.pressed,
							onClick: () => {
								nextPick = next.id;
								paintRide();
							},
							children: next.name
						}))
					}),
					/* @__PURE__ */ a("button", {
						class: "btn huge",
						id: "act",
						onClick: act,
						children: text?.act
					}),
					/* @__PURE__ */ a("div", {
						class: "row",
						children: [/* @__PURE__ */ a("button", {
							class: "btn ghost",
							id: "mark",
							onClick: mark,
							children: "이상한 순간 표시"
						}), /* @__PURE__ */ a("button", {
							class: "btn ghost",
							id: "undo",
							onClick: undo,
							children: "방금 것 취소"
						})]
					}),
					/* @__PURE__ */ a("div", {
						class: "facts",
						children: [
							/* @__PURE__ */ a("div", { children: [/* @__PURE__ */ a("small", { children: "탄 지" }), /* @__PURE__ */ a("b", {
								id: "f-time",
								children: view.time
							})] }),
							/* @__PURE__ */ a("div", { children: [/* @__PURE__ */ a("small", { children: "GPS" }), /* @__PURE__ */ a("b", {
								id: "f-gps",
								children: view.gpsText
							})] }),
							/* @__PURE__ */ a("div", { children: [/* @__PURE__ */ a("small", { children: "보낼 것" }), /* @__PURE__ */ a("b", {
								id: "f-queue",
								children: queue.length
							})] }),
							/* @__PURE__ */ a("div", {
								id: "f-motion-box",
								onClick: () => {
									if (ride.id) startMotion();
								},
								children: [/* @__PURE__ */ a("small", { children: "센서" }), /* @__PURE__ */ a("b", {
									id: "f-motion",
									children: view.motionText
								})]
							})
						]
					}),
					/* @__PURE__ */ a("ul", {
						class: "log",
						id: "log",
						children: view.log.map((line) => /* @__PURE__ */ a("li", { children: line }))
					}),
					/* @__PURE__ */ a("button", {
						class: "btn ghost",
						id: "end",
						style: "margin-top:16px",
						onClick: end,
						children: "내렸어요(끝내기)"
					})
				]
			})]
		}),
		/* @__PURE__ */ a("section", {
			id: "shot",
			role: "tabpanel",
			hidden: view.tab !== "shot",
			children: /* @__PURE__ */ a("div", {
				class: "box",
				children: [
					/* @__PURE__ */ a("h2", { children: "캡처 올리기" }),
					/* @__PURE__ */ a("p", {
						class: "muted",
						children: "이상한 화면 · 동영상을 올려 주세요. 기기 정보와 지금 탑승 기록이 같이 붙어요."
					}),
					/* @__PURE__ */ a("button", {
						class: "btn",
						id: "pick",
						onClick: () => filesRef.current.click(),
						children: "캡처 고르기"
					}),
					/* @__PURE__ */ a("input", {
						id: "files",
						type: "file",
						accept: "image/*,video/*",
						multiple: true,
						hidden: true,
						ref: filesRef,
						onChange: (event) => {
							picked = [...picked, ...event.currentTarget.files].slice(0, 8);
							event.currentTarget.value = "";
							showPicked();
						}
					}),
					/* @__PURE__ */ a("div", {
						class: "thumbs",
						id: "thumbs",
						children: view.thumbs.map((url) => url ? /* @__PURE__ */ a("img", {
							src: url,
							alt: "고른 캡처"
						}) : /* @__PURE__ */ a("span", { children: "동영상" }))
					}),
					/* @__PURE__ */ a("label", {
						for: "note",
						children: "어떤 상황이었나요?"
					}),
					/* @__PURE__ */ a("textarea", {
						id: "note",
						placeholder: "예: 조선 모드, 11번 출구 장승, 갓이 깨져 보임 / 3011 탑승 중, 지도 버스가 내 위치보다 한 정류장 뒤",
						value: view.note,
						onInput: field("note")
					}),
					/* @__PURE__ */ a("button", {
						class: "btn",
						id: "send",
						disabled: view.sendDisabled,
						onClick: send,
						children: "올리기"
					}),
					/* @__PURE__ */ a("div", {
						class: view.status.cls,
						id: "shot-status",
						role: "status",
						children: view.status.text
					})
				]
			})
		}),
		/* @__PURE__ */ a("section", {
			id: "list",
			role: "tabpanel",
			hidden: view.tab !== "list",
			children: /* @__PURE__ */ a(Recently, {})
		})
	] });
}
main.textContent = "";
tabs.textContent = "";
set({});
loadSubway().then(() => {
	if (ride.id) {
		set({ log: [] });
		say("하던 탑승 이어서");
		enterRiding();
	}
}).catch(() => {
	set({ linesFailed: true });
});
fetch("/api/admin/debug/recent", { credentials: "same-origin" }).then((response) => showLogin(response.status === 401)).catch(() => {});
flush();
