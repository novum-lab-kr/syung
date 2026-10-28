import { Fragment as M, render as K } from "../npm/preact/dist/preact.mjs";
import { jsx as a } from "../npm/preact/jsx-runtime/dist/jsxRuntime.mjs";
import { useEffect as A, useState as d } from "../npm/preact/hooks/dist/hooks.mjs";
import { cacheRow, callLine, clock, duration } from "./status_data.mjs";
// web/admin/status.tsx
function Problems({ view }) {
	const { error, body } = view;
	if (error) return /* @__PURE__ */ a("ul", {
		class: "problems",
		id: "problems",
		children: /* @__PURE__ */ a("li", { children: error })
	});
	if (!body) return /* @__PURE__ */ a("ul", {
		class: "problems",
		id: "problems",
		children: /* @__PURE__ */ a("li", {
			class: "fine",
			children: "불러오는 중"
		})
	});
	return /* @__PURE__ */ a("ul", {
		class: "problems",
		id: "problems",
		children: body.problems.length ? body.problems.map((problem) => /* @__PURE__ */ a("li", { children: problem.text })) : /* @__PURE__ */ a("li", {
			class: "fine",
			children: "문제 없어요"
		})
	});
}
function StatusPage() {
	const [view, setView] = d({
		login: false,
		error: null,
		body: null
	});
	async function load() {
		let body;
		try {
			const response = await fetch("/api/admin/status", { credentials: "same-origin" });
			if (response.status === 401) {
				setView((prev) => ({
					...prev,
					login: true
				}));
				return;
			}
			setView((prev) => ({
				...prev,
				login: false
			}));
			body = await response.json();
			if (!response.ok) throw new Error(body.error?.message || `요청 실패(${response.status})`);
		} catch (error) {
			setView((prev) => ({
				...prev,
				error: error.message
			}));
			return;
		}
		setView((prev) => ({
			...prev,
			error: null,
			body
		}));
	}
	A(() => {
		load();
		const timer = setInterval(() => {
			if (!document.hidden) load();
		}, 3e4);
		return () => clearInterval(timer);
	}, []);
	const { body } = view;
	return /* @__PURE__ */ a(M, { children: [
		/* @__PURE__ */ a("p", {
			class: "login",
			id: "login",
			hidden: !view.login,
			children: ["로그인이 풀렸어요. ", /* @__PURE__ */ a("a", {
				href: "/admin/login.html?next=/admin/status",
				children: "다시 로그인"
			})]
		}),
		/* @__PURE__ */ a("section", {
			class: "stats",
			"aria-label": "서버",
			children: [
				/* @__PURE__ */ a("div", {
					class: "stat",
					children: [
						/* @__PURE__ */ a("small", { children: "켠 지" }),
						/* @__PURE__ */ a("b", {
							id: "uptime",
							children: body ? duration(body.uptimeSeconds) : "–"
						}),
						/* @__PURE__ */ a("span", {
							id: "started",
							children: body ? `${body.startedAt.slice(0, 10)} ${clock(body.startedAt)} 시작` : ""
						})
					]
				}),
				/* @__PURE__ */ a("div", {
					class: "stat",
					children: [
						/* @__PURE__ */ a("small", { children: "지금 문제" }),
						/* @__PURE__ */ a("b", {
							id: "problemCount",
							children: body ? body.problems.length ? `${body.problems.length}건` : "없음" : "–"
						}),
						/* @__PURE__ */ a("span", { children: "이상 감지 기준" })
					]
				}),
				/* @__PURE__ */ a("div", {
					class: "stat",
					children: [
						/* @__PURE__ */ a("small", { children: "확인한 때" }),
						/* @__PURE__ */ a("b", {
							id: "checked",
							children: body ? clock(body.checkedAt) : "–"
						}),
						/* @__PURE__ */ a("span", { children: "30초마다 다시 봐요" })
					]
				})
			]
		}),
		/* @__PURE__ */ a("section", {
			class: "box",
			"aria-label": "지금 문제",
			children: [/* @__PURE__ */ a("h2", { children: ["지금 문제", /* @__PURE__ */ a("button", {
				class: "btn",
				type: "button",
				id: "reload",
				onClick: load,
				children: "다시 보기"
			})] }), /* @__PURE__ */ a(Problems, { view })]
		}),
		/* @__PURE__ */ a("section", {
			class: "box",
			"aria-label": "API 사용량",
			children: [
				/* @__PURE__ */ a("h2", { children: "오늘 바깥 API 호출" }),
				/* @__PURE__ */ a("div", {
					class: "calls",
					id: "calls",
					children: body?.calls.map(callLine).map((line) => /* @__PURE__ */ a("div", {
						class: "call",
						children: [
							/* @__PURE__ */ a("div", { children: [/* @__PURE__ */ a("span", { children: line.label }), /* @__PURE__ */ a("b", { children: line.count })] }),
							/* @__PURE__ */ a("div", {
								class: "meter",
								children: /* @__PURE__ */ a("i", {
									class: line.level,
									style: { width: line.width }
								})
							}),
							/* @__PURE__ */ a("small", { children: line.sub })
						]
					}))
				}),
				/* @__PURE__ */ a("p", {
					class: "note",
					children: "서울시 API 는 키마다 하루 한도가 있어요(한국 날짜로 0시에 다시 세요). 위치 피드는 지하철 호출 안에서 따로 정한 예산이에요."
				})
			]
		}),
		/* @__PURE__ */ a("section", {
			class: "box",
			"aria-label": "캐시",
			children: [/* @__PURE__ */ a("h2", { children: "캐시" }), /* @__PURE__ */ a("table", { children: [/* @__PURE__ */ a("thead", { children: /* @__PURE__ */ a("tr", { children: [
				/* @__PURE__ */ a("th", { children: "무엇" }),
				/* @__PURE__ */ a("th", {
					class: "n",
					children: "담긴 수"
				}),
				/* @__PURE__ */ a("th", {
					class: "n",
					children: "받은 지"
				})
			] }) }), /* @__PURE__ */ a("tbody", {
				id: "caches",
				children: body?.caches.map(cacheRow).map(([label, entries, age]) => /* @__PURE__ */ a("tr", { children: [
					/* @__PURE__ */ a("td", { children: label }),
					/* @__PURE__ */ a("td", {
						class: "n",
						children: entries
					}),
					/* @__PURE__ */ a("td", {
						class: "n",
						children: age
					})
				] }))
			})] })]
		})
	] });
}
var main = document.querySelector("main");
main.textContent = "";
K(/* @__PURE__ */ a(StatusPage, {}), main);
