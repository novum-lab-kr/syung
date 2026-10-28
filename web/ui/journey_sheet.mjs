import { Fragment as M, render as K } from "../npm/preact/dist/preact.mjs";
import { jsx as a } from "../npm/preact/jsx-runtime/dist/jsxRuntime.mjs";
// web/ui/journey_sheet.tsx
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
var WALK = /* @__PURE__ */ a("svg", {
	viewBox: "0 0 24 24",
	"aria-hidden": "true",
	fill: "currentColor",
	children: [/* @__PURE__ */ a("circle", {
		cx: "13",
		cy: "4",
		r: "2"
	}), /* @__PURE__ */ a("path", { d: "M10.2 7.6 7 9.4V13h2v-2.4l1.3-.7-1.6 8.1H11l1-4.3 2 2V21h2v-6.2l-2.1-2.1.6-3.1c1 1.3 2.5 2.1 4.2 2.2v-2c-1.4-.1-2.5-.9-3.1-2l-1-1.6c-.4-.6-1-1-1.7-1-.3 0-.6.1-.9.2z" })]
});
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
var EDIT = /* @__PURE__ */ a("svg", {
	viewBox: "0 0 24 24",
	"aria-hidden": "true",
	fill: "none",
	stroke: "currentColor",
	"stroke-width": "2",
	"stroke-linecap": "round",
	"stroke-linejoin": "round",
	children: [/* @__PURE__ */ a("path", { d: "M4 20h4L19 9l-4-4L4 16z" }), /* @__PURE__ */ a("path", { d: "m13.5 6.5 4 4" })]
});
var BUS = /* @__PURE__ */ a("svg", {
	viewBox: "0 0 24 24",
	"aria-hidden": "true",
	fill: "currentColor",
	children: /* @__PURE__ */ a("path", { d: "M5 3h14a2 2 0 0 1 2 2v11a2 2 0 0 1-1 1.7V20a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1v-1H7v1a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-2.3A2 2 0 0 1 3 16V5a2 2 0 0 1 2-2zm0 3v5h14V6zm2 8a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm10 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z" })
});
function PlaceList({ id, label, list, onPick }) {
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
function When({ view, actions }) {
	const draft = view.draft, off = (key) => draft?.off[key] ?? false;
	return /* @__PURE__ */ a("div", {
		class: "jopts jwhen",
		children: [/* @__PURE__ */ a("button", {
			type: "button",
			class: view.whenAt ? "jw-row set" : "jw-row",
			id: "jWhenRow",
			"aria-expanded": view.whenOpen,
			"aria-controls": "jWhenPanel",
			onClick: actions.whenRow,
			children: [
				CLOCK,
				/* @__PURE__ */ a("span", {
					id: "jWhenText",
					children: view.whenText
				}),
				CHEV
			]
		}), /* @__PURE__ */ a("div", {
			class: "jw-panel",
			id: "jWhenPanel",
			hidden: !view.whenOpen,
			children: [
				/* @__PURE__ */ a("div", {
					class: "jw-head",
					children: [/* @__PURE__ */ a("b", { children: "출발 시각" }), /* @__PURE__ */ a("button", {
						type: "button",
						class: "jw-now",
						id: "jWhenNow",
						onClick: actions.whenNow,
						children: "지금으로"
					})]
				}),
				/* @__PURE__ */ a("div", {
					class: "segmented jw-day",
					role: "group",
					"aria-label": "날짜",
					children: [/* @__PURE__ */ a("button", {
						type: "button",
						"data-d": "0",
						"aria-pressed": !(draft?.tomorrow ?? false),
						onClick: () => actions.day(0),
						children: "오늘"
					}), /* @__PURE__ */ a("button", {
						type: "button",
						"data-d": "1",
						"aria-pressed": draft?.tomorrow ?? false,
						onClick: () => actions.day(1),
						children: "내일"
					})]
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
									hold: actions.hold.h1,
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
									hold: actions.hold["h-1"],
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
									hold: actions.hold.m1,
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
									hold: actions.hold["m-1"],
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
					onClick: actions.whenGo,
					children: "이 시간에 출발"
				})
			]
		})]
	});
}
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
function Step({ step }) {
	if (step.kind === "node") return /* @__PURE__ */ a("li", {
		class: `js node ${step.n}`,
		style: `--c:${step.color}`,
		children: [
			/* @__PURE__ */ a("span", {
				class: "js-t",
				children: step.time
			}),
			/* @__PURE__ */ a("span", { class: "js-dot" }),
			/* @__PURE__ */ a("div", {
				class: "js-b",
				children: [/* @__PURE__ */ a("b", { children: step.name }), step.sub !== null && /* @__PURE__ */ a("small", { children: step.sub })]
			})
		]
	});
	if (step.kind === "walk") return /* @__PURE__ */ a("li", {
		class: "js walk",
		children: [
			/* @__PURE__ */ a("span", { class: "js-t" }),
			/* @__PURE__ */ a("span", { class: "js-rail" }),
			/* @__PURE__ */ a("div", {
				class: "js-b",
				children: /* @__PURE__ */ a("small", { children: [WALK, step.text] })
			})
		]
	});
	return /* @__PURE__ */ a("li", {
		class: "js ride",
		style: `--c:${step.color};--t:${step.ink}`,
		children: [
			/* @__PURE__ */ a("span", { class: "js-t" }),
			/* @__PURE__ */ a("span", { class: "js-rail" }),
			/* @__PURE__ */ a("div", {
				class: "js-b",
				children: [/* @__PURE__ */ a("p", { children: [/* @__PURE__ */ a("span", {
					class: "js-chip",
					children: [step.bus && BUS, step.chip]
				}), step.toward] }), /* @__PURE__ */ a("small", { children: [step.text, step.live !== null && /* @__PURE__ */ a("span", {
					class: "js-live",
					children: step.live
				})] })]
			})
		]
	});
}
var CARD_ROLE = { role: "button" };
function Card({ plan, index, on, hidden, actions }) {
	const duration = plan.duration;
	return /* @__PURE__ */ a("article", {
		class: on ? "jp on" : "jp",
		"data-i": String(index),
		tabIndex: 0,
		...CARD_ROLE,
		"aria-label": plan.aria,
		"aria-expanded": on,
		hidden,
		onClick: () => actions.card(index),
		onKeyDown: (event) => {
			if (event.key === "Enter" || event.key === " ") {
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
					plan.tag !== null && /* @__PURE__ */ a("span", {
						class: "jp-tag",
						children: plan.tag
					})
				]
			}),
			/* @__PURE__ */ a(Track, { segs: plan.track }),
			/* @__PURE__ */ a("p", {
				class: "jp-meta",
				children: [plan.meta, plan.live && /* @__PURE__ */ a("span", {
					class: "jp-live",
					children: "실시간"
				})]
			}),
			/* @__PURE__ */ a("ol", {
				class: "jsteps",
				children: plan.steps.map((step) => /* @__PURE__ */ a(Step, { step }))
			})
		]
	});
}
function Result({ result, actions }) {
	if (result.kind === "none") return null;
	if (result.kind === "loading") return /* @__PURE__ */ a("div", {
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
	if (result.kind === "failed") return /* @__PURE__ */ a("div", {
		class: "jerr",
		children: [
			/* @__PURE__ */ a("b", { children: "경로를 찾지 못했어요" }),
			/* @__PURE__ */ a("p", { children: result.message }),
			/* @__PURE__ */ a("button", {
				type: "button",
				class: "jerr-retry",
				onClick: actions.retry,
				children: "다시 찾기"
			})
		]
	});
	return /* @__PURE__ */ a(M, { children: [
		result.tabs && /* @__PURE__ */ a("div", {
			class: "segmented jkinds",
			role: "group",
			"aria-label": "경로 종류",
			children: result.tabs.map((tab) => /* @__PURE__ */ a("button", {
				type: "button",
				"data-k": tab.kind,
				"aria-pressed": tab.pressed,
				onClick: () => actions.tab(tab.kind),
				children: [tab.name, /* @__PURE__ */ a("b", { children: tab.count })]
			}))
		}),
		/* @__PURE__ */ a("div", {
			class: "jplans",
			children: result.cards.map((card, index) => /* @__PURE__ */ a(Card, {
				plan: card.plan,
				index,
				on: card.on,
				hidden: card.hidden,
				actions
			}))
		}),
		/* @__PURE__ */ a("p", {
			class: "jp-note",
			children: "경로를 누르면 지도에 보여요. 창을 닫아도 경로는 남아 있어요. 첫 열차는 실시간 위치로, 이후 열차는 배차 간격으로, 버스는 시간표로 계산한 예상 시간이에요."
		})
	] });
}
function JourneySheet({ view, actions }) {
	const summary = view.summary;
	return /* @__PURE__ */ a("div", {
		class: view.done ? "journey done" : "journey",
		children: [
			/* @__PURE__ */ a("h3", { children: "길찾기" }),
			/* @__PURE__ */ a("button", {
				type: "button",
				class: "jsum",
				id: "jSum",
				hidden: !view.done,
				"aria-label": summary?.aria,
				onClick: actions.summary,
				children: summary && /* @__PURE__ */ a(M, { children: [/* @__PURE__ */ a("span", {
					class: "jsum-trip",
					children: [/* @__PURE__ */ a("span", {
						class: "jsum-end",
						children: [/* @__PURE__ */ a("i", { class: "jdot from" }), /* @__PURE__ */ a("b", { children: summary.from })]
					}), /* @__PURE__ */ a("span", {
						class: "jsum-end",
						children: [/* @__PURE__ */ a("i", { class: "jdot to" }), /* @__PURE__ */ a("b", { children: summary.to })]
					})]
				}), /* @__PURE__ */ a("span", {
					class: "jsum-side",
					children: [/* @__PURE__ */ a("span", {
						class: "jsum-when",
						children: summary.when
					}), /* @__PURE__ */ a("span", {
						class: "jsum-edit",
						children: [EDIT, "수정"]
					})]
				})] })
			}),
			/* @__PURE__ */ a("div", {
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
								defaultValue: view.here ? "내 위치" : "",
								onInput: (event) => actions.typed("from", event.currentTarget.value)
							}),
							view.here && /* @__PURE__ */ a("button", {
								type: "button",
								class: "jf-here",
								id: "jHere",
								"aria-label": "내 위치에서 출발",
								title: "내 위치",
								onClick: actions.here,
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
							onInput: (event) => actions.typed("to", event.currentTarget.value)
						})]
					}),
					/* @__PURE__ */ a("button", {
						type: "button",
						class: "jswap",
						id: "jSwap",
						"aria-label": "출발지와 도착지 바꾸기",
						title: "바꾸기",
						onClick: actions.swap,
						children: SWAP
					})
				]
			}),
			/* @__PURE__ */ a(PlaceList, {
				id: "jFromList",
				label: "출발지 찾기 결과",
				list: view.lists.from,
				onPick: (place) => actions.place("from", place)
			}),
			/* @__PURE__ */ a(PlaceList, {
				id: "jToList",
				label: "도착지 찾기 결과",
				list: view.lists.to,
				onPick: (place) => actions.place("to", place)
			}),
			/* @__PURE__ */ a(When, {
				view,
				actions
			}),
			/* @__PURE__ */ a("div", {
				class: view.status.sr ? "jf-status sr" : "jf-status",
				id: "jStatus",
				role: "status",
				"aria-live": "polite",
				children: view.status.text
			}),
			/* @__PURE__ */ a("div", {
				id: "jResult",
				children: /* @__PURE__ */ a(Result, {
					result: view.result,
					actions
				})
			})
		]
	});
}
var drawJourney = (body, view, actions) => K(/* @__PURE__ */ a(JourneySheet, {
	view,
	actions
}), body);
var clearJourney = (body) => K(null, body);
export { JourneySheet, clearJourney, drawJourney };
