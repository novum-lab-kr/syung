import { render as K } from "../npm/preact/dist/preact.mjs";
import { jsx as a } from "../npm/preact/jsx-runtime/dist/jsxRuntime.mjs";
// web/components/ride_card.tsx
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
function RideCard({ view, actions }) {
	return /* @__PURE__ */ a("div", {
		class: "rg-stack",
		children: [
			!view.following && /* @__PURE__ */ a("button", {
				type: "button",
				class: "sheet-follow rg-follow",
				onClick: actions.follow,
				children: "다시 따라가기"
			}),
			/* @__PURE__ */ a("div", {
				class: "rg-talk",
				role: "status",
				"aria-live": "polite",
				children: [
					/* @__PURE__ */ a("b", { children: view.title }),
					view.say && /* @__PURE__ */ a("p", {
						class: "rg-said",
						children: /* @__PURE__ */ a("span", {
							class: "rg-pen",
							children: view.say
						})
					}),
					/* @__PURE__ */ a("small", { children: view.detour ? /* @__PURE__ */ a("a", {
						href: "#",
						class: "rg-detour",
						onClick: (event) => {
							event.preventDefault();
							actions.detour();
						},
						children: "다른 길 찾기 ›"
					}) : view.sub }),
					/* @__PURE__ */ a("button", {
						type: "button",
						class: "rg-x",
						"aria-label": "타고 가기 끝내기",
						title: "타고 가기 끝내기",
						onClick: actions.close,
						children: CLOSE
					})
				]
			}),
			/* @__PURE__ */ a("i", {
				class: view.flip ? "rg-sprout flip" : "rg-sprout",
				"aria-hidden": "true",
				style: `background-image:url("./brand/characters/${view.image}")`
			})
		]
	});
}
var drawRideCard = (host, view, actions) => K(view ? /* @__PURE__ */ a(RideCard, {
	view,
	actions
}) : null, host);
export { RideCard, drawRideCard };
