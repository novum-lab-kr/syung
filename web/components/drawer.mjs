import { Fragment as M } from "../npm/preact/dist/preact.mjs";
import { jsx as a } from "../npm/preact/jsx-runtime/dist/jsxRuntime.mjs";
// web/components/drawer.tsx
var BACK = /* @__PURE__ */ a("svg", {
	viewBox: "0 0 24 24",
	"aria-hidden": "true",
	fill: "none",
	stroke: "currentColor",
	"stroke-width": "2",
	"stroke-linecap": "round",
	"stroke-linejoin": "round",
	children: /* @__PURE__ */ a("path", { d: "m15 6-6 6 6 6" })
});
var CLOSE = /* @__PURE__ */ a("svg", {
	viewBox: "0 0 24 24",
	"aria-hidden": "true",
	fill: "none",
	stroke: "currentColor",
	"stroke-width": "2",
	"stroke-linecap": "round",
	children: /* @__PURE__ */ a("path", { d: "M6 6l12 12M18 6 6 18" })
});
var CHEVRON = /* @__PURE__ */ a("svg", {
	class: "menu-chev",
	viewBox: "0 0 24 24",
	"aria-hidden": "true",
	fill: "none",
	stroke: "currentColor",
	"stroke-width": "2",
	"stroke-linecap": "round",
	"stroke-linejoin": "round",
	children: /* @__PURE__ */ a("path", { d: "m9 6 6 6-6 6" })
});
var DrawerHead = ({ title, back = false }) => /* @__PURE__ */ a(M, { children: [
	/* @__PURE__ */ a("button", {
		id: "menuBack",
		class: "menu-back",
		type: "button",
		"aria-label": "메뉴로 돌아가기",
		hidden: !back,
		children: BACK
	}),
	/* @__PURE__ */ a("h2", {
		id: "settingsTitle",
		children: title
	}),
	/* @__PURE__ */ a("button", {
		id: "settingsClose",
		class: "menu-close",
		type: "button",
		"aria-label": "메뉴 닫기",
		children: CLOSE
	})
] });
var MenuItem = ({ page, icon, name, id, nameId, hidden, disabled }) => /* @__PURE__ */ a("button", {
	id,
	class: "menu-item",
	type: "button",
	"data-menu-page": page,
	"aria-controls": page,
	hidden,
	disabled,
	children: [
		icon,
		/* @__PURE__ */ a("span", {
			id: nameId,
			class: "setting-name",
			children: name
		}),
		CHEVRON
	]
});
function SettingSwitch({ id, name, note, icon, pressed, disabled, nameId, noteId, describedBy, controls, onClick }) {
	return /* @__PURE__ */ a("button", {
		id,
		class: "setting-switch",
		type: "button",
		"aria-pressed": pressed ? "true" : "false",
		"aria-labelledby": nameId,
		"aria-describedby": describedBy,
		"aria-controls": controls,
		disabled,
		onClick: () => onClick?.(),
		children: [
			icon,
			/* @__PURE__ */ a("span", {
				class: "setting-name",
				children: [nameId ? /* @__PURE__ */ a("span", {
					id: nameId,
					children: name
				}) : name, /* @__PURE__ */ a("small", {
					id: noteId,
					children: note
				})]
			}),
			/* @__PURE__ */ a("i", {
				class: "switch",
				"aria-hidden": "true"
			})
		]
	});
}
export { DrawerHead, MenuItem, SettingSwitch };
