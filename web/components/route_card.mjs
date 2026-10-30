import { Fragment as M } from "../npm/preact/dist/preact.mjs";
import { jsx as a } from "../npm/preact/jsx-runtime/dist/jsxRuntime.mjs";
import { Chip } from "./chip.mjs";
import { BUS } from "./icons.mjs";
import { StepList } from "./step_list.mjs";
// web/components/route_card.tsx
function Track({ segs }) {
	return /* @__PURE__ */ a("div", {
		class: "jtrack",
		"aria-hidden": "true",
		children: segs.map((seg) => seg.k !== "ride" ? /* @__PURE__ */ a("i", {
			class: `jseg ${seg.k}`,
			style: `flex:${seg.flex} 1 0`
		}) : /* @__PURE__ */ a("i", {
			class: seg.bus ? "jseg ride bus" : "jseg ride",
			style: `flex:${seg.flex} 1 0;min-width:${seg.need}px;--c:${seg.color};--t:${seg.ink}`,
			children: [seg.icon && BUS, seg.label]
		}))
	});
}
var CARD_ROLE = { role: "button" };
function RouteCard({ plan, index, on, hidden = false, onPick }) {
	const duration = plan.duration;
	return /* @__PURE__ */ a("article", {
		class: on ? "jp on" : "jp",
		"data-i": String(index),
		tabIndex: 0,
		...CARD_ROLE,
		"aria-label": plan.aria,
		"aria-expanded": on,
		hidden,
		onClick: () => onPick(index),
		onKeyDown: (event) => {
			if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) {
				event.preventDefault();
				event.currentTarget.click();
			}
		},
		children: [
			/* @__PURE__ */ a("div", {
				class: "jp-top",
				children: [
					/* @__PURE__ */ a("strong", {
						class: "jp-min",
						children: duration.hours !== null ? /* @__PURE__ */ a(M, { children: [
							`${duration.hours}`,
							/* @__PURE__ */ a("small", { children: "시간" }),
							` ${duration.minutes}`,
							/* @__PURE__ */ a("small", { children: "분" })
						] }) : /* @__PURE__ */ a(M, { children: [`${duration.minutes}`, /* @__PURE__ */ a("small", { children: "분" })] })
					}),
					/* @__PURE__ */ a("span", {
						class: "jp-arr",
						children: plan.arrive
					}),
					plan.tag !== null && /* @__PURE__ */ a(Chip, {
						kind: "tag",
						children: plan.tag
					})
				]
			}),
			/* @__PURE__ */ a(Track, { segs: plan.track }),
			on && /* @__PURE__ */ a("p", {
				class: "jp-meta",
				children: [plan.meta, plan.live && /* @__PURE__ */ a("span", {
					class: "jp-live",
					children: "실시간"
				})]
			}),
			/* @__PURE__ */ a(StepList, {
				steps: plan.steps,
				className: "jsteps"
			})
		]
	});
}
function RouteLoading() {
	return /* @__PURE__ */ a("div", {
		class: "jload",
		"aria-hidden": "true",
		children: [
			0,
			1,
			2
		].map((row) => /* @__PURE__ */ a("div", {
			class: "jsk",
			children: [
				/* @__PURE__ */ a("i", { class: "jsk-min" }),
				/* @__PURE__ */ a("div", {
					class: "jsk-track",
					children: row === 0 && /* @__PURE__ */ a("span", {
						class: "jsk-run",
						children: /* @__PURE__ */ a("i", {})
					})
				}),
				/* @__PURE__ */ a("i", { class: "jsk-meta" })
			]
		}))
	});
}
export { RouteCard, RouteLoading, Track };
