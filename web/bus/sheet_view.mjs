import { Fragment as M, render as K } from "../npm/preact/dist/preact.mjs";
import { jsx as a } from "../npm/preact/jsx-runtime/dist/jsxRuntime.mjs";
// web/bus/sheet_view.tsx
var BUS_ICON = /* @__PURE__ */ a("svg", {
	viewBox: "0 0 24 24",
	fill: "none",
	stroke: "currentColor",
	"stroke-width": "2.2",
	"stroke-linecap": "round",
	"stroke-linejoin": "round",
	"aria-hidden": "true",
	children: [/* @__PURE__ */ a("rect", {
		x: "4",
		y: "3",
		width: "16",
		height: "15",
		rx: "3"
	}), /* @__PURE__ */ a("path", { d: "M4 11h16M7 21v-3M17 21v-3" })]
});
var REFRESH_ICON = /* @__PURE__ */ a("svg", {
	viewBox: "0 0 24 24",
	fill: "none",
	stroke: "currentColor",
	"stroke-width": "2.4",
	"stroke-linecap": "round",
	"stroke-linejoin": "round",
	"aria-hidden": "true",
	children: [/* @__PURE__ */ a("path", { d: "M20 12a8 8 0 1 1-2.34-5.66" }), /* @__PURE__ */ a("path", { d: "M20 4v5h-5" })]
});
var Badge = ({ badge }) => /* @__PURE__ */ a("span", {
	class: badge.long ? "bus-num bus-num-long" : "bus-num",
	style: `--c:${badge.color}`,
	children: badge.name
});
function FollowLine({ line }) {
	return /* @__PURE__ */ a("div", {
		class: line.following ? "bus-follow" : "bus-follow is-off",
		children: [/* @__PURE__ */ a("p", {
			class: "bus-follow-state",
			role: "status",
			children: [
				line.following && /* @__PURE__ */ a("span", {
					class: "bus-follow-dot",
					"aria-hidden": "true"
				}),
				/* @__PURE__ */ a(Badge, { badge: line.badge }),
				/* @__PURE__ */ a("span", {
					class: "bus-follow-text",
					children: [/* @__PURE__ */ a("b", { children: line.state }), line.arrival && /* @__PURE__ */ a("span", { children: line.arrival })]
				})
			]
		}), /* @__PURE__ */ a("div", {
			class: "bus-follow-actions",
			children: line.buttons.map((button) => /* @__PURE__ */ a("button", {
				type: "button",
				"data-bus-stop-view": button.what,
				"aria-label": button.aria || void 0,
				children: button.label
			}))
		})]
	});
}
function Hero({ hero }) {
	const head = hero.one ? /* @__PURE__ */ a("span", {
		class: "bus-hero-head",
		children: [
			/* @__PURE__ */ a(Badge, { badge: hero.badges[0] }),
			/* @__PURE__ */ a("span", {
				class: "bus-hero-dir",
				children: hero.direction
			}),
			hero.onMap && /* @__PURE__ */ a("span", {
				class: "bus-hero-on",
				children: "지도에 표시 중"
			})
		]
	}) : /* @__PURE__ */ a("span", {
		class: "bus-hero-head is-many",
		children: [hero.badges.map((badge) => /* @__PURE__ */ a(Badge, { badge })), hero.more > 0 && /* @__PURE__ */ a("span", {
			class: "bus-num bus-num-more",
			children: `+${hero.more}`
		})]
	});
	const body = /* @__PURE__ */ a(M, { children: [
		head,
		/* @__PURE__ */ a("span", {
			class: "bus-hero-now",
			children: [/* @__PURE__ */ a("span", {
				class: "bus-hero-soon",
				children: "곧 도착"
			}), hero.next && /* @__PURE__ */ a("span", {
				class: "bus-hero-next",
				children: hero.next
			})]
		}),
		/* @__PURE__ */ a("span", {
			class: "bus-track",
			"aria-hidden": "true",
			children: [
				/* @__PURE__ */ a("span", { class: "bus-track-from" }),
				/* @__PURE__ */ a("span", {
					class: "bus-track-bus",
					"data-track-route": hero.trackRoute ?? void 0,
					style: `left:${hero.ratio * 50}%`,
					children: BUS_ICON
				}),
				/* @__PURE__ */ a("span", { class: "bus-track-here" }),
				/* @__PURE__ */ a("span", { class: "bus-track-to" })
			]
		}),
		/* @__PURE__ */ a("span", {
			class: "bus-track-names",
			children: [
				/* @__PURE__ */ a("span", { children: hero.prev }),
				/* @__PURE__ */ a("b", { children: hero.stop }),
				/* @__PURE__ */ a("span", { children: hero.after })
			]
		})
	] });
	return hero.button ? /* @__PURE__ */ a("button", {
		type: "button",
		class: "bus-hero",
		"data-bus-route": hero.routeId,
		"aria-pressed": hero.pressed,
		children: body
	}) : /* @__PURE__ */ a("div", {
		class: "bus-hero",
		children: body
	});
}
function RowTime({ row }) {
	const time = row.time;
	if (time.kind === "wait") return /* @__PURE__ */ a("span", {
		class: "bus-row-time",
		children: /* @__PURE__ */ a("i", { class: "bus-wait" })
	});
	if (time.kind === "none") return /* @__PURE__ */ a("span", {
		class: "bus-row-time",
		children: /* @__PURE__ */ a("span", {
			class: "bus-away",
			children: "도착 정보 없음"
		})
	});
	if (time.kind === "soon") return /* @__PURE__ */ a("span", {
		class: "bus-row-time",
		children: /* @__PURE__ */ a("span", {
			class: "bus-soon",
			children: "곧 도착"
		})
	});
	if (time.kind === "away") return /* @__PURE__ */ a("span", {
		class: "bus-row-time",
		children: /* @__PURE__ */ a("span", {
			class: "bus-away",
			children: time.text
		})
	});
	return /* @__PURE__ */ a("span", {
		class: "bus-row-time",
		children: [time.where && /* @__PURE__ */ a("span", {
			class: "bus-away",
			children: time.where
		}), /* @__PURE__ */ a("span", {
			class: "bus-eta",
			"data-eta": String(time.at),
			children: time.left
		})]
	});
}
function Row({ row }) {
	const inner = /* @__PURE__ */ a(M, { children: [
		/* @__PURE__ */ a(Badge, { badge: row.badge }),
		/* @__PURE__ */ a("span", {
			class: "bus-row-dir",
			children: [/* @__PURE__ */ a("span", { children: row.direction }), row.tag && /* @__PURE__ */ a("span", {
				class: "bus-tag",
				children: row.tag
			})]
		}),
		/* @__PURE__ */ a(RowTime, { row })
	] });
	return row.live ? /* @__PURE__ */ a("button", {
		type: "button",
		class: "bus-row",
		"data-bus-route": row.routeId,
		"aria-pressed": row.pressed,
		children: [inner, /* @__PURE__ */ a("span", {
			class: "bus-sr",
			children: ", 곧 올 버스 따라가기"
		})]
	}) : /* @__PURE__ */ a("div", {
		class: "bus-row",
		children: inner
	});
}
function StopSheet({ view }) {
	if (view.compact) return /* @__PURE__ */ a("div", {
		class: "bus-stop is-following",
		children: [/* @__PURE__ */ a("h3", {
			class: "bus-sr",
			tabIndex: -1,
			children: view.name
		}), view.followLine && /* @__PURE__ */ a(FollowLine, { line: view.followLine })]
	});
	const refresh = view.refresh;
	return /* @__PURE__ */ a("div", {
		class: "bus-stop",
		children: [
			/* @__PURE__ */ a("div", {
				class: "bus-stop-head",
				children: [/* @__PURE__ */ a("div", {
					class: "bus-stop-title",
					children: [view.arsId && /* @__PURE__ */ a("span", {
						class: "bus-stop-no",
						children: [BUS_ICON, view.arsId]
					}), /* @__PURE__ */ a("h3", {
						tabIndex: -1,
						children: view.name
					})]
				}), refresh && /* @__PURE__ */ a("button", {
					type: "button",
					class: refresh.loading ? "bus-refresh is-loading" : "bus-refresh",
					"data-bus-refresh": "",
					"aria-label": refresh.clock ? `도착 정보 새로 받기 · ${refresh.clock} 기준` : "도착 정보 새로 받기",
					children: [/* @__PURE__ */ a("span", { children: refresh.clock }), REFRESH_ICON]
				})]
			}),
			view.followLine && /* @__PURE__ */ a(FollowLine, { line: view.followLine }),
			view.note && /* @__PURE__ */ a("p", {
				class: "bus-detail-note",
				children: view.note
			}),
			view.stopNote && /* @__PURE__ */ a("p", {
				class: "bus-detail-note",
				role: "status",
				children: view.stopNote
			}),
			view.mock && /* @__PURE__ */ a("p", {
				class: "bus-detail-note",
				children: "예시 데이터 · 실제 운행 정보 아님"
			}),
			view.hero && /* @__PURE__ */ a(Hero, { hero: view.hero }),
			/* @__PURE__ */ a("div", {
				class: "bus-rows",
				children: view.rows.map((row) => /* @__PURE__ */ a(Row, { row }))
			}),
			view.ended.length > 0 && /* @__PURE__ */ a("div", {
				class: "bus-ended",
				children: [/* @__PURE__ */ a("span", { children: "운행 종료" }), view.ended.map((item) => item.live ? /* @__PURE__ */ a("button", {
					type: "button",
					"data-bus-route": item.routeId,
					"aria-pressed": item.pressed,
					children: item.name
				}) : /* @__PURE__ */ a("span", { children: item.name }))]
			})
		]
	});
}
function RouteSheet({ view }) {
	return /* @__PURE__ */ a(M, { children: [
		/* @__PURE__ */ a("h3", {
			tabIndex: -1,
			children: [/* @__PURE__ */ a("span", {
				class: "bus-type",
				style: `--bus-color:${view.typeColor}`,
				children: view.typeName
			}), ` ${view.name}번`]
		}),
		view.grid && /* @__PURE__ */ a("dl", {
			class: "bus-detail-grid",
			children: [
				/* @__PURE__ */ a("dt", { children: "다음 정류장" }),
				/* @__PURE__ */ a("dd", { children: [view.grid.next, view.grid.onPath && /* @__PURE__ */ a("small", { children: "경로 기준" })] }),
				/* @__PURE__ */ a("dt", { children: view.grid.clockLabel }),
				/* @__PURE__ */ a("dd", { children: view.grid.time })
			]
		}),
		/* @__PURE__ */ a("p", {
			class: "bus-detail-note",
			children: view.note
		}),
		view.approx && /* @__PURE__ */ a("p", {
			class: "bus-detail-note",
			children: "정류장을 연결한 근사 경로예요."
		})
	] });
}
function BusSheet({ view }) {
	if (!view) return null;
	return /* @__PURE__ */ a("div", {
		class: "bus-detail",
		children: view.kind === "stop" ? /* @__PURE__ */ a(StopSheet, { view }) : /* @__PURE__ */ a(RouteSheet, { view })
	});
}
var drawBusSheet = (body, view) => K(/* @__PURE__ */ a(BusSheet, { view }), body);
var clearBusSheet = (body) => K(null, body);
export { BusSheet, clearBusSheet, drawBusSheet };
