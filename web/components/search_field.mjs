import { Fragment as M } from "../npm/preact/dist/preact.mjs";
import { jsx as a } from "../npm/preact/jsx-runtime/dist/jsxRuntime.mjs";
// web/components/search_field.tsx
function SearchList({ hits, marked = -1 }) {
	if (!hits.length) return /* @__PURE__ */ a("li", {
		class: "search-empty",
		role: "option",
		"aria-disabled": "true",
		children: "찾는 역이 없어요"
	}, "empty");
	return /* @__PURE__ */ a(M, { children: hits.map((hit, index) => /* @__PURE__ */ a("li", {
		id: `sr-${index}`,
		role: "option",
		"aria-selected": index === marked ? "true" : "false",
		"data-k": String(index),
		children: [/* @__PURE__ */ a("b", { children: hit.name }), /* @__PURE__ */ a("span", { children: hit.lines.map((line) => /* @__PURE__ */ a("i", {
			style: `--c:${line.color}`,
			children: line.name
		})) })]
	})) });
}
export { SearchList };
