import { Fragment as M, render as K } from "../npm/preact/dist/preact.mjs";
import { jsx as a } from "../npm/preact/jsx-runtime/dist/jsxRuntime.mjs";
var state = {
	pressed: Object.fromEntries([
		"toggleSimcity",
		"toggleJoseon",
		"toggleStarcraft",
		"toggleRetro",
		"toggleNation",
		"toggleCoaster",
		"togglePrebuild",
		"toggleSaver"
	].map((id) => [id, false])),
	hidden: {
		starcraftRace: true,
		nationRow: true,
		coasterSpeed: true
	},
	speedNote: "실시간",
	icons: {
		coaster: "",
		speed: ""
	},
	themeNote: "",
	sky: {
		html: "",
		night: false
	}
};
var handlers = { switches: {} };
var ICON = {
	auto: /* @__PURE__ */ a("svg", {
		viewBox: "0 0 24 24",
		"aria-hidden": "true",
		children: [
			/* @__PURE__ */ a("path", {
				d: "M12 3a9 9 0 0 0 0 18z",
				fill: "#f5a524"
			}),
			/* @__PURE__ */ a("path", {
				d: "M12 3a9 9 0 0 1 0 18z",
				fill: "#4a5b78"
			}),
			/* @__PURE__ */ a("circle", {
				cx: "12",
				cy: "12",
				r: "9",
				fill: "none",
				stroke: "currentColor",
				"stroke-width": "1.4",
				opacity: ".6"
			})
		]
	}),
	light: /* @__PURE__ */ a("svg", {
		viewBox: "0 0 24 24",
		"aria-hidden": "true",
		fill: "none",
		"stroke-linecap": "round",
		children: [/* @__PURE__ */ a("circle", {
			cx: "12",
			cy: "12",
			r: "4.2",
			fill: "#f5a524",
			stroke: "#d98a0b",
			"stroke-width": "1.6"
		}), /* @__PURE__ */ a("path", {
			d: "M12 2.5v2.2M12 19.3v2.2M4.6 4.6l1.6 1.6M17.8 17.8l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.6 19.4l1.6-1.6M17.8 6.2l1.6-1.6",
			stroke: "#e39a17",
			"stroke-width": "2"
		})]
	}),
	dark: /* @__PURE__ */ a("svg", {
		viewBox: "0 0 24 24",
		"aria-hidden": "true",
		children: /* @__PURE__ */ a("path", {
			d: "M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z",
			fill: "#b8c9da",
			stroke: "#7f97b0",
			"stroke-width": "1"
		})
	}),
	simcity: /* @__PURE__ */ a("svg", {
		viewBox: "0 0 24 24",
		width: "20",
		height: "20",
		fill: "none",
		stroke: "currentColor",
		"stroke-width": "1.9",
		"stroke-linecap": "round",
		"stroke-linejoin": "round",
		"aria-hidden": "true",
		children: /* @__PURE__ */ a("path", { d: "M3 21h18M4 21V10h6v11M10 21V3h9v18M7 13v1m0 3v1m6-11h3m-3 4h3m-3 4h3m-3 4h3" })
	}),
	joseon: /* @__PURE__ */ a("svg", {
		viewBox: "0 0 24 24",
		width: "20",
		height: "20",
		fill: "none",
		stroke: "currentColor",
		"stroke-width": "1.9",
		"stroke-linecap": "round",
		"stroke-linejoin": "round",
		"aria-hidden": "true",
		children: /* @__PURE__ */ a("path", { d: "M2 10.5c3.5.3 6.5-1.8 10-5.5 3.5 3.7 6.5 5.8 10 5.5M5 9.5V20M19 9.5V20M3 20h18M9.5 20v-5h5v5" })
	}),
	starcraft: /* @__PURE__ */ a("svg", {
		viewBox: "0 0 24 24",
		width: "20",
		height: "20",
		fill: "none",
		stroke: "currentColor",
		"stroke-width": "1.9",
		"stroke-linecap": "round",
		"stroke-linejoin": "round",
		"aria-hidden": "true",
		children: [
			/* @__PURE__ */ a("circle", {
				cx: "12",
				cy: "12",
				r: "7"
			}),
			/* @__PURE__ */ a("circle", {
				cx: "12",
				cy: "12",
				r: "2"
			}),
			/* @__PURE__ */ a("path", { d: "M12 2v4M12 18v4M2 12h4M18 12h4" })
		]
	}),
	retro: /* @__PURE__ */ a("svg", {
		viewBox: "0 0 24 24",
		width: "20",
		height: "20",
		fill: "none",
		stroke: "currentColor",
		"stroke-width": "1.9",
		"stroke-linecap": "square",
		"stroke-linejoin": "miter",
		"aria-hidden": "true",
		children: /* @__PURE__ */ a("path", { d: "M4 4h4v4H4zM10 4h4v4h-4zM16 10h4v4h-4zM10 10h4v4h-4zM4 16h4v4H4zM16 16h4v4h-4z" })
	}),
	nation: /* @__PURE__ */ a("svg", {
		viewBox: "0 0 24 24",
		width: "20",
		height: "20",
		fill: "none",
		stroke: "currentColor",
		"stroke-width": "1.9",
		"stroke-linecap": "round",
		"stroke-linejoin": "round",
		"aria-hidden": "true",
		children: [/* @__PURE__ */ a("circle", {
			cx: "12",
			cy: "12",
			r: "9"
		}), /* @__PURE__ */ a("path", { d: "M3 12h18M12 3c2.6 2.7 3.9 5.7 3.9 9s-1.3 6.3-3.9 9c-2.6-2.7-3.9-5.7-3.9-9S9.4 5.7 12 3z" })]
	}),
	prebuild: /* @__PURE__ */ a("svg", {
		viewBox: "0 0 24 24",
		width: "20",
		height: "20",
		fill: "none",
		stroke: "currentColor",
		"stroke-width": "1.9",
		"stroke-linecap": "round",
		"stroke-linejoin": "round",
		"aria-hidden": "true",
		children: /* @__PURE__ */ a("path", { d: "M4 21V9l5-3v15M9 21V4h8v17M3 21h18M13 2l-2 4h4l-2 4" })
	}),
	saver: /* @__PURE__ */ a("svg", {
		viewBox: "0 0 24 24",
		width: "20",
		height: "20",
		fill: "none",
		stroke: "currentColor",
		"stroke-width": "1.9",
		"stroke-linecap": "round",
		"stroke-linejoin": "round",
		"aria-hidden": "true",
		children: [/* @__PURE__ */ a("rect", {
			x: "3",
			y: "7",
			width: "16",
			height: "10",
			rx: "2"
		}), /* @__PURE__ */ a("path", { d: "M21 11v2M7 10v4M10 10v4" })]
	})
};
var yes = (on) => on ? "true" : "false";
var pressedBy = (want, value) => want === void 0 ? void 0 : yes(want === value);
function Switch({ id, name, desc, icon, controls }) {
	const key = id.slice(6).toLowerCase();
	return /* @__PURE__ */ a("button", {
		id,
		class: "setting-switch",
		type: "button",
		"aria-pressed": yes(state.pressed[id]),
		"aria-labelledby": `${key}Name`,
		"aria-describedby": `${key}Description cityModeHelp`,
		"aria-controls": controls,
		onClick: () => handlers.switches[id]?.(),
		children: [
			icon,
			/* @__PURE__ */ a("span", {
				class: "setting-name",
				children: [/* @__PURE__ */ a("span", {
					id: `${key}Name`,
					children: name
				}), /* @__PURE__ */ a("small", {
					id: `${key}Description`,
					children: desc
				})]
			}),
			/* @__PURE__ */ a("i", {
				class: "switch",
				"aria-hidden": "true"
			})
		]
	});
}
var Icon = ({ children }) => /* @__PURE__ */ a("span", {
	class: "setting-icon",
	"aria-hidden": "true",
	children
});
var RawIcon = ({ svg }) => /* @__PURE__ */ a("span", {
	class: "setting-icon",
	"aria-hidden": "true",
	dangerouslySetInnerHTML: { __html: svg }
});
function Modes() {
	return /* @__PURE__ */ a(M, { children: [
		/* @__PURE__ */ a("h3", {
			id: "cityModeTitle",
			class: "sr",
			children: "도시 모드"
		}),
		/* @__PURE__ */ a(Switch, {
			id: "toggleSimcity",
			name: "심시티",
			desc: "작은 서울을 거닐어요",
			icon: /* @__PURE__ */ a(Icon, { children: ICON.simcity })
		}),
		/* @__PURE__ */ a(Switch, {
			id: "toggleJoseon",
			name: "조선",
			desc: "한양 기와집 사이를 거닐어요",
			icon: /* @__PURE__ */ a(Icon, { children: ICON.joseon })
		}),
		/* @__PURE__ */ a(Switch, {
			id: "toggleStarcraft",
			name: "스타크래프트",
			desc: "종족을 골라 서울을 거닐어요",
			icon: /* @__PURE__ */ a(Icon, { children: ICON.starcraft }),
			controls: "starcraftRace"
		}),
		/* @__PURE__ */ a("div", {
			id: "starcraftRace",
			class: "setting-row",
			hidden: state.hidden.starcraftRace,
			children: [
				/* @__PURE__ */ a(Icon, {}),
				/* @__PURE__ */ a("span", {
					class: "setting-name",
					children: "종족"
				}),
				/* @__PURE__ */ a("div", {
					class: "segmented",
					role: "group",
					"aria-label": "종족",
					children: [
						["terran", "테란"],
						["zerg", "저그"],
						["protoss", "프로토스"]
					].map(([race, label]) => /* @__PURE__ */ a("button", {
						type: "button",
						"data-race": race,
						"aria-pressed": pressedBy(state.race, race),
						onClick: () => handlers.race?.(race),
						children: label
					}))
				})
			]
		}),
		/* @__PURE__ */ a(Switch, {
			id: "toggleRetro",
			name: "레트로",
			desc: "도트 게임 속 서울을 거닐어요",
			icon: /* @__PURE__ */ a(Icon, { children: ICON.retro })
		}),
		/* @__PURE__ */ a(Switch, {
			id: "toggleNation",
			name: "세계 여행",
			desc: "서울을 다른 나라 풍으로 거닐어요",
			icon: /* @__PURE__ */ a(Icon, { children: ICON.nation }),
			controls: "nationRow"
		}),
		/* @__PURE__ */ a("div", {
			id: "nationRow",
			class: "setting-row",
			hidden: state.hidden.nationRow,
			children: [
				/* @__PURE__ */ a(Icon, {}),
				/* @__PURE__ */ a("span", {
					class: "setting-name",
					children: "나라"
				}),
				/* @__PURE__ */ a("div", {
					class: "segmented",
					role: "group",
					"aria-label": "나라",
					children: [
						["greece", "그리스"],
						["netherlands", "네덜란드"],
						["paris", "파리"],
						["egypt", "이집트"]
					].map(([nation, label]) => /* @__PURE__ */ a("button", {
						type: "button",
						"data-nation": nation,
						"aria-pressed": pressedBy(state.nation, nation),
						onClick: () => handlers.nation?.(nation),
						children: label
					}))
				})
			]
		}),
		/* @__PURE__ */ a(Switch, {
			id: "toggleCoaster",
			name: "롤러코스터",
			desc: "도시 위를 달려요",
			icon: /* @__PURE__ */ a(RawIcon, { svg: state.icons.coaster }),
			controls: "coasterSpeed"
		}),
		/* @__PURE__ */ a("div", {
			id: "coasterSpeed",
			class: "setting-row",
			hidden: state.hidden.coasterSpeed,
			children: [
				/* @__PURE__ */ a(RawIcon, { svg: state.icons.speed }),
				/* @__PURE__ */ a("span", {
					class: "setting-name",
					children: ["열차 속도", /* @__PURE__ */ a("small", {
						id: "speedNote",
						children: state.speedNote
					})]
				}),
				/* @__PURE__ */ a("div", {
					class: "segmented",
					role: "group",
					"aria-label": "열차 속도",
					children: [
						1,
						5,
						20
					].map((speed) => /* @__PURE__ */ a("button", {
						type: "button",
						"data-speed": speed,
						"aria-pressed": pressedBy(state.speed, speed),
						onClick: () => handlers.speed?.(speed),
						children: `${speed}배`
					}))
				})
			]
		}),
		/* @__PURE__ */ a("p", {
			id: "cityModeHelp",
			class: "setting-help",
			children: [
				"한 번에 하나만 켤 수 있어요.",
				/* @__PURE__ */ a("br", {}),
				"모두 끄면 기본 지도예요."
			]
		})
	] });
}
function DeviceSwitch({ id, name, note, icon }) {
	return /* @__PURE__ */ a("button", {
		id,
		class: "setting-switch",
		type: "button",
		"aria-pressed": yes(state.pressed[id]),
		onClick: () => handlers.switches[id]?.(),
		children: [
			/* @__PURE__ */ a(Icon, { children: icon }),
			/* @__PURE__ */ a("span", {
				class: "setting-name",
				children: [name, /* @__PURE__ */ a("small", { children: note })]
			}),
			/* @__PURE__ */ a("i", {
				class: "switch",
				"aria-hidden": "true"
			})
		]
	});
}
var Device = () => /* @__PURE__ */ a(M, { children: [/* @__PURE__ */ a(DeviceSwitch, {
	id: "togglePrebuild",
	name: "건물 미리 짓기",
	note: "모드 전환이 빨라져요 · 발열 주의",
	icon: ICON.prebuild
}), /* @__PURE__ */ a(DeviceSwitch, {
	id: "toggleSaver",
	name: "절전",
	note: "움직임을 조금 덜 부드럽게 · 배터리 아낌",
	icon: ICON.saver
})] });
function ThemePick() {
	const note = state.themeNote, choices = [
		[
			"auto",
			ICON.auto,
			"자동"
		],
		[
			"light",
			ICON.light,
			"라이트"
		],
		[
			"dark",
			ICON.dark,
			"다크"
		]
	];
	return /* @__PURE__ */ a(M, { children: [
		/* @__PURE__ */ a("div", {
			id: "sunPath",
			class: state.sky.night ? "sun-path is-night" : "sun-path",
			dangerouslySetInnerHTML: { __html: state.sky.html }
		}),
		/* @__PURE__ */ a("div", {
			class: "theme-seg",
			role: "group",
			"aria-label": "테마",
			"aria-describedby": "themeNote",
			children: choices.map(([choice, icon, label]) => /* @__PURE__ */ a("button", {
				type: "button",
				"data-theme-choice": choice,
				"aria-pressed": pressedBy(state.theme, choice),
				onClick: () => handlers.theme?.(choice),
				children: [icon, /* @__PURE__ */ a("span", { children: label })]
			}))
		}),
		/* @__PURE__ */ a("p", {
			id: "themeNote",
			class: "theme-note",
			"aria-live": "polite",
			children: typeof note === "string" ? note : /* @__PURE__ */ a(M, { children: [
				note.lead,
				/* @__PURE__ */ a("b", { children: note.bold }),
				note.tail
			] })
		})
	] });
}
var roots = [
	[document.querySelector("#menuRoot .theme-pick"), () => /* @__PURE__ */ a(ThemePick, {})],
	[document.getElementById("menuModes"), () => /* @__PURE__ */ a(Modes, {})],
	[document.getElementById("menuDevice"), () => /* @__PURE__ */ a(Device, {})]
];
function paint(patch) {
	state = {
		...state,
		...patch
	};
	for (const [root, view] of roots) if (root) K(view(), root);
}
var settingsMenu = {
	press(id, on) {
		paint({ pressed: {
			...state.pressed,
			[id]: on
		} });
	},
	hide(id, hidden) {
		paint({ hidden: {
			...state.hidden,
			[id]: hidden
		} });
	},
	race(want) {
		paint({ race: want });
	},
	nation(want) {
		paint({ nation: want });
	},
	speed(speed, note) {
		paint({
			speed,
			speedNote: note
		});
	},
	icons(coaster, speed) {
		paint({ icons: {
			coaster,
			speed
		} });
	},
	theme(choice) {
		paint({ theme: choice });
	},
	themeNote(note) {
		paint({ themeNote: note });
	},
	sky(html, night) {
		paint({ sky: {
			html,
			night
		} });
	},
	on(more) {
		Object.assign(handlers.switches, more.switches);
		if (more.race) handlers.race = more.race;
		if (more.nation) handlers.nation = more.nation;
		if (more.speed) handlers.speed = more.speed;
		if (more.theme) handlers.theme = more.theme;
	}
};
paint({});
export { settingsMenu };
