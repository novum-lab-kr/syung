import { jsx as a } from "../npm/preact/jsx-runtime/dist/jsxRuntime.mjs";
// web/components/save_button.tsx
function SaveButton({ id, type = "button", disabled, onClick, children }) {
	return /* @__PURE__ */ a("button", {
		id,
		class: "tf-save",
		type,
		disabled,
		onClick,
		children
	});
}
export { SaveButton };
