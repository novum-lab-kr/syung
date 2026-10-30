import { routeTrack } from "../lib/journey-ui.mjs";
import { Fragment as M } from "../npm/preact/dist/preact.mjs";
import { jsx as a } from "../npm/preact/jsx-runtime/dist/jsxRuntime.mjs";
import { StepList } from "./step_list.mjs";
import { RouteLoading } from "./route_card.mjs";
import { Segmented } from "./segmented.mjs";
import { esc } from "../user/ticket_routes.mjs";
import { RouteHead } from "./route_head.mjs";
import { SaveButton } from "./save_button.mjs";
// web/components/route_picker.tsx
function planHTML(plan, colors) {
	return `<i class="rt-radio" aria-hidden="true"></i><span class="rt-b"><span class="jp-top"><strong class="jp-min"><small>약 </small>${plan.minutes}<small>분</small></strong>${plan.tag ? `<span class="jp-tag">${esc(plan.tag)}</span>` : ""}</span>${routeTrack(plan, colors, 250)}</span>`;
}
function RoutePicker({ when, from, to, filter, rows, colors, message, loading, onKind, onPlan, onSteps, onPick }) {
	return /* @__PURE__ */ a(M, { children: [
		/* @__PURE__ */ a(RouteHead, {
			when,
			from,
			to
		}),
		filter && /* @__PURE__ */ a("div", {
			class: "rt-filters",
			children: /* @__PURE__ */ a(Segmented, {
				label: "경로 종류",
				class: "jkinds",
				attr: "k",
				items: filter.kinds.map((tab) => ({
					id: tab.kind,
					name: tab.name,
					count: tab.count,
					pressed: tab.pressed
				})),
				onPick: (kind) => onKind?.(kind)
			})
		}),
		/* @__PURE__ */ a("div", {
			id: "routeList",
			class: "rt-list",
			role: "radiogroup",
			"aria-label": "경로",
			children: rows.map(({ index, plan, chosen, steps }) => /* @__PURE__ */ a("div", {
				class: "rt-item",
				children: [/* @__PURE__ */ a("div", {
					class: "rt-card",
					children: [/* @__PURE__ */ a("button", {
						type: "button",
						class: "rt-plan",
						role: "radio",
						"aria-checked": chosen ? "true" : "false",
						"aria-label": `${plan.tag || "경로"} 약 ${plan.minutes}분, 환승 ${plan.transfers}번`,
						onClick: () => onPlan?.(index),
						dangerouslySetInnerHTML: { __html: planHTML(plan, colors) }
					}), /* @__PURE__ */ a("button", {
						type: "button",
						class: "rt-open",
						"aria-expanded": steps ? "true" : "false",
						"aria-label": "경로 자세히 보기",
						onClick: () => onSteps?.(plan),
						children: /* @__PURE__ */ a("svg", {
							viewBox: "0 0 24 24",
							width: "16",
							height: "16",
							"aria-hidden": "true",
							fill: "none",
							stroke: "currentColor",
							"stroke-width": "2.6",
							"stroke-linecap": "round",
							"stroke-linejoin": "round",
							children: /* @__PURE__ */ a("path", { d: "m6 9 6 6 6-6" })
						})
					})]
				}), steps && /* @__PURE__ */ a("div", {
					class: "rt-steps",
					children: [/* @__PURE__ */ a("p", {
						class: "jp-meta",
						children: `환승 ${plan.transfers}번 · 걷기 ${plan.walkMinutes}분`
					}), /* @__PURE__ */ a(StepList, {
						steps,
						className: "jsteps shown"
					})]
				})]
			}))
		}),
		filter?.empty && /* @__PURE__ */ a("div", {
			class: "rt-empty",
			children: [/* @__PURE__ */ a("b", { children: filter.empty }), /* @__PURE__ */ a("p", { children: "다른 조건을 골라 보세요" })]
		}),
		/* @__PURE__ */ a("p", {
			id: "routeMsg",
			class: "account-msg",
			role: "status",
			"aria-live": "polite",
			children: message
		}),
		loading && /* @__PURE__ */ a(RouteLoading, {}),
		/* @__PURE__ */ a("div", {
			class: "rt-foot",
			hidden: !rows.length,
			children: /* @__PURE__ */ a(SaveButton, {
				id: "routePick",
				onClick: () => onPick?.(),
				children: "이 경로로"
			})
		})
	] });
}
export { RoutePicker };
