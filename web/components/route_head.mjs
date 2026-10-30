import { jsx as a } from "../npm/preact/jsx-runtime/dist/jsxRuntime.mjs";
// web/components/route_head.tsx
function RouteHead({ when, from, to }) {
	return /* @__PURE__ */ a("div", {
		class: "rt-sum",
		children: [when && /* @__PURE__ */ a("div", {
			class: "rt-cal",
			id: "routeWhen",
			"aria-label": `${when.month}월 ${when.day}일 ${when.weekday}`,
			children: [
				/* @__PURE__ */ a("span", {
					class: "rt-month",
					children: [when.month, "월"]
				}),
				/* @__PURE__ */ a("b", {
					class: "rt-day",
					children: when.day
				}),
				/* @__PURE__ */ a("span", {
					class: "rt-wd",
					children: when.weekday
				})
			]
		}), /* @__PURE__ */ a("div", {
			class: "rt-trip",
			children: [
				/* @__PURE__ */ a("p", {
					class: "rt-origin",
					children: [/* @__PURE__ */ a("b", {
						id: "routeFrom",
						children: from
					}), "에서"]
				}),
				/* @__PURE__ */ a("p", {
					class: "rt-dest",
					children: [/* @__PURE__ */ a("b", {
						id: "routeTo",
						children: to
					}), /* @__PURE__ */ a("span", {
						class: "rt-to-sfx",
						children: "까지"
					})]
				}),
				when && /* @__PURE__ */ a("p", {
					class: "rt-time",
					children: [/* @__PURE__ */ a("b", { children: [when.time, " 출발"] }), /* @__PURE__ */ a("span", { children: "이 시각 출발 기준으로 찾은 경로" })]
				})
			]
		})]
	});
}
export { RouteHead };
