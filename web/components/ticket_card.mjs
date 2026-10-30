import { Fragment as M } from "../npm/preact/dist/preact.mjs";
import { jsx as a } from "../npm/preact/jsx-runtime/dist/jsxRuntime.mjs";
import { DOWN } from "./icons.mjs";
import { StepList } from "./step_list.mjs";
import { DAYS, esc, shortName } from "../user/ticket_routes.mjs";
import { Button } from "./button.mjs";
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
var daysText = (days) => days.length ? days.map((day) => DAYS[day - 1]).join(" ") : "없음";
function TicketFront({ ticket, today }) {
	const name = ticket.name || "승차권", label = ticket.name ? `${name}권` : name;
	const serial = `${ticket.id ? String(ticket.id).padStart(4, "0") : "----"} ${ticket.days.map((day) => DAYS[day - 1]).join("")} ${(ticket.depart || "").replace(":", "")}`;
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
function TicketCard({ ticket, today, flipped, chain, mapping, steps, onFlip, onEdit, onMap, onSteps }) {
	const waiting = `<span>${esc(shortName(ticket.from.name))}</span><em>→</em><span>${esc(shortName(ticket.to.name))}</span>`;
	return /* @__PURE__ */ a(M, { children: [/* @__PURE__ */ a("div", {
		class: flipped ? "ticket flipped" : "ticket",
		onClick: (event) => {
			if (event.target.closest(".tk-steps-btn")) {
				event.stopPropagation();
				onSteps();
				return;
			}
			if (event.target.closest(".tk-edit")) {
				event.stopPropagation();
				onEdit();
				return;
			}
			if (event.target.closest(".tk-map")) {
				event.stopPropagation();
				onMap();
				return;
			}
			onFlip();
		},
		children: /* @__PURE__ */ a("div", {
			class: "ticket-in",
			children: [/* @__PURE__ */ a(TicketFront, {
				ticket,
				today
			}), /* @__PURE__ */ a("div", {
				class: "tk-face tk-back",
				children: [
					/* @__PURE__ */ a("p", {
						class: chain === null ? "tk-chain wait" : "tk-chain",
						dangerouslySetInnerHTML: { __html: chain ?? waiting }
					}),
					ticket.route && /* @__PURE__ */ a("div", {
						class: "tk-alts",
						children: /* @__PURE__ */ a(Button, {
							variant: "text",
							class: "on-ticket tk-steps-btn",
							expanded: steps !== null,
							children: ["경로 자세히", DOWN]
						})
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
							children: [/* @__PURE__ */ a(Button, {
								variant: "secondary",
								class: "on-ticket tk-map",
								loading: mapping ? "찾는 중…" : void 0,
								children: "지도에서 보기"
							}), /* @__PURE__ */ a(Button, {
								class: "on-ticket tk-edit",
								children: "고치기 ›"
							})]
						})]
					})
				]
			})]
		})
	}), ticket.route && steps && /* @__PURE__ */ a("div", {
		class: "tk-steps",
		children: /* @__PURE__ */ a(StepList, {
			steps,
			className: "jsteps shown"
		})
	})] });
}
function TicketList({ onNew, children }) {
	return /* @__PURE__ */ a(M, { children: [/* @__PURE__ */ a("div", {
		id: "ticketList",
		class: "ticket-list",
		children
	}), /* @__PURE__ */ a("button", {
		id: "ticketNew",
		class: "ticket-new",
		type: "button",
		onClick: onNew,
		children: "+ 승차권 예매하기"
	})] });
}
export { TicketCard, TicketFront, TicketList };
