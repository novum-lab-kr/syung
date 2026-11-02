import { Fragment as M, render as K } from "../npm/preact/dist/preact.mjs";
import { jsx as a } from "../npm/preact/jsx-runtime/dist/jsxRuntime.mjs";
import { JourneyStep, PlaceEndsCard, PlaceHereRow, PlacePickedSheet, PlaceSearch, PlaceSearchField } from "../components/place_search.mjs";
import { RouteCard, RouteFailed, RouteLoading, RouteNote } from "../components/route_card.mjs";
import { JourneyBar, JourneySummary } from "../components/journey_summary.mjs";
import { JourneyWhen } from "../components/journey_when.mjs";
import { Segmented } from "../components/segmented.mjs";
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
				note: card.note,
				onPick: (pick) => actions.card(pick),
				onTicket: (pick) => actions.ticket(pick)
			}))
		}),
		/* @__PURE__ */ a(RouteNote, {})
	] });
}
function Search({ view, actions }) {
	const { title, query, hits, pending, failed, fixed, here } = view.search;
	return /* @__PURE__ */ a(PlaceSearch, {
		title,
		query,
		hits,
		pending,
		failed,
		notice: view.notice ?? "",
		onPick: actions.place,
		onRetry: actions.retrySeek,
		here: here ? /* @__PURE__ */ a(PlaceHereRow, { onPick: actions.here }) : null,
		children: fixed ? /* @__PURE__ */ a(PlaceEndsCard, {
			fixedName: fixed.name,
			fixed: fixed.which,
			value: query,
			onInput: actions.typed,
			onClear: actions.clear,
			onEnter: actions.enter
		}) : /* @__PURE__ */ a(PlaceSearchField, {
			value: query,
			onInput: actions.typed,
			onClear: actions.clear,
			onEnter: actions.enter
		})
	});
}
function JourneySheet({ view, actions }) {
	const step = /* @__PURE__ */ a(JourneyStep, {
		canBack: !!view.canBack,
		onPress: actions.leave
	});
	if (view.stage === "search") return /* @__PURE__ */ a("div", {
		class: "journey",
		children: [step, /* @__PURE__ */ a(Search, {
			view,
			actions
		})]
	});
	if (view.stage === "picked" && view.picked) return /* @__PURE__ */ a("div", {
		class: "journey",
		children: [step, /* @__PURE__ */ a(PlacePickedSheet, {
			hit: view.picked,
			notice: view.notice ?? "",
			onEnd: actions.end,
			onArrivals: actions.arrivals
		})]
	});
	return /* @__PURE__ */ a("div", {
		class: "journey done",
		children: [
			step,
			/* @__PURE__ */ a("div", {
				class: "jtop",
				children: [/* @__PURE__ */ a(JourneySummary, {
					summary: view.summary,
					onEnd: actions.changeEnd,
					onSwap: actions.swap
				}), /* @__PURE__ */ a(JourneyWhen, {
					text: view.whenText,
					isSet: view.whenAt,
					open: view.whenOpen,
					onRow: actions.whenRow,
					onNow: actions.whenNow,
					onGo: actions.whenGo
				})]
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
	onClear: actions.clear,
	onFresh: actions.fresh
}), host);
export { JourneySheet, clearJourney, drawJourney, drawJourneyBar };
