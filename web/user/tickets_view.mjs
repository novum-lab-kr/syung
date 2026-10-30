import { routeSteps, routeTrack } from "../lib/journey-ui.mjs";
import { Fragment as M, render as K } from "../npm/preact/dist/preact.mjs";
import { jsx as a } from "../npm/preact/jsx-runtime/dist/jsxRuntime.mjs";
import { DAYS, esc, shortName } from "./ticket_routes.mjs";
import { TicketCard, TicketList } from "../components/ticket_card.mjs";
import { PlaceField } from "../components/place_field.mjs";
import { TimeField } from "../components/time_field.mjs";
import { DayPicker } from "../components/day_picker.mjs";
import { TicketForm } from "../components/ticket_form.mjs";
import { RoutePicker } from "../components/route_picker.mjs";
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
	return /* @__PURE__ */ a(TicketForm, {
		preview: opened ? {
			ticket: draft,
			today: isToday(draft)
		} : null,
		places: /* @__PURE__ */ a(M, { children: [/* @__PURE__ */ a(Place, { which: "from" }), /* @__PURE__ */ a(Place, { which: "to" })] }),
		time: /* @__PURE__ */ a(TimeField, {
			open: view.wheelOpen,
			text: opened ? time : null,
			value: view.time,
			onToggle: call("timeToggle"),
			onDone: call("timeDone")
		}),
		days: /* @__PURE__ */ a(DayPicker, {
			days: view.days,
			onDay: (day) => call("day")(day),
			onQuick: (days) => call("quick")(days)
		}),
		routeHTML: opened ? routeHTML(view.route) : "",
		routeEmpty: opened && !view.route,
		name: view.name,
		sending: view.sending,
		saveDisabled: view.sending || opened && !view.route,
		deleteHidden: !opened || view.editingId === void 0,
		deleteArmed: view.deleteArmed,
		onRoute: call("route"),
		onName: (value) => call("name")(value),
		onSubmit: call("submit"),
		onDelete: call("remove")
	});
}
function RoutePage() {
	const filter = view.routeFilter;
	const rows = (filter ? filter.order : view.plans.map((_plan, index) => index)).map((index) => {
		const plan = view.plans[index];
		return {
			index,
			plan,
			chosen: index === view.chosen,
			steps: view.stepsOf === plan ? routeSteps(plan.legs, {
				from: view.from?.name ?? "출발",
				to: view.to?.name ?? "도착"
			}, view.colors) : null
		};
	});
	return /* @__PURE__ */ a(RoutePicker, {
		when: view.routeWhen,
		from: view.from?.name,
		to: view.to?.name,
		filter,
		rows,
		colors: view.colors,
		message: view.routeMsg,
		loading: view.routeLoading,
		onKind: (kind) => call("routeKind")(kind),
		onPlan: (index) => call("plan")(index),
		onSteps: (plan) => set({ stepsOf: view.stepsOf === plan ? null : plan }),
		onPick: call("planPick")
	});
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
