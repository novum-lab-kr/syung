import { Fragment as M } from "../npm/preact/dist/preact.mjs";
import { jsx as a } from "../npm/preact/jsx-runtime/dist/jsxRuntime.mjs";
// web/components/sheet_frame.tsx
var SheetFrame = ({ followLabel = "이 열차 따라가기", followHidden = true, children }) => /* @__PURE__ */ a(M, { children: [
	/* @__PURE__ */ a("button", {
		type: "button",
		class: "sheet-grab",
		"aria-label": "닫기",
		title: "끌어내리거나 눌러서 닫기"
	}),
	/* @__PURE__ */ a("button", {
		type: "button",
		class: "sheet-close",
		"aria-label": "닫기",
		children: "✕"
	}),
	/* @__PURE__ */ a("div", {
		class: "sheet-body",
		children
	}),
	/* @__PURE__ */ a("button", {
		type: "button",
		class: "sheet-follow",
		hidden: followHidden,
		children: followLabel
	})
] });
export { SheetFrame };
