import { Fragment as M, render as K } from "../npm/preact/dist/preact.mjs";
import { jsx as a } from "../npm/preact/jsx-runtime/dist/jsxRuntime.mjs";
import { JourneyFields, JourneyPlaceList } from "../components/journey_fields.mjs";
import { RouteCard, RouteFailed, RouteLoading, RouteNote } from "../components/route_card.mjs";
import { JourneyBar, JourneySummary } from "../components/journey_summary.mjs";
import { Segmented } from "../components/segmented.mjs";
import { JourneyWhen } from "../components/journey_when.mjs";
// web/ui/journey_sheet.tsx
function Result({ result, actions }) {
	if (result.kind === "none") return null;
	if (result.kind === "loading") return /* @__PURE__ */ a(RouteLoading, {});
	if (result.kind === "failed") return /* @__PURE__ */ a(RouteFailed, {
		message: result.message,
		onRetry: actions.retry
	});
	return /* @__PURE__ */ a(M, { children: [
		result.tabs && /* @__PURE__ */ a(Segmented, {
			label: "경로 종류",
			class: "jkinds",
			attr: "k",
			items: result.tabs.map((tab) => ({
				id: tab.kind,
				name: tab.name,
				count: tab.count,
				pressed: tab.pressed
			})),
			onPick: (kind) => actions.tab(kind)
		}),
		/* @__PURE__ */ a("div", {
			class: "jplans",
			children: result.cards.map((card, index) => /* @__PURE__ */ a(RouteCard, {
				plan: card.plan,
				index,
				on: card.on,
				hidden: card.hidden,
				onPick: (pick) => actions.card(pick)
			}))
		}),
		/* @__PURE__ */ a(RouteNote, {})
	] });
}
function JourneySheet({ view, actions }) {
	return /* @__PURE__ */ a("div", {
		class: view.done ? "journey done" : "journey",
		children: [
			/* @__PURE__ */ a("h3", { children: "길찾기" }),
			/* @__PURE__ */ a(JourneySummary, {
				hidden: !view.done,
				summary: view.summary,
				onOpen: actions.summary
			}),
			/* @__PURE__ */ a(JourneyFields, {
				here: view.here,
				fromValue: view.here ? "내 위치" : "",
				onTyped: actions.typed,
				onHere: actions.here,
				onSwap: actions.swap
			}),
			/* @__PURE__ */ a(JourneyPlaceList, {
				id: "jFromList",
				label: "출발지 찾기 결과",
				list: view.lists.from,
				onPick: (place) => actions.place("from", place)
			}),
			/* @__PURE__ */ a(JourneyPlaceList, {
				id: "jToList",
				label: "도착지 찾기 결과",
				list: view.lists.to,
				onPick: (place) => actions.place("to", place)
			}),
			/* @__PURE__ */ a(JourneyWhen, {
				text: view.whenText,
				isSet: view.whenAt,
				open: view.whenOpen,
				draft: view.draft,
				hold: actions.hold,
				onRow: actions.whenRow,
				onNow: actions.whenNow,
				onGo: actions.whenGo,
				onDay: actions.day
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
var drawJourneyBar = (host, bar, actions) => K(/* @__PURE__ */ a(JourneyBar, {
	bar,
	onOpen: actions.open,
	onClear: actions.clear
}), host);
export { JourneySheet, clearJourney, drawJourney, drawJourneyBar };
