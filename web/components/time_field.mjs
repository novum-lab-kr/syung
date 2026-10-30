import { Component as x, Fragment as M } from "../npm/preact/dist/preact.mjs";
import { jsx as a } from "../npm/preact/jsx-runtime/dist/jsxRuntime.mjs";
// web/components/time_field.tsx
var Wheels = class extends x {
	shouldComponentUpdate() {
		return false;
	}
	render() {
		return /* @__PURE__ */ a("div", {
			class: "tw-cols",
			children: [
				/* @__PURE__ */ a("div", {
					class: "tw-band",
					"aria-hidden": "true"
				}),
				/* @__PURE__ */ a("div", {
					class: "tw-col",
					"data-part": "ampm",
					role: "spinbutton",
					tabindex: 0,
					"aria-label": "오전 · 오후"
				}),
				/* @__PURE__ */ a("div", {
					class: "tw-col",
					"data-part": "hour",
					role: "spinbutton",
					tabindex: 0,
					"aria-label": "시"
				}),
				/* @__PURE__ */ a("span", {
					class: "tw-colon",
					"aria-hidden": "true",
					children: ":"
				}),
				/* @__PURE__ */ a("div", {
					class: "tw-col",
					"data-part": "minute",
					role: "spinbutton",
					tabindex: 0,
					"aria-label": "분"
				})
			]
		});
	}
};
function TimeField({ open, text, value, onToggle, onDone }) {
	return /* @__PURE__ */ a(M, { children: [
		/* @__PURE__ */ a("button", {
			id: "ticketTimeBtn",
			class: "tf-time",
			type: "button",
			"aria-expanded": open ? "true" : "false",
			"aria-controls": "ticketTimePick",
			onClick: onToggle,
			children: [
				/* @__PURE__ */ a("span", { children: "출발 시각" }),
				/* @__PURE__ */ a("b", {
					id: "ticketTimeText",
					children: text && /* @__PURE__ */ a(M, { children: [/* @__PURE__ */ a("em", { children: text.ampm }), ` ${text.clock}`] })
				}),
				/* @__PURE__ */ a("svg", {
					class: "tf-chev",
					viewBox: "0 0 24 24",
					"aria-hidden": "true",
					fill: "none",
					stroke: "currentColor",
					"stroke-width": "2.2",
					"stroke-linecap": "round",
					"stroke-linejoin": "round",
					children: /* @__PURE__ */ a("path", { d: "m6 9 6 6 6-6" })
				})
			]
		}),
		/* @__PURE__ */ a("input", {
			id: "ticketTime",
			type: "hidden",
			value
		}),
		/* @__PURE__ */ a("div", {
			id: "ticketTimePick",
			class: "tf-wheel",
			hidden: !open,
			children: [/* @__PURE__ */ a(Wheels, {}), /* @__PURE__ */ a("div", {
				class: "tw-foot",
				children: [/* @__PURE__ */ a("span", { children: "돌려서 고르기 · 5분 단위" }), /* @__PURE__ */ a("button", {
					id: "ticketTimeDone",
					class: "tw-ok",
					type: "button",
					onClick: onDone,
					children: "완료"
				})]
			})]
		})
	] });
}
export { TimeField };
