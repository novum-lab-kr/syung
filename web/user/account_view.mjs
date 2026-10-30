import { Fragment as M, render as K } from "../npm/preact/dist/preact.mjs";
import { jsx as a } from "../npm/preact/jsx-runtime/dist/jsxRuntime.mjs";
import { LayerSheet } from "../components/layer_sheet.mjs";
import { LoginSheetBody, SocialButtons } from "../components/login_sheet.mjs";
import { ProfileCard } from "../components/profile_card.mjs";
import { CHARACTERS, ProfileForm as ProfileForm$1, ProfileSheetBody } from "../components/profile_form.mjs";
import { StatsPanel } from "../components/stats_panel.mjs";
// web/user/account_view.tsx
var PHOTO_URL = /^\/api\/me\/avatar\/[\w-]{32}\.(?:webp|jpg)$/;
var PROVIDER_NAMES = {
	kakao: "카카오",
	google: "구글",
	apple: "Apple"
};
var nameLength = (text) => [...text.trim()].length;
var monthDay = (seconds) => {
	const date = /* @__PURE__ */ new Date(seconds * 1e3);
	return `${date.getMonth() + 1}월 ${date.getDate()}일`;
};
function avatarLook(avatar, big = false) {
	const photo = avatar?.type === "photo" && PHOTO_URL.test(avatar.url);
	const id = avatar?.type === "character" && CHARACTERS.some(([key]) => key === avatar.id) ? avatar.id : "sprout";
	let image = "";
	if (photo) image = `url("${avatar.url}")`;
	else if (big || id !== "sprout") image = `url("./brand/faces/${id}-${big ? 240 : 84}.png")`;
	return {
		photo,
		image
	};
}
var currentChoice = (avatar) => {
	if (avatar?.type === "photo") return "photo";
	return avatar?.type === "character" ? avatar.id : "sprout";
};
var view = {
	me: null,
	marked: false,
	draft: { kind: "keep" },
	converting: false,
	facesLoaded: false,
	saving: false,
	nameValue: "",
	statsShown: false,
	stats: null,
	statsTurn: 0,
	safeShown: false,
	sessions: null,
	safeTurn: 0,
	outBusy: [],
	confirmOpen: false
};
var handlers = null;
var call = (key) => (...args) => (handlers?.[key])?.(...args);
function draftLook(me, draft) {
	if (draft.kind === "photo") return {
		photo: true,
		small: `url("${draft.preview}")`,
		choice: "photo"
	};
	if (draft.kind === "character") return {
		photo: false,
		small: "",
		choice: draft.id
	};
	const big = avatarLook(me?.avatar, true), small = avatarLook(me?.avatar);
	return {
		photo: big.photo,
		small: small.photo ? small.image : "",
		choice: currentChoice(me?.avatar)
	};
}
function Profile() {
	const { me } = view;
	return /* @__PURE__ */ a(ProfileCard, {
		name: me?.name ?? "",
		provider: me ? PROVIDER_NAMES[me.provider] || me.provider : "",
		look: me ? avatarLook(me.avatar, true) : null,
		onEdit: call("edit")
	});
}
function ProfileForm() {
	const count = nameLength(view.nameValue), look = draftLook(view.me, view.draft);
	return /* @__PURE__ */ a(ProfileForm$1, {
		name: view.nameValue,
		count: `${count}/12`,
		over: count > 12,
		photoImage: look.small,
		choice: look.choice,
		marked: view.marked,
		facesLoaded: view.facesLoaded,
		saving: view.saving,
		converting: view.converting,
		onName: (nameValue) => set({ nameValue }),
		onSave: call("save"),
		onCancel: call("cancel"),
		onPickPhoto: call("pickPhoto"),
		onPhotoFile: call("photoFile"),
		onPickCharacter: call("pickCharacter")
	});
}
function SafeBody({ sessions }) {
	return /* @__PURE__ */ a(M, { children: [
		/* @__PURE__ */ a("p", {
			class: "acct-sub",
			children: `로그인한 기기 ${sessions.length}대`
		}),
		/* @__PURE__ */ a("ul", {
			class: "dv-list",
			children: sessions.map((item) => /* @__PURE__ */ a("li", {
				"data-session": item.id,
				children: [
					/* @__PURE__ */ a("span", {
						class: "dv-name",
						children: [item.device, item.current && /* @__PURE__ */ a("em", { children: "이 기기" })]
					}),
					/* @__PURE__ */ a("small", { children: `마지막 사용 ${monthDay(item.lastUsedAt)} · 로그인 ${monthDay(item.createdAt)}` }),
					!item.current && /* @__PURE__ */ a("button", {
						type: "button",
						class: "dv-out",
						disabled: view.outBusy.includes(item.id),
						onClick: () => call("logoutDevice")(item.id),
						children: "로그아웃"
					})
				]
			}))
		}),
		/* @__PURE__ */ a("div", {
			class: "dv-actions",
			children: [sessions.length > 1 && /* @__PURE__ */ a("button", {
				type: "button",
				id: "deviceOthers",
				onClick: call("logoutOthers"),
				children: "다른 기기 모두 로그아웃"
			}), /* @__PURE__ */ a("button", {
				type: "button",
				id: "dataExport",
				onClick: call("exportData"),
				children: "내 데이터 내려받기"
			})]
		}),
		/* @__PURE__ */ a("p", {
			class: "st-note",
			children: "내려받기: 회원 정보 · 로그인 기기 · 승차권 · 날짜별 사용 횟수를 JSON 파일 하나로 받아요."
		})
	] });
}
function AccountPage() {
	return /* @__PURE__ */ a(M, { children: [
		/* @__PURE__ */ a(Profile, {}),
		/* @__PURE__ */ a("section", {
			id: "accountStats",
			class: "acct-sec",
			"aria-labelledby": "accountStatsTitle",
			hidden: !view.statsShown,
			children: [/* @__PURE__ */ a("h4", {
				id: "accountStatsTitle",
				class: "pf-l",
				children: "내 통계"
			}), /* @__PURE__ */ a("div", {
				id: "accountStatsBody",
				"aria-live": "polite",
				children: view.stats && /* @__PURE__ */ a(StatsPanel, { stats: view.stats }, view.statsTurn)
			})]
		}),
		/* @__PURE__ */ a("section", {
			id: "accountSafe",
			class: "acct-sec",
			"aria-labelledby": "accountSafeTitle",
			hidden: !view.safeShown,
			children: [/* @__PURE__ */ a("h4", {
				id: "accountSafeTitle",
				class: "pf-l",
				children: "계정"
			}), /* @__PURE__ */ a("div", {
				id: "accountSafeBody",
				children: view.sessions && /* @__PURE__ */ a(SafeBody, { sessions: view.sessions }, view.safeTurn)
			})]
		}),
		/* @__PURE__ */ a("div", {
			class: "account-foot",
			children: [
				/* @__PURE__ */ a("a", {
					href: "./privacy.html",
					target: "_blank",
					rel: "noopener",
					children: "개인정보처리방침"
				}),
				/* @__PURE__ */ a("button", {
					id: "accountLogout",
					type: "button",
					onClick: call("logout"),
					children: "로그아웃"
				}),
				/* @__PURE__ */ a("button", {
					id: "accountDelete",
					type: "button",
					class: "account-delete",
					onClick: call("deleteAsk"),
					children: "탈퇴"
				})
			]
		}),
		/* @__PURE__ */ a("div", {
			id: "accountConfirm",
			class: "account-confirm",
			hidden: !view.confirmOpen,
			children: [/* @__PURE__ */ a("p", { children: "탈퇴하면 승차권까지 모두 지워져요" }), /* @__PURE__ */ a("div", { children: [/* @__PURE__ */ a("button", {
				id: "accountConfirmNo",
				type: "button",
				onClick: call("deleteNo"),
				children: "취소"
			}), /* @__PURE__ */ a("button", {
				id: "accountConfirmYes",
				type: "button",
				class: "danger",
				onClick: call("deleteYes"),
				children: "탈퇴"
			})] })]
		})
	] });
}
var loginRoot = document.getElementById("loginSheet");
var profileRoot = document.getElementById("profileSheet");
if (loginRoot) K(/* @__PURE__ */ a(LayerSheet, {
	labelledBy: "loginTitle",
	children: /* @__PURE__ */ a(LoginSheetBody, {})
}), loginRoot);
if (profileRoot) K(/* @__PURE__ */ a(LayerSheet, {
	label: "프로필 수정",
	children: /* @__PURE__ */ a(ProfileSheetBody, {})
}), profileRoot);
function drawProviders(providers) {
	const box = document.getElementById("accountProviders");
	if (box) K(/* @__PURE__ */ a(SocialButtons, { providers }), box);
}
var root = document.getElementById("menuAccount");
var formRoot = document.getElementById("profileBody");
function set(patch) {
	view = {
		...view,
		...patch
	};
	if (root) K(/* @__PURE__ */ a(AccountPage, {}), root);
	if (formRoot) K(/* @__PURE__ */ a(ProfileForm, {}), formRoot);
}
var accountView = {
	set,
	get state() {
		return view;
	},
	on(next) {
		handlers = next;
	}
};
if (root) {
	root.textContent = "";
	set({});
}
export { accountView, avatarLook, currentChoice, drawProviders, nameLength };
