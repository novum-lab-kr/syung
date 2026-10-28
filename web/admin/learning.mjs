import { Fragment as M, createRef as $, render as K } from "../npm/preact/dist/preact.mjs";
import { jsx as a } from "../npm/preact/jsx-runtime/dist/jsxRuntime.mjs";
import { BUS_TYPES, CRITERIA, ENOUGH, addDay, byLineOrder, events, firstStopLine, fmt, growth, lineColor, lineTiers, md, openPass, pct, r1, scoreChart, scoreDelta, scores, sightings, stopRows } from "./learning_data.mjs";
// web/admin/learning.tsx
var bold = (...kids) => ({
	tag: "b",
	kids
});
var span = (cls, ...kids) => ({
	tag: "span",
	cls,
	kids
});
function Show({ rich }) {
	if (typeof rich === "string") return rich;
	if (Array.isArray(rich)) return /* @__PURE__ */ a(M, { children: rich.map((part) => /* @__PURE__ */ a(Show, { rich: part })) });
	if (rich.tag === "dot") return /* @__PURE__ */ a("span", {
		class: "dot",
		style: `--c:${rich.color}`
	});
	const kids = rich.kids.map((part) => /* @__PURE__ */ a(Show, { rich: part }));
	return rich.tag === "b" ? /* @__PURE__ */ a("b", { children: kids }) : /* @__PURE__ */ a("span", {
		class: rich.cls,
		children: kids
	});
}
var cell = (rich, cls) => ({
	rich,
	cls
});
var Cells = ({ rows }) => /* @__PURE__ */ a(M, { children: rows?.map((row) => /* @__PURE__ */ a("tr", {
	class: row.cls,
	children: row.cells.map((item) => item.classFirst ? /* @__PURE__ */ a("td", {
		class: item.cls,
		colSpan: item.colSpan,
		children: /* @__PURE__ */ a(Show, { rich: item.rich })
	}) : /* @__PURE__ */ a("td", {
		colSpan: item.colSpan,
		class: item.cls,
		children: /* @__PURE__ */ a(Show, { rich: item.rich })
	}))
})) });
var dot = (color) => ({
	tag: "dot",
	color
});
var view = {
	tab: 0,
	touched: false,
	filled: {},
	error: false
};
var data = {};
var main = document.querySelector("main");
var tabRefs = [$(), $()];
function set(patch) {
	view = {
		...view,
		...patch
	};
	K(/* @__PURE__ */ a(LearningPage, {}), main);
}
var fill = (patch) => set({ filled: {
	...view.filled,
	...patch
} });
var TABS = [[
	"tabSubway",
	"panelSubway",
	""
], [
	"tabBus",
	"panelBus",
	"#bus"
]];
function showTab(index, focus) {
	set({
		tab: index,
		touched: true
	});
	if (focus) tabRefs[index].current.focus();
	history.replaceState(null, "", TABS[index][2] || location.pathname + location.search);
}
var km = (value) => value == null ? "–" : `${value}m`;
var sign = (value) => `${value > 0 ? "+" : ""}${value}초`;
function sgn(value) {
	if (value > 0) return span("up", `+${value}`);
	return value < 0 ? span("dn", `−${-value}`) : "0";
}
var pair = (before, after) => {
	if (after == null) return "–";
	return before == null ? `${after}` : [`${before} → `, bold(`${after}`)];
};
function perCent(pace) {
	const value = pct(pace);
	if (value > 0) return span("up", `+${value}%`);
	return value < 0 ? span("dn", `−${-value}%`) : "0%";
}
var orDefault = (value, show, fallback) => value != null ? show(value) : span("def", fallback != null ? show(fallback) : "–");
function paceWords(pace) {
	if (pace == null) return "시간표대로 달려요";
	const value = pct(pace);
	if (value === 0) return "시간표대로 달려요";
	return value < 0 ? [
		"시간표보다 ",
		span("faster", `${-value}% 빠르게`),
		" 달려요"
	] : [
		"시간표보다 ",
		span("slower", `${value}% 느리게`),
		" 달려요"
	];
}
var RESULTS = {
	published: "적용",
	"kept current": "유지",
	backfill: "나중에 계산"
};
var KINDS = [
	["도착→출발", "역에 서 있는 시간"],
	["출발→다음 도착", "출발해서 다음 역 도착"],
	["도착→다음 도착", "도착해서 다음 역 도착"]
];
var FEEDS = [["samples", "도착정보"], ["position", "열차 위치"]];
function fillAll(d) {
	const hist = d.history || [], genDay = (d.generatedAt || "").slice(0, 10);
	{
		const rp = d.replay, days = rp?.days || [], last = days.at(-1), criteria = rp?.criteria || CRITERIA;
		if (!last) fill({
			openText: "아직 다시 그린 날이 없어요. 고정 채점 창은 10/19 부터 모아요 — 다음 날 새벽 03:10 학습 때 처음 매겨요.",
			openTable: []
		});
		else {
			const day = `${last.day.slice(0, 4)}-${last.day.slice(4, 6)}-${last.day.slice(6)}`, windows = last.windows.filter((win) => win.events);
			const check = (value, ok, text) => value == null ? cell("—") : cell(text, ok ? "ok" : "no");
			const rows = windows.map((win) => {
				const arrive = win.arrive || {}, depart = win.depart || {}, stalls = win.stalls || {};
				return { cells: [
					cell(win.line),
					cell(win.window),
					cell(`${win.trains ?? "—"}`),
					check(arrive.signedMedian, Math.abs(arrive.signedMedian) <= criteria.bias, sign(arrive.signedMedian)),
					check(arrive.absMedian, arrive.absMedian <= criteria.absMedian && arrive.p90 <= criteria.p90, `${arrive.absMedian} · ${arrive.p90}초`),
					check(depart.signedMedian, Math.abs(depart.signedMedian) <= criteria.bias, sign(depart.signedMedian)),
					check(depart.absMedian, depart.absMedian <= criteria.absMedian && depart.p90 <= criteria.p90, `${depart.absMedian} · ${depart.p90}초`),
					check(stalls.n, stalls.n <= criteria.stalls, `${stalls.n}번 · 열차·시간당 ${stalls.perTrainHour}`),
					cell(win.coverage != null ? `${Math.round(win.coverage * 100)}%` : "—")
				] };
			});
			fill({ openTable: rows.length ? rows : [{ cells: [{
				rich: "그날 위치 자료가 없어요",
				colSpan: 9,
				cls: "muted"
			}] }] });
			fill({ openText: `${md(day)} 화면을 다시 그려 봤어요: ${windows.length}개 창 가운데 ${openPass(windows, criteria)}개가 기준을 다 넘었어요.${days.length > 1 ? ` (${days.length}일치 기록)` : ""}` });
		}
	}
	{
		const bus = d.bus, days = (bus?.days || []).filter((day) => day.date < genDay), routes = bus?.routes || [], count = days.length, last = days.at(-1);
		const rows = days.reduce((sum, day) => sum + day.rows, 0), calls = days.reduce((sum, day) => sum + day.calls, 0);
		const pace = bus?.pace, learned = pace?.routes || [], list = (bus?.scores || []).filter((item) => item.results?.pace);
		const shown = [...list].reverse().find((item) => item.results.pace.gap30?.n >= 1e3);
		fill({ busScore: {
			hidden: !list.length,
			rows: view.filled.busScore?.rows ?? []
		} });
		fill({ busScore: {
			hidden: !list.length,
			rows: [...list].reverse().map((item) => {
				const result = item.results, near = (kind) => result[kind].gap30, rare = (kind) => result[kind]["gap60+"];
				const nearCells = near("pace").n ? [
					cell(km(near("none").meanAbs)),
					cell(km(near("recent").meanAbs)),
					cell(bold(km(near("pace").meanAbs)))
				] : [
					cell("–"),
					cell("–"),
					cell("–")
				];
				return {
					cls: item === shown ? "sep" : void 0,
					cells: [
						cell(md(item.date)),
						cell(`${item.trainedRoutes}개`),
						...nearCells,
						cell(rare("pace").n ? [`${km(rare("recent").meanAbs)} → `, bold(km(rare("pace").meanAbs))] : "–")
					]
				};
			})
		} });
		fill({ busLearnHidden: !learned.length });
		if (learned.length) fill({ busLearn: {
			note: `${pace.days}일 기록으로 ${learned.length}개 노선을 배웠어요. 지도는 이 노선 버스를 그 시간대에 배운 빠르기로 앞질러 그리고, 나머지는 최근 2분 속도로 그려요.`,
			rows: [...learned].sort((left, right) => right.hours - left.hours).map((route) => ({ cells: [cell([dot(route.color || "#888"), route.name], "l"), cell(`${route.hours}시간`)] }))
		} });
		if (shown) {
			const result = shown.results, mean = result.pace.gap30.meanAbs, was = result.recent.gap30.meanAbs, rare = result.pace["gap60+"], rareWas = result.recent["gap60+"];
			fill({ busHero: {
				label: "버스 위치 오차 · 지도 볼 때 평균",
				mean,
				cls: `delta ${mean < was ? "down" : "same"}`,
				delta: mean < was ? `▼ 예전 방식(최근 속도, ${was}m)보다 ${was - mean}m 줄었어요` : `예전 방식(최근 속도)도 ${was}m · 비슷해요`,
				text: `${md(shown.date)} 버스 기록을 화면처럼 다시 그려 보니, 배운 노선 ${shown.trainedRoutes}개에서 지도 볼 때 평균 ${mean}m${rare?.n ? `, 드물게 받을 때 ${rareWas.meanAbs}m → ${rare.meanAbs}m` : ""} 어긋났어요. 노선 · 시간대 · 50m 구간마다 걸린 시간을 매일 새벽 배워요.`
			} });
		} else if (learned.length) fill({ busHero: { delta: `${learned.length}개 노선을 배웠어요 · 채점은 기록이 더 쌓이면` } });
		else fill({ busHero: { delta: count >= 7 ? "기록이 다 모였어요 · 오차를 잴 차례예요" : `${count}/7일 모았어요` } });
		if (!shown) fill({ busText: count ? `${md(days[0].date)}부터 ${count}일 동안 버스 위치 ${fmt(rows)}건을 모았어요. 일주일쯤 모이면 지하철처럼 오차부터 재고, 정류장 사이 달리는 시간을 구간마다 배워요.` : "버스 위치를 모으기 시작했어요. 오늘 모은 기록은 내일 새벽 03:10에 여기 나타나요." });
		let step = 0;
		if (list.length) step = 2;
		else if (learned.length) step = 1;
		fill({ busSteps: {
			step,
			items: [
				["기록 모으기", `${count}일`],
				["구간마다 배우기", learned.length ? `${learned.length}개 노선` : "모은 뒤"],
				["날마다 채점", list.length ? `${list.length}일` : "배운 뒤"]
			]
		} });
		if (last) fill({ busDay: [
			`${md(last.date)} 하루 모은 기록`,
			fmt(last.rows),
			`${fmt(last.calls)}번 불러서`
		] });
		fill({ busTotal: [fmt(rows), `${count}일 · ${fmt(calls)}번 불러서`] });
		fill({ busRoutes: [routes.length ? `${routes.length}개` : "–", routes.slice(0, 3).map((route) => route.name).join(" · ")] });
		fill({ busGrowth: growth(days, (day) => day.rows) });
		fill({ busRouteTable: routes.length ? routes.map((route) => ({ cells: [
			cell([dot(route.color || "#888"), route.name], "l"),
			cell(route.type && BUS_TYPES[route.type] || "–", "l"),
			cell(fmt(route.calls)),
			cell(`${fmt(route.buses)}대`),
			cell(`${route.days}일`)
		] })) : [{ cells: [{
			rich: "아직 모은 노선이 없어요.",
			cls: "l muted",
			colSpan: 5,
			classFirst: true
		}] }] });
		fill({ busDayTable: days.length ? [...days].reverse().map((day) => ({ cells: [
			cell(md(day.date)),
			cell(fmt(day.calls)),
			cell(fmt(day.rows)),
			cell(`${fmt(day.buses)}대`),
			cell(`${day.routes}`)
		] })) : [{ cells: [{
			rich: "아직 없어요.",
			cls: "muted",
			colSpan: 5,
			classFirst: true
		}] }] });
	}
	const days = (d.days || []).filter((day) => day.date < genDay);
	const list = scores(hist), last = list.at(-1);
	if (last) {
		fill({ err: last.cand.toFixed(1) });
		fill({ delta: scoreDelta(last) });
		const p90 = last.kinds.p90;
		fill({ heroText: `${md(last.day)} 하루 열차 움직임 ${last.n?.toLocaleString("ko-KR")}건을 예측해 봤더니 평균 ${last.cand.toFixed(1)}초 틀렸어요. 절반은 ${last.kinds.all}초 안쪽${p90 != null ? `, 10번 중 9번은 ${p90}초 안쪽` : ""}으로 맞혔어요.` });
		const means = last.kinds.means;
		fill({ kinds: {
			title: `어디서 틀리나요 · ${means ? "평균" : "중앙값"}`,
			items: KINDS.filter(([kind]) => last.kinds[kind] != null).map(([kind, title]) => [title, `${means?.[kind] ?? last.kinds[kind]}초`])
		} });
	}
	fill({ scores: scoreChart(list) });
	const lastDay = days.at(-1), total = days.reduce((sum, day) => sum + sightings(day), 0), learnedCount = days.reduce((sum, day) => sum + events(day), 0);
	if (lastDay) fill({ sDay: [
		`${md(lastDay.date)} 하루 모은 기록`,
		fmt(sightings(lastDay)),
		`학습용 ${fmt(events(lastDay))}`
	] });
	fill({ sTotal: [fmt(total), `${days.length}일 동안`] });
	fill({ sShare: total ? `${Math.round(learnedCount / total * 100)}%` : "–" });
	fill({ growth: growth(days, events) });
	fill({ groups: lineTiers(d.latest || {}, hist).filter((group) => group.lines.length).map((group) => ({
		name: group.name,
		cls: group.cls,
		head: `${group.lines.length}개 노선 · ${group.hint}`,
		cards: group.lines.map(({ line, values, count }) => {
			const items = [paceWords(values.pace)];
			if (values.zone != null) items.push(`역에서 약 ${values.zone}초 머물러요`);
			if (values.rushPace != null) {
				const value = pct(values.rushPace);
				items.push(["출퇴근엔 ", value > 0 ? span("slower", `${value}% 더 느려요`) : span("faster", `${-value}% 빨라요`)]);
			}
			return {
				line,
				items,
				title: `${count.toLocaleString("ko-KR")}구간`,
				width: `${Math.min(100, count / ENOUGH * 100)}%`
			};
		})
	})) });
	const scored = hist.filter((item) => item.candidate?.all != null).map((item) => ({
		day: addDay(item.date, -1),
		current: item.current || {},
		candidate: item.candidate,
		result: item.result
	}));
	fill({ kindTable: [...scored].reverse().map(({ day, current, candidate }) => ({ cells: [
		cell(md(day)),
		cell(fmt(candidate.n || 0)),
		...[
			"도착→출발",
			"출발→다음 도착",
			"도착→다음 도착",
			"all",
			"mean"
		].map((field) => cell(pair(r1(current[field]), r1(candidate[field]))))
	] })) });
	fill({ collectTable: [...days].reverse().flatMap((day) => FEEDS.map(([key, name], index) => {
		const feed = day[key] || {};
		return {
			cls: index === 0 ? "sep" : void 0,
			cells: [
				cell(index === 0 ? md(day.date) : ""),
				cell(name, "l"),
				cell(fmt(feed.records || 0)),
				cell(fmt(feed.sightings || 0)),
				cell(fmt(feed.event || 0)),
				cell(fmt(feed.trains || 0))
			]
		};
	})) });
	const latest = d.latest || {}, lineValues = latest.lines || {}, counts = latest.n || {}, fallback = latest.default || {};
	fill({ lineTable: [.../* @__PURE__ */ new Set([...Object.keys(lineValues), ...Object.keys(counts)])].sort(byLineOrder).map((line) => {
		const values = lineValues[line] || {};
		return { cells: [
			cell([dot(lineColor(line)), line], "l"),
			cell(orDefault(values.pace, perCent, fallback.pace)),
			cell(values.rushPace != null ? perCent(values.rushPace) : span("def", "평소와 같게")),
			cell(orDefault(values.zone, (zone) => `${zone}초`, fallback.zone)),
			cell(orDefault(values.approach, (approach) => `${approach}초`, fallback.approach)),
			cell(`${Object.keys(values.stops || {}).length || "–"}`),
			cell(fmt(counts[line]?.pace || 0))
		] };
	}) });
	const stations = latest.stations || {}, stopLines = Object.keys(stations).filter((line) => stations[line].length).sort(byLineOrder);
	fill({ stopLines });
	if (stopLines.length) showStops(firstStopLine(latest, stopLines));
	const byDay = Object.fromEntries(scored.map(({ day, current, candidate, result }) => {
		const hasMean = candidate.mean != null, field = hasMean ? "mean" : "all";
		return [day, {
			cand: r1(candidate[field]),
			cur: r1(current[field]),
			result,
			note: hasMean ? "" : " (중앙값)"
		}];
	}));
	fill({ daysTable: [...days].reverse().map((day) => {
		const score = byDay[day.date];
		let text = "–", outcome = "";
		if (score) {
			text = (score.cur != null ? `${score.cur} → ${score.cand}초` : `${score.cand}초`) + score.note;
			outcome = RESULTS[score.result] || "";
		}
		return { cells: [
			cell(md(day.date)),
			cell(fmt(day.samples?.sightings || 0)),
			cell(fmt(day.position?.sightings || 0)),
			cell(fmt(events(day))),
			cell(text),
			cell(outcome)
		] };
	}) });
	fill({ updated: `${new Date(d.generatedAt).toLocaleString("ko-KR", {
		timeZone: "Asia/Seoul",
		month: "numeric",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit"
	})}에 갱신 · 숫자는 매일 03:10 재학습 때 한 번 바뀌고, 오늘 모으는 기록은 내일 새벽에 들어가요` });
}
function showStops(line) {
	const { rows, summary } = stopRows(data.latest || {}, line);
	fill({ stop: {
		line,
		summary,
		rows: rows.map((row) => {
			let measured = "–";
			if (row.times) measured = row.times.toLocaleString("ko-KR");
			else if (row.runs) measured = span("def", span("full", "도착 "), row.runs.toLocaleString("ko-KR"));
			const use = row.own ? [bold(`${row.use}초`), row.use === row.base ? " 0초" : [
				" ",
				sgn(row.use - row.base),
				"초"
			]] : span("def", `${row.use}초`);
			return { cells: [
				cell(row.name, "l"),
				cell(measured),
				cell(row.sec != null ? `${row.sec}초` : "–"),
				cell(use),
				cell(span(`badge ${row.status[0]}`, span("full", row.status[1]), span("short", row.status[2])), "l")
			] };
		})
	} });
}
function GrowthChart({ chart, note }) {
	if (!chart) return /* @__PURE__ */ a("p", {
		class: "muted",
		children: "아직 기록이 없어요."
	});
	return /* @__PURE__ */ a(M, { children: [/* @__PURE__ */ a("div", { children: /* @__PURE__ */ a("svg", {
		viewBox: `0 0 ${chart.width} ${chart.height}`,
		role: "img",
		"aria-label": `학습용 기록 누적 ${fmt(chart.total)}`,
		children: [
			/* @__PURE__ */ a("defs", { children: /* @__PURE__ */ a("linearGradient", {
				id: "gf",
				x1: "0",
				y1: "0",
				x2: "0",
				y2: "1",
				children: [/* @__PURE__ */ a("stop", {
					offset: "0",
					"stop-color": "var(--syung)",
					"stop-opacity": ".55"
				}), /* @__PURE__ */ a("stop", {
					offset: "1",
					"stop-color": "var(--syung)",
					"stop-opacity": ".05"
				})]
			}) }),
			/* @__PURE__ */ a("polygon", {
				points: chart.polygon,
				fill: "url(#gf)"
			}),
			/* @__PURE__ */ a("polyline", {
				points: chart.line,
				fill: "none",
				stroke: "var(--syung-deep)",
				"stroke-width": "3",
				"stroke-linejoin": "round"
			}),
			/* @__PURE__ */ a("line", {
				x1: chart.left,
				x2: chart.width - chart.right,
				y1: chart.base,
				y2: chart.base,
				stroke: "var(--rule)"
			}),
			chart.points.map((point) => /* @__PURE__ */ a(M, { children: [
				/* @__PURE__ */ a("circle", {
					cx: point.x,
					cy: point.y,
					r: "4",
					fill: "var(--paper)",
					stroke: "var(--syung-deep)",
					"stroke-width": "2.5"
				}),
				/* @__PURE__ */ a("text", {
					x: point.x,
					y: chart.height - 8,
					"text-anchor": "middle",
					children: point.label
				}),
				point.value && /* @__PURE__ */ a("text", {
					class: "val",
					x: point.x,
					y: point.y - 10,
					"text-anchor": point.value.anchor,
					children: point.value.text
				})
			] }))
		]
	}) }), /* @__PURE__ */ a("p", {
		class: "muted",
		style: "margin:6px 0 0;font-size:12.5px",
		children: note
	})] });
}
function ScoresChart({ chart }) {
	if (!chart) return /* @__PURE__ */ a("p", {
		class: "muted",
		children: "아직 채점 기록이 없어요."
	});
	return /* @__PURE__ */ a("svg", {
		viewBox: `0 0 ${chart.width} ${chart.height}`,
		role: "img",
		"aria-label": "날마다 채점한 오차",
		children: [chart.grid.map((row) => /* @__PURE__ */ a(M, { children: [/* @__PURE__ */ a("line", {
			x1: chart.left,
			x2: chart.width - chart.right,
			y1: row.y,
			y2: row.y,
			stroke: "var(--rule)"
		}), /* @__PURE__ */ a("text", {
			x: chart.left,
			y: row.y - 3,
			children: `${row.label}초`
		})] })), chart.points.map((point) => /* @__PURE__ */ a(M, { children: [
			point.cur != null && /* @__PURE__ */ a(M, { children: [/* @__PURE__ */ a("line", {
				x1: point.x,
				x2: point.x,
				y1: point.cur,
				y2: point.candY,
				stroke: "var(--muted)",
				"stroke-width": "2"
			}), /* @__PURE__ */ a("circle", {
				cx: point.x,
				cy: point.cur,
				r: "8",
				fill: "var(--paper)",
				stroke: "var(--muted)",
				"stroke-width": "2"
			})] }),
			/* @__PURE__ */ a("circle", {
				cx: point.x,
				cy: point.candY,
				r: "5",
				fill: "var(--syung-deep)"
			}),
			/* @__PURE__ */ a("text", {
				class: "val",
				x: point.x + 9,
				y: point.candY + 4,
				children: point.cand
			}),
			/* @__PURE__ */ a("text", {
				x: point.x,
				y: point.bottom,
				"text-anchor": "middle",
				children: point.label
			})
		] }))]
	});
}
function BusPanel() {
	const filled = view.filled, hero = filled.busHero;
	return /* @__PURE__ */ a("div", {
		class: "panel",
		id: "panelBus",
		role: "tabpanel",
		"aria-labelledby": "tabBus",
		hidden: view.tab !== 1,
		children: [
			/* @__PURE__ */ a("section", {
				class: "box hero",
				"aria-label": "버스 학습 상태",
				children: [/* @__PURE__ */ a("div", { children: [
					/* @__PURE__ */ a("small", {
						id: "bLabel",
						children: hero?.label ?? "버스 도착 시각 예측"
					}),
					/* @__PURE__ */ a("div", {
						class: "big",
						id: "bBig",
						children: hero?.mean != null ? /* @__PURE__ */ a(M, { children: [/* @__PURE__ */ a("b", {
							id: "bState",
							children: hero.mean
						}), /* @__PURE__ */ a("span", { children: "m" })] }) : /* @__PURE__ */ a("b", {
							class: "word",
							id: "bState",
							children: "모으는 중"
						})
					}),
					/* @__PURE__ */ a("span", {
						class: hero?.cls ?? "delta same",
						id: "bDelta",
						children: hero ? hero.delta : "불러오는 중"
					}),
					/* @__PURE__ */ a("p", {
						id: "bText",
						children: hero?.text ?? filled.busText ?? ""
					})
				] }), /* @__PURE__ */ a("ul", {
					class: "kinds steps",
					id: "bSteps",
					children: filled.busSteps && /* @__PURE__ */ a(M, { children: [/* @__PURE__ */ a("h3", { children: "배우는 순서" }), filled.busSteps.items.map(([title, value], index) => /* @__PURE__ */ a("li", {
						class: index === filled.busSteps.step ? "now" : void 0,
						children: [`${index + 1}. ${title}`, /* @__PURE__ */ a("b", { children: value })]
					}))] })
				})]
			}),
			/* @__PURE__ */ a("section", {
				class: "stats",
				"aria-label": "모은 버스 기록",
				children: [
					/* @__PURE__ */ a("div", {
						class: "stat",
						children: [
							/* @__PURE__ */ a("small", {
								id: "bDayLabel",
								children: filled.busDay?.[0] ?? "하루 모은 기록"
							}),
							/* @__PURE__ */ a("b", {
								id: "bToday",
								children: filled.busDay?.[1] ?? "–"
							}),
							/* @__PURE__ */ a("span", {
								id: "bTodaySub",
								children: filled.busDay?.[2] ?? ""
							})
						]
					}),
					/* @__PURE__ */ a("div", {
						class: "stat",
						children: [
							/* @__PURE__ */ a("small", { children: "지금까지" }),
							/* @__PURE__ */ a("b", {
								id: "bTotal",
								children: filled.busTotal?.[0] ?? "–"
							}),
							/* @__PURE__ */ a("span", {
								id: "bTotalSub",
								children: filled.busTotal?.[1] ?? ""
							})
						]
					}),
					/* @__PURE__ */ a("div", {
						class: "stat",
						children: [
							/* @__PURE__ */ a("small", { children: "모은 노선" }),
							/* @__PURE__ */ a("b", {
								id: "bRoutes",
								children: filled.busRoutes?.[0] ?? "–"
							}),
							/* @__PURE__ */ a("span", {
								id: "bRoutesSub",
								children: filled.busRoutes?.[1] ?? ""
							})
						]
					})
				]
			}),
			/* @__PURE__ */ a("section", {
				class: "box",
				id: "bScoreBox",
				hidden: filled.busScore ? filled.busScore.hidden : true,
				children: [
					/* @__PURE__ */ a("h2", { children: "날마다 채점한 거리 오차" }),
					/* @__PURE__ */ a("div", {
						class: "tw",
						children: /* @__PURE__ */ a("table", {
							class: "wide",
							children: [/* @__PURE__ */ a("thead", { children: /* @__PURE__ */ a("tr", { children: [
								/* @__PURE__ */ a("th", { children: "채점한 날" }),
								/* @__PURE__ */ a("th", { children: "배운 노선" }),
								/* @__PURE__ */ a("th", { children: [
									"지도 볼 때",
									/* @__PURE__ */ a("br", {}),
									"앞지르지 않음"
								] }),
								/* @__PURE__ */ a("th", { children: [
									"지도 볼 때",
									/* @__PURE__ */ a("br", {}),
									"최근 속도"
								] }),
								/* @__PURE__ */ a("th", { children: [
									"지도 볼 때",
									/* @__PURE__ */ a("br", {}),
									"배운 빠르기"
								] }),
								/* @__PURE__ */ a("th", { children: [
									"드물게 받을 때",
									/* @__PURE__ */ a("br", {}),
									"최근 속도 → 배운 빠르기"
								] })
							] }) }), /* @__PURE__ */ a("tbody", {
								id: "bScoreTable",
								children: /* @__PURE__ */ a(Cells, { rows: filled.busScore?.rows })
							})]
						})
					}),
					/* @__PURE__ */ a("p", {
						class: "note",
						children: "그 날 서버가 받은 버스 위치를 화면처럼 다시 그려, 1초마다 그린 자리와 실제 자리의 거리(평균, m)를 쟀어요. 배운 빠르기는 그 날 전 기록으로만 배운 값이에요. 지도 볼 때 = 30초마다 받는 노선, 드물게 = 학습용으로 1분 넘게 띄엄띄엄 받는 노선이에요. 실제 자리는 받은 위치 사이를 이은 값이라 신호 · 정류장에서 선 것이 빠져 있어 실제 오차는 조금 더 커요. 배운 노선이 그 날 다닌 노선과 겹친 만큼만 매겨요(학습 노선이 날마다 바뀌어서 겹치는 날이 적어요)."
					})
				]
			}),
			/* @__PURE__ */ a("section", {
				class: "box",
				id: "bLearnBox",
				hidden: filled.busLearnHidden ?? true,
				children: [
					/* @__PURE__ */ a("h2", { children: "배운 노선" }),
					/* @__PURE__ */ a("p", {
						class: "note",
						id: "bLearnNote",
						style: "margin:0 0 8px",
						children: filled.busLearn?.note ?? ""
					}),
					/* @__PURE__ */ a("div", {
						class: "tw",
						children: /* @__PURE__ */ a("table", { children: [/* @__PURE__ */ a("thead", { children: /* @__PURE__ */ a("tr", { children: [/* @__PURE__ */ a("th", {
							class: "l",
							children: "노선"
						}), /* @__PURE__ */ a("th", { children: "배운 시간대" })] }) }), /* @__PURE__ */ a("tbody", {
							id: "bLearnTable",
							children: /* @__PURE__ */ a(Cells, { rows: filled.busLearn?.rows })
						})] })
					})
				]
			}),
			/* @__PURE__ */ a("section", {
				class: "box growth",
				children: [/* @__PURE__ */ a("h2", { children: "버스 기록이 쌓이는 중" }), /* @__PURE__ */ a("div", {
					id: "bGrowth",
					children: filled.busGrowth !== void 0 && /* @__PURE__ */ a(GrowthChart, {
						chart: filled.busGrowth,
						note: "모은 버스 위치를 날마다 더한 값이에요. 버스 한 대가 한 번 찍힐 때마다 한 건이에요."
					})
				})]
			}),
			/* @__PURE__ */ a("section", {
				class: "box",
				children: [
					/* @__PURE__ */ a("h2", { children: "노선별 수집" }),
					/* @__PURE__ */ a("div", {
						class: "tw",
						children: /* @__PURE__ */ a("table", { children: [/* @__PURE__ */ a("thead", { children: /* @__PURE__ */ a("tr", { children: [
							/* @__PURE__ */ a("th", {
								class: "l",
								children: "노선"
							}),
							/* @__PURE__ */ a("th", {
								class: "l",
								children: "종류"
							}),
							/* @__PURE__ */ a("th", { children: "부른 횟수" }),
							/* @__PURE__ */ a("th", { children: "본 버스" }),
							/* @__PURE__ */ a("th", { children: "모은 날" })
						] }) }), /* @__PURE__ */ a("tbody", {
							id: "bRouteTable",
							children: /* @__PURE__ */ a(Cells, { rows: filled.busRouteTable })
						})] })
					}),
					/* @__PURE__ */ a("p", {
						class: "note",
						children: "서버가 낮(05~24시) 동안 이 노선들을 번갈아 불러 기록해요. 지도에서 누가 버스를 보고 있으면 잠깐 쉬어요."
					})
				]
			}),
			/* @__PURE__ */ a("section", {
				class: "box",
				children: [/* @__PURE__ */ a("h2", { children: "날짜별 수집" }), /* @__PURE__ */ a("div", {
					class: "tw",
					children: /* @__PURE__ */ a("table", { children: [/* @__PURE__ */ a("thead", { children: /* @__PURE__ */ a("tr", { children: [
						/* @__PURE__ */ a("th", { children: "날짜" }),
						/* @__PURE__ */ a("th", { children: "부른 횟수" }),
						/* @__PURE__ */ a("th", { children: "받은 기록" }),
						/* @__PURE__ */ a("th", { children: "본 버스" }),
						/* @__PURE__ */ a("th", { children: "노선" })
					] }) }), /* @__PURE__ */ a("tbody", {
						id: "bDayTable",
						children: /* @__PURE__ */ a(Cells, { rows: filled.busDayTable })
					})] })
				})]
			})
		]
	});
}
function SubwayPanel() {
	const filled = view.filled, stop = filled.stop;
	return /* @__PURE__ */ a("div", {
		class: "panel",
		id: "panelSubway",
		role: "tabpanel",
		"aria-labelledby": "tabSubway",
		hidden: view.tab !== 0,
		children: [
			/* @__PURE__ */ a("section", {
				class: "box open",
				"aria-label": "오픈 기준",
				children: [
					/* @__PURE__ */ a("h2", { children: "오픈 기준 · 지도 화면 다시 그리기" }),
					/* @__PURE__ */ a("p", {
						class: "muted",
						id: "openText",
						style: "margin:0 0 12px;font-size:13.5px;line-height:1.6",
						children: filled.openText ?? "불러오는 중"
					}),
					/* @__PURE__ */ a("div", {
						class: "tw",
						children: /* @__PURE__ */ a("table", {
							class: "wide",
							children: [/* @__PURE__ */ a("thead", { children: /* @__PURE__ */ a("tr", { children: [
								/* @__PURE__ */ a("th", { children: "노선" }),
								/* @__PURE__ */ a("th", { children: "시간" }),
								/* @__PURE__ */ a("th", { children: "열차" }),
								/* @__PURE__ */ a("th", { children: "도착 치우침" }),
								/* @__PURE__ */ a("th", { children: "도착 가운데 · 90%" }),
								/* @__PURE__ */ a("th", { children: "출발 치우침" }),
								/* @__PURE__ */ a("th", { children: "출발 가운데 · 90%" }),
								/* @__PURE__ */ a("th", { children: "역 사이 멈춤" }),
								/* @__PURE__ */ a("th", { children: "맞춘 사건" })
							] }) }), /* @__PURE__ */ a("tbody", {
								id: "openTable",
								children: /* @__PURE__ */ a(Cells, { rows: filled.openTable })
							})]
						})
					}),
					/* @__PURE__ */ a("p", {
						class: "note",
						children: [
							"날마다 7 · 2 · 9호선을 출근 · 평시 · 퇴근 30분씩 그날 쓰던 학습 값으로 다시 그려, 위치 자료가 나중에 알려 준 열차 자신의 도착 · 출발 시각과 견줘요(초, + 는 슝이 늦음).",
							" ",
							/* @__PURE__ */ a("b", {
								class: "ok",
								children: "초록"
							}),
							"은 기준 안(치우침 ±10초 · 가운데 15초 · 90% 30초 · 역 사이 10초 넘는 멈춤 0), ",
							/* @__PURE__ */ a("b", {
								class: "no",
								children: "노랑"
							}),
							"은 기준 밖. 위치 자료의 '도착'은 실제로 서는 때보다 조금 이를 수 있어 치우침은 실제 탑승 비교로 함께 봐요."
						]
					})
				]
			}),
			/* @__PURE__ */ a("section", {
				class: "box hero",
				"aria-label": "학습 값 채점",
				children: [/* @__PURE__ */ a("div", { children: [
					/* @__PURE__ */ a("small", { children: "학습 값 채점 · 다음 사건까지 예측 오차 평균 (오픈 기준 아님)" }),
					/* @__PURE__ */ a("div", {
						class: "big",
						children: [/* @__PURE__ */ a("b", {
							id: "err",
							children: filled.err ?? "–"
						}), /* @__PURE__ */ a("span", { children: "초" })]
					}),
					/* @__PURE__ */ a("span", {
						class: filled.delta?.cls ?? "delta same",
						id: "delta",
						children: filled.delta?.text ?? "불러오는 중"
					}),
					/* @__PURE__ */ a("p", {
						id: "heroText",
						children: view.error ? "학습 기록을 불러오지 못했어요." : filled.heroText ?? ""
					})
				] }), /* @__PURE__ */ a("ul", {
					class: "kinds",
					id: "kinds",
					children: filled.kinds && /* @__PURE__ */ a(M, { children: [/* @__PURE__ */ a("h3", { children: filled.kinds.title }), filled.kinds.items.map(([title, value]) => /* @__PURE__ */ a("li", { children: [title, /* @__PURE__ */ a("b", { children: value })] }))] })
				})]
			}),
			/* @__PURE__ */ a("section", {
				class: "stats",
				"aria-label": "모은 기록",
				children: [
					/* @__PURE__ */ a("div", {
						class: "stat",
						children: [
							/* @__PURE__ */ a("small", {
								id: "sDayLabel",
								children: filled.sDay?.[0] ?? "하루 모은 기록"
							}),
							/* @__PURE__ */ a("b", {
								id: "sToday",
								children: filled.sDay?.[1] ?? "–"
							}),
							/* @__PURE__ */ a("span", {
								id: "sTodaySub",
								children: filled.sDay?.[2] ?? ""
							})
						]
					}),
					/* @__PURE__ */ a("div", {
						class: "stat",
						children: [
							/* @__PURE__ */ a("small", { children: "지금까지" }),
							/* @__PURE__ */ a("b", {
								id: "sTotal",
								children: filled.sTotal?.[0] ?? "–"
							}),
							/* @__PURE__ */ a("span", {
								id: "sTotalSub",
								children: filled.sTotal?.[1] ?? ""
							})
						]
					}),
					/* @__PURE__ */ a("div", {
						class: "stat",
						children: [
							/* @__PURE__ */ a("small", { children: "학습에 쓰인 비율" }),
							/* @__PURE__ */ a("b", {
								id: "sShare",
								children: filled.sShare ?? "–"
							}),
							/* @__PURE__ */ a("span", { children: "자체 시각이 있는 기록" })
						]
					})
				]
			}),
			/* @__PURE__ */ a("section", {
				class: "box scores",
				children: [
					/* @__PURE__ */ a("h2", { children: "날마다 채점한 오차" }),
					/* @__PURE__ */ a("div", {
						class: "legend",
						children: [/* @__PURE__ */ a("span", { children: [/* @__PURE__ */ a("i", { style: "background:var(--syung-deep)" }), "새로 배운 값"] }), /* @__PURE__ */ a("span", { children: [/* @__PURE__ */ a("i", { style: "border:2px solid var(--muted)" }), "쓰던 값"] })]
					}),
					/* @__PURE__ */ a("div", {
						id: "scores",
						children: filled.scores !== void 0 && /* @__PURE__ */ a(ScoresChart, { chart: filled.scores })
					}),
					/* @__PURE__ */ a("div", {
						class: "tw",
						style: "margin-top:12px",
						children: /* @__PURE__ */ a("table", {
							class: "wide",
							children: [/* @__PURE__ */ a("thead", { children: /* @__PURE__ */ a("tr", { children: [
								/* @__PURE__ */ a("th", { children: "채점한 날" }),
								/* @__PURE__ */ a("th", { children: "채점 건수" }),
								/* @__PURE__ */ a("th", { children: "역에 서 있는 시간" }),
								/* @__PURE__ */ a("th", { children: "출발→다음 역 도착" }),
								/* @__PURE__ */ a("th", { children: "도착→다음 역 도착" }),
								/* @__PURE__ */ a("th", { children: "전체 중앙값" }),
								/* @__PURE__ */ a("th", { children: "전체 평균" })
							] }) }), /* @__PURE__ */ a("tbody", {
								id: "kindTable",
								children: /* @__PURE__ */ a(Cells, { rows: filled.kindTable })
							})]
						})
					}),
					/* @__PURE__ */ a("p", {
						class: "note",
						children: "칸마다 쓰던 값 → 새로 배운 값(초)이에요. 칸별은 중앙값, 마지막 칸은 평균이에요. 그래프는 평균이라 평균을 재기 시작한 10/7부터 그려요."
					}),
					/* @__PURE__ */ a("p", {
						class: "muted",
						style: "margin:6px 0 0;font-size:12.5px;line-height:1.55",
						children: "날마다 그날 열차 움직임으로 채점해서 시험지가 매일 달라요. 날짜끼리 오르내림엔 그날 난이도(채점 건수, 출퇴근 비중)도 섞여 있으니, 배운 게 좋아졌는지는 같은 날의 두 점을 비교해 보세요."
					})
				]
			}),
			/* @__PURE__ */ a("section", {
				class: "box growth",
				children: [/* @__PURE__ */ a("h2", { children: "학습 데이터가 쌓이는 중" }), /* @__PURE__ */ a("div", {
					id: "growth",
					children: filled.growth !== void 0 && /* @__PURE__ */ a(GrowthChart, {
						chart: filled.growth,
						note: "학습에 쓸 수 있는 기록을 날마다 더한 값이에요. 기울기가 가파를수록 그날 많이 모았어요."
					})
				})]
			}),
			/* @__PURE__ */ a("section", {
				class: "box",
				children: [
					/* @__PURE__ */ a("h2", { children: "날짜별 수집 상세" }),
					/* @__PURE__ */ a("div", {
						class: "tw",
						children: /* @__PURE__ */ a("table", {
							class: "wide",
							children: [/* @__PURE__ */ a("thead", { children: /* @__PURE__ */ a("tr", { children: [
								/* @__PURE__ */ a("th", { children: "날짜" }),
								/* @__PURE__ */ a("th", {
									class: "l",
									children: "피드"
								}),
								/* @__PURE__ */ a("th", { children: "받은 기록" }),
								/* @__PURE__ */ a("th", { children: "새로 본 움직임" }),
								/* @__PURE__ */ a("th", { children: "학습용" }),
								/* @__PURE__ */ a("th", { children: "열차 수" })
							] }) }), /* @__PURE__ */ a("tbody", {
								id: "collectTable",
								children: /* @__PURE__ */ a(Cells, { rows: filled.collectTable })
							})]
						})
					}),
					/* @__PURE__ */ a("p", {
						class: "note",
						children: "받은 기록: API에서 받은 줄 수 · 새로 본 움직임: 같은 열차의 같은 역·상태 반복을 뺀 것 · 학습용: 그중 자기 시각이 찍혀 있어 시간을 잴 수 있는 것."
					})
				]
			}),
			/* @__PURE__ */ a("section", {
				class: "box",
				children: [/* @__PURE__ */ a("h2", { children: "노선별 학습 상태" }), /* @__PURE__ */ a("div", {
					class: "groups",
					id: "groups",
					children: filled.groups?.map((group) => /* @__PURE__ */ a("div", {
						class: "group",
						children: [/* @__PURE__ */ a("h3", { children: [/* @__PURE__ */ a("span", {
							class: `badge ${group.cls}`,
							children: group.name
						}), /* @__PURE__ */ a("i", { children: group.head })] }), /* @__PURE__ */ a("div", {
							class: "cards",
							children: group.cards.map((card) => /* @__PURE__ */ a("div", {
								class: "lc",
								style: `--c:${lineColor(card.line)}`,
								children: [
									/* @__PURE__ */ a("b", { children: card.line }),
									/* @__PURE__ */ a("ul", { children: card.items.map((item) => /* @__PURE__ */ a("li", { children: /* @__PURE__ */ a(Show, { rich: item }) })) }),
									/* @__PURE__ */ a("div", {
										class: "meter",
										title: card.title,
										children: /* @__PURE__ */ a("i", { style: `width:${card.width}` })
									})
								]
							}))
						})]
					}))
				})]
			}),
			/* @__PURE__ */ a("section", {
				class: "box",
				children: [
					/* @__PURE__ */ a("h2", { children: "노선별 배운 값" }),
					/* @__PURE__ */ a("div", {
						class: "tw",
						children: /* @__PURE__ */ a("table", {
							class: "wide",
							children: [/* @__PURE__ */ a("thead", { children: /* @__PURE__ */ a("tr", { children: [
								/* @__PURE__ */ a("th", {
									class: "l",
									children: "노선"
								}),
								/* @__PURE__ */ a("th", { children: "속도" }),
								/* @__PURE__ */ a("th", { children: "출퇴근 속도" }),
								/* @__PURE__ */ a("th", { children: "역에 머무는 시간" }),
								/* @__PURE__ */ a("th", { children: "진입→도착" }),
								/* @__PURE__ */ a("th", { children: "따로 배운 역" }),
								/* @__PURE__ */ a("th", { children: "속도 학습 구간" })
							] }) }), /* @__PURE__ */ a("tbody", {
								id: "lineTable",
								children: /* @__PURE__ */ a(Cells, { rows: filled.lineTable })
							})]
						})
					}),
					/* @__PURE__ */ a("p", {
						class: "note",
						children: "속도는 시간표 대비(+는 느리게, −는 빠르게)예요. 회색은 데이터가 모자라 기본값을 쓰는 칸이에요."
					})
				]
			}),
			/* @__PURE__ */ a("section", {
				class: "box",
				children: [
					/* @__PURE__ */ a("h2", { children: "역별 머무는 시간" }),
					/* @__PURE__ */ a("div", {
						class: "chips",
						id: "stopLines",
						role: "tablist",
						"aria-label": "노선 고르기",
						children: filled.stopLines?.map((line) => /* @__PURE__ */ a("button", {
							type: "button",
							role: "tab",
							"data-l": line,
							style: `--c:${lineColor(line)}`,
							"aria-selected": stop ? line === stop.line : void 0,
							onClick: () => showStops(line),
							children: [/* @__PURE__ */ a("span", { class: "dot" }), line]
						}))
					}),
					/* @__PURE__ */ a("p", {
						class: "note",
						id: "stopSummary",
						style: "margin:0 0 8px",
						children: stop?.summary ?? ""
					}),
					/* @__PURE__ */ a("div", {
						class: "tw",
						children: /* @__PURE__ */ a("table", { children: [/* @__PURE__ */ a("thead", { children: /* @__PURE__ */ a("tr", { children: [
							/* @__PURE__ */ a("th", {
								class: "l",
								children: "역"
							}),
							/* @__PURE__ */ a("th", { children: "잰 횟수" }),
							/* @__PURE__ */ a("th", { children: "잰 시간" }),
							/* @__PURE__ */ a("th", { children: "지도 값" }),
							/* @__PURE__ */ a("th", {
								class: "l",
								children: "상태"
							})
						] }) }), /* @__PURE__ */ a("tbody", {
							id: "stopTable",
							children: /* @__PURE__ */ a(Cells, { rows: stop?.rows })
						})] })
					}),
					/* @__PURE__ */ a("p", {
						class: "note",
						children: "지난 8일 동안 역에 도착해서 출발할 때까지를 잰 값이에요. 30번 넘게 재고 노선 평균과 5초 넘게 다른 역만 따로 배우고, 나머지 역은 노선 평균을 써요. 출발 신호가 없는 역(코레일 구간)은 도착해서 다음 역에 도착하기까지가 예상보다 얼마나 늦는지로 추정해요(도착 n = 그 기록 수). 추정값엔 다음 구간 시간표 오차도 섞여 있어요. 지도 값은 30~180초 안으로 잘라요."
					})
				]
			}),
			/* @__PURE__ */ a("section", {
				class: "box",
				children: [/* @__PURE__ */ a("h2", { children: "날짜별 자세한 기록" }), /* @__PURE__ */ a("div", {
					class: "tw",
					children: /* @__PURE__ */ a("table", {
						id: "daysTable",
						children: [/* @__PURE__ */ a("thead", { children: /* @__PURE__ */ a("tr", { children: [
							/* @__PURE__ */ a("th", { children: "날짜" }),
							/* @__PURE__ */ a("th", { children: "도착정보" }),
							/* @__PURE__ */ a("th", { children: "열차 위치" }),
							/* @__PURE__ */ a("th", { children: "학습용" }),
							/* @__PURE__ */ a("th", { children: [
								"이 날로 채점(평균)",
								/* @__PURE__ */ a("br", {}),
								"쓰던 값 → 새 값"
							] }),
							/* @__PURE__ */ a("th", { children: "결과" })
						] }) }), /* @__PURE__ */ a("tbody", { children: /* @__PURE__ */ a(Cells, { rows: filled.daysTable }) })]
					})
				})]
			})
		]
	});
}
function LearningPage() {
	return /* @__PURE__ */ a(M, { children: [
		/* @__PURE__ */ a("div", {
			class: "tabs",
			role: "tablist",
			"aria-label": "무엇을 배우나",
			children: ["지하철", "버스"].map((label, index) => {
				let tabIndex = view.tab === index ? 0 : -1;
				if (!view.touched && index === 0) tabIndex = void 0;
				return /* @__PURE__ */ a("button", {
					type: "button",
					role: "tab",
					id: TABS[index][0],
					"aria-controls": TABS[index][1],
					"aria-selected": view.tab === index,
					tabIndex,
					ref: tabRefs[index],
					onClick: () => showTab(index),
					onKeyDown: (event) => {
						if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
							event.preventDefault();
							showTab((index + 1) % TABS.length, true);
						}
					},
					children: label
				});
			})
		}),
		/* @__PURE__ */ a(SubwayPanel, {}),
		/* @__PURE__ */ a(BusPanel, {}),
		/* @__PURE__ */ a("p", {
			class: "muted",
			id: "updated",
			style: "margin:0;font-size:12px;text-align:center",
			children: view.filled.updated ?? ""
		})
	] });
}
main.textContent = "";
set({});
if (location.hash === "#bus") showTab(1);
fetch("/admin/learning.json", { cache: "no-cache" }).then((response) => {
	if (response.status === 401) {
		location.href = "/admin/login.html?next=/admin/learning";
		throw 0;
	}
	return response.json();
}).then((received) => {
	data = received;
	fillAll(received);
}).catch((error) => {
	if (error !== 0) set({ error: true });
});
