import { jsx as a } from "../npm/preact/jsx-runtime/dist/jsxRuntime.mjs";
// web/components/place_field.tsx
var PIN = "<svg viewBox=\"0 0 24 24\" width=\"20\" height=\"20\" aria-hidden=\"true\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><circle cx=\"12\" cy=\"12\" r=\"3.2\"/><circle cx=\"12\" cy=\"12\" r=\"7.5\"/><path d=\"M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3\"/></svg>";
function PlaceResults({ id, label, hidden, rows, onPick }) {
	return /* @__PURE__ */ a("ul", {
		id,
		class: "pp-list tf-list",
		"aria-label": label,
		hidden,
		children: typeof rows === "string" ? /* @__PURE__ */ a("li", {
			class: "empty",
			children: rows
		}) : rows.map((found) => /* @__PURE__ */ a("li", { children: /* @__PURE__ */ a("button", {
			type: "button",
			onMouseDown: (event) => event.preventDefault(),
			onClick: (event) => {
				event.stopPropagation();
				onPick(found);
			},
			children: [/* @__PURE__ */ a("b", { children: found.name }), /* @__PURE__ */ a("small", { children: found.address })]
		}) }))
	});
}
function PlaceField({ id, head, name, placeholder, to = false, value, listHidden, rows, onFocus, onInput, onPick, onLeave, onHere, onCloseList }) {
	return /* @__PURE__ */ a("div", {
		class: "tf-fld",
		onFocusOut: (event) => {
			const next = event.relatedTarget;
			if (!next || !event.currentTarget.contains(next)) onLeave();
		},
		children: [/* @__PURE__ */ a("div", {
			class: "tf-row",
			children: [/* @__PURE__ */ a("label", {
				class: "tf-pl",
				children: [/* @__PURE__ */ a("i", {
					class: to ? "tf-dot to" : "tf-dot",
					"aria-hidden": "true"
				}), /* @__PURE__ */ a("span", { children: [/* @__PURE__ */ a("small", { children: head }), /* @__PURE__ */ a("input", {
					id,
					type: "text",
					maxlength: 40,
					autocomplete: "off",
					"aria-label": name,
					"aria-controls": `${id}List`,
					placeholder,
					value,
					onFocus: (event) => {
						onFocus();
						event.currentTarget.select();
					},
					onInput: (event) => onInput(event.currentTarget.value),
					onKeyDown: (event) => {
						if (event.key === "Enter") event.preventDefault();
						else if (event.key === "Escape" && !listHidden) {
							event.stopPropagation();
							onCloseList();
						}
					}
				})] })]
			}), /* @__PURE__ */ a("button", {
				id: `${id}Here`,
				class: "tf-here",
				type: "button",
				"aria-label": `내 위치를 ${name}로`,
				title: "내 위치",
				onClick: onHere,
				dangerouslySetInnerHTML: { __html: PIN }
			})]
		}), /* @__PURE__ */ a(PlaceResults, {
			id: `${id}List`,
			label: `${name} 찾기 결과`,
			hidden: listHidden,
			rows,
			onPick
		})]
	});
}
export { PlaceField, PlaceResults };
