import { Fragment as M, createRef as $, render as K } from "../npm/preact/dist/preact.mjs";
import { jsx as a } from "../npm/preact/jsx-runtime/dist/jsxRuntime.mjs";
import { chartBars, facts, kindLines, logLine, pageInfo, placeRow, provider, ticketRow, when, withdrawName } from "./members_data.mjs";
// web/admin/members.tsx
var ACTIONS = [
	"place",
	"out",
	"avatar",
	"name",
	"del"
];
var each = (make) => Object.fromEntries(ACTIONS.map((action) => [action, make(action)]));
var page = 1;
var query = "";
var picked = null;
var view = {
	login: false,
	stats: null,
	statsError: null,
	drawn: false,
	pager: {
		text: "",
		prev: true,
		next: true
	},
	rows: null,
	on: null,
	shown: false,
	title: "회원",
	member: null,
	avatarSrc: null,
	places: null,
	inputs: {
		...each(() => ""),
		confirm: ""
	},
	msgs: each(() => ({
		text: "",
		ok: null
	})),
	disabled: each(() => false)
};
var main = document.querySelector("main");
var detailRef = $();
var searchRef = $();
function set(patch) {
	view = {
		...view,
		...patch
	};
	K(/* @__PURE__ */ a(MembersPage, {}), main);
}
var say = (action, text, ok = false) => set({ msgs: {
	...view.msgs,
	[action]: {
		text,
		ok
	}
} });
var typed = (field) => (event) => set({ inputs: {
	...view.inputs,
	[field]: event.currentTarget.value
} });
async function api(path, options = {}) {
	const init = {
		credentials: "same-origin",
		...options
	};
	if (options.body) init.headers = {
		"Content-Type": "application/json",
		"X-Requested-With": "syung"
	};
	const response = await fetch("/api/admin" + path, init);
	if (response.status === 401) {
		set({ login: true });
		throw new Error("로그인이 필요해요");
	}
	set({ login: false });
	const body = await response.json().catch(() => ({}));
	if (!response.ok) throw new Error(body.error?.message || `요청 실패(${response.status})`);
	return body;
}
var message = (error) => error.message;
async function loadStats() {
	try {
		set({
			stats: await api("/members/stats"),
			statsError: null,
			drawn: true
		});
	} catch (error) {
		set({ statsError: message(error) });
	}
}
async function loadList() {
	try {
		const body = await api(`/members?q=${encodeURIComponent(query)}&page=${page}`);
		const info = pageInfo(body, page);
		set({
			pager: {
				text: info.text,
				prev: info.prev,
				next: info.next
			},
			rows: {
				members: body.members,
				empty: query ? "찾는 회원이 없어요" : "아직 회원이 없어요"
			},
			on: picked
		});
	} catch (error) {
		set({ rows: { error: message(error) } });
	}
}
var pickRow = (target) => {
	const row = target.closest("tr[data-id]");
	if (row) openMember(Number(row.dataset.id));
};
async function openMember(id) {
	picked = id;
	set({
		on: id,
		inputs: {
			...each(() => ""),
			confirm: ""
		},
		msgs: each((action) => ({
			...view.msgs[action],
			text: ""
		})),
		places: null,
		disabled: each(() => false)
	});
	try {
		showMember(await api(`/members/${id}`));
	} catch (error) {
		set({
			shown: true,
			title: message(error)
		});
		return;
	}
	detailRef.current.scrollIntoView({
		behavior: "smooth",
		block: "start"
	});
}
function showMember(member) {
	const photo = member.avatar?.type === "photo";
	set({
		shown: true,
		title: `${member.name} · ${member.id}번`,
		member,
		avatarSrc: photo ? `/api/admin/members/${member.id}/avatar` : null,
		disabled: {
			...view.disabled,
			avatar: !photo
		}
	});
}
var reasonOf = (action) => view.inputs[action].trim();
var cleared = (action) => set({ inputs: {
	...view.inputs,
	[action]: ""
} });
async function viewPlaces() {
	const reason = reasonOf("place");
	if (!reason) return say("place", "보는 이유를 적어 주세요");
	try {
		set({ places: (await api(`/members/${picked}/places`, {
			method: "POST",
			body: JSON.stringify({ reason })
		})).places });
		say("place", "열람 기록을 남겼어요", true);
		showMember(await api(`/members/${picked}`));
	} catch (error) {
		say("place", message(error));
	}
}
async function forceLogout() {
	const reason = reasonOf("out");
	if (!reason) return say("out", "이유를 적어 주세요");
	try {
		const body = await api(`/members/${picked}/logout`, {
			method: "POST",
			body: JSON.stringify({ reason })
		});
		cleared("out");
		say("out", `로그인 기기 ${body.sessions}대에서 로그아웃했어요`, true);
		showMember(await api(`/members/${picked}`));
		loadList();
	} catch (error) {
		say("out", message(error));
	}
}
async function clearAvatar() {
	const reason = reasonOf("avatar");
	if (!reason) return say("avatar", "이유를 적어 주세요");
	try {
		await api(`/members/${picked}/avatar`, {
			method: "POST",
			body: JSON.stringify({ reason })
		});
		cleared("avatar");
		say("avatar", "사진을 내렸어요(기본 캐릭터로)", true);
		showMember(await api(`/members/${picked}`));
	} catch (error) {
		say("avatar", message(error));
	}
}
async function resetName() {
	const reason = reasonOf("name");
	if (!reason) return say("name", "이유를 적어 주세요");
	try {
		const body = await api(`/members/${picked}/name`, {
			method: "POST",
			body: JSON.stringify({ reason })
		});
		cleared("name");
		say("name", `닉네임을 '${body.name}'(으)로 되돌렸어요`, true);
		showMember(await api(`/members/${picked}`));
		loadList();
	} catch (error) {
		say("name", message(error));
	}
}
async function withdraw() {
	const reason = reasonOf("del"), confirm = view.inputs.confirm.trim();
	if (!reason) return say("del", "이유를 적어 주세요");
	if (confirm !== String(picked)) return say("del", "확인용 회원번호가 맞지 않아요");
	try {
		const body = await api(`/members/${picked}`, {
			method: "DELETE",
			body: JSON.stringify({
				reason,
				confirm
			})
		});
		say("del", `탈퇴 처리했어요(승차권 ${body.removed.tickets}장 · 로그인 기기 ${body.removed.sessions}대 삭제)`, true);
		set({
			title: `${picked}번 회원 · 탈퇴 처리됨`,
			disabled: each(() => true),
			avatarSrc: null,
			places: null
		});
		picked = null;
		loadStats();
		loadList();
	} catch (error) {
		say("del", message(error));
	}
}
function Chart({ id, daily, label, barClass }) {
	let inner;
	if (view.statsError) inner = view.statsError;
	else if (daily) inner = /* @__PURE__ */ a("svg", {
		viewBox: "0 0 600 180",
		role: "img",
		"aria-label": label,
		children: chartBars(daily).map((bar) => /* @__PURE__ */ a(M, { children: [
			/* @__PURE__ */ a("rect", {
				class: barClass,
				x: bar.x,
				y: bar.y,
				width: bar.width,
				height: bar.height,
				rx: "2",
				children: /* @__PURE__ */ a("title", { children: bar.title })
			}),
			bar.value && /* @__PURE__ */ a("text", {
				class: "val",
				x: bar.value.x,
				y: bar.value.y,
				"text-anchor": "middle",
				children: bar.value.text
			}),
			bar.label && /* @__PURE__ */ a("text", {
				x: bar.label.x,
				y: bar.label.y,
				"text-anchor": bar.label.anchor,
				children: bar.label.text
			})
		] }))
	});
	else inner = "불러오는 중";
	return /* @__PURE__ */ a("div", {
		id,
		class: view.drawn ? "" : "muted",
		children: inner
	});
}
var Kinds = ({ id, lines }) => /* @__PURE__ */ a("ul", {
	class: "kinds",
	id,
	children: lines?.map((line) => /* @__PURE__ */ a("li", { children: [line.name, /* @__PURE__ */ a("b", { children: line.count })] }))
});
var Stat = ({ label, id, value }) => /* @__PURE__ */ a("div", {
	class: "stat",
	children: [/* @__PURE__ */ a("small", { children: label }), /* @__PURE__ */ a("b", {
		id,
		children: value ?? "–"
	})]
});
function Act({ action, title, text, label, button, danger }) {
	const onClick = {
		place: viewPlaces,
		out: forceLogout,
		avatar: clearAvatar,
		name: resetName,
		del: withdraw
	}[action];
	return /* @__PURE__ */ a("div", {
		class: danger ? "act danger" : "act",
		children: [
			/* @__PURE__ */ a("b", { children: title }),
			/* @__PURE__ */ a("p", { children: text }),
			/* @__PURE__ */ a("div", {
				class: "row",
				children: [
					/* @__PURE__ */ a("input", {
						id: `${action}Reason`,
						maxlength: 200,
						placeholder: "이유(기록에 남아요)",
						"aria-label": label,
						value: view.inputs[action],
						onInput: typed(action)
					}),
					danger && /* @__PURE__ */ a("input", {
						id: "delConfirm",
						inputmode: "numeric",
						placeholder: "회원번호 다시 입력",
						"aria-label": "확인용 회원번호",
						style: { flex: "0 1 160px" },
						value: view.inputs.confirm,
						onInput: typed("confirm")
					}),
					/* @__PURE__ */ a("button", {
						class: danger ? "btn danger" : "btn quiet",
						type: "button",
						id: `${action}Btn`,
						disabled: view.disabled[action],
						onClick,
						children: button
					})
				]
			}),
			/* @__PURE__ */ a(Message, { action })
		]
	});
}
function Message({ action }) {
	const { text, ok } = view.msgs[action];
	let cls = "msg";
	if (ok != null) cls = ok ? "msg ok" : "msg err";
	return /* @__PURE__ */ a("div", {
		class: cls,
		id: `${action}Msg`,
		role: "status",
		children: text
	});
}
function MemberList() {
	const { rows } = view;
	if (!rows) return null;
	if ("error" in rows) return /* @__PURE__ */ a("tr", { children: /* @__PURE__ */ a("td", {
		colSpan: 7,
		children: rows.error
	}) });
	if (!rows.members.length) return /* @__PURE__ */ a("tr", { children: /* @__PURE__ */ a("td", {
		colSpan: 7,
		children: rows.empty
	}) });
	return /* @__PURE__ */ a(M, { children: rows.members.map((member) => /* @__PURE__ */ a("tr", {
		tabIndex: 0,
		"data-id": member.id,
		class: member.id === view.on ? "on" : void 0,
		children: [
			/* @__PURE__ */ a("td", {
				class: "n",
				children: member.id
			}),
			/* @__PURE__ */ a("td", { children: member.name }),
			/* @__PURE__ */ a("td", { children: provider(member.provider) }),
			/* @__PURE__ */ a("td", { children: when(member.createdAt, false) }),
			/* @__PURE__ */ a("td", {
				class: "n",
				children: member.tickets
			}),
			/* @__PURE__ */ a("td", { children: when(member.lastLogin) }),
			/* @__PURE__ */ a("td", {
				class: "n",
				children: member.sessions
			})
		]
	})) });
}
function Detail() {
	const { member } = view;
	return /* @__PURE__ */ a("section", {
		class: "box",
		id: "detail",
		"aria-label": "회원 상세",
		hidden: !view.shown,
		ref: detailRef,
		children: [
			/* @__PURE__ */ a("h2", {
				id: "dTitle",
				children: view.title
			}),
			/* @__PURE__ */ a("dl", {
				class: "facts",
				id: "dFacts",
				children: member && facts(member).map(([label, value]) => /* @__PURE__ */ a("div", { children: [/* @__PURE__ */ a("dt", { children: label }), /* @__PURE__ */ a("dd", { children: value })] }))
			}),
			/* @__PURE__ */ a("div", {
				id: "dAvatar",
				class: "avatar-view",
				hidden: !view.avatarSrc,
				children: [view.avatarSrc ? /* @__PURE__ */ a("img", {
					id: "dAvatarImg",
					alt: "회원이 올린 프로필 사진",
					width: "96",
					height: "96",
					src: view.avatarSrc
				}, "photo") : /* @__PURE__ */ a("img", {
					id: "dAvatarImg",
					alt: "회원이 올린 프로필 사진",
					width: "96",
					height: "96"
				}, "none"), /* @__PURE__ */ a("span", { children: "회원이 올린 프로필 사진 · 볼 때마다 관리 기록에 남아요" })]
			}),
			/* @__PURE__ */ a("h3", { children: "승차권" }),
			/* @__PURE__ */ a("div", {
				class: "tw",
				children: /* @__PURE__ */ a("table", { children: [/* @__PURE__ */ a("thead", { children: /* @__PURE__ */ a("tr", { children: [
					/* @__PURE__ */ a("th", { children: "이름" }),
					/* @__PURE__ */ a("th", { children: "출발 시각" }),
					/* @__PURE__ */ a("th", { children: "타는 날" }),
					/* @__PURE__ */ a("th", { children: "고른 경로" }),
					/* @__PURE__ */ a("th", { children: "만든 날" })
				] }) }), /* @__PURE__ */ a("tbody", {
					id: "dTickets",
					children: member && (member.ticketList.length ? member.ticketList.map((ticket) => /* @__PURE__ */ a("tr", { children: ticketRow(ticket).map((text) => /* @__PURE__ */ a("td", { children: text })) })) : /* @__PURE__ */ a("tr", { children: /* @__PURE__ */ a("td", {
						colSpan: 5,
						children: "승차권이 없어요"
					}) }))
				})] })
			}),
			/* @__PURE__ */ a("div", {
				class: "hidden-place",
				id: "placeBox",
				style: { marginTop: "10px" },
				hidden: !!member && !member.ticketList.length,
				children: [
					/* @__PURE__ */ a("span", { children: "장소는 가려져 있어요." }),
					/* @__PURE__ */ a("input", {
						id: "placeReason",
						maxlength: 200,
						placeholder: "보는 이유(기록에 남아요)",
						"aria-label": "장소를 보는 이유",
						style: { flex: "1 1 200px" },
						value: view.inputs.place,
						onInput: typed("place")
					}),
					/* @__PURE__ */ a("button", {
						class: "btn quiet",
						type: "button",
						id: "placeBtn",
						disabled: view.disabled.place,
						onClick: viewPlaces,
						children: "장소 보기"
					})
				]
			}),
			/* @__PURE__ */ a(Message, { action: "place" }),
			/* @__PURE__ */ a("div", {
				class: "tw",
				id: "placeTable",
				hidden: !view.places,
				children: /* @__PURE__ */ a("table", { children: [/* @__PURE__ */ a("thead", { children: /* @__PURE__ */ a("tr", { children: [
					/* @__PURE__ */ a("th", { children: "승차권" }),
					/* @__PURE__ */ a("th", { children: "출발지" }),
					/* @__PURE__ */ a("th", { children: "도착지" })
				] }) }), /* @__PURE__ */ a("tbody", {
					id: "dPlaces",
					children: view.places?.map((place) => /* @__PURE__ */ a("tr", { children: placeRow(place).map((text) => /* @__PURE__ */ a("td", { children: text })) }))
				})] })
			}),
			/* @__PURE__ */ a("h3", { children: "조치" }),
			/* @__PURE__ */ a(Act, {
				action: "out",
				title: "강제 로그아웃",
				text: "이 회원이 로그인한 모든 기기에서 로그아웃돼요. 회원 정보와 승차권은 그대로예요.",
				label: "강제 로그아웃 이유",
				button: "강제 로그아웃"
			}),
			/* @__PURE__ */ a(Act, {
				action: "avatar",
				title: "프로필 사진 내리기",
				text: "회원이 올린 사진을 지우고 기본 캐릭터로 되돌려요. 사진 파일도 지워져요.",
				label: "프로필 사진 내리기 이유",
				button: "사진 내리기"
			}),
			/* @__PURE__ */ a(Act, {
				action: "name",
				title: "닉네임 초기화",
				text: "닉네임을 로그인 방법의 기본 이름(카카오 사용자 등)으로 되돌려요.",
				label: "닉네임 초기화 이유",
				button: "닉네임 초기화"
			}),
			/* @__PURE__ */ a(Act, {
				action: "del",
				title: "탈퇴 처리",
				text: "회원 정보 · 로그인 연결 · 로그인 기기 · 승차권 · 올린 프로필 사진이 모두 지워지고 되돌릴 수 없어요. 확인을 위해 회원번호를 한 번 더 적어 주세요.",
				label: "탈퇴 처리 이유",
				button: "탈퇴 처리",
				danger: true
			}),
			/* @__PURE__ */ a("h3", { children: "관리 기록" }),
			/* @__PURE__ */ a("ul", {
				class: "log",
				id: "dLog",
				children: member && (member.log.length ? member.log.map((item) => {
					const [at, what, reason] = logLine(item);
					return /* @__PURE__ */ a("li", { children: [
						at,
						/* @__PURE__ */ a("b", { children: what }),
						reason
					] });
				}) : /* @__PURE__ */ a("li", { children: "아직 기록이 없어요" }))
			})
		]
	});
}
function MembersPage() {
	const { stats } = view, out = stats?.withdraw;
	const search = (event) => {
		event.preventDefault();
		query = searchRef.current.value.trim();
		page = 1;
		loadList();
	};
	return /* @__PURE__ */ a(M, { children: [
		/* @__PURE__ */ a("p", {
			class: "login",
			id: "login",
			hidden: !view.login,
			children: ["로그인이 풀렸어요. ", /* @__PURE__ */ a("a", {
				href: "/admin/login.html?next=/admin/members",
				children: "다시 로그인"
			})]
		}),
		/* @__PURE__ */ a("section", {
			class: "stats",
			"aria-label": "회원 수",
			children: [
				/* @__PURE__ */ a(Stat, {
					label: "모든 회원",
					id: "sTotal",
					value: stats?.total.toLocaleString("ko-KR")
				}),
				/* @__PURE__ */ a(Stat, {
					label: "오늘 가입",
					id: "sToday",
					value: stats?.today
				}),
				/* @__PURE__ */ a(Stat, {
					label: "최근 7일 가입",
					id: "sWeek",
					value: stats?.week
				}),
				/* @__PURE__ */ a(Stat, {
					label: "최근 30일 가입",
					id: "sMonth",
					value: stats?.month
				})
			]
		}),
		/* @__PURE__ */ a("section", {
			class: "box",
			"aria-label": "가입 추이",
			children: [/* @__PURE__ */ a("h2", { children: "가입 추이 · 최근 30일" }), /* @__PURE__ */ a("div", {
				class: "trend",
				children: [/* @__PURE__ */ a(Chart, {
					id: "chart",
					daily: stats?.daily,
					label: "날짜별 가입 수",
					barClass: "bar"
				}), /* @__PURE__ */ a("div", { children: [/* @__PURE__ */ a("h3", {
					style: { marginTop: 0 },
					children: "로그인 방법"
				}), /* @__PURE__ */ a(Kinds, {
					id: "kinds",
					lines: stats ? kindLines(stats.providers, (item) => provider(item.provider), "아직 회원 없음") : void 0
				})] })]
			})]
		}),
		/* @__PURE__ */ a("section", {
			class: "stats",
			"aria-label": "탈퇴 수",
			children: [
				/* @__PURE__ */ a(Stat, {
					label: "모든 탈퇴",
					id: "wTotal",
					value: out?.total.toLocaleString("ko-KR")
				}),
				/* @__PURE__ */ a(Stat, {
					label: "오늘 탈퇴",
					id: "wToday",
					value: out?.today
				}),
				/* @__PURE__ */ a(Stat, {
					label: "최근 7일 탈퇴",
					id: "wWeek",
					value: out?.week
				}),
				/* @__PURE__ */ a(Stat, {
					label: "최근 30일 탈퇴",
					id: "wMonth",
					value: out?.month
				})
			]
		}),
		/* @__PURE__ */ a("section", {
			class: "box",
			"aria-label": "탈퇴 추이",
			children: [/* @__PURE__ */ a("h2", { children: "탈퇴 추이 · 최근 30일" }), /* @__PURE__ */ a("div", {
				class: "trend",
				children: [/* @__PURE__ */ a(Chart, {
					id: "outChart",
					daily: out?.daily,
					label: "날짜별 탈퇴 수",
					barClass: "bar out"
				}), /* @__PURE__ */ a("div", { children: [/* @__PURE__ */ a("h3", {
					style: { marginTop: 0 },
					children: "탈퇴 사유"
				}), /* @__PURE__ */ a(Kinds, {
					id: "outKinds",
					lines: out && kindLines(out.reasons, (item) => withdrawName(item.reason), "아직 탈퇴 없음")
				})] })]
			})]
		}),
		/* @__PURE__ */ a("section", {
			class: "box",
			"aria-label": "회원 목록",
			children: [
				/* @__PURE__ */ a("h2", { children: "회원 목록" }),
				/* @__PURE__ */ a("form", {
					class: "search",
					id: "searchForm",
					role: "search",
					onSubmit: search,
					children: [/* @__PURE__ */ a("input", {
						id: "q",
						type: "search",
						maxlength: 40,
						placeholder: "닉네임이나 회원번호",
						"aria-label": "닉네임이나 회원번호로 찾기",
						ref: searchRef
					}), /* @__PURE__ */ a("button", {
						class: "btn",
						type: "submit",
						children: "찾기"
					})]
				}),
				/* @__PURE__ */ a("div", {
					class: "tw",
					children: /* @__PURE__ */ a("table", { children: [/* @__PURE__ */ a("thead", { children: /* @__PURE__ */ a("tr", { children: [
						/* @__PURE__ */ a("th", {
							class: "n",
							children: "번호"
						}),
						/* @__PURE__ */ a("th", { children: "닉네임" }),
						/* @__PURE__ */ a("th", { children: "로그인 방법" }),
						/* @__PURE__ */ a("th", { children: "가입" }),
						/* @__PURE__ */ a("th", {
							class: "n",
							children: "승차권"
						}),
						/* @__PURE__ */ a("th", { children: "최근 로그인" }),
						/* @__PURE__ */ a("th", {
							class: "n",
							children: "로그인 기기"
						})
					] }) }), /* @__PURE__ */ a("tbody", {
						class: "pick",
						id: "list",
						onClick: (event) => pickRow(event.target),
						onKeyDown: (event) => {
							if (event.key === "Enter") pickRow(event.target);
						},
						children: /* @__PURE__ */ a(MemberList, {})
					})] })
				}),
				/* @__PURE__ */ a("div", {
					class: "pager",
					children: [
						/* @__PURE__ */ a("span", {
							id: "pageText",
							children: view.pager.text
						}),
						/* @__PURE__ */ a("button", {
							class: "btn quiet",
							type: "button",
							id: "prev",
							disabled: !view.pager.prev,
							onClick: () => {
								page -= 1;
								loadList();
							},
							children: "이전"
						}),
						/* @__PURE__ */ a("button", {
							class: "btn quiet",
							type: "button",
							id: "next",
							disabled: !view.pager.next,
							onClick: () => {
								page += 1;
								loadList();
							},
							children: "다음"
						})
					]
				}),
				/* @__PURE__ */ a("p", {
					class: "note",
					children: "승차권의 장소(출발지 · 도착지)는 목록과 상세에 보이지 않아요. 상세의 [장소 보기]에서 이유를 적어야 보이고, 그때 기록이 남아요."
				})
			]
		}),
		/* @__PURE__ */ a(Detail, {})
	] });
}
main.textContent = "";
set({});
loadStats();
loadList();
