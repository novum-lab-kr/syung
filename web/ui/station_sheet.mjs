import { Fragment as M, render as K } from "../npm/preact/dist/preact.mjs";
import { jsx as a } from "../npm/preact/jsx-runtime/dist/jsxRuntime.mjs";
// web/ui/station_sheet.tsx
function Head({ name, chips, sub }) {
	return /* @__PURE__ */ a(M, { children: [
		/* @__PURE__ */ a("div", {
			class: "tp-line",
			children: chips.map((c) => /* @__PURE__ */ a("span", {
				class: "chip",
				style: `--c:${c.color}`,
				children: [/* @__PURE__ */ a("span", { class: "dot" }), c.name]
			}))
		}),
		/* @__PURE__ */ a("div", {
			class: "tp-dest",
			children: name
		}),
		/* @__PURE__ */ a("div", {
			class: "tp-now",
			children: sub
		}),
		/* @__PURE__ */ a("div", {
			class: "st-journey",
			children: [/* @__PURE__ */ a("button", {
				type: "button",
				"data-end": "from",
				children: "여기서 출발"
			}), /* @__PURE__ */ a("button", {
				type: "button",
				"data-end": "to",
				children: "여기로 도착"
			})]
		})
	] });
}
function Card({ card }) {
	return /* @__PURE__ */ a("div", {
		class: "arr",
		style: `--c:${card.color}`,
		children: [/* @__PURE__ */ a("div", {
			class: "arr-h",
			children: [
				/* @__PURE__ */ a("span", { class: "dot" }),
				card.line,
				" ",
				/* @__PURE__ */ a("span", {
					class: "muted",
					children: [card.direction, card.toward ? " · " + card.toward : ""]
				})
			]
		}), card.rows.map((a$1) => /* @__PURE__ */ a("div", {
			class: "arr-t",
			children: [/* @__PURE__ */ a("b", { children: a$1.text }), /* @__PURE__ */ a("span", {
				class: "muted",
				children: [
					a$1.destination,
					"행",
					a$1.express ? " · 급행" : "",
					a$1.last ? " · 막차" : ""
				]
			})]
		}))]
	});
}
function Exits({ exits }) {
	return /* @__PURE__ */ a("div", {
		class: "exits",
		children: exits.map((e) => /* @__PURE__ */ a("span", {
			class: "exit",
			title: `${e.ref}번 출구${e.wheelchair ? " · 휠체어 가능" : ""}`,
			children: [e.ref, e.wheelchair && /* @__PURE__ */ a("i", { children: "♿" })]
		}))
	});
}
function StationSheet({ name, chips, exits, state }) {
	if (state.kind === "failed") return /* @__PURE__ */ a("div", {
		class: "train-inspect station-sheet",
		children: /* @__PURE__ */ a(Head, {
			name,
			chips,
			sub: "도착 정보를 불러오지 못했어요. 잠시 후 다시 눌러 주세요."
		})
	});
	if (state.kind === "loading") return /* @__PURE__ */ a("div", {
		class: "train-inspect station-sheet",
		children: [
			/* @__PURE__ */ a(Head, {
				name,
				chips,
				sub: "도착 정보 불러오는 중…"
			}),
			/* @__PURE__ */ a("div", {
				class: "sec",
				children: "곧 오는 열차"
			}),
			/* @__PURE__ */ a("div", {
				class: "arrs st-sk",
				"aria-hidden": "true",
				children: Array.from({ length: state.rows }, () => /* @__PURE__ */ a("div", {
					class: "arr",
					children: [
						/* @__PURE__ */ a("i", {}),
						/* @__PURE__ */ a("i", {}),
						/* @__PURE__ */ a("i", {})
					]
				}))
			})
		]
	});
	return /* @__PURE__ */ a("div", {
		class: "train-inspect station-sheet",
		children: [
			/* @__PURE__ */ a(Head, {
				name,
				chips,
				sub: `서울시 실시간 도착정보 · ${state.time} 기준`
			}),
			/* @__PURE__ */ a("div", {
				class: "sec",
				children: "곧 오는 열차"
			}),
			state.cards.length ? /* @__PURE__ */ a("div", {
				class: "arrs",
				children: state.cards.map((c) => /* @__PURE__ */ a(Card, { card: c }))
			}) : /* @__PURE__ */ a("div", {
				class: "muted empty",
				children: "지금 도착 예정 열차 정보가 없어요."
			}),
			exits.length > 0 && /* @__PURE__ */ a(M, { children: [/* @__PURE__ */ a("div", {
				class: "sec",
				children: "출구"
			}), /* @__PURE__ */ a(Exits, { exits })] })
		]
	});
}
var drawStationSheet = (body, props) => K(/* @__PURE__ */ a(StationSheet, { ...props }), body);
var clearPanel = (body) => K(null, body);
export { StationSheet, clearPanel, drawStationSheet };
