import { jsx as a } from "../npm/preact/jsx-runtime/dist/jsxRuntime.mjs";
// web/components/segmented.tsx
function Segmented({ label, class: extra, attr, items, onPick }) {
	return /* @__PURE__ */ a("div", {
		class: extra ? `segmented ${extra}` : "segmented",
		role: "group",
		"aria-label": label,
		children: items.map((item) => {
			const data = { [`data-${attr}`]: item.id };
			return /* @__PURE__ */ a("button", {
				type: "button",
				...data,
				"aria-pressed": item.pressed,
				onClick: () => onPick(item.id),
				children: [item.name, item.count !== void 0 && /* @__PURE__ */ a("b", { children: item.count })]
			});
		})
	});
}
export { Segmented };
