import { Fragment as M } from "../npm/preact/dist/preact.mjs";
import { jsx as a } from "../npm/preact/jsx-runtime/dist/jsxRuntime.mjs";
// web/components/account_page.tsx
var monthDay = (seconds) => {
	const date = /* @__PURE__ */ new Date(seconds * 1e3);
	return `${date.getMonth() + 1}월 ${date.getDate()}일`;
};
function DeviceList({ sessions, busy, onLogoutDevice, onLogoutOthers, onExport }) {
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
						disabled: busy.includes(item.id),
						onClick: () => onLogoutDevice?.(item.id),
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
				onClick: () => onLogoutOthers?.(),
				children: "다른 기기 모두 로그아웃"
			}), /* @__PURE__ */ a("button", {
				type: "button",
				id: "dataExport",
				onClick: () => onExport?.(),
				children: "내 데이터 내려받기"
			})]
		}),
		/* @__PURE__ */ a("p", {
			class: "st-note",
			children: "내려받기: 회원 정보 · 로그인 기기 · 승차권 · 날짜별 사용 횟수를 JSON 파일 하나로 받아요."
		})
	] });
}
function AccountPage({ profile, statsShown, stats, safeShown, safe, confirmOpen, onLogout, onDeleteAsk, onDeleteNo, onDeleteYes }) {
	return /* @__PURE__ */ a(M, { children: [
		profile,
		/* @__PURE__ */ a("section", {
			id: "accountStats",
			class: "acct-sec",
			"aria-labelledby": "accountStatsTitle",
			hidden: !statsShown,
			children: [/* @__PURE__ */ a("h4", {
				id: "accountStatsTitle",
				class: "pf-l",
				children: "내 통계"
			}), /* @__PURE__ */ a("div", {
				id: "accountStatsBody",
				"aria-live": "polite",
				children: stats
			})]
		}),
		/* @__PURE__ */ a("section", {
			id: "accountSafe",
			class: "acct-sec",
			"aria-labelledby": "accountSafeTitle",
			hidden: !safeShown,
			children: [/* @__PURE__ */ a("h4", {
				id: "accountSafeTitle",
				class: "pf-l",
				children: "계정"
			}), /* @__PURE__ */ a("div", {
				id: "accountSafeBody",
				children: safe
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
					onClick: () => onLogout?.(),
					children: "로그아웃"
				}),
				/* @__PURE__ */ a("button", {
					id: "accountDelete",
					type: "button",
					class: "account-delete",
					onClick: () => onDeleteAsk?.(),
					children: "탈퇴"
				})
			]
		}),
		/* @__PURE__ */ a("div", {
			id: "accountConfirm",
			class: "account-confirm",
			hidden: !confirmOpen,
			children: [/* @__PURE__ */ a("p", { children: "탈퇴하면 승차권까지 모두 지워져요" }), /* @__PURE__ */ a("div", { children: [/* @__PURE__ */ a("button", {
				id: "accountConfirmNo",
				type: "button",
				onClick: () => onDeleteNo?.(),
				children: "취소"
			}), /* @__PURE__ */ a("button", {
				id: "accountConfirmYes",
				type: "button",
				class: "danger",
				onClick: () => onDeleteYes?.(),
				children: "탈퇴"
			})] })]
		})
	] });
}
export { AccountPage, DeviceList };
