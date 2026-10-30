import { jsx as a } from "../npm/preact/jsx-runtime/dist/jsxRuntime.mjs";
// web/components/profile_card.tsx
var BADGE = /* @__PURE__ */ a("svg", {
	class: "pf-badge",
	viewBox: "0 0 24 24",
	"aria-hidden": "true",
	fill: "none",
	stroke: "currentColor",
	"stroke-width": "2.2",
	"stroke-linecap": "round",
	"stroke-linejoin": "round",
	children: /* @__PURE__ */ a("path", { d: "M4 20h4L19 9l-4-4L4 16z" })
});
function ProfileCard({ name, provider, look, onEdit }) {
	return /* @__PURE__ */ a("div", {
		class: "account-prof",
		children: [/* @__PURE__ */ a("button", {
			id: "accountAvatarBig",
			class: `account-avatar big ${look?.photo ? "photo" : "face"}`,
			type: "button",
			"aria-label": "프로필 수정",
			"aria-haspopup": "dialog",
			style: look ? { backgroundImage: look.image } : void 0,
			onClick: () => onEdit?.(),
			children: BADGE
		}), /* @__PURE__ */ a("div", {
			class: "pf-who",
			children: [/* @__PURE__ */ a("div", {
				class: "pf-name",
				children: /* @__PURE__ */ a("b", {
					id: "accountName",
					children: name
				})
			}), /* @__PURE__ */ a("small", {
				id: "accountProvider",
				children: provider
			})]
		})]
	});
}
export { ProfileCard };
