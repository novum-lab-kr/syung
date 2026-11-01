import { jsx as a } from "../npm/preact/jsx-runtime/dist/jsxRuntime.mjs";
import { Segmented } from "./segmented.mjs";
import { TimeWheels } from "./time_field.mjs";
// web/components/journey_when.tsx
var CHEV = /* @__PURE__ */ a("svg", {
	class: "jw-chev",
	viewBox: "0 0 24 24",
	"aria-hidden": "true",
	fill: "none",
	stroke: "currentColor",
	"stroke-width": "2.2",
	"stroke-linecap": "round",
	"stroke-linejoin": "round",
	children: /* @__PURE__ */ a("path", { d: "m9 6 6 6-6 6" })
});
var CLOCK = /* @__PURE__ */ a("svg", {
	viewBox: "0 0 24 24",
	"aria-hidden": "true",
	fill: "none",
	stroke: "currentColor",
	"stroke-width": "2",
	"stroke-linecap": "round",
	children: [/* @__PURE__ */ a("circle", {
		cx: "12",
		cy: "12",
		r: "8.5"
	}), /* @__PURE__ */ a("path", { d: "M12 7.5V12l3 2" })]
});
function JourneyWhen({ text, isSet, open, draft, onRow, onNow, onGo, onDay }) {
	return /* @__PURE__ */ a("div", {
		class: "jopts jwhen",
		children: [/* @__PURE__ */ a("button", {
			type: "button",
			class: isSet ? "jw-row set" : "jw-row",
			id: "jWhenRow",
			"aria-expanded": open,
			"aria-controls": "jWhenPanel",
			onClick: onRow,
			children: [
				CLOCK,
				/* @__PURE__ */ a("span", {
					id: "jWhenText",
					children: text
				}),
				CHEV
			]
		}), /* @__PURE__ */ a("div", {
			class: "jw-panel",
			id: "jWhenPanel",
			hidden: !open,
			children: [
				/* @__PURE__ */ a("div", {
					class: "jw-head",
					children: [/* @__PURE__ */ a("b", { children: "출발 시각" }), /* @__PURE__ */ a("button", {
						type: "button",
						class: "jw-now",
						id: "jWhenNow",
						onClick: onNow,
						children: "지금으로"
					})]
				}),
				/* @__PURE__ */ a(Segmented, {
					label: "날짜",
					class: "jw-day",
					attr: "d",
					items: [{
						id: "0",
						name: "오늘",
						pressed: !(draft?.tomorrow ?? false)
					}, {
						id: "1",
						name: "내일",
						pressed: draft?.tomorrow ?? false
					}],
					onPick: (day) => onDay(Number(day))
				}),
				/* @__PURE__ */ a("div", {
					class: "tf-wheel jw-wheel",
					id: "jWhenWheel",
					children: /* @__PURE__ */ a(TimeWheels, {})
				}),
				/* @__PURE__ */ a("button", {
					type: "button",
					class: "jw-go",
					id: "jWhenGo",
					onClick: onGo,
					children: "이 시간에 출발"
				})
			]
		})]
	});
}
export { JourneyWhen };
