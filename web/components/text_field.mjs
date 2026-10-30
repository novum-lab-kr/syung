import { jsx as a } from "../npm/preact/jsx-runtime/dist/jsxRuntime.mjs";
// web/components/text_field.tsx
function TextField({ id, label, value, class: extra, maxLength, autocomplete, placeholder, disabled, count, countId, over, onInput }) {
	return /* @__PURE__ */ a("label", {
		class: extra ? `tf-in ${extra}` : "tf-in",
		children: [/* @__PURE__ */ a("input", {
			id,
			maxlength: maxLength,
			autocomplete,
			placeholder,
			enterkeyhint: "done",
			"aria-label": label,
			"aria-describedby": countId,
			value,
			disabled,
			onInput: (event) => onInput?.(event.currentTarget.value)
		}), count !== void 0 && /* @__PURE__ */ a("small", {
			id: countId,
			class: over ? "over" : void 0,
			children: count
		})]
	});
}
export { TextField };
