import { routeSteps, routeTrack } from "../lib/journey-ui.mjs";
import { Fragment as M, render as K } from "../npm/preact/dist/preact.mjs";
import { jsx as a } from "../npm/preact/jsx-runtime/dist/jsxRuntime.mjs";
import { StepList } from "../components/step_list.mjs";
import { RouteLoading } from "../components/route_card.mjs";
import { Segmented } from "../components/segmented.mjs";
import { DAYS, esc, shortName } from "./ticket_routes.mjs";
import { TicketCard, TicketFront, TicketList } from "../components/ticket_card.mjs";
import { PlaceField } from "../components/place_field.mjs";
import { TimeField } from "../components/time_field.mjs";
import { DayPicker } from "../components/day_picker.mjs";
import { RouteHead } from "../components/route_head.mjs";
import { SaveButton } from "../components/save_button.mjs";
// web/user/tickets_view.tsx
var todayDay = () => ((/* @__PURE__ */ new Date()).getDay() + 6) % 7 + 1;
function timeParts(time) {
	const [hour, minute] = (time || "08:00").split(":").map(Number);
	return {
		ampm: hour < 12 ? "오전" : "오후",
		clock: `${hour % 12 || 12}:${String(minute).padStart(2, "0")}`
	};
}
var CHEVRON = "<svg class=\"tf-chev\" viewBox=\"0 0 24 24\" aria-hidden=\"true\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"m9 6 6 6-6 6\"/></svg>";
var PLACE_TEXT = {
	from: [
		"출발",
		"출발지 고르기",
		"출발지",
		"ticketFrom"
	],
	to: [
		"도착",
		"도착지 고르기",
		"도착지",
		"ticketTo"
	]
};
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
	wheelOpen: false,
	sending: false,
	deleteArmed: false,
	fromHere: false,
	toHere: false,
	placeFor: null,
	placeQuery: "",
	placeHidden: true,
	placeRows: [],
	routeWhen: null,
	plans: [],
	chosen: -1,
	routeMsg: "",
	routeLoading: false,
	routeFilter: null,
	stepsOf: null,
	stepsOpen: null
};
var handlers = null;
var call = (key) => (...args) => (handlers?.[key])?.(...args);
var isToday = (ticket) => !!ticket.id && ticket.days.includes(todayDay());
function Card({ ticket, index }) {
	const stepsKey = `${view.listTurn}-${index}`, opened = view.stepsOpen === stepsKey;
	return /* @__PURE__ */ a(TicketCard, {
		ticket,
		today: isToday(ticket),
		flipped: !!view.flipped[index],
		chain: view.chains[index] ?? null,
		mapping: view.mapping === index,
		steps: opened && ticket.route ? routeSteps(ticket.route.legs, {
			from: ticket.from.name,
			to: ticket.to.name
		}, view.colors) : null,
		onFlip: () => call("ticketFlip")(index),
		onEdit: () => call("ticketEdit")(index),
		onMap: () => call("ticketMap")(index),
		onSteps: () => set({ stepsOpen: opened ? null : stepsKey })
	});
}
function TicketsPage() {
	return /* @__PURE__ */ a(TicketList, {
		onNew: call("ticketNew"),
		children: view.tickets.map((ticket, index) => /* @__PURE__ */ a(Card, {
			ticket,
			index
		}, `${view.listTurn}-${index}`))
	});
}
function Place({ which }) {
	const spot = view[which], active = view.placeFor === which, [head, empty, name, id] = PLACE_TEXT[which];
	return /* @__PURE__ */ a(PlaceField, {
		id,
		head,
		name,
		placeholder: view.opened ? empty : "",
		to: which === "to",
		value: active ? view.placeQuery : spot?.name ?? "",
		listHidden: !active || view.placeHidden,
		rows: view.placeRows,
		onFocus: () => call("placeFocus")(which),
		onInput: (value) => call("placeInput")(value),
		onPick: (found) => call("placePick")(found),
		onLeave: () => call("placeBlur")(which),
		onHere: () => call("here")(which),
		onCloseList: () => set({ placeHidden: true })
	});
}
function routeHTML(route) {
	if (!route) return `<span class="pk">경로 고르기</span>${CHEVRON}`;
	return `${routeTrack(route, view.colors, 270)}<span class="pk"><b>약 ${route.minutes}분</b> · 환승 ${route.transfers}</span><u>바꾸기</u>`;
}
function TicketPage() {
	const { opened } = view, time = timeParts(view.time), draft = {
		id: view.editingId,
		name: view.name.trim(),
		depart: view.time,
		days: view.days
	};
	return /* @__PURE__ */ a(M, { children: [/* @__PURE__ */ a("div", {
		id: "ticketPreview",
		"aria-hidden": "true",
		children: opened && /* @__PURE__ */ a("div", {
			class: "ticket",
			children: /* @__PURE__ */ a("div", {
				class: "ticket-in",
				children: /* @__PURE__ */ a(TicketFront, {
					ticket: draft,
					today: isToday(draft)
				})
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
					children: [/* @__PURE__ */ a(Place, { which: "from" }), /* @__PURE__ */ a(Place, { which: "to" })]
				})
			}),
			/* @__PURE__ */ a(TimeField, {
				open: view.wheelOpen,
				text: opened ? time : null,
				value: view.time,
				onToggle: call("timeToggle"),
				onDone: call("timeDone")
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
			/* @__PURE__ */ a(DayPicker, {
				days: view.days,
				onDay: (day) => call("day")(day),
				onQuick: (days) => call("quick")(days)
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
			/* @__PURE__ */ a(SaveButton, {
				id: "ticketSave",
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
function planHTML(plan) {
	return `<i class="rt-radio" aria-hidden="true"></i><span class="rt-b"><span class="jp-top"><strong class="jp-min"><small>약 </small>${plan.minutes}<small>분</small></strong>${plan.tag ? `<span class="jp-tag">${esc(plan.tag)}</span>` : ""}</span>${routeTrack(plan, view.colors, 250)}</span>`;
}
function RouteFilters({ filter }) {
	return /* @__PURE__ */ a("div", {
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
			onPick: (kind) => call("routeKind")(kind)
		})
	});
}
function RoutePage() {
	const filter = view.routeFilter, order = filter ? filter.order : view.plans.map((_plan, index) => index);
	return /* @__PURE__ */ a(M, { children: [
		/* @__PURE__ */ a(RouteHead, {
			when: view.routeWhen,
			from: view.from?.name,
			to: view.to?.name
		}),
		filter && /* @__PURE__ */ a(RouteFilters, { filter }),
		/* @__PURE__ */ a("div", {
			id: "routeList",
			class: "rt-list",
			role: "radiogroup",
			"aria-label": "경로",
			children: order.map((index) => {
				const plan = view.plans[index], opened = view.stepsOf === plan;
				return /* @__PURE__ */ a("div", {
					class: "rt-item",
					children: [/* @__PURE__ */ a("div", {
						class: "rt-card",
						children: [/* @__PURE__ */ a("button", {
							type: "button",
							class: "rt-plan",
							role: "radio",
							"aria-checked": index === view.chosen ? "true" : "false",
							"aria-label": `${plan.tag || "경로"} 약 ${plan.minutes}분, 환승 ${plan.transfers}번`,
							onClick: () => call("plan")(index),
							dangerouslySetInnerHTML: { __html: planHTML(plan) }
						}), /* @__PURE__ */ a("button", {
							type: "button",
							class: "rt-open",
							"aria-expanded": opened ? "true" : "false",
							"aria-label": "경로 자세히 보기",
							onClick: () => set({ stepsOf: opened ? null : plan }),
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
					}), opened && /* @__PURE__ */ a("div", {
						class: "rt-steps",
						children: [/* @__PURE__ */ a("p", {
							class: "jp-meta",
							children: `환승 ${plan.transfers}번 · 걷기 ${plan.walkMinutes}분`
						}), /* @__PURE__ */ a(StepList, {
							steps: routeSteps(plan.legs, {
								from: view.from?.name ?? "출발",
								to: view.to?.name ?? "도착"
							}, view.colors),
							className: "jsteps shown"
						})]
					})]
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
			children: /* @__PURE__ */ a(SaveButton, {
				id: "routePick",
				onClick: call("planPick"),
				children: "이 경로로"
			})
		})
	] });
}
var roots = [
	["menuTickets", TicketsPage],
	["menuTicket", TicketPage],
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
export { DAYS, esc, shortName, ticketsView, timeParts };
