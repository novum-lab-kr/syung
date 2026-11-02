import { distanceText, inkOn } from "../lib/place-search.mjs";
import { Fragment as M } from "../npm/preact/dist/preact.mjs";
import { jsx as a } from "../npm/preact/jsx-runtime/dist/jsxRuntime.mjs";
// web/components/place_search.tsx
var SEARCH = /* @__PURE__ */ a("svg", {
	viewBox: "0 0 24 24",
	width: "20",
	height: "20",
	"aria-hidden": "true",
	fill: "none",
	stroke: "currentColor",
	"stroke-width": "2.4",
	"stroke-linecap": "round",
	children: [/* @__PURE__ */ a("circle", {
		cx: "11",
		cy: "11",
		r: "7"
	}), /* @__PURE__ */ a("path", { d: "m16 16 5 5" })]
});
var CLEAR = /* @__PURE__ */ a("svg", {
	viewBox: "0 0 24 24",
	width: "18",
	height: "18",
	"aria-hidden": "true",
	fill: "none",
	stroke: "currentColor",
	"stroke-width": "2.4",
	"stroke-linecap": "round",
	children: /* @__PURE__ */ a("path", { d: "M6 6l12 12M18 6 6 18" })
});
var PIN = /* @__PURE__ */ a("svg", {
	viewBox: "0 0 24 24",
	width: "22",
	height: "22",
	"aria-hidden": "true",
	fill: "none",
	stroke: "currentColor",
	"stroke-width": "2",
	"stroke-linejoin": "round",
	children: [/* @__PURE__ */ a("path", { d: "M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21z" }), /* @__PURE__ */ a("circle", {
		cx: "12",
		cy: "9.5",
		r: "2.4"
	})]
});
var TRAIN = /* @__PURE__ */ a("svg", {
	viewBox: "0 0 24 24",
	width: "22",
	height: "22",
	"aria-hidden": "true",
	fill: "none",
	stroke: "currentColor",
	"stroke-width": "2",
	"stroke-linecap": "round",
	"stroke-linejoin": "round",
	children: [
		/* @__PURE__ */ a("rect", {
			x: "5",
			y: "3.5",
			width: "14",
			height: "14",
			rx: "3.5"
		}),
		/* @__PURE__ */ a("path", { d: "M5 11h14M9 21l2-3.5M15 21l-2-3.5" }),
		/* @__PURE__ */ a("path", { d: "M9 14.5h.01M15 14.5h.01" })
	]
});
var HERE = /* @__PURE__ */ a("svg", {
	viewBox: "0 0 24 24",
	width: "22",
	height: "22",
	"aria-hidden": "true",
	fill: "none",
	stroke: "currentColor",
	"stroke-width": "2",
	"stroke-linecap": "round",
	children: [
		/* @__PURE__ */ a("circle", {
			cx: "12",
			cy: "12",
			r: "6.5"
		}),
		/* @__PURE__ */ a("circle", {
			cx: "12",
			cy: "12",
			r: "2"
		}),
		/* @__PURE__ */ a("path", { d: "M12 2.5v3M12 18.500v3M2.500 12h3M18.500 12h3" })
	]
});
var PLACE_SEARCH_LABEL = "장소 검색";
var noop = () => {};
function PlaceSearchField({ value = "", label = PLACE_SEARCH_LABEL, onInput = noop, onClear = noop, onEnter = noop }) {
	return /* @__PURE__ */ a("div", {
		class: "ps-field",
		children: [
			SEARCH,
			/* @__PURE__ */ a("input", {
				id: "placeInput",
				type: "text",
				autocomplete: "off",
				"aria-label": label,
				enterkeyhint: "go",
				placeholder: PLACE_SEARCH_LABEL,
				value,
				onInput: (event) => onInput(event.currentTarget.value),
				onKeyDown: (event) => {
					if (event.key === "Enter" && !event.isComposing) onEnter();
				}
			}),
			value && /* @__PURE__ */ a("button", {
				type: "button",
				class: "ps-clear",
				"aria-label": "지우기",
				onClick: onClear,
				children: CLEAR
			})
		]
	});
}
function Marked({ name, query }) {
	const wanted = name.includes(query) ? query : query.replace(/역$/, ""), at = wanted ? name.indexOf(wanted) : -1;
	if (at < 0) return /* @__PURE__ */ a("b", { children: name });
	return /* @__PURE__ */ a("b", { children: [
		name.slice(0, at),
		/* @__PURE__ */ a("mark", { children: wanted }),
		name.slice(at + wanted.length)
	] });
}
var Chips = ({ hit }) => /* @__PURE__ */ a("span", {
	class: "ps-chips",
	children: hit.lines.map((line) => /* @__PURE__ */ a("i", {
		style: `--c:${line.color};--t:${inkOn(line.color)}`,
		children: line.name
	}))
});
var PlaceRow = ({ hit, query, onPick = noop }) => /* @__PURE__ */ a("button", {
	type: "button",
	class: "ps-row",
	onClick: () => onPick(hit),
	children: [/* @__PURE__ */ a("span", {
		class: hit.lines ? "ps-tile station" : "ps-tile",
		children: hit.lines ? TRAIN : PIN
	}), /* @__PURE__ */ a("span", {
		class: "ps-text",
		children: [/* @__PURE__ */ a(Marked, {
			name: hit.name,
			query
		}), hit.lines ? /* @__PURE__ */ a(Chips, { hit }) : /* @__PURE__ */ a("small", { children: [hit.address, hit.metres === void 0 ? "" : distanceText(hit.metres)].filter(Boolean).join(" · ") })]
	})]
});
var PlaceList = ({ hits, query, onPick, here }) => /* @__PURE__ */ a("ul", {
	class: "ps-list",
	"aria-label": "찾은 곳",
	children: [here && /* @__PURE__ */ a("li", { children: here }), hits.map((hit) => /* @__PURE__ */ a("li", { children: /* @__PURE__ */ a(PlaceRow, {
		hit,
		query,
		...onPick ? { onPick } : {}
	}) }))]
});
var PlaceHereRow = ({ onPick }) => /* @__PURE__ */ a("button", {
	type: "button",
	class: "ps-row",
	onClick: onPick,
	children: [/* @__PURE__ */ a("span", {
		class: "ps-tile",
		children: HERE
	}), /* @__PURE__ */ a("span", {
		class: "ps-text",
		children: /* @__PURE__ */ a("b", { children: "내 위치" })
	})]
});
var PlaceEmpty = ({ query, failed = false, onRetry }) => /* @__PURE__ */ a("div", {
	class: "ps-empty",
	children: [
		/* @__PURE__ */ a("img", {
			src: "./brand/syung-light.svg",
			alt: "",
			width: 47,
			height: 47
		}),
		failed && /* @__PURE__ */ a(M, { children: [
			/* @__PURE__ */ a("b", { children: "검색하지 못했어요" }),
			/* @__PURE__ */ a("small", { children: "잠시 뒤 다시 찾아 보세요" }),
			onRetry && /* @__PURE__ */ a("button", {
				type: "button",
				class: "ps-retry",
				onClick: onRetry,
				children: "다시 찾기"
			})
		] }),
		!failed && query && /* @__PURE__ */ a(M, { children: [/* @__PURE__ */ a("b", { children: "찾는 곳이 없어요" }), /* @__PURE__ */ a("small", { children: [
			"「",
			query,
			"」 대신 다른 이름으로 찾아 보세요"
		] })] }),
		!failed && !query && /* @__PURE__ */ a(M, { children: [/* @__PURE__ */ a("b", { children: "어디든 슝!" }), /* @__PURE__ */ a("small", { children: "역이나 장소 이름을 적어 보세요" })] })
	]
});
var MIN_ASK = 2;
var PlaceSearch = ({ title = "어디로 갈까요?", query = "", hits = [], failed = false, pending = false, notice = "", onPick, onRetry, here, children }) => {
	const wanted = query.trim(), listed = hits.length > 0 || !!here;
	return /* @__PURE__ */ a("div", {
		class: "ps",
		children: [
			/* @__PURE__ */ a("h3", {
				class: "ps-title",
				children: title
			}),
			/* @__PURE__ */ a("div", {
				class: "ps-stick",
				children: children ?? /* @__PURE__ */ a(PlaceSearchField, { value: query })
			}),
			notice && /* @__PURE__ */ a("p", {
				class: "ps-notice",
				role: "alert",
				children: notice
			}),
			listed && /* @__PURE__ */ a(PlaceList, {
				hits,
				query: wanted,
				here,
				...onPick ? { onPick } : {}
			}),
			pending && /* @__PURE__ */ a("p", {
				class: "ps-pending",
				role: "status",
				children: "장소를 찾고 있어요"
			}),
			listed && failed && /* @__PURE__ */ a("p", {
				class: "ps-failed",
				role: "status",
				children: ["장소를 찾지 못했어요", onRetry && /* @__PURE__ */ a("button", {
					type: "button",
					class: "ps-retry",
					onClick: onRetry,
					children: "다시 찾기"
				})]
			}),
			!listed && !pending && /* @__PURE__ */ a(PlaceEmpty, {
				failed,
				...wanted.length >= MIN_ASK ? { query: wanted } : {},
				...onRetry ? { onRetry } : {}
			})
		]
	});
};
var PlacePickedSheet = ({ hit, notice = "", onEnd = noop, onArrivals = noop }) => /* @__PURE__ */ a("div", {
	class: "ps-picked",
	children: [
		/* @__PURE__ */ a("h3", { children: hit.name }),
		hit.lines ? /* @__PURE__ */ a(Chips, { hit }) : hit.address && /* @__PURE__ */ a("p", { children: hit.address }),
		notice && /* @__PURE__ */ a("p", {
			class: "ps-notice",
			role: "alert",
			children: notice
		}),
		hit.lines && /* @__PURE__ */ a("button", {
			type: "button",
			class: "ps-arrivals",
			onClick: onArrivals,
			children: "곧 오는 열차"
		}),
		/* @__PURE__ */ a("div", {
			class: "ps-ends",
			children: [/* @__PURE__ */ a("button", {
				type: "button",
				"data-end": "from",
				onClick: () => onEnd("from"),
				children: "여기서 출발"
			}), /* @__PURE__ */ a("button", {
				type: "button",
				class: "to",
				"data-end": "to",
				onClick: () => onEnd("to"),
				children: "여기로 도착"
			})]
		})
	]
});
var PlaceEndsCard = ({ fixedName, fixed, value = "", onInput = noop, onClear = noop, onEnter = noop }) => {
	const row = /* @__PURE__ */ a("div", {
		class: "ps-end",
		children: [/* @__PURE__ */ a("i", {
			class: `jdot ${fixed}`,
			"aria-hidden": "true"
		}), /* @__PURE__ */ a("span", { children: [/* @__PURE__ */ a("small", { children: fixed === "from" ? "출발" : "도착" }), /* @__PURE__ */ a("b", { children: fixedName })] })]
	});
	const field = /* @__PURE__ */ a(PlaceSearchField, {
		value,
		label: fixed === "from" ? "도착지" : "출발지",
		onInput,
		onClear,
		onEnter
	});
	return /* @__PURE__ */ a("div", {
		class: "ps-route",
		children: fixed === "from" ? /* @__PURE__ */ a(M, { children: [row, field] }) : /* @__PURE__ */ a(M, { children: [field, row] })
	});
};
var BACK = /* @__PURE__ */ a("svg", {
	viewBox: "0 0 24 24",
	width: "24",
	height: "24",
	"aria-hidden": "true",
	fill: "none",
	stroke: "currentColor",
	"stroke-width": "2",
	"stroke-linecap": "round",
	"stroke-linejoin": "round",
	children: /* @__PURE__ */ a("path", { d: "m15 6-6 6 6 6" })
});
var JourneyStep = ({ canBack, onPress = noop }) => /* @__PURE__ */ a("button", {
	type: "button",
	class: canBack ? "jstep back" : "jstep",
	"aria-label": canBack ? "뒤로" : "닫기",
	onClick: onPress,
	children: canBack ? BACK : CLEAR
});
export { JourneyStep, PLACE_SEARCH_LABEL, PlaceEmpty, PlaceEndsCard, PlaceHereRow, PlaceList, PlacePickedSheet, PlaceRow, PlaceSearch, PlaceSearchField };
