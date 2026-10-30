import { Fragment as M } from "../npm/preact/dist/preact.mjs";
import { jsx as a } from "../npm/preact/jsx-runtime/dist/jsxRuntime.mjs";
import { DAYS } from "../user/ticket_routes.mjs";
// web/components/day_picker.tsx
var QUICK = [
	["1,2,3,4,5", "평일"],
	["6,7", "주말"],
	["1,2,3,4,5,6,7", "매일"]
];
function DayPicker({ days, onDay, onQuick }) {
	const quickNow = days.join(",");
	return /* @__PURE__ */ a(M, { children: [/* @__PURE__ */ a("div", {
		class: "tf-dh",
		children: [/* @__PURE__ */ a("span", {
			id: "ticketDaysLabel",
			class: "tf-l",
			children: "타는 날"
		}), /* @__PURE__ */ a("span", {
			id: "ticketQuick",
			class: "tf-quick",
			role: "group",
			"aria-label": "타는 날 빠르게 고르기",
			children: QUICK.map(([value, label]) => /* @__PURE__ */ a("button", {
				type: "button",
				"data-quick": value,
				"aria-pressed": quickNow === value ? "true" : "false",
				onClick: () => onQuick(value),
				children: /* @__PURE__ */ a("i", { children: label })
			}))
		})]
	}), /* @__PURE__ */ a("div", {
		id: "ticketDays",
		class: "tf-days",
		role: "group",
		"aria-labelledby": "ticketDaysLabel",
		children: DAYS.map((label, index) => /* @__PURE__ */ a("button", {
			type: "button",
			"data-day": index + 1,
			"aria-pressed": days.includes(index + 1) ? "true" : "false",
			onClick: () => onDay(index + 1),
			children: label
		}))
	})] });
}
export { DayPicker };
