import { jsx as a } from "../npm/preact/jsx-runtime/dist/jsxRuntime.mjs";
// web/components/journey_fields.tsx
var PIN = /* @__PURE__ */ a("svg", {
	viewBox: "0 0 24 24",
	"aria-hidden": "true",
	fill: "none",
	stroke: "currentColor",
	"stroke-width": "2",
	"stroke-linecap": "round",
	children: [
		/* @__PURE__ */ a("circle", {
			cx: "12",
			cy: "12",
			r: "3.2"
		}),
		/* @__PURE__ */ a("path", { d: "M12 2v3M12 19v3M2 12h3M19 12h3" }),
		/* @__PURE__ */ a("circle", {
			cx: "12",
			cy: "12",
			r: "7.5"
		})
	]
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
function JourneyFields({ here, fromValue, toValue, onTyped, onHere, onSwap }) {
	return /* @__PURE__ */ a("div", {
		class: "jcard",
		children: [
			/* @__PURE__ */ a("div", {
				class: "jf jrow",
				children: [
					/* @__PURE__ */ a("i", {
						class: "jdot from",
						"aria-hidden": "true"
					}),
					/* @__PURE__ */ a("input", {
						id: "jFrom",
						type: "text",
						autocomplete: "off",
						"aria-label": "출발지",
						placeholder: "어디서 출발할까요?",
						defaultValue: fromValue,
						onInput: (event) => onTyped("from", event.currentTarget.value)
					}),
					here && /* @__PURE__ */ a("button", {
						type: "button",
						class: "jf-here",
						id: "jHere",
						"aria-label": "내 위치에서 출발",
						title: "내 위치",
						onClick: onHere,
						children: PIN
					})
				]
			}),
			/* @__PURE__ */ a("div", {
				class: "jf jrow",
				children: [/* @__PURE__ */ a("i", {
					class: "jdot to",
					"aria-hidden": "true"
				}), /* @__PURE__ */ a("input", {
					id: "jTo",
					type: "text",
					autocomplete: "off",
					"aria-label": "도착지",
					placeholder: "어디로 갈까요?",
					defaultValue: toValue,
					onInput: (event) => onTyped("to", event.currentTarget.value)
				})]
			}),
			/* @__PURE__ */ a("button", {
				type: "button",
				class: "jswap",
				id: "jSwap",
				"aria-label": "출발지와 도착지 바꾸기",
				title: "바꾸기",
				onClick: onSwap,
				children: SWAP
			})
		]
	});
}
function JourneyPlaceList({ id, label, list, onPick }) {
	return /* @__PURE__ */ a("ul", {
		class: "jf-list",
		id,
		"aria-label": label,
		hidden: list.hidden,
		children: list.empty !== null ? /* @__PURE__ */ a("li", {
			class: "jf-empty",
			children: list.empty
		}) : list.places.map((place) => /* @__PURE__ */ a("li", { children: /* @__PURE__ */ a("button", {
			type: "button",
			onClick: () => onPick(place),
			children: [/* @__PURE__ */ a("b", { children: place.name }), /* @__PURE__ */ a("small", { children: place.address })]
		}) }))
	});
}
export { JourneyFields, JourneyPlaceList };
