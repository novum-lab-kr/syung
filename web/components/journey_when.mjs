import { jsx as a } from "../npm/preact/jsx-runtime/dist/jsxRuntime.mjs";
import { Segmented } from "./segmented.mjs";
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
var UP = /* @__PURE__ */ a("svg", {
	viewBox: "0 0 24 24",
	"aria-hidden": "true",
	fill: "none",
	stroke: "currentColor",
	"stroke-width": "2.6",
	"stroke-linecap": "round",
	"stroke-linejoin": "round",
	children: /* @__PURE__ */ a("path", { d: "m6 15 6-6 6 6" })
});
var DOWN = /* @__PURE__ */ a("svg", {
	viewBox: "0 0 24 24",
	"aria-hidden": "true",
	fill: "none",
	stroke: "currentColor",
	"stroke-width": "2.6",
	"stroke-linecap": "round",
	"stroke-linejoin": "round",
	children: /* @__PURE__ */ a("path", { d: "m6 9 6 6 6-6" })
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
function StepButton({ unit, step, label, off, hold, icon }) {
	return /* @__PURE__ */ a("button", {
		type: "button",
		class: "jw-step",
		"data-u": unit,
		"data-s": String(step),
		"aria-label": label,
		disabled: off,
		onPointerDown: hold.down,
		onPointerUp: hold.stop,
		onPointerLeave: hold.stop,
		onPointerCancel: hold.stop,
		onClick: hold.click,
		onTouchStart: (event) => event.preventDefault(),
		onContextMenu: (event) => event.preventDefault(),
		children: icon
	});
}
function JourneyWhen({ text, isSet, open, draft, hold, onRow, onNow, onGo, onDay }) {
	const off = (key) => draft?.off[key] ?? false;
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
					class: "jw-clock",
					"aria-live": "polite",
					children: [
						/* @__PURE__ */ a("div", {
							class: "jw-col",
							children: [
								/* @__PURE__ */ a(StepButton, {
									unit: "h",
									step: 1,
									label: "1시간 늦게",
									off: off("h1"),
									hold: hold["h1"],
									icon: UP
								}),
								/* @__PURE__ */ a("output", {
									id: "jWhenH",
									children: draft?.hours ?? "00"
								}),
								/* @__PURE__ */ a(StepButton, {
									unit: "h",
									step: -1,
									label: "1시간 이르게",
									off: off("h-1"),
									hold: hold["h-1"],
									icon: DOWN
								})
							]
						}),
						/* @__PURE__ */ a("span", {
							class: "jw-colon",
							"aria-hidden": "true",
							children: ":"
						}),
						/* @__PURE__ */ a("div", {
							class: "jw-col",
							children: [
								/* @__PURE__ */ a(StepButton, {
									unit: "m",
									step: 1,
									label: "1분 늦게",
									off: off("m1"),
									hold: hold["m1"],
									icon: UP
								}),
								/* @__PURE__ */ a("output", {
									id: "jWhenM",
									children: draft?.minutes ?? "00"
								}),
								/* @__PURE__ */ a(StepButton, {
									unit: "m",
									step: -1,
									label: "1분 이르게",
									off: off("m-1"),
									hold: hold["m-1"],
									icon: DOWN
								})
							]
						})
					]
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
