import { exitHints, routeTrack, sameRoutes } from "../lib/journey-ui.mjs";
import { Component as x, Fragment as M, render as K } from "../npm/preact/dist/preact.mjs";
import { jsx as a } from "../npm/preact/jsx-runtime/dist/jsxRuntime.mjs";
import { RouteLoading } from "../ui/journey_sheet.mjs";
// web/user/tickets_view.tsx
var DAYS = [
	"월",
	"화",
	"수",
	"목",
	"금",
	"토",
	"일"
];
var QUICK = [
	["1,2,3,4,5", "평일"],
	["6,7", "주말"],
	["1,2,3,4,5,6,7", "매일"]
];
var esc = (text) => String(text).replace(/[&<>"']/g, (mark) => ({
	"&": "&amp;",
	"<": "&lt;",
	">": "&gt;",
	"\"": "&quot;",
	"'": "&#39;"
})[mark]);
var todayDay = () => ((/* @__PURE__ */ new Date()).getDay() + 6) % 7 + 1;
var daysText = (days) => days.length ? days.map((day) => DAYS[day - 1]).join(" ") : "없음";
var shortName = (name) => name.length >= 7 ? `${name.slice(0, 3)}‥${name.slice(-2)}` : name;
function timeParts(time) {
	const [hour, minute] = (time || "08:00").split(":").map(Number);
	return {
		ampm: hour < 12 ? "오전" : "오후",
		clock: `${hour % 12 || 12}:${String(minute).padStart(2, "0")}`
	};
}
var LOGOS = { __html: "<svg viewBox=\"0 0 100 60\"><g fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.1\" stroke-dasharray=\".3 2.3\" stroke-linecap=\"round\"><rect x=\"36\" y=\"11\" width=\"56\" height=\"38\" rx=\"19\"/><rect x=\"40.5\" y=\"15.5\" width=\"47\" height=\"29\" rx=\"14.5\"/><circle cx=\"74\" cy=\"30\" r=\"7.5\"/><circle cx=\"74\" cy=\"30\" r=\"3.5\"/><rect x=\"15\" y=\"16\" width=\"17\" height=\"7\" rx=\"3.5\"/><rect x=\"8\" y=\"26.5\" width=\"24\" height=\"7\" rx=\"3.5\"/><rect x=\"15\" y=\"37\" width=\"17\" height=\"7\" rx=\"3.5\"/></g></svg>".repeat(5) };
var STRIP = [
	0,
	1,
	2,
	3,
	4,
	5,
	6
];
var CHEVRON = "<svg class=\"tf-chev\" viewBox=\"0 0 24 24\" aria-hidden=\"true\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"m9 6 6 6-6 6\"/></svg>";
var view = {
	colors: {},
	tickets: [],
	listTurn: 0,
	flipped: [],
	chains: [],
	mapping: -1,
	opened: false,
	editingId: void 0,
	name: "",
	time: "08:00",
	days: [],
	from: null,
	to: null,
	route: null,
	via: null,
	wheelOpen: false,
	sending: false,
	deleteArmed: false,
	placeTo: false,
	placeVia: false,
	placeQuery: "",
	placeHidden: true,
	placeRows: [],
	routeTrip: "",
	routeWhen: "",
	plans: [],
	chosen: -1,
	routeMsg: "",
	routeLoading: false,
	routeFilter: null,
	routeVia: null
};
var handlers = null;
var call = (key) => (...args) => (handlers?.[key])?.(...args);
function Front({ ticket }) {
	const name = ticket.name || "승차권", label = ticket.name ? `${name}권` : name;
	const serial = `${ticket.id ? String(ticket.id).padStart(4, "0") : "----"} ${ticket.days.map((day) => DAYS[day - 1]).join("")} ${(ticket.depart || "").replace(":", "")}`;
	const today = ticket.id && ticket.days.includes(todayDay());
	return /* @__PURE__ */ a("div", {
		class: "tk-face tk-front",
		children: [
			/* @__PURE__ */ a("div", {
				class: "tk-logos",
				children: /* @__PURE__ */ a("div", {
					class: "tk-logo-row",
					dangerouslySetInnerHTML: LOGOS
				})
			}),
			/* @__PURE__ */ a("div", {
				class: "tk-top",
				children: [/* @__PURE__ */ a("b", { children: name }), /* @__PURE__ */ a("b", { children: ticket.depart || "--:--" })]
			}),
			/* @__PURE__ */ a("div", {
				class: "tk-strip",
				children: STRIP.map(() => /* @__PURE__ */ a("span", { children: [/* @__PURE__ */ a("img", {
					src: "./brand/syung-light.svg",
					alt: ""
				}), label] }))
			}),
			/* @__PURE__ */ a("div", {
				class: "tk-serial",
				children: serial
			}),
			today ? /* @__PURE__ */ a("span", {
				class: "tk-today",
				children: "오늘"
			}) : null,
			ticket.id ? /* @__PURE__ */ a("button", {
				class: "tk-flip",
				type: "button",
				"aria-label": "뒤집기",
				children: "↻"
			}) : null
		]
	});
}
function Card({ ticket, index }) {
	const chain = view.chains[index] ?? null;
	const waiting = `<span>${esc(shortName(ticket.from.name))}</span><em>→</em><span>${esc(shortName(ticket.to.name))}</span>`;
	return /* @__PURE__ */ a("div", {
		class: view.flipped[index] ? "ticket flipped" : "ticket",
		onClick: (event) => {
			if (event.target.closest(".tk-edit")) {
				event.stopPropagation();
				call("ticketEdit")(index);
				return;
			}
			if (event.target.closest(".tk-map")) {
				event.stopPropagation();
				call("ticketMap")(index);
				return;
			}
			call("ticketFlip")(index);
		},
		children: /* @__PURE__ */ a("div", {
			class: "ticket-in",
			children: [/* @__PURE__ */ a(Front, { ticket }), /* @__PURE__ */ a("div", {
				class: "tk-face tk-back",
				children: [
					/* @__PURE__ */ a("p", {
						class: chain === null ? "tk-chain wait" : "tk-chain",
						dangerouslySetInnerHTML: { __html: chain ?? waiting }
					}),
					ticket.route && (exitHints(ticket.route.legs).length > 0 || sameRoutes(ticket.route.legs) !== null) && /* @__PURE__ */ a("div", {
						class: "tk-alts",
						children: [exitHints(ticket.route.legs).length > 0 && /* @__PURE__ */ a("p", {
							class: "tk-alt",
							title: exitHints(ticket.route.legs).join(" / "),
							children: exitHints(ticket.route.legs).join(" / ")
						}), sameRoutes(ticket.route.legs) !== null && /* @__PURE__ */ a("p", {
							class: "tk-alt",
							title: sameRoutes(ticket.route.legs),
							children: sameRoutes(ticket.route.legs)
						})]
					}),
					/* @__PURE__ */ a("p", {
						class: "tk-time",
						children: [/* @__PURE__ */ a("span", { children: "출발 시각" }), /* @__PURE__ */ a("b", { children: ticket.depart })]
					}),
					/* @__PURE__ */ a("div", { class: "tk-mag" }),
					/* @__PURE__ */ a("div", {
						class: "tk-foot",
						children: [/* @__PURE__ */ a("span", { children: `타는 날 ${daysText(ticket.days)}` }), /* @__PURE__ */ a("span", {
							class: "tk-acts",
							children: [/* @__PURE__ */ a("button", {
								class: "tk-map",
								type: "button",
								"aria-disabled": view.mapping === index ? "true" : void 0,
								children: view.mapping === index ? "찾는 중…" : "지도에서 보기"
							}), /* @__PURE__ */ a("button", {
								class: "tk-edit",
								type: "button",
								children: "고치기 ›"
							})]
						})]
					})
				]
			})]
		})
	});
}
function TicketsPage() {
	return /* @__PURE__ */ a(M, { children: [/* @__PURE__ */ a("div", {
		id: "ticketList",
		class: "ticket-list",
		children: view.tickets.map((ticket, index) => /* @__PURE__ */ a(Card, {
			ticket,
			index
		}, `${view.listTurn}-${index}`))
	}), /* @__PURE__ */ a("button", {
		id: "ticketNew",
		class: "ticket-new",
		type: "button",
		onClick: call("ticketNew"),
		children: "+ 승차권 예매하기"
	})] });
}
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
function routeHTML(route) {
	if (!route) return `<span class="pk">경로 고르기</span>${CHEVRON}`;
	return `${routeTrack(route, view.colors, 270)}<span class="pk"><b>약 ${route.minutes}분</b> · 환승 ${route.transfers}</span><u>바꾸기</u>`;
}
function TicketPage() {
	const { opened } = view, time = timeParts(view.time), quickNow = view.days.join(",");
	const place = (spot, empty) => opened ? /* @__PURE__ */ a("b", {
		class: spot ? "" : "ph",
		children: spot?.name || empty
	}) : /* @__PURE__ */ a("b", {});
	return /* @__PURE__ */ a(M, { children: [/* @__PURE__ */ a("div", {
		id: "ticketPreview",
		"aria-hidden": "true",
		children: opened && /* @__PURE__ */ a("div", {
			class: "ticket",
			children: /* @__PURE__ */ a("div", {
				class: "ticket-in",
				children: /* @__PURE__ */ a(Front, { ticket: {
					id: view.editingId,
					name: view.name.trim(),
					depart: view.time,
					days: view.days
				} })
			})
		})
	}), /* @__PURE__ */ a("form", {
		id: "ticketForm",
		class: "ticket-form",
		autocomplete: "off",
		noValidate: true,
		onSubmit: (event) => {
			event.preventDefault();
			call("submit")();
		},
		children: [
			/* @__PURE__ */ a("div", {
				class: "tf-route",
				children: /* @__PURE__ */ a("div", {
					class: "tf-pls",
					children: [/* @__PURE__ */ a("button", {
						id: "ticketFrom",
						class: "tf-pl",
						type: "button",
						onClick: call("placeFrom"),
						children: [/* @__PURE__ */ a("i", {
							class: "tf-dot",
							"aria-hidden": "true"
						}), /* @__PURE__ */ a("span", { children: [/* @__PURE__ */ a("small", { children: "출발" }), place(view.from, "출발지 고르기")] })]
					}), /* @__PURE__ */ a("button", {
						id: "ticketTo",
						class: "tf-pl",
						type: "button",
						onClick: call("placeTo"),
						children: [/* @__PURE__ */ a("i", {
							class: "tf-dot to",
							"aria-hidden": "true"
						}), /* @__PURE__ */ a("span", { children: [/* @__PURE__ */ a("small", { children: "도착" }), place(view.to, "도착지 고르기")] })]
					})]
				})
			}),
			/* @__PURE__ */ a("button", {
				id: "ticketTimeBtn",
				class: "tf-time",
				type: "button",
				"aria-expanded": view.wheelOpen ? "true" : "false",
				"aria-controls": "ticketTimePick",
				onClick: call("timeToggle"),
				children: [
					/* @__PURE__ */ a("span", { children: "출발 시각" }),
					/* @__PURE__ */ a("b", {
						id: "ticketTimeText",
						children: opened && /* @__PURE__ */ a(M, { children: [/* @__PURE__ */ a("em", { children: time.ampm }), ` ${time.clock}`] })
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
				value: view.time
			}),
			/* @__PURE__ */ a("div", {
				id: "ticketTimePick",
				class: "tf-wheel",
				hidden: !view.wheelOpen,
				children: [/* @__PURE__ */ a(Wheels, {}), /* @__PURE__ */ a("div", {
					class: "tw-foot",
					children: [/* @__PURE__ */ a("span", { children: "돌려서 고르기 · 5분 단위" }), /* @__PURE__ */ a("button", {
						id: "ticketTimeDone",
						class: "tw-ok",
						type: "button",
						onClick: call("timeDone"),
						children: "완료"
					})]
				})]
			}),
			/* @__PURE__ */ a("span", {
				id: "ticketRouteLabel",
				class: "tf-l",
				children: "경로"
			}),
			/* @__PURE__ */ a("button", {
				id: "ticketRoute",
				class: opened && !view.route ? "tf-pick empty" : "tf-pick",
				type: "button",
				"aria-labelledby": "ticketRouteLabel ticketRoute",
				onClick: call("route"),
				dangerouslySetInnerHTML: { __html: opened ? routeHTML(view.route) : "" }
			}),
			/* @__PURE__ */ a("div", {
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
					children: QUICK.map(([days, label]) => /* @__PURE__ */ a("button", {
						type: "button",
						"data-quick": days,
						"aria-pressed": quickNow === days ? "true" : "false",
						onClick: () => call("quick")(days),
						children: /* @__PURE__ */ a("i", { children: label })
					}))
				})]
			}),
			/* @__PURE__ */ a("div", {
				id: "ticketDays",
				class: "tf-days",
				role: "group",
				"aria-labelledby": "ticketDaysLabel",
				children: DAYS.map((label, index) => /* @__PURE__ */ a("button", {
					type: "button",
					"data-day": index + 1,
					"aria-pressed": view.days.includes(index + 1) ? "true" : "false",
					onClick: () => call("day")(index + 1),
					children: label
				}))
			}),
			/* @__PURE__ */ a("label", {
				class: "tf-l",
				for: "ticketName",
				children: "승차권 이름"
			}),
			/* @__PURE__ */ a("div", {
				class: "tf-in",
				children: [/* @__PURE__ */ a("input", {
					id: "ticketName",
					maxlength: 12,
					placeholder: "이름 넣기",
					enterkeyhint: "done",
					value: view.name,
					onInput: (event) => call("name")(event.currentTarget.value)
				}), /* @__PURE__ */ a("small", {
					id: "ticketNameCount",
					"aria-hidden": "true",
					children: `${[...view.name].length}/12`
				})]
			}),
			/* @__PURE__ */ a("button", {
				id: "ticketSave",
				class: "tf-save",
				type: "submit",
				disabled: view.sending || opened && !view.route,
				children: view.sending ? "발권하는 중…" : "발권하기"
			}),
			/* @__PURE__ */ a("button", {
				id: "ticketDelete",
				class: "tf-del",
				type: "button",
				hidden: !opened || view.editingId === void 0,
				onClick: call("remove"),
				children: view.deleteArmed ? "한 번 더 누르면 지워요" : "이 승차권 지우기"
			})
		]
	})] });
}
function PlacePage() {
	const rows = view.placeRows;
	return /* @__PURE__ */ a(M, { children: [/* @__PURE__ */ a("div", {
		class: "pp-bar",
		children: [/* @__PURE__ */ a("i", {
			id: "placeDot",
			class: view.placeVia ? "tf-dot via" : view.placeTo ? "tf-dot to" : "tf-dot",
			"aria-hidden": "true"
		}), /* @__PURE__ */ a("input", {
			id: "placeQuery",
			type: "search",
			placeholder: "역 · 장소 이름",
			enterkeyhint: "search",
			"aria-label": "장소 이름",
			"aria-controls": "placeList",
			value: view.placeQuery,
			onInput: (event) => call("placeInput")(event.currentTarget.value)
		})]
	}), /* @__PURE__ */ a("ul", {
		id: "placeList",
		class: "pp-list",
		hidden: view.placeHidden,
		children: typeof rows === "string" ? /* @__PURE__ */ a("li", {
			class: "empty",
			children: rows
		}) : rows.map((spot) => /* @__PURE__ */ a("li", { children: /* @__PURE__ */ a("button", {
			type: "button",
			onClick: () => call("placePick")(spot),
			children: [/* @__PURE__ */ a("b", { children: spot.name }), /* @__PURE__ */ a("small", { children: spot.address })]
		}) }))
	})] });
}
function altHTML(legs) {
	const note = [sameRoutes(legs), ...exitHints(legs)].filter(Boolean).join(" / ");
	return note ? `<span class="jp-alt">${esc(note)}</span>` : "";
}
function planHTML(plan) {
	return `<i class="rt-radio" aria-hidden="true"></i><span class="rt-b"><span class="jp-top"><strong class="jp-min"><small>약 </small>${plan.minutes}<small>분</small></strong>${plan.tag ? `<span class="jp-tag">${esc(plan.tag)}</span>` : ""}</span>${routeTrack(plan, view.colors, 250)}<span class="jp-meta">환승 ${plan.transfers}번 · 걷기 ${plan.walkMinutes}분</span>${altHTML(plan.legs)}</span>`;
}
function RouteFilters({ filter }) {
	return /* @__PURE__ */ a("div", {
		class: "rt-filters",
		children: [/* @__PURE__ */ a("div", {
			class: "segmented jkinds",
			role: "group",
			"aria-label": "경로 종류",
			children: filter.kinds.map((tab) => /* @__PURE__ */ a("button", {
				type: "button",
				"data-k": tab.kind,
				"aria-pressed": tab.pressed,
				onClick: () => call("routeKind")(tab.kind),
				children: [tab.name, /* @__PURE__ */ a("b", { children: tab.count })]
			}))
		}), /* @__PURE__ */ a("div", {
			class: "segmented jkinds",
			role: "group",
			"aria-label": "경로 차례",
			children: filter.sorts.map((tab) => /* @__PURE__ */ a("button", {
				type: "button",
				"data-s": tab.sort,
				"aria-pressed": tab.pressed,
				onClick: () => call("routeSort")(tab.pressed ? "" : tab.sort),
				children: tab.name
			}))
		})]
	});
}
function RouteVia() {
	const via = view.routeVia;
	return /* @__PURE__ */ a("div", {
		class: "tf-route rt-via",
		children: [/* @__PURE__ */ a("div", {
			class: "tf-pls",
			children: /* @__PURE__ */ a("button", {
				id: "routeVia",
				class: "tf-pl",
				type: "button",
				onClick: call("viaAdd"),
				children: [/* @__PURE__ */ a("i", {
					class: "tf-dot via",
					"aria-hidden": "true"
				}), /* @__PURE__ */ a("span", { children: [/* @__PURE__ */ a("small", { children: "경유" }), /* @__PURE__ */ a("b", {
					class: via ? "" : "ph",
					children: via ? via.name : "+ 경유지 넣기"
				})] })]
			})
		}), /* @__PURE__ */ a("button", {
			id: "routeViaClear",
			class: "rt-via-x",
			type: "button",
			hidden: !via,
			"aria-label": "경유지 빼기",
			title: "경유지 빼기",
			onClick: call("viaClear"),
			children: /* @__PURE__ */ a("svg", {
				viewBox: "0 0 24 24",
				width: "16",
				height: "16",
				"aria-hidden": "true",
				fill: "none",
				stroke: "currentColor",
				"stroke-width": "2.2",
				"stroke-linecap": "round",
				children: /* @__PURE__ */ a("path", { d: "M6 6l12 12M18 6 6 18" })
			})
		})]
	});
}
function RoutePage() {
	const filter = view.routeFilter, order = filter ? filter.order : view.plans.map((_plan, index) => index);
	return /* @__PURE__ */ a(M, { children: [
		/* @__PURE__ */ a("div", {
			class: "rt-sum",
			children: [/* @__PURE__ */ a("b", {
				id: "routeTrip",
				children: view.routeTrip
			}), /* @__PURE__ */ a("span", {
				id: "routeWhen",
				children: view.routeWhen
			})]
		}),
		/* @__PURE__ */ a(RouteVia, {}),
		filter && /* @__PURE__ */ a(RouteFilters, { filter }),
		/* @__PURE__ */ a("div", {
			id: "routeList",
			class: "rt-list",
			role: "radiogroup",
			"aria-label": "경로",
			children: order.map((index) => {
				const plan = view.plans[index];
				return /* @__PURE__ */ a("button", {
					type: "button",
					class: "rt-plan",
					role: "radio",
					"aria-checked": index === view.chosen ? "true" : "false",
					"aria-label": `${plan.tag || "경로"} 약 ${plan.minutes}분, 환승 ${plan.transfers}번`,
					onClick: () => call("plan")(index),
					dangerouslySetInnerHTML: { __html: planHTML(plan) }
				});
			})
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
			children: view.routeMsg
		}),
		view.routeLoading && /* @__PURE__ */ a(RouteLoading, {}),
		/* @__PURE__ */ a("div", {
			class: "rt-foot",
			hidden: !order.length,
			children: /* @__PURE__ */ a("button", {
				id: "routePick",
				class: "tf-save",
				type: "button",
				onClick: call("planPick"),
				children: "이 경로로"
			})
		})
	] });
}
var roots = [
	["menuTickets", TicketsPage],
	["menuTicket", TicketPage],
	["menuPlace", PlacePage],
	["menuRoute", RoutePage]
].map(([id, Page]) => [document.getElementById(id), Page]);
function set(patch) {
	view = {
		...view,
		...patch
	};
	for (const [root, Page] of roots) if (root) K(/* @__PURE__ */ a(Page, {}), root);
}
var ticketsView = {
	set,
	get state() {
		return view;
	},
	on(next) {
		handlers = next;
	}
};
for (const [root] of roots) if (root) root.textContent = "";
set({});
export { DAYS, altHTML, esc, shortName, ticketsView, timeParts };
