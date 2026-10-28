// web/admin/learning_data.mts
var COLORS = {
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
var ORDER = Object.keys(COLORS);
var byLineOrder = (left, right) => ORDER.indexOf(left) - ORDER.indexOf(right);
var lineColor = (line) => COLORS[line] || "#888";
var ENOUGH = 2e3;
function fmt(count) {
	if (count >= 1e6) return `${(count / 1e6).toFixed(1)}백만`;
	return count >= 1e4 ? `${(count / 1e4).toFixed(1)}만` : Math.round(count).toLocaleString("ko-KR");
}
var md = (date) => {
	const [, month = "", day = ""] = date.split("-");
	return `${+month}/${+day}`;
};
var sightings = (day) => (day.samples?.sightings || 0) + (day.position?.sightings || 0);
var events = (day) => (day.samples?.event || 0) + (day.position?.event || 0);
var addDay = (date, count) => {
	const time = /* @__PURE__ */ new Date(`${date}T00:00:00Z`);
	time.setUTCDate(time.getUTCDate() + count);
	return time.toISOString().slice(0, 10);
};
var pct = (pace) => Math.round((pace - 1) * 100);
var r1 = (value) => value == null ? null : Math.round(value * 10) / 10;
var scores = (history) => history.filter((item) => item.candidate?.mean != null).map((item) => ({
	day: addDay(item.date, -1),
	cand: r1(item.candidate.mean),
	cur: r1(item.current?.mean),
	n: item.candidate.n,
	result: item.result,
	kinds: item.candidate
}));
function scoreChart(list) {
	if (!list.length) return null;
	const width = 560, height = 190, left = 16, right = 16, top = 26, values = list.flatMap((item) => [item.cand, item.cur].filter((value) => value != null));
	const low = Math.floor(Math.min(...values)) - 1, high = Math.ceil(Math.max(...values)) + 1;
	const xOf = (index) => list.length === 1 ? width / 2 : 76 + index * 444 / (list.length - 1);
	const yOf = (value) => top + 130 * (high - value) / (high - low);
	const grid = [];
	for (let value = Math.ceil(low); value <= high; value += high - low > 8 ? 4 : 2) grid.push({
		y: yOf(value),
		label: value
	});
	return {
		width,
		height,
		left,
		right,
		grid,
		points: list.map((item, index) => ({
			x: xOf(index),
			cur: item.cur != null ? yOf(item.cur) : null,
			candY: yOf(item.cand),
			cand: item.cand,
			label: md(item.day),
			bottom: 182
		}))
	};
}
function scoreDelta(last) {
	const cur = last.cur, diff = cur != null ? +(last.cand - cur).toFixed(1) : 0;
	if (cur == null) return {
		cls: "delta same",
		text: "첫 채점"
	};
	if (last.result === "kept current") return {
		cls: "delta up",
		text: `쓰던 값(${cur}초)이 더 나아 그대로 써요`
	};
	if (diff < 0) return {
		cls: "delta down",
		text: `▼ 같은 날 쓰던 값(${cur}초)보다 ${-diff}초 좋아졌어요`
	};
	return {
		cls: "delta same",
		text: diff > 0 ? `쓰던 값(${cur}초)과 거의 같아요` : `같은 날 쓰던 값도 ${cur}초 · 그대로예요`
	};
}
function growth(days, value) {
	if (!days.length) return null;
	let total = 0;
	const points = days.map((day) => ({
		date: day.date,
		sum: total += value(day)
	})), width = 560, height = 220, left = 12, right = 12, top = 28, most = total * 1.1;
	const xOf = (index) => points.length === 1 ? width / 2 : 32 + index * 496 / (points.length - 1), yOf = (sum) => top + 166 * (1 - sum / most);
	const line = points.map((point, index) => `${xOf(index)},${yOf(point.sum)}`).join(" ");
	return {
		total,
		width,
		height,
		left,
		right,
		base: yOf(0),
		line,
		polygon: `${xOf(0)},${yOf(0)} ${line} ${xOf(points.length - 1)},${yOf(0)}`,
		points: points.map((point, index) => ({
			x: xOf(index),
			y: yOf(point.sum),
			label: md(point.date),
			value: index === points.length - 1 || index === 0 ? {
				text: fmt(point.sum),
				anchor: index === 0 ? "start" : "end"
			} : null
		}))
	};
}
function lineTiers(latest, history) {
	const lines = latest.lines || {}, counts = latest.n || [...history].reverse().find((item) => item.n)?.n || {};
	const all = [.../* @__PURE__ */ new Set([...Object.keys(lines), ...Object.keys(counts)])].sort(byLineOrder);
	const tier = (line) => {
		const count = counts[line]?.pace || 0;
		if (count >= 2e3) return 0;
		return count >= 300 ? 1 : 2;
	};
	return [
		[
			"충분히 배웠어요",
			"b-good",
			"값을 믿고 써요"
		],
		[
			"배우는 중",
			"b-mid",
			"며칠 더 모으면 정확해져요"
		],
		[
			"데이터 모으는 중",
			"b-low",
			"아직 대부분 기본값을 써요"
		]
	].map(([name, cls, hint], index) => ({
		name,
		cls,
		hint,
		lines: all.filter((line) => tier(line) === index).map((line) => ({
			line,
			values: lines[line] || {},
			count: counts[line]?.pace || 0
		}))
	}));
}
function stopRows(latest, line) {
	const values = latest.lines?.[line] || {}, fallback = latest.default || {}, base = values.zone ?? fallback.zone, own = values.stops || {}, got = latest.stands?.[line] || {}, names = latest.names || {};
	const rows = (latest.stations?.[line] || []).map((id) => {
		const [times, sec, runs = 0] = got[id] || [
			0,
			null,
			0
		], timed = times >= 30, count = timed ? times : runs, mine = own[id];
		let status;
		if (mine != null) status = timed ? [
			"b-good",
			"따로 배움",
			"따로"
		] : [
			"b-est",
			"도착으로 추정",
			"추정"
		];
		else status = timed || runs >= 30 ? [
			"b-mid",
			"평균과 비슷",
			"비슷"
		] : [
			"b-low",
			`모으는 중 ${count}/30`,
			`${count}/30`
		];
		return {
			name: names[id] || `역 ${id}`,
			times,
			sec,
			runs,
			own: mine != null,
			use: mine ?? base,
			base,
			status
		};
	});
	const count = (cls) => rows.filter((row) => row.status[0] === cls).length;
	return {
		rows,
		summary: `${line} ${rows.length}개 역 · 따로 배움 ${count("b-good")}${count("b-est") ? ` · 도착으로 추정 ${count("b-est")}` : ""} · 평균과 비슷 ${count("b-mid")} · 모으는 중 ${count("b-low")} · 노선 평균 ${base}초${values.zone == null ? " (기본값)" : ""}`
	};
}
function firstStopLine(latest, lines) {
	const timed = (line) => Object.values(latest.stands?.[line] || {}).filter(([times]) => times >= 30).length;
	return lines.reduce((best, line) => timed(line) > timed(best) ? line : best);
}
var CRITERIA = {
	absMedian: 15,
	p90: 30,
	bias: 10,
	stalls: 0
};
function openPass(windows, criteria) {
	return windows.filter((win) => Math.abs(win.arrive?.signedMedian) <= criteria.bias && win.arrive?.absMedian <= criteria.absMedian && win.arrive?.p90 <= criteria.p90 && Math.abs(win.depart?.signedMedian) <= criteria.bias && win.depart?.absMedian <= criteria.absMedian && win.depart?.p90 <= criteria.p90 && win.stalls?.n <= criteria.stalls).length;
}
var BUS_TYPES = {
	trunk: "간선",
	branch: "지선",
	circular: "순환",
	express: "광역",
	night: "심야"
};
export { BUS_TYPES, COLORS, CRITERIA, ENOUGH, addDay, byLineOrder, events, firstStopLine, fmt, growth, lineColor, lineTiers, md, openPass, pct, r1, scoreChart, scoreDelta, scores, sightings, stopRows };
