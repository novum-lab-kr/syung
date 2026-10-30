import { Fragment as M } from "../npm/preact/dist/preact.mjs";
import { jsx as a } from "../npm/preact/jsx-runtime/dist/jsxRuntime.mjs";
import { TicketFront } from "./ticket_card.mjs";
import { SaveButton } from "./save_button.mjs";
// web/components/ticket_form.tsx
function TicketForm({ preview, places, time, days, routeHTML, routeEmpty, name, sending, saveDisabled, deleteHidden, deleteArmed, onRoute, onName, onSubmit, onDelete }) {
	return /* @__PURE__ */ a(M, { children: [/* @__PURE__ */ a("div", {
		id: "ticketPreview",
		"aria-hidden": "true",
		children: preview && /* @__PURE__ */ a("div", {
			class: "ticket",
			children: /* @__PURE__ */ a("div", {
				class: "ticket-in",
				children: /* @__PURE__ */ a(TicketFront, {
					ticket: preview.ticket,
					today: preview.today
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
			onSubmit?.();
		},
		children: [
			/* @__PURE__ */ a("div", {
				class: "tf-route",
				children: /* @__PURE__ */ a("div", {
					class: "tf-pls",
					children: places
				})
			}),
			time,
			/* @__PURE__ */ a("span", {
				id: "ticketRouteLabel",
				class: "tf-l",
				children: "경로"
			}),
			/* @__PURE__ */ a("button", {
				id: "ticketRoute",
				class: routeEmpty ? "tf-pick empty" : "tf-pick",
				type: "button",
				"aria-labelledby": "ticketRouteLabel ticketRoute",
				onClick: () => onRoute?.(),
				dangerouslySetInnerHTML: { __html: routeHTML }
			}),
			days,
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
					value: name,
					onInput: (event) => onName?.(event.currentTarget.value)
				}), /* @__PURE__ */ a("small", {
					id: "ticketNameCount",
					"aria-hidden": "true",
					children: `${[...name].length}/12`
				})]
			}),
			/* @__PURE__ */ a(SaveButton, {
				id: "ticketSave",
				type: "submit",
				disabled: saveDisabled,
				children: sending ? "발권하는 중…" : "발권하기"
			}),
			/* @__PURE__ */ a("button", {
				id: "ticketDelete",
				class: "tf-del",
				type: "button",
				hidden: deleteHidden,
				onClick: () => onDelete?.(),
				children: deleteArmed ? "한 번 더 누르면 지워요" : "이 승차권 지우기"
			})
		]
	})] });
}
export { TicketForm };
