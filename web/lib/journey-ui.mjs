// web/lib/journey-ui.mts
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
var inkOn = (hex) => {
	const n = parseInt(String(hex).slice(1), 16);
	if (Number.isNaN(n)) return "#fff";
	const [r, g, b] = [
		n >> 16,
		n >> 8 & 255,
		n & 255
	].map((v) => {
		v /= 255;
		return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4;
	});
	const L = .2126 * r + .7152 * g + .0722 * b;
	return 1.05 / (L + .05) >= (L + .05) / .057 ? "#fff" : "#141414";
};
var BUS = "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\" fill=\"currentColor\"><path d=\"M5 3h14a2 2 0 0 1 2 2v11a2 2 0 0 1-1 1.7V20a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1v-1H7v1a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-2.3A2 2 0 0 1 3 16V5a2 2 0 0 1 2-2zm0 3v5h14V6zm2 8a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm10 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z\"/></svg>";
var textW = (t) => [...String(t)].reduce((w, ch) => w + (/[가-힣]/.test(ch) ? 11.5 : 7), 0);
function sameRoutes(legs, all = false) {
	const side = (stop) => `옆 정류장 ${stop.name}${stop.ars ? ` ${stop.ars}` : ""}(${stop.metres}m${stop.exit ? ` · ${stop.exit}번 출구 쪽` : ""})`;
	const notes = legs.flatMap((leg) => {
		if (leg.type !== "bus" || !leg.alternatives?.length) return [];
		const shown = all ? leg.alternatives : leg.alternatives.slice(0, 3);
		const where = shown.flatMap((other) => [...other.boardAt ? [`${other.route} 는 ${side(other.boardAt)}에서 타요`] : [], ...other.alightAt ? [`${other.route} 는 ${side(other.alightAt)}에서 내려요`] : []]);
		return [`${[leg.route, ...shown.map((other) => other.route)].join(" · ")} 중 먼저 오는 버스${where.length ? ` (${where.join(", ")})` : ""}`];
	});
	return notes.length ? notes.join(" / ") : null;
}
function hiddenRoutes(legs) {
	return legs.reduce((sum, leg) => sum + (leg.type === "bus" ? Math.max(0, (leg.alternatives?.length ?? 0) - 3) : 0), 0);
}
function exitHints(legs) {
	return legs.flatMap((leg, at) => {
		const before = legs[at - 1], after = legs[at + 1];
		if (leg.type !== "walk" || !leg.exit || !before || !after) return [];
		if (before.type === "ride" && after.type === "bus" && before.to) return [`${before.to}역 ${leg.exit}번 출구 옆 정류장에서 ${after.route ?? "버스"}`];
		if (before.type === "bus" && after.type === "ride" && after.from) return [`${after.from}역 ${leg.exit}번 출구로`];
		return [];
	});
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
function initJourney({ openSheetView, closeSheet, map, colors, myLocation, button, showRoute, clearRoute, drawJourney, clearJourney }) {
	const picked = {
		from: null,
		to: null
	};
	let last = null;
	let inSheet = false;
	let goSeq = 0;
	const bar = document.createElement("div");
	bar.className = "jbar";
	bar.hidden = true;
	bar.innerHTML = "<button type=\"button\" class=\"jbar-open\" aria-label=\"경로 결과 다시 보기\"></button><button type=\"button\" class=\"jbar-x\" aria-label=\"경로 지우기\" title=\"경로 지우기\"><svg viewBox=\"0 0 24 24\" width=\"16\" height=\"16\" aria-hidden=\"true\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.2\" stroke-linecap=\"round\"><path d=\"M6 6l12 12M18 6 6 18\"/></svg></button>";
	document.body.append(bar);
	bar.querySelector(".jbar-open").onclick = () => open();
	bar.querySelector(".jbar-x").onclick = () => {
		last = null;
		bar.hidden = true;
		clearRoute?.();
	};
	let body = null, mounted = 0, mountSeq = 0;
	const emptyList = () => ({
		hidden: true,
		places: [],
		empty: null
	});
	const freshView = () => ({
		here: !!myLocation(),
		done: false,
		summary: null,
		whenText: "지금 출발",
		whenAt: false,
		whenOpen: false,
		draft: null,
		lists: {
			from: emptyList(),
			to: emptyList()
		},
		status: {
			text: "",
			sr: false
		},
		result: { kind: "none" }
	});
	let view = freshView();
	const paint = () => {
		if (body) drawJourney(body, view, actions);
	};
	const field = (which) => document.getElementById(which === "from" ? "jFrom" : "jTo");
	const pad = (n) => String(n).padStart(2, "0");
	let when = { k: "now" }, draft = null;
	const local = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
	const hhmm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
	const isTomorrow = (d) => d.toDateString() !== (/* @__PURE__ */ new Date()).toDateString();
	const soonest = () => {
		const d = /* @__PURE__ */ new Date();
		d.setSeconds(0, 0);
		d.setMinutes(d.getMinutes() + 1);
		return d;
	};
	const nextTen = () => {
		const d = soonest();
		d.setMinutes(Math.ceil(d.getMinutes() / 10) * 10);
		return d;
	};
	const latest = () => {
		const d = /* @__PURE__ */ new Date();
		d.setDate(d.getDate() + 1);
		d.setHours(23, 50, 0, 0);
		return d;
	};
	const clamp = (d) => new Date(Math.min(latest(), Math.max(soonest(), d)));
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
	function stepped(d, unit, n) {
		const x = new Date(d);
		if (unit === "h") x.setTime(+x + n * 36e5);
		else x.setMinutes((x.getMinutes() + n + 60) % 60);
		return clamp(x);
	}
	const STEP_KEYS = [
		["h", 1],
		["h", -1],
		["m", 1],
		["m", -1]
	];
	function drawDraft() {
		const at = draft;
		view.draft = {
			hours: pad(at.getHours()),
			minutes: pad(at.getMinutes()),
			tomorrow: isTomorrow(at),
			off: Object.fromEntries(STEP_KEYS.map(([unit, step]) => [`${unit}${step}`, +stepped(at, unit, step) === +at]))
		};
		paint();
	}
	function whenOpen(on) {
		view.whenOpen = on;
		if (on) {
			draft = clamp(when.k === "at" ? new Date(when.d) : nextTen());
			drawDraft();
			requestAnimationFrame(() => document.getElementById("jWhenPanel")?.scrollIntoView({
				block: "nearest",
				behavior: "smooth"
			}));
		} else paint();
	}
	function holdStep(unit, amount) {
		let hold = 0, repeat = 0;
		const step = () => {
			draft = stepped(draft, unit, amount);
			drawDraft();
		};
		const stop = () => {
			clearTimeout(hold);
			clearTimeout(repeat);
			hold = repeat = 0;
		};
		return {
			down(event) {
				if (event.button) return;
				const target = event.currentTarget;
				step();
				const started = performance.now();
				const tick = () => {
					if (target.disabled) return stop();
					step();
					const held = performance.now() - started;
					repeat = setTimeout(tick, held > 2200 ? 35 : held > 1200 ? 60 : 110);
				};
				hold = setTimeout(tick, 400);
			},
			stop,
			click(event) {
				if (event.detail === 0) step();
			}
		};
	}
	const holds = Object.fromEntries(STEP_KEYS.map(([unit, step]) => [`${unit}${step}`, holdStep(unit, step)]));
	const seeks = {
		from: {
			timer: 0,
			seq: 0
		},
		to: {
			timer: 0,
			seq: 0
		}
	};
	function typed(which, text) {
		const seek = seeks[which], list = view.lists[which];
		picked[which] = null;
		clearTimeout(seek.timer);
		const query = text.trim();
		if (query.length < 2) {
			list.hidden = true;
			paint();
			return;
		}
		seek.timer = setTimeout(async () => {
			const mine = ++seek.seq, centre = map.getCenter();
			const show = (places, empty) => {
				const now = view.lists[which];
				now.places = places;
				now.empty = empty;
				now.hidden = false;
				paint();
			};
			try {
				const answer = await (await fetch(`./api/place?q=${encodeURIComponent(query)}&near=${centre.lat.toFixed(5)},${centre.lng.toFixed(5)}`)).json();
				if (mine !== seek.seq) return;
				if (!answer.ok) {
					show([], answer.error || "검색하지 못했어요");
					return;
				}
				if (!answer.places.length) {
					show([], "찾는 곳이 없어요");
					return;
				}
				show(answer.places, null);
			} catch {
				if (mine === seek.seq) show([], "검색하지 못했어요");
			}
		}, 300);
	}
	function placePicked(which, place) {
		picked[which] = place;
		field(which).value = place.name;
		view.lists[which].hidden = true;
		paint();
		next(which);
	}
	const fromOf = () => picked.from || (field("from").value.trim() === "내 위치" && myLocation() ? {
		lat: myLocation()[1],
		lng: myLocation()[0]
	} : null);
	function next(which) {
		if (fromOf() && picked.to) {
			go();
			return;
		}
		const empty = !fromOf() ? "from" : "to";
		if (which) field(empty).focus({ preventScroll: true });
	}
	function fold(on) {
		view.done = on;
		if (on) {
			const from = field("from").value, to = field("to").value, label = whenLabel();
			view.summary = {
				from,
				to,
				when: label,
				aria: `${from}에서 ${to}까지, ${label}. 눌러서 바꾸기`
			};
		}
		paint();
	}
	const legColor = (l) => legColorOf(l, colors);
	const track = (p, width = 330) => routeTrack(p, colors, width);
	const durParts = (total) => total >= 60 ? {
		hours: Math.floor(total / 60),
		minutes: total % 60
	} : {
		hours: null,
		minutes: total
	};
	const dur = (total) => {
		const parts = durParts(total);
		return parts.hours !== null ? `${parts.hours}<small>시간</small> ${parts.minutes}<small>분</small>` : `${parts.minutes}<small>분</small>`;
	};
	function steps(p) {
		const station = (l, n) => l.type === "bus" ? n : `${n}역`;
		const items = [{
			n: "start",
			name: last?.from || "출발",
			t: p.leaveBy,
			c: "var(--syung)"
		}];
		for (const l of p.legs) {
			if (l.type === "walk") {
				items.push({
					e: "walk",
					l
				});
				continue;
			}
			items.push({
				n: "board",
				name: station(l, l.from),
				t: l.departs,
				c: legColor(l)
			}, {
				e: "ride",
				l
			}, {
				n: "alight",
				name: station(l, l.to),
				t: l.arrives,
				c: legColor(l)
			});
		}
		items.push({
			n: "end",
			name: last?.to || "도착",
			t: p.arrives,
			c: "var(--ink)"
		});
		const rows = [];
		for (let k = 0; k < items.length; k++) {
			const a = items[k], b = items[k + 1];
			if (a.n && b?.n) {
				rows.push({
					n: "change",
					name: a.name === b.name ? a.name : `${a.name} → ${b.name}`,
					t: a.t,
					t2: b.t,
					c: b.c
				});
				k++;
			} else rows.push(a);
		}
		return rows.map((row) => {
			if (row.n) return {
				kind: "node",
				n: row.n,
				color: row.c,
				time: row.t,
				name: row.name,
				sub: row.n === "change" ? `갈아타기${row.t2 && row.t2 !== row.t ? ` · ${row.t2} 출발` : ""}` : null
			};
			const leg = row.l;
			if (row.e === "walk") return {
				kind: "walk",
				text: `걷기 ${min(leg.seconds)}분 · ${Math.round(leg.metres / 10) * 10}m${leg.exit ? ` · ${leg.exit}번 출구` : ""}`
			};
			const color = legColor(leg), toward = leg.type === "bus" ? `${leg.toward ?? ""} 방면` : leg.destination ? `${leg.destination}행` : leg.direction || "";
			const live = leg.type !== "bus" && leg.realtime ? `실시간 · 지금 ${leg.trainNow ?? ""}` : null;
			const others = leg.type === "bus" ? leg.alternatives ?? [] : [];
			const noteOf = (count) => leg.type === "bus" ? others.length ? `${others.slice(0, count).map((other) => `${other.route} ${other.departs}`).join(" · ")} 도 같은 길` : leg.alts?.length ? `같은 길 ${leg.alts.join(" · ")}` : "시간표 기준" : "배차 간격 기준";
			const textOf = (note) => `${leg.stops}${leg.type === "bus" ? "정류장" : "정거장"}${leg.wait > 60 ? ` · ${min(leg.wait)}분 기다림` : ""} · ${live ? "" : note}`;
			const more = Math.max(0, others.length - 3);
			return {
				kind: "ride",
				color,
				ink: inkOn(color),
				bus: leg.type === "bus",
				chip: legName(leg),
				toward,
				text: textOf(noteOf(3)),
				textAll: more ? textOf(noteOf(others.length)) : null,
				more,
				live
			};
		});
	}
	function planView(plan) {
		return {
			aria: `${plan.tag || "경로"} ${plan.minutes}분, ${plan.arrives} 도착, 지도에서 보기`,
			alt: sameRoutes(plan.legs),
			altAll: hiddenRoutes(plan.legs) ? sameRoutes(plan.legs, true) : null,
			altMore: hiddenRoutes(plan.legs),
			duration: durParts(plan.minutes),
			arrive: `${plan.arrives} 도착`,
			tag: plan.tag || null,
			track: trackParts(plan, colors),
			meta: `${plan.leaveBy} 출발 · 환승 ${plan.transfers}번 · 걷기 ${plan.walkMinutes}분`,
			live: plan.legs.some((leg) => leg.realtime),
			steps: steps(plan)
		};
	}
	const KINDS = [
		["all", "전체"],
		["subway", "지하철"],
		["bus", "버스"],
		["mixed", "지하철+버스"]
	];
	const cardsOf = () => view.result.kind === "plans" ? view.result.cards : [];
	function pick(index) {
		last.sel = index;
		cardsOf().forEach((card, other) => {
			card.on = other === index;
		});
		paint();
		showRoute?.(last.d.plans[index]);
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
			if (first >= 0) pick(first);
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
		pick(sel);
		filter(last.tab || "all");
	}
	function cardPressed(index) {
		if (last.sel === index && cardsOf()[index]?.on) closeSheet?.();
		else pick(index);
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
			from: field("from").value,
			to: field("to").value,
			picked: { ...picked }
		};
		if (!from) {
			view.status.text = "출발지를 목록에서 골라 주세요.";
			paint();
			return;
		}
		if (!to) {
			view.status.text = "도착지를 목록에서 골라 주세요.";
			paint();
			return;
		}
		const at = whenValue();
		view.status = {
			text: "경로를 찾고 있어요",
			sr: false
		};
		view.result = { kind: "loading" };
		fold(false);
		document.activeElement?.blur?.();
		const current = () => my === goSeq && mine !== 0 && mounted === mine;
		try {
			const answer = await (await fetch(`./api/route?from=${from.lat},${from.lng}&to=${to.lat},${to.lng}${at ? `&at=${encodeURIComponent(at)}` : ""}`)).json();
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
			render(answer, 0);
			dispatchEvent(new CustomEvent("syung:route"));
			fold(true);
			const sheetBody = body?.closest(".sheet-body");
			if (sheetBody) sheetBody.scrollTop = 0;
		} catch {
			if (current()) failed("연결이 불안정해요. 잠시 뒤 다시 찾아 주세요.");
		}
	}
	const actions = {
		typed,
		place: placePicked,
		here() {
			picked.from = null;
			field("from").value = "내 위치";
			next("from");
		},
		swap() {
			const fromField = field("from"), toField = field("to"), start = fromOf();
			[fromField.value, toField.value] = [toField.value, fromField.value];
			[picked.from, picked.to] = [picked.to, start && !picked.from ? {
				...start,
				name: "내 위치"
			} : picked.from];
			next();
		},
		summary() {
			fold(false);
			field("to").focus({ preventScroll: true });
		},
		whenRow() {
			whenOpen(!view.whenOpen);
		},
		whenNow() {
			whenSet({ k: "now" });
			whenOpen(false);
			next();
		},
		whenGo() {
			whenSet({
				k: "at",
				d: new Date(draft)
			});
			whenOpen(false);
			next();
		},
		day(offset) {
			const at = new Date(draft), today = /* @__PURE__ */ new Date();
			at.setFullYear(today.getFullYear(), today.getMonth(), today.getDate() + offset);
			draft = clamp(at);
			drawDraft();
		},
		hold: holds,
		tab: filter,
		card: cardPressed,
		retry: () => {
			go();
		}
	};
	function open(fresh = false) {
		bar.hidden = true;
		for (const seek of Object.values(seeks)) {
			clearTimeout(seek.timer);
			seek.seq++;
		}
		for (const hold of Object.values(holds)) hold.stop();
		view = freshView();
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
				for (const hold of Object.values(holds)) hold.stop();
				clearJourney(target);
			};
		});
		inSheet = true;
		if (!last) when = { k: "now" };
		whenSet(when);
		if (last) {
			field("from").value = last.from;
			field("to").value = last.to;
			whenSet(last.when ? {
				...last.when,
				d: last.when.d && new Date(last.when.d)
			} : { k: "now" });
			Object.assign(picked, last.picked);
			render(last.d, last.sel);
			fold(true);
		} else if (!fresh) field("to").focus({ preventScroll: true });
	}
	function openWith(end, place) {
		last = null;
		picked.from = picked.to = null;
		clearRoute?.();
		open(true);
		const other = end === "from" ? "to" : "from";
		picked[end] = place;
		field(end).value = place.name;
		const otherField = field(other);
		if (other === "from" && otherField.value === "내 위치") {
			go();
			return;
		}
		otherField.value = "";
		otherField.focus({ preventScroll: true });
	}
	function sheetClosed() {
		const was = inSheet;
		inSheet = false;
		if (!last || !was) return false;
		const p = last.d.plans[last.sel];
		bar.querySelector(".jbar-open").innerHTML = `<span class="jbar-top"><b>${dur(p.minutes)}</b><span>${esc(p.arrives)} 도착</span></span>${track(p, 240)}`;
		bar.hidden = false;
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
	button.addEventListener("click", () => open());
	return {
		open,
		openWith,
		sheetClosed,
		sheetReplaced,
		drop
	};
}
export { exitHints, hiddenRoutes, initJourney, routeTrack, sameRoutes, trackParts };
