import { Fragment as M } from "../npm/preact/dist/preact.mjs";
import { jsx as a } from "../npm/preact/jsx-runtime/dist/jsxRuntime.mjs";
import { TextField } from "./text_field.mjs";
// web/components/profile_form.tsx
var CHARACTERS = [
	["sprout", "새싹 볼빵 후디"],
	["builder", "꼬마 건설 반장"],
	["seonbi", "갓 쓴 꼬마 선비"],
	["visitor", "두근두근 나들이"],
	["scv", "테란 SCV"],
	["drone", "저그 드론"],
	["probe", "프로토스 프로브"]
];
var CAMERA = /* @__PURE__ */ a("svg", {
	viewBox: "0 0 24 24",
	"aria-hidden": "true",
	fill: "none",
	stroke: "currentColor",
	"stroke-width": "1.9",
	"stroke-linecap": "round",
	"stroke-linejoin": "round",
	children: [/* @__PURE__ */ a("path", { d: "M4 8h3l2-3h6l2 3h3v11H4z" }), /* @__PURE__ */ a("circle", {
		cx: "12",
		cy: "13",
		r: "3.5"
	})]
});
var CLOSE = /* @__PURE__ */ a("svg", {
	viewBox: "0 0 24 24",
	"aria-hidden": "true",
	fill: "none",
	stroke: "currentColor",
	"stroke-width": "2.2",
	"stroke-linecap": "round",
	children: /* @__PURE__ */ a("path", { d: "M6 6l12 12M18 6L6 18" })
});
var ProfileSheetBody = () => /* @__PURE__ */ a(M, { children: [
	/* @__PURE__ */ a("button", {
		id: "profileClose",
		class: "profile-x",
		type: "button",
		"aria-label": "닫기",
		children: CLOSE
	}),
	/* @__PURE__ */ a("div", {
		id: "profileBody",
		class: "profile-body"
	}),
	/* @__PURE__ */ a("p", {
		id: "profileMsg",
		class: "login-msg",
		role: "status",
		"aria-live": "polite"
	})
] });
var pressed = (marked, on) => {
	if (!marked) return void 0;
	return on ? "true" : "false";
};
function ProfileForm({ name, count, over, photoImage, choice, marked, facesLoaded, saving, converting, onName, onSave, onCancel, onPickPhoto, onPhotoFile, onPickCharacter }) {
	const lock = saving || converting;
	return /* @__PURE__ */ a("form", {
		id: "profileForm",
		class: "pf-form",
		onSubmit: (event) => {
			event.preventDefault();
			onSave?.();
		},
		children: [
			/* @__PURE__ */ a(TextField, {
				id: "nameInput",
				class: "pf-in",
				label: "닉네임",
				maxLength: 40,
				autocomplete: "nickname",
				value: name,
				disabled: saving,
				count,
				countId: "nameCount",
				over,
				onInput: onName
			}),
			/* @__PURE__ */ a("div", {
				id: "avatarPick",
				class: "pf-pick",
				children: [
					/* @__PURE__ */ a("p", {
						class: "pf-l",
						children: "사진 · 캐릭터"
					}),
					/* @__PURE__ */ a("div", {
						id: "avatarChoices",
						class: "pf-choices",
						role: "group",
						"aria-label": "프로필 사진 고르기",
						children: [/* @__PURE__ */ a("button", {
							id: "photoPick",
							class: photoImage ? "pf-choice pf-photo photo" : "pf-choice pf-photo",
							type: "button",
							"aria-label": "사진 올리기",
							"aria-pressed": pressed(marked, choice === "photo"),
							style: photoImage ? { backgroundImage: photoImage } : void 0,
							disabled: lock,
							onClick: () => onPickPhoto?.(),
							children: [CAMERA, /* @__PURE__ */ a("span", { children: "사진" })]
						}), CHARACTERS.map(([id, label]) => /* @__PURE__ */ a("button", {
							type: "button",
							class: "pf-choice",
							"data-character": id,
							"aria-label": label,
							title: label,
							"aria-pressed": pressed(marked, id === choice),
							style: facesLoaded ? { backgroundImage: `url("./brand/faces/${id}-240.png")` } : void 0,
							disabled: saving,
							onClick: () => onPickCharacter?.(id)
						}))]
					}),
					/* @__PURE__ */ a("input", {
						id: "photoFile",
						type: "file",
						accept: "image/*",
						hidden: true,
						onChange: (event) => {
							const file = event.currentTarget.files?.[0];
							event.currentTarget.value = "";
							onPhotoFile?.(file);
						}
					}),
					/* @__PURE__ */ a("p", {
						class: "pf-note",
						children: "가운데를 정사각형으로 잘라 올려요. 위치 같은 사진 정보는 빼요."
					})
				]
			}),
			/* @__PURE__ */ a("div", {
				class: "pf-row",
				children: [/* @__PURE__ */ a("button", {
					id: "profileCancel",
					type: "button",
					disabled: saving,
					onClick: () => onCancel?.(),
					children: "취소"
				}), /* @__PURE__ */ a("button", {
					id: "profileSave",
					type: "submit",
					class: "pf-ok",
					disabled: lock,
					children: converting ? "사진 준비 중" : "저장"
				})]
			})
		]
	});
}
export { CHARACTERS, ProfileForm, ProfileSheetBody };
