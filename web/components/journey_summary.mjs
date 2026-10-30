import { Fragment as M } from "../npm/preact/dist/preact.mjs";
import { jsx as a } from "../npm/preact/jsx-runtime/dist/jsxRuntime.mjs";
import { Track } from "./route_card.mjs";
// web/components/journey_summary.tsx
var EDIT = /* @__PURE__ */ a("svg", {
	viewBox: "0 0 24 24",
	"aria-hidden": "true",
	fill: "none",
	stroke: "currentColor",
	"stroke-width": "2",
	"stroke-linecap": "round",
	"stroke-linejoin": "round",
	children: [/* @__PURE__ */ a("path", { d: "M4 20h4L19 9l-4-4L4 16z" }), /* @__PURE__ */ a("path", { d: "m13.5 6.5 4 4" })]
});
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
function JourneySummary({ hidden, summary, onOpen }) {
	return /* @__PURE__ */ a("button", {
		type: "button",
		class: "jsum",
		id: "jSum",
		hidden,
		"aria-label": summary?.aria,
		onClick: onOpen,
		children: summary && /* @__PURE__ */ a(M, { children: [/* @__PURE__ */ a("span", {
			class: "jsum-trip",
			children: [/* @__PURE__ */ a("span", {
				class: "jsum-end",
				children: [/* @__PURE__ */ a("i", { class: "jdot from" }), /* @__PURE__ */ a("b", { children: summary.from })]
			}), /* @__PURE__ */ a("span", {
				class: "jsum-end",
				children: [/* @__PURE__ */ a("i", { class: "jdot to" }), /* @__PURE__ */ a("b", { children: summary.to })]
			})]
		}), /* @__PURE__ */ a("span", {
			class: "jsum-side",
			children: [/* @__PURE__ */ a("span", {
				class: "jsum-when",
				children: summary.when
			}), /* @__PURE__ */ a("span", {
				class: "jsum-edit",
				children: [EDIT, "수정"]
			})]
		})] })
	});
}
function JourneyBar({ bar, onOpen, onClear }) {
	const duration = bar?.duration;
	return /* @__PURE__ */ a(M, { children: [/* @__PURE__ */ a("button", {
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
	}), /* @__PURE__ */ a("button", {
		type: "button",
		class: "jbar-x",
		"aria-label": "경로 지우기",
		title: "경로 지우기",
		onClick: onClear,
		children: CLOSE
	})] });
}
export { JourneyBar, JourneySummary };
