import { Fragment as M } from "../npm/preact/dist/preact.mjs";
import { jsx as a } from "../npm/preact/jsx-runtime/dist/jsxRuntime.mjs";
// web/components/layer_sheet.tsx
var LayerSheet = ({ label, labelledBy, children }) => /* @__PURE__ */ a(M, { children: [/* @__PURE__ */ a("div", { class: "login-scrim" }), /* @__PURE__ */ a("div", {
	class: "login-card",
	role: "dialog",
	"aria-modal": "true",
	"aria-label": label,
	"aria-labelledby": labelledBy,
	children: [/* @__PURE__ */ a("div", { class: "login-grab" }), children]
})] });
export { LayerSheet };
