import { jsx as a } from "../npm/preact/jsx-runtime/dist/jsxRuntime.mjs";
// web/components/login_button.tsx
var LoginButton = () => /* @__PURE__ */ a("button", {
	id: "loginOpen",
	class: "login-open",
	type: "button",
	"aria-haspopup": "dialog",
	"aria-controls": "loginSheet",
	children: [
		/* @__PURE__ */ a("span", {
			class: "account-avatar face",
			"aria-hidden": "true"
		}),
		/* @__PURE__ */ a("span", {
			class: "login-open-name",
			children: "로그인"
		}),
		/* @__PURE__ */ a("svg", {
			class: "login-open-go",
			viewBox: "0 0 24 24",
			"aria-hidden": "true",
			fill: "none",
			stroke: "currentColor",
			"stroke-width": "2.4",
			"stroke-linecap": "round",
			"stroke-linejoin": "round",
			children: /* @__PURE__ */ a("path", { d: "M5 12h13M13 6l6 6-6 6" })
		})
	]
});
export { LoginButton };
