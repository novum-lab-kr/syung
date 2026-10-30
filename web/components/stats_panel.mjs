import { Fragment as M } from "../npm/preact/dist/preact.mjs";
import { jsx as a } from "../npm/preact/jsx-runtime/dist/jsxRuntime.mjs";
// web/components/stats_panel.tsx
var FARE_REASONS = {
	route: "고른 경로가 없는 승차권",
	distance: "공식 거리 자료가 없는 노선",
	outside: "수도권 밖 구간",
	extra: "추가 운임 노선(신분당선 · 의정부경전철 · 공항철도 영종 구간)",
	bus: "요금 · 거리 자료가 없는 버스",
	none: "전철 · 버스를 타지 않는 승차권"
};
var won = (count) => `${count.toLocaleString("ko-KR")}원`;
var StatCell = ({ value, label }) => /* @__PURE__ */ a("div", {
	class: "st-cell",
	children: [/* @__PURE__ */ a("b", { children: value }), /* @__PURE__ */ a("small", { children: label })]
});
function StatsPanel({ stats }) {
	const most = Math.max(1, ...stats.daily.map((day) => day.open + day.route + day.ticket)), fare = stats.fare, [, month] = fare.month.split("-").map(Number);
	const why = Object.entries(fare.reasons).map(([key, count]) => `${FARE_REASONS[key] || key} ${count}장`).join(" · ");
	return /* @__PURE__ */ a(M, { children: [
		/* @__PURE__ */ a("div", {
			class: "st-grid",
			children: [
				/* @__PURE__ */ a(StatCell, {
					value: `${stats.daysTogether}일`,
					label: "함께한 날"
				}),
				/* @__PURE__ */ a(StatCell, {
					value: `${stats.tickets}장`,
					label: "승차권"
				}),
				/* @__PURE__ */ a(StatCell, {
					value: `${stats.recent.openDays}일`,
					label: `최근 ${stats.recent.days}일 슝 연 날`
				}),
				/* @__PURE__ */ a(StatCell, {
					value: `${stats.recent.route}번`,
					label: `최근 ${stats.recent.days}일 길찾기`
				})
			]
		}),
		/* @__PURE__ */ a("div", {
			class: "st-bars",
			role: "img",
			"aria-label": `최근 ${stats.recent.days}일 날짜별 사용 횟수`,
			children: stats.daily.map((day) => {
				const count = day.open + day.route + day.ticket, [, dayMonth, date] = day.day.split("-").map(Number);
				return /* @__PURE__ */ a("i", {
					style: `height:${count ? Math.max(8, Math.round(count / most * 100)) : 0}%`,
					title: `${dayMonth}월 ${date}일 · ${count}번`
				});
			})
		}),
		/* @__PURE__ */ a("p", {
			class: "st-note",
			children: `한 주에 타는 횟수 ${stats.weeklyRides}번 · 승차권 본 횟수 ${stats.recent.ticket}번(최근 ${stats.recent.days}일)`
		}),
		stats.tickets ? /* @__PURE__ */ a("div", {
			class: "st-fare",
			children: [
				/* @__PURE__ */ a("div", {
					class: "st-fare-top",
					children: [/* @__PURE__ */ a("span", { children: `${month}월 예상 교통비` }), /* @__PURE__ */ a("b", { children: won(fare.total) })]
				}),
				/* @__PURE__ */ a("p", {
					class: "st-note",
					children: "승차권대로 다 탄다고 가정한 예상이에요"
				}),
				fare.tickets.length > 0 && /* @__PURE__ */ a("ul", {
					class: "st-fare-list",
					children: fare.tickets.map((ticket) => /* @__PURE__ */ a("li", { children: [
						/* @__PURE__ */ a("span", { children: ticket.name }),
						/* @__PURE__ */ a("small", { children: `${won(ticket.fare)} × ${ticket.rides}번` }),
						/* @__PURE__ */ a("b", { children: won(ticket.monthly) })
					] }))
				}),
				fare.skipped ? /* @__PURE__ */ a("p", {
					class: "st-skip",
					children: `${fare.skipped}장 계산 못 함${why ? ` — ${why}` : ""}`
				}) : null,
				/* @__PURE__ */ a("p", {
					class: "st-note",
					children: "교통카드 어른 요금 · 고른 경로 거리 기준이에요. 갈아타는 시간 · 정기권 · 공휴일은 넣지 않았어요."
				})
			]
		}) : null
	] });
}
export { StatCell, StatsPanel };
