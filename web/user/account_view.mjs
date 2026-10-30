import { Fragment as M, render as K } from "../npm/preact/dist/preact.mjs";
import { jsx as a } from "../npm/preact/jsx-runtime/dist/jsxRuntime.mjs";
// web/user/account_view.tsx
var CHARACTERS = [
	["sprout", "새싹 볼빵 후디"],
	["builder", "꼬마 건설 반장"],
	["seonbi", "갓 쓴 꼬마 선비"],
	["visitor", "두근두근 나들이"],
	["scv", "테란 SCV"],
	["drone", "저그 드론"],
	["probe", "프로토스 프로브"]
];
var PHOTO_URL = /^\/api\/me\/avatar\/[\w-]{32}\.(?:webp|jpg)$/;
var PROVIDER_NAMES = {
	kakao: "카카오",
	google: "구글",
	apple: "Apple"
};
var FARE_REASONS = {
	route: "고른 경로가 없는 승차권",
	distance: "공식 거리 자료가 없는 노선",
	outside: "수도권 밖 구간",
	extra: "추가 운임 노선(신분당선 · 의정부경전철 · 공항철도 영종 구간)",
	bus: "요금 · 거리 자료가 없는 버스",
	none: "전철 · 버스를 타지 않는 승차권"
};
var nameLength = (text) => [...text.trim()].length;
var won = (count) => `${count.toLocaleString("ko-KR")}원`;
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
	const { me } = view, big = avatarLook(me?.avatar, true);
	return /* @__PURE__ */ a("div", {
		class: "account-prof",
		children: [/* @__PURE__ */ a("button", {
			id: "accountAvatarBig",
			class: `account-avatar big ${me && big.photo ? "photo" : "face"}`,
			type: "button",
			"aria-label": "프로필 수정",
			"aria-haspopup": "dialog",
			style: me ? { backgroundImage: big.image } : void 0,
			onClick: call("edit"),
			children: BADGE
		}), /* @__PURE__ */ a("div", {
			class: "pf-who",
			children: [/* @__PURE__ */ a("div", {
				class: "pf-name",
				children: /* @__PURE__ */ a("b", {
					id: "accountName",
					children: me?.name ?? ""
				})
			}), /* @__PURE__ */ a("small", {
				id: "accountProvider",
				children: me ? PROVIDER_NAMES[me.provider] || me.provider : ""
			})]
		})]
	});
}
function ProfileForm() {
	const { me } = view, count = nameLength(view.nameValue), look = draftLook(me, view.draft), lock = view.saving || view.converting;
	return /* @__PURE__ */ a("form", {
		id: "profileForm",
		class: "pf-form",
		onSubmit: (event) => {
			event.preventDefault();
			call("save")();
		},
		children: [
			/* @__PURE__ */ a("label", {
				class: "tf-in pf-in",
				children: [/* @__PURE__ */ a("input", {
					id: "nameInput",
					maxlength: 40,
					autocomplete: "nickname",
					enterkeyhint: "done",
					"aria-label": "닉네임",
					"aria-describedby": "nameCount",
					value: view.nameValue,
					disabled: view.saving,
					onInput: (event) => set({ nameValue: event.currentTarget.value })
				}), /* @__PURE__ */ a("small", {
					id: "nameCount",
					class: count > 12 ? "over" : void 0,
					children: `${count}/12`
				})]
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
							class: look.small ? "pf-choice pf-photo photo" : "pf-choice pf-photo",
							type: "button",
							"aria-label": "사진 올리기",
							"aria-pressed": view.marked ? String(look.choice === "photo") : void 0,
							style: look.small ? { backgroundImage: look.small } : void 0,
							disabled: lock,
							onClick: call("pickPhoto"),
							children: [CAMERA, /* @__PURE__ */ a("span", { children: "사진" })]
						}), CHARACTERS.map(([id, label]) => /* @__PURE__ */ a("button", {
							type: "button",
							class: "pf-choice",
							"data-character": id,
							"aria-label": label,
							title: label,
							"aria-pressed": view.marked ? String(id === look.choice) : void 0,
							style: view.facesLoaded ? { backgroundImage: `url("./brand/faces/${id}-240.png")` } : void 0,
							disabled: view.saving,
							onClick: () => call("pickCharacter")(id)
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
							call("photoFile")(file);
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
					disabled: view.saving,
					onClick: call("cancel"),
					children: "취소"
				}), /* @__PURE__ */ a("button", {
					id: "profileSave",
					type: "submit",
					class: "pf-ok",
					disabled: lock,
					children: view.converting ? "사진 준비 중" : "저장"
				})]
			})
		]
	});
}
var Cell = ({ value, label }) => /* @__PURE__ */ a("div", {
	class: "st-cell",
	children: [/* @__PURE__ */ a("b", { children: value }), /* @__PURE__ */ a("small", { children: label })]
});
function StatsBody({ stats }) {
	const most = Math.max(1, ...stats.daily.map((day) => day.open + day.route + day.ticket)), fare = stats.fare, [, month] = fare.month.split("-").map(Number);
	const why = Object.entries(fare.reasons).map(([key, count]) => `${FARE_REASONS[key] || key} ${count}장`).join(" · ");
	return /* @__PURE__ */ a(M, { children: [
		/* @__PURE__ */ a("div", {
			class: "st-grid",
			children: [
				/* @__PURE__ */ a(Cell, {
					value: `${stats.daysTogether}일`,
					label: "함께한 날"
				}),
				/* @__PURE__ */ a(Cell, {
					value: `${stats.tickets}장`,
					label: "승차권"
				}),
				/* @__PURE__ */ a(Cell, {
					value: `${stats.recent.openDays}일`,
					label: `최근 ${stats.recent.days}일 슝 연 날`
				}),
				/* @__PURE__ */ a(Cell, {
					value: `${stats.recent.route}번`,
					label: `최근 ${stats.recent.days}일 길찾기`
				})
			]
		}),
		/* @__PURE__ */ a("div", {
			class: "st-bars",
			role: "img",
			"aria-label": `최근 ${stats.recent.days}일 날짜별 사용 횟수`,
			children: stats.daily.map((day) => {
				const count = day.open + day.route + day.ticket, [, dayMonth, date] = day.day.split("-").map(Number);
				return /* @__PURE__ */ a("i", {
					style: `height:${count ? Math.max(8, Math.round(count / most * 100)) : 0}%`,
					title: `${dayMonth}월 ${date}일 · ${count}번`
				});
			})
		}),
		/* @__PURE__ */ a("p", {
			class: "st-note",
			children: `한 주에 타는 횟수 ${stats.weeklyRides}번 · 승차권 본 횟수 ${stats.recent.ticket}번(최근 ${stats.recent.days}일)`
		}),
		stats.tickets ? /* @__PURE__ */ a("div", {
			class: "st-fare",
			children: [
				/* @__PURE__ */ a("div", {
					class: "st-fare-top",
					children: [/* @__PURE__ */ a("span", { children: `${month}월 예상 교통비` }), /* @__PURE__ */ a("b", { children: won(fare.total) })]
				}),
				/* @__PURE__ */ a("p", {
					class: "st-note",
					children: "승차권대로 다 탄다고 가정한 예상이에요"
				}),
				fare.tickets.length > 0 && /* @__PURE__ */ a("ul", {
					class: "st-fare-list",
					children: fare.tickets.map((ticket) => /* @__PURE__ */ a("li", { children: [
						/* @__PURE__ */ a("span", { children: ticket.name }),
						/* @__PURE__ */ a("small", { children: `${won(ticket.fare)} × ${ticket.rides}번` }),
						/* @__PURE__ */ a("b", { children: won(ticket.monthly) })
					] }))
				}),
				fare.skipped ? /* @__PURE__ */ a("p", {
					class: "st-skip",
					children: `${fare.skipped}장 계산 못 함${why ? ` — ${why}` : ""}`
				}) : null,
				/* @__PURE__ */ a("p", {
					class: "st-note",
					children: "교통카드 어른 요금 · 고른 경로 거리 기준이에요. 갈아타는 시간 · 정기권 · 공휴일은 넣지 않았어요."
				})
			]
		}) : null
	] });
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
				children: view.stats && /* @__PURE__ */ a(StatsBody, { stats: view.stats }, view.statsTurn)
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
export { CHARACTERS, accountView, avatarLook, currentChoice, nameLength };
