import { jsx as a } from "../npm/preact/jsx-runtime/dist/jsxRuntime.mjs";
// web/components/button.tsx
function Button({ variant = "primary", class: extra, type = "button", disabled = false, loading, label, expanded, onClick, children }) {
	const busy = loading !== void 0 && loading !== null && loading !== false, off = disabled || busy;
	const classes = [
		"sy-btn",
		`sy-btn-${variant}`,
		extra
	].filter(Boolean).join(" ");
	return /* @__PURE__ */ a("button", {
		type,
		class: classes,
		"aria-label": label,
		"aria-expanded": expanded === void 0 ? void 0 : expanded ? "true" : "false",
		"aria-disabled": off ? "true" : void 0,
		onClick: (event) => {
			if (!off) onClick?.(event);
		},
		children: busy ? loading : children
	});
}
export { Button };
