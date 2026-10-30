import { jsx as a } from "../npm/preact/jsx-runtime/dist/jsxRuntime.mjs";
// web/components/chip.tsx
function Chip(props) {
	if (props.kind === "tag") return /* @__PURE__ */ a("span", {
		class: "jp-tag",
		children: props.children
	});
	const style = props.color === void 0 ? void 0 : `--c:${props.color};--t:${props.ink ?? "#fff"}`;
	return /* @__PURE__ */ a("span", {
		class: "js-chip",
		style,
		children: [props.icon, props.children]
	});
}
export { Chip };
