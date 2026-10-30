import { render as K } from "../npm/preact/dist/preact.mjs";
import { jsx as a } from "../npm/preact/jsx-runtime/dist/jsxRuntime.mjs";
import { AccountPage as AccountPage$1, DeviceList } from "../components/account_page.mjs";
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
function AccountPage() {
	return /* @__PURE__ */ a(AccountPage$1, {
		profile: /* @__PURE__ */ a(Profile, {}),
		statsShown: view.statsShown,
		stats: view.stats && /* @__PURE__ */ a(StatsPanel, { stats: view.stats }, view.statsTurn),
		safeShown: view.safeShown,
		safe: view.sessions && /* @__PURE__ */ a(DeviceList, {
			sessions: view.sessions,
			busy: view.outBusy,
			onLogoutDevice: (id) => call("logoutDevice")(id),
			onLogoutOthers: call("logoutOthers"),
			onExport: call("exportData")
		}, view.safeTurn),
		confirmOpen: view.confirmOpen,
		onLogout: call("logout"),
		onDeleteAsk: call("deleteAsk"),
		onDeleteNo: call("deleteNo"),
		onDeleteYes: call("deleteYes")
	});
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
