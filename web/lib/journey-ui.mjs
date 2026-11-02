import { appMapMode, serverUrl } from "./server_url.mjs";
import { endName, findStations, inkOn, mergeHits, sameSpot, swappedEnds } from "./place-search.mjs";
import { createTimeWheel } from "./time-wheel.mjs";
// web/lib/journey-ui.mts
var HERE_NAME = "내 위치";
var PICK_ZOOM = 16;
var SEEK_LIMIT_MS = 1e4;
var PICK_PAD = 200;
var esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({
	"&": "&amp;",
	"<": "&lt;",
	">": "&gt;",
	"\"": "&quot;"
})[c]);
var min = (s) => Math.max(1, Math.round(s / 60));
var hm = (t) => {
	const [h, m] = String(t).split(":").map(Number);
	return h * 60 + m;
};
var legSecs = (l) => l.type === "walk" ? l.seconds : Math.max(60, (hm(l.arrives) - hm(l.departs) + 1440) % 1440 * 60);
var legColorOf = (l, colors) => l.type === "bus" ? l.color : colors[l.line] || "#888";
var legName = (l) => l.type === "bus" ? l.route : l.line;
var legShort = (l) => l.type === "bus" ? l.route : l.line.replace(/호선$/, "").replace(/선$/, "");
var BUS = "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\" fill=\"currentColor\"><path d=\"M5 3h14a2 2 0 0 1 2 2v11a2 2 0 0 1-1 1.7V20a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1v-1H7v1a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-2.3A2 2 0 0 1 3 16V5a2 2 0 0 1 2-2zm0 3v5h14V6zm2 8a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm10 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z\"/></svg>";
var textW = (t) => [...String(t)].reduce((w, ch) => w + (/[가-힣]/.test(ch) ? 11.5 : 7), 0);
var rideMinutes = (leg) => leg.departs && leg.arrives ? Math.max(1, (hm(leg.arrives) - hm(leg.departs) + 1440) % 1440) : null;
function walkText(prev, next, exit, label) {
	const door = exit ? `${exit}번 출구` : "";
	const out = prev?.type === "ride" && door ? `${door}로 나와 ` : "";
	if (!next) return `${out}목적지까지 걸어서`;
	if (next.type === "walk") return `${out}${label ? `${label} 걸어서` : "걸어서 이동"}`;
	if (next.type === "bus") return `${out}${next.from ?? ""} 정류장까지 걸어서`;
	return `${next.from ?? ""}역${prev?.type !== "ride" && door ? ` ${door}` : ""}까지 걸어서`;
}
var sideStop = (stop) => stop.walkMinutes ? `${stop.walkMinutes}분` : `${stop.metres}m`;
function routeSteps(legs, ends, colors, times = null) {
	const rows = [{
		kind: "place",
		at: "start",
		name: ends.from,
		time: times?.start ?? null
	}];
	legs.forEach((leg, at) => {
		if (leg.type === "walk") {
			const minutes = min(leg.seconds ?? 0);
			rows.push({
				kind: "walk",
				text: walkText(legs[at - 1], legs[at + 1], leg.exit ?? "", leg.label),
				detail: `${minutes}분${leg.metres ? ` · ${Math.round(leg.metres / 10) * 10}m` : ""}`
			});
			return;
		}
		const bus = leg.type === "bus", place = (name) => bus ? name ?? "" : `${name ?? ""}역`;
		const color = bus ? leg.color ?? "#888" : colors[leg.line ?? ""] || "#888", ink = inkOn(color);
		const others = bus ? leg.alternatives ?? [] : [];
		const chips = bus ? [{
			route: leg.route ?? "",
			color,
			ink,
			side: null,
			detail: null
		}, ...others.map((other) => ({
			route: other.route,
			color: other.color,
			ink: inkOn(other.color),
			side: other.boardAt ? `옆 ${sideStop(other.boardAt)}` : null,
			detail: other.boardAt ? `${other.boardAt.name}${other.boardAt.ars ? ` ${other.boardAt.ars}` : ""} · 걸어서 ${sideStop(other.boardAt)}${other.boardAt.exit ? ` · ${other.boardAt.exit}번 출구 쪽` : ""}` : null
		}))] : [];
		const minutes = rideMinutes(leg), waits = times && (leg.wait ?? 0) > 60 ? `${min(leg.wait ?? 0)}분 기다림` : null;
		const info = [
			leg.stops ? `${leg.stops}개 ${bus ? "정류장" : "역"}` : null,
			minutes ? `${minutes}분` : null,
			waits
		].filter(Boolean).join(" · ");
		const toward = bus ? leg.toward ? `${leg.toward} 방면` : null : leg.destination ? `${leg.destination} 방면` : leg.direction || null;
		rows.push({
			kind: "board",
			name: `${place(leg.from)} 승차`,
			color,
			time: times ? leg.departs ?? null : null
		}, {
			kind: "ride",
			color,
			ink,
			bus,
			chip: bus ? leg.route ?? "" : leg.line ?? "",
			toward,
			chips,
			info,
			live: times && !bus && leg.realtime ? `실시간 · 지금 ${leg.trainNow ?? ""}` : null
		}, {
			kind: "alight",
			name: `${place(leg.to)} 하차`,
			color,
			time: times ? leg.arrives ?? null : null,
			chips: others.flatMap((other) => other.alightAt ? [{
				route: other.route,
				color: other.color,
				ink: inkOn(other.color),
				where: other.alightAt.name
			}] : [])
		});
	});
	rows.push({
		kind: "place",
		at: "end",
		name: ends.to,
		time: times?.end ?? null
	});
	return rows;
}
function trackParts(p, colors, width = 330) {
	const segs = [];
	for (const l of p.legs) {
		if (l.type !== "walk" && l.wait > 30) segs.push({
			k: "wait",
			s: l.wait
		});
		segs.push({
			k: l.type === "walk" ? "walk" : "ride",
			s: legSecs(l),
			l
		});
	}
	const total = segs.reduce((a, g) => a + g.s, 0) || 1;
	return segs.map((seg) => {
		if (seg.k !== "ride") return {
			k: seg.k,
			flex: seg.s
		};
		const px = seg.s / total * width, color = legColorOf(seg.l, colors), full = legName(seg.l), bus = seg.l.type === "bus";
		return {
			k: "ride",
			flex: seg.s,
			need: textW(legShort(seg.l)) + 12,
			color,
			ink: inkOn(color),
			bus,
			icon: bus && px >= textW(full) + 34,
			label: px >= textW(full) + 14 ? full : legShort(seg.l)
		};
	});
}
function routeTrack(p, colors, width = 330) {
	return `<div class="jtrack" aria-hidden="true">${trackParts(p, colors, width).map((seg) => seg.k !== "ride" ? `<i class="jseg ${seg.k}" style="flex:${seg.flex} 1 0"></i>` : `<i class="jseg ride${seg.bus ? " bus" : ""}" style="flex:${seg.flex} 1 0;min-width:${seg.need}px;--c:${seg.color};--t:${seg.ink}">${seg.icon ? BUS : ""}${esc(seg.label)}</i>`).join("")}</div>`;
}
function soonestWhen(now = /* @__PURE__ */ new Date()) {
	const at = new Date(now);
	at.setSeconds(0, 0);
	at.setMinutes(Math.floor(at.getMinutes() / 5) * 5 + 5);
	return at;
}
function keepPickable(at, now = /* @__PURE__ */ new Date()) {
	const latest = new Date(now);
	latest.setHours(23, 55, 0, 0);
	return new Date(Math.max(+soonestWhen(now), Math.min(+latest, +at)));
}
function wheelDate(time, now = /* @__PURE__ */ new Date()) {
	const [hours = 0, minutes = 0] = time.split(":").map(Number), at = new Date(now);
	at.setHours(hours, minutes, 0, 0);
	return at;
}
var TICKET_NO_START = "내 위치를 찾지 못했어요. 위에서 출발을 다시 골라 주세요.";
function initJourney({ openSheetView, closeSheet, map, colors, myLocation, button, showRoute, clearRoute, drawJourney, clearJourney, drawJourneyBar, stations, showStation, setPlaceMarker, ticketDesk }) {
	const picked = {
		from: null,
		to: null
	};
	const names = {
		from: HERE_NAME,
		to: ""
	};
	let last = null;
	let inSheet = false;
	let goSeq = 0;
	let trail = null, routeBack = null, originStation = null;
	const bar = document.createElement("div");
	bar.className = "jbar";
	bar.hidden = true;
	document.body.append(bar);
	const clearBar = () => {
		last = null;
		bar.hidden = true;
		clearRoute?.();
		trail = null;
		view = freshView();
	};
	const barActions = {
		open: () => open(),
		clear: clearBar,
		fresh: () => {
			clearBar();
			start();
		}
	};
	drawJourneyBar(bar, null, barActions);
	let body = null, mounted = 0, mountSeq = 0;
	const hereKnown = () => !!myLocation();
	const emptySearch = (fixed = null) => ({
		title: fixed?.which === "from" ? "어디로 갈까요?" : fixed ? "어디서 출발할까요?" : "어디로 갈까요?",
		query: "",
		hits: [],
		pending: false,
		failed: false,
		fixed,
		here: fixed?.which === "to" && hereKnown()
	});
	const freshView = () => ({
		stage: "search",
		search: emptySearch(),
		picked: null,
		done: false,
		summary: null,
		whenText: "지금 출발",
		whenAt: false,
		whenOpen: false,
		status: {
			text: "",
			sr: false
		},
		result: { kind: "none" }
	});
	let view = freshView();
	const paint = () => {
		if (body) {
			view.canBack = canGoBack();
			drawJourney(body, view, actions);
		}
	};
	const focusSearch = () => document.getElementById("placeInput")?.focus({ preventScroll: true });
	const pad = (n) => String(n).padStart(2, "0");
	let when = { k: "now" }, draft = null, wheel = null, wheelBox = null, wheelTimer = 0;
	const local = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
	const hhmm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
	const isTomorrow = (d) => d.toDateString() !== (/* @__PURE__ */ new Date()).toDateString();
	function whenValue() {
		return when.k === "at" ? local(when.d) : "";
	}
	function whenLabel() {
		return when.k === "at" ? `${isTomorrow(when.d) ? "내일" : "오늘"} ${hhmm(when.d)} 출발` : "지금 출발";
	}
	function whenSet(chosen) {
		when = chosen;
		view.whenText = whenLabel();
		view.whenAt = chosen.k === "at";
		paint();
	}
	function wheelMoved(time) {
		draft = wheelDate(time);
		clearTimeout(wheelTimer);
		wheelTimer = setTimeout(() => {
			const kept = keepPickable(draft);
			if (+kept !== +draft) {
				draft = kept;
				wheel?.roll(hhmm(kept));
			}
		}, 180);
	}
	function whenOpen(on) {
		view.whenOpen = on;
		clearTimeout(wheelTimer);
		if (!on) {
			paint();
			return;
		}
		draft = keepPickable(when.k === "at" ? new Date(when.d) : soonestWhen());
		paint();
		const box = document.getElementById("jWhenWheel");
		if (box && box !== wheelBox) {
			wheelBox = box;
			wheel = createTimeWheel(box, wheelMoved);
		}
		wheel?.show(hhmm(draft));
		requestAnimationFrame(() => document.getElementById("jWhenPanel")?.scrollIntoView({
			block: "nearest",
			behavior: "smooth"
		}));
	}
	let seekTimer = 0, seekSeq = 0;
	function typed(text) {
		const search = view.search, query = text.trim(), mine = ++seekSeq, stationHits = findStations(stations, query, colors);
		const merged = () => {
			const spot = myLocation();
			return mergeHits(stationHits, search.places ?? [], {
				query,
				here: spot ? {
					lat: spot[1],
					lng: spot[0]
				} : null
			});
		};
		clearTimeout(seekTimer);
		const asked = search.asked ?? "";
		if (query.length < 2 || !(query.startsWith(asked) || asked.startsWith(query))) search.places = [];
		search.query = text;
		search.hits = merged();
		search.failed = false;
		search.pending = query.length >= 2;
		search.cut = false;
		view.notice = "";
		paint();
		if (query.length < 2) return;
		seekTimer = setTimeout(async () => {
			const centre = map.getCenter(), limit = new AbortController(), timer = setTimeout(() => limit.abort(), SEEK_LIMIT_MS);
			const show = (places, isFailed) => {
				search.places = places;
				search.asked = query;
				search.hits = merged();
				search.failed = isFailed;
				search.pending = false;
				paint();
			};
			try {
				const answer = await (await fetch(serverUrl(`./api/place?q=${encodeURIComponent(query)}&near=${centre.lat.toFixed(5)},${centre.lng.toFixed(5)}`), { signal: limit.signal })).json();
				if (mine === seekSeq) show(answer.ok ? answer.places : [], !answer.ok);
			} catch {
				if (mine === seekSeq) show([], true);
			} finally {
				clearTimeout(timer);
			}
		}, 300);
	}
	const stopSeeking = () => {
		clearTimeout(seekTimer);
		seekSeq++;
	};
	const cutSeek = () => {
		if (view.search.pending) view.search.cut = true;
		stopSeeking();
		view.search.pending = false;
	};
	const endOf = (hit) => ({
		name: endName(hit),
		lat: hit.lat,
		lng: hit.lng
	});
	function placePicked(hit) {
		cutSeek();
		view.notice = "";
		const fixed = view.search.fixed;
		if (fixed) {
			fillEnd(fixed.which === "from" ? "to" : "from", endOf(hit));
			go();
			return;
		}
		document.activeElement?.blur?.();
		view.picked = hit;
		view.stage = "picked";
		paint();
		setPlaceMarker([hit.lng, hit.lat]);
		map.flyTo({
			center: [hit.lng, hit.lat],
			zoom: Math.max(map.getZoom(), PICK_ZOOM),
			padding: {
				top: 0,
				bottom: PICK_PAD,
				left: 0,
				right: 0
			},
			duration: 900
		});
	}
	function fillEnd(which, end) {
		picked[which] = end;
		names[which] = end.name;
	}
	const useHere = () => {
		picked.from = null;
		names.from = HERE_NAME;
	};
	function chooseEnd(which, end) {
		dispatchEvent(new CustomEvent("syung:place_end", { detail: which }));
		if (view.picked) trail = {
			hit: view.picked,
			search: view.search
		};
		fillEnd(which, end);
		if (which === "to" && hereKnown()) {
			useHere();
			go();
			return;
		}
		if (which === "from") {
			picked.to = null;
			names.to = "";
		} else {
			picked.from = null;
			names.from = "";
		}
		searchFor(which, end.name);
	}
	function searchFor(which, name) {
		stopSeeking();
		whenOpen(false);
		view.search = emptySearch({
			which,
			name
		});
		view.picked = null;
		view.stage = "search";
		view.done = false;
		paint();
		focusSearch();
	}
	function changeEnd(which) {
		const other = which === "from" ? "to" : "from";
		searchFor(other, names[other]);
	}
	function swap() {
		const swapped = swappedEnds(names, picked, fromOf(), HERE_NAME);
		Object.assign(names, swapped.names);
		Object.assign(picked, swapped.picked);
		whenOpen(false);
		stopSeeking();
		go();
	}
	function hereRow() {
		useHere();
		cutSeek();
		go();
	}
	const fromOf = () => picked.from || (names.from === HERE_NAME && myLocation() ? {
		lat: myLocation()[1],
		lng: myLocation()[0]
	} : null);
	function fold() {
		const label = whenLabel();
		view.done = true;
		view.stage = "route";
		view.summary = {
			from: names.from,
			to: names.to,
			when: label,
			aria: `${names.from}에서 ${names.to}까지, ${label}`
		};
	}
	const durParts = (total) => total >= 60 ? {
		hours: Math.floor(total / 60),
		minutes: total % 60
	} : {
		hours: null,
		minutes: total
	};
	function planView(plan) {
		return {
			aria: `${plan.tag || "경로"} ${plan.minutes}분, ${plan.arrives} 도착, 지도에서 보기`,
			duration: durParts(plan.minutes),
			arrive: `${plan.leaveBy} → ${plan.arrives}`,
			tag: plan.tag || null,
			track: trackParts(plan, colors),
			meta: `환승 ${plan.transfers}번 · 걷기 ${plan.walkMinutes}분`,
			live: plan.legs.some((leg) => leg.realtime),
			steps: routeSteps(plan.legs, {
				from: last?.from || "출발",
				to: last?.to || "도착"
			}, colors, {
				start: plan.leaveBy,
				end: plan.arrives
			})
		};
	}
	const KINDS = [
		["all", "전체"],
		["subway", "지하철"],
		["bus", "버스"],
		["mixed", "지하철+버스"]
	];
	const cardsOf = () => view.result.kind === "plans" ? view.result.cards : [];
	function pick(index, opened = true) {
		last.sel = index;
		last.opened = opened;
		cardsOf().forEach((card, other) => {
			card.on = opened && other === index;
			card.note = "";
		});
		paint();
		try {
			showRoute?.(last.d.plans[index]);
		} catch (error) {
			console.warn("지도에 경로를 그리지 못했어요", error);
		}
	}
	function filter(kind) {
		last.tab = kind;
		if (view.result.kind === "plans") view.result.tabs?.forEach((tab) => {
			tab.pressed = tab.kind === kind;
		});
		const cards = cardsOf();
		cards.forEach((card) => {
			card.hidden = !(kind === "all" || card.kind === kind);
		});
		paint();
		if (cards[last.sel]?.hidden) {
			const first = cards.findIndex((card) => !card.hidden);
			if (first >= 0) pick(first, false);
		}
	}
	function render(answer, sel) {
		const count = (kind) => answer.plans.filter((plan) => kind === "all" || plan.kind === kind).length;
		const kinds = KINDS.filter(([kind]) => kind !== "all" && count(kind));
		if (kinds.length < 2) last.tab = "all";
		const tabs = kinds.length < 2 ? null : KINDS.filter(([kind]) => kind === "all" || count(kind)).map(([kind, name]) => ({
			kind,
			name,
			count: count(kind),
			pressed: (last.tab || "all") === kind
		}));
		view.result = {
			kind: "plans",
			tabs,
			cards: answer.plans.map((plan) => ({
				plan: planView(plan),
				kind: plan.kind,
				on: false,
				hidden: false
			}))
		};
		paint();
		pick(sel, !!last.opened);
		filter(last.tab || "all");
	}
	function cardPressed(index) {
		if (last.sel === index && cardsOf()[index]?.on) closeSheet?.();
		else {
			pick(index);
			revealOpened();
		}
	}
	function revealOpened() {
		requestAnimationFrame(() => {
			const opened = document.querySelector(".jp.on"), port = opened?.closest(".sheet-body");
			if (!opened || !port) return;
			const card = opened.getBoundingClientRect(), box = port.getBoundingClientRect();
			if (card.top < box.top || card.bottom > box.bottom) opened.scrollIntoView({
				block: "start",
				behavior: "smooth"
			});
		});
	}
	function failed(message) {
		view.status = {
			text: `경로를 찾지 못했어요. ${message}`,
			sr: true
		};
		view.result = {
			kind: "failed",
			message
		};
		paint();
	}
	async function go() {
		const from = fromOf(), to = picked.to, my = ++goSeq, mine = mounted;
		const trip = {
			from: names.from,
			to: names.to,
			picked: { ...picked }
		};
		if (!from || !to) {
			searchFor(from ? "from" : "to", from ? names.from : names.to);
			return;
		}
		if (sameSpot(from, to)) {
			if (view.stage === "route") failed("출발과 도착이 같아요");
			else {
				view.notice = "출발과 도착이 같아요";
				paint();
			}
			return;
		}
		view.notice = "";
		if (view.stage === "search" && view.search.fixed) routeBack = view.search;
		const at = whenValue();
		setPlaceMarker(null);
		view.status = {
			text: "경로를 찾고 있어요",
			sr: false
		};
		view.result = { kind: "loading" };
		view.picked = null;
		fold();
		paint();
		document.activeElement?.blur?.();
		const current = () => my === goSeq && mine !== 0 && mounted === mine;
		try {
			const answer = await (await fetch(serverUrl(`./api/route?from=${from.lat},${from.lng}&to=${to.lat},${to.lng}${at ? `&at=${encodeURIComponent(at)}` : ""}`))).json();
			if (!current()) return;
			if (!answer.ok) {
				failed(answer.error || "출발지나 도착지를 바꿔 보세요.");
				return;
			}
			view.status.text = "";
			last = {
				d: answer,
				sel: 0,
				from: trip.from,
				to: trip.to,
				at,
				when: { ...when },
				picked: trip.picked
			};
			trail = routeBack = originStation = null;
			render(answer, 0);
			dispatchEvent(new CustomEvent("syung:route"));
			paint();
			const sheetBody = body?.closest(".sheet-body");
			if (sheetBody) sheetBody.scrollTop = 0;
		} catch {
			if (current()) failed("연결이 불안정해요. 잠시 뒤 다시 찾아 주세요.");
		}
	}
	async function ticket(index) {
		const search = last, plan = search?.d.plans[index];
		if (!search || !plan) return;
		search.sel = index;
		view.status = {
			text: "",
			sr: false
		};
		const desk = await ticketDesk?.();
		if (last !== search) return;
		if (!desk) {
			view.status = {
				text: "지금은 승차권을 등록할 수 없어요.",
				sr: false
			};
			paint();
			return;
		}
		const here = search.picked.from ? null : fromOf(), start = search.picked.from ?? here, end = search.picked.to;
		if (!start || !end) {
			const card = cardsOf()[index];
			if (card) {
				card.note = TICKET_NO_START;
				paint();
			}
			return;
		}
		desk.start({
			from: {
				name: search.from,
				lat: start.lat,
				lng: start.lng
			},
			to: {
				name: search.to,
				lat: end.lat,
				lng: end.lng
			},
			leaveBy: plan.leaveBy,
			tomorrow: search.when.k === "at" && isTomorrow(search.when.d),
			fromHere: !!here,
			plan
		}, search);
	}
	function ticketReturn(search) {
		const saved = search;
		if (!saved?.d?.plans?.length) return null;
		return { back() {
			if (!inSheet || !last) {
				last = saved;
				open();
			}
			requestAnimationFrame(() => {
				const again = body?.querySelector(".jp.on .jp-ticket");
				again?.scrollIntoView({ block: "nearest" });
				again?.focus({ preventScroll: true });
			});
		} };
	}
	const actions = {
		typed,
		place: placePicked,
		here: hereRow,
		swap,
		clear() {
			typed("");
			focusSearch();
		},
		enter() {
			const first = view.search.hits[0];
			if (first && (first.lines || !view.search.pending)) placePicked(first);
			else document.activeElement?.blur?.();
		},
		retrySeek() {
			typed(view.search.query);
		},
		leave() {
			if (!back()) closeSheet?.();
		},
		end(which) {
			const hit = view.picked;
			if (hit) chooseEnd(which, endOf(hit));
		},
		arrivals() {
			const hit = view.picked, station = hit && stations.find((one) => one.name === hit.name && one.lat === hit.lat);
			if (station) showStation(station);
		},
		changeEnd,
		whenRow() {
			whenOpen(!view.whenOpen);
		},
		whenNow() {
			whenSet({ k: "now" });
			whenOpen(false);
			go();
		},
		whenGo() {
			draft = keepPickable(draft);
			whenSet({
				k: "at",
				d: new Date(draft)
			});
			whenOpen(false);
			go();
		},
		tab: filter,
		card: cardPressed,
		ticket: (index) => {
			ticket(index);
		},
		retry: () => {
			go();
		}
	};
	function showResults() {
		const search = last;
		names.from = search.from;
		names.to = search.to;
		whenSet(search.when ? {
			...search.when,
			d: search.when.d && new Date(search.when.d)
		} : { k: "now" });
		Object.assign(picked, search.picked);
		fold();
		render(search.d, search.sel);
	}
	function mountView() {
		openSheetView((target) => {
			const id = ++mountSeq;
			body = target;
			mounted = id;
			paint();
			return () => {
				if (mounted === id) {
					mounted = 0;
					body = null;
				}
				clearTimeout(wheelTimer);
				setPlaceMarker(null);
				clearJourney(target);
			};
		});
	}
	function open() {
		bar.hidden = true;
		stopSeeking();
		const kept = trail?.search ?? (view.search.fixed ? null : view.search), keep = !last && !!kept?.query.trim(), unfinished = keep && (kept.pending || !!kept.cut);
		view = freshView();
		if (keep) view.search = kept;
		trail = routeBack = originStation = null;
		mountView();
		inSheet = true;
		armHistory();
		if (!last) {
			when = { k: "now" };
			useHere();
			picked.to = null;
			names.to = "";
			if (!hereKnown()) names.from = "";
		}
		whenSet(when);
		if (last) showResults();
		else if (unfinished) typed(kept.query);
	}
	function start() {
		open();
		if (!last) focusSearch();
	}
	function openWith(end, place) {
		last = null;
		picked.from = picked.to = null;
		clearRoute?.();
		open();
		originStation = stations.find((one) => one.lat === place.lat && one.lon === place.lng) ?? null;
		view.search = emptySearch();
		chooseEnd(end, place);
	}
	const resumeSeek = () => {
		if (view.search.cut) typed(view.search.query);
	};
	function toOrigin() {
		stopSeeking();
		if (trail) {
			const { hit, search } = trail;
			picked.from = picked.to = null;
			useHere();
			names.to = "";
			if (!hereKnown()) names.from = "";
			view.search = search;
			view.picked = hit;
			view.stage = "picked";
			view.done = false;
			view.status = {
				text: "",
				sr: false
			};
			view.result = { kind: "none" };
			routeBack = null;
			paint();
			setPlaceMarker([hit.lng, hit.lat]);
			return true;
		}
		if (originStation) {
			const station = originStation;
			originStation = null;
			inSheet = false;
			disarmHistory();
			showStation(station);
			return true;
		}
		return false;
	}
	const hasPlans = () => view.result.kind === "plans";
	function canGoBack() {
		if (view.stage === "picked") return true;
		if (hasPlans()) return false;
		return !!(view.stage === "search" ? view.search.fixed && (last || trail || originStation) : last || routeBack || trail || originStation);
	}
	function back() {
		if (!inSheet) return false;
		if (!mounted) {
			if (last || view.stage === "route") return false;
			mountView();
			if (view.picked) setPlaceMarker([view.picked.lng, view.picked.lat]);
			return true;
		}
		view.notice = "";
		if (view.stage === "picked") {
			setPlaceMarker(null);
			view.stage = "search";
			view.picked = null;
			trail = null;
			paint();
			resumeSeek();
			return true;
		}
		if (view.stage === "search") {
			if (!view.search.fixed) return false;
			if (last) {
				stopSeeking();
				showResults();
				return true;
			}
			return toOrigin();
		}
		if (hasPlans()) return false;
		goSeq++;
		whenOpen(false);
		if (last) {
			showResults();
			return true;
		}
		if (routeBack) {
			view.search = routeBack;
			routeBack = null;
			view.stage = "search";
			view.done = false;
			view.status = {
				text: "",
				sr: false
			};
			view.result = { kind: "none" };
			paint();
			resumeSeek();
			return true;
		}
		return toOrigin();
	}
	const pageHistory = appMapMode() ? null : globalThis.history ?? null;
	let armed = false, walking = false;
	function armHistory() {
		if (!pageHistory || armed) return;
		armed = true;
		if (!walking) pageHistory.pushState(pageHistory.state, "");
	}
	function disarmHistory() {
		if (!pageHistory || !armed) return;
		armed = false;
		if (walking) return;
		walking = true;
		pageHistory.back();
	}
	if (pageHistory) globalThis.addEventListener("popstate", () => {
		if (walking) {
			walking = false;
			if (armed) pageHistory.pushState(pageHistory.state, "");
			return;
		}
		if (!armed) return;
		armed = false;
		if (back() && inSheet) armHistory();
		else if (inSheet) closeSheet?.();
	});
	const showBar = () => {
		const plan = last.d.plans[last.sel];
		drawJourneyBar(bar, {
			duration: durParts(plan.minutes),
			arrives: plan.arrives,
			track: trackParts(plan, colors, 240)
		}, barActions);
		bar.hidden = false;
	};
	function sheetClosed() {
		const was = inSheet;
		inSheet = false;
		disarmHistory();
		setPlaceMarker(null);
		if (!last || !was) return false;
		showBar();
		return true;
	}
	function sheetReplaced() {
		if (inSheet) {
			inSheet = false;
			if (last) sheetClosed();
		}
	}
	function drop() {
		last = null;
		bar.hidden = true;
	}
	button.addEventListener("click", start);
	return {
		open,
		openWith,
		back,
		sheetClosed,
		sheetReplaced,
		drop,
		ticketReturn
	};
}
export { initJourney, keepPickable, routeSteps, routeTrack, soonestWhen, trackParts, wheelDate };
