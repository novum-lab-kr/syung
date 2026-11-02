import { Fragment as M } from "../npm/preact/dist/preact.mjs";
import { jsx as a } from "../npm/preact/jsx-runtime/dist/jsxRuntime.mjs";
import { Track } from "./route_card.mjs";
// web/components/journey_summary.tsx
var CLOSE = /* @__PURE__ */ a("svg", {
	viewBox: "0 0 24 24",
	width: "16",
	height: "16",
	"aria-hidden": "true",
	fill: "none",
	stroke: "currentColor",
	"stroke-width": "2.2",
	"stroke-linecap": "round",
	children: /* @__PURE__ */ a("path", { d: "M6 6l12 12M18 6 6 18" })
});
var SWAP = /* @__PURE__ */ a("svg", {
	viewBox: "0 0 24 24",
	"aria-hidden": "true",
	fill: "none",
	stroke: "currentColor",
	"stroke-width": "2",
	"stroke-linecap": "round",
	"stroke-linejoin": "round",
	children: /* @__PURE__ */ a("path", { d: "M8 4v16M4 8l4-4 4 4M16 20V4M12 16l4 4 4-4" })
});
function JourneySummary({ summary, onEnd, onSwap }) {
	return /* @__PURE__ */ a("div", {
		class: "jsum",
		id: "jSum",
		role: "group",
		"aria-label": summary?.aria,
		children: [summary && /* @__PURE__ */ a("span", {
			class: "jsum-trip",
			children: [/* @__PURE__ */ a("button", {
				type: "button",
				class: "jsum-end",
				"aria-label": `출발 ${summary.from} 바꾸기`,
				onClick: () => onEnd("from"),
				children: [/* @__PURE__ */ a("i", { class: "jdot from" }), /* @__PURE__ */ a("b", { children: summary.from })]
			}), /* @__PURE__ */ a("button", {
				type: "button",
				class: "jsum-end",
				"aria-label": `도착 ${summary.to} 바꾸기`,
				onClick: () => onEnd("to"),
				children: [/* @__PURE__ */ a("i", { class: "jdot to" }), /* @__PURE__ */ a("b", { children: summary.to })]
			})]
		}), summary && onSwap && /* @__PURE__ */ a("button", {
			type: "button",
			class: "jsum-swap",
			id: "jSwap",
			"aria-label": "출발지와 도착지 바꾸기",
			title: "바꾸기",
			onClick: onSwap,
			children: SWAP
		})]
	});
}
function JourneyBar({ bar, onOpen, onClear, onFresh }) {
	const duration = bar?.duration;
	return /* @__PURE__ */ a(M, { children: [
		/* @__PURE__ */ a("button", {
			type: "button",
			class: "jbar-open",
			"aria-label": "경로 결과 다시 보기",
			onClick: onOpen,
			children: bar && /* @__PURE__ */ a(M, { children: [/* @__PURE__ */ a("span", {
				class: "jbar-top",
				children: [/* @__PURE__ */ a("b", { children: duration.hours !== null ? /* @__PURE__ */ a(M, { children: [
					`${duration.hours}`,
					/* @__PURE__ */ a("small", { children: "시간" }),
					` ${duration.minutes}`,
					/* @__PURE__ */ a("small", { children: "분" })
				] }) : /* @__PURE__ */ a(M, { children: [`${duration.minutes}`, /* @__PURE__ */ a("small", { children: "분" })] }) }), /* @__PURE__ */ a("span", { children: `${bar.arrives} 도착` })]
			}), /* @__PURE__ */ a(Track, { segs: bar.track })] })
		}),
		onFresh && /* @__PURE__ */ a("button", {
			type: "button",
			class: "jbar-new",
			onClick: onFresh,
			children: "새로 찾기"
		}),
		/* @__PURE__ */ a("button", {
			type: "button",
			class: "jbar-x",
			"aria-label": "경로 지우기",
			title: "경로 지우기",
			onClick: onClear,
			children: CLOSE
		})
	] });
}
export { JourneyBar, JourneySummary };
