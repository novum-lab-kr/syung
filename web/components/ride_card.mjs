import { Fragment as M, render as K } from "../npm/preact/dist/preact.mjs";
import { __vitePreload } from "../_virtual/_vite/preload-helper.mjs";
import { jsx as a } from "../npm/preact/jsx-runtime/dist/jsxRuntime.mjs";
import { useCallback as b, useEffect as A, useRef as T, useState as d } from "../npm/preact/hooks/dist/hooks.mjs";
import { GoalFlag, MapArrival } from "./ride_arrival.mjs";
// web/components/ride_card.tsx
var CLOSE = /* @__PURE__ */ a("svg", {
	viewBox: "0 0 24 24",
	width: "16",
	height: "16",
	"aria-hidden": "true",
	fill: "none",
	stroke: "currentColor",
	"stroke-width": "2.2",
	"stroke-linecap": "round",
	children: /* @__PURE__ */ a("path", { d: "M6 6l12 12M18 6 6 18" })
});
var DEV_ANSWERS = [["rode", "탔음"], ["not_rode", "안 탔음"]];
function DevAnswer({ dev, answer }) {
	return /* @__PURE__ */ a("div", {
		class: "rg-dev",
		role: "group",
		"aria-label": "개발자 기록 — 탔는지 표시",
		children: DEV_ANSWERS.map(([value, label]) => /* @__PURE__ */ a("button", {
			type: "button",
			class: `sy-btn ${dev.answered === value ? "sy-btn-primary" : "sy-btn-secondary"}`,
			"aria-pressed": dev.answered === value ? "true" : "false",
			onClick: () => answer?.(value),
			children: label
		}, value))
	});
}
var said = (parts) => parts.map((part) => typeof part === "string" ? part : /* @__PURE__ */ a("span", {
	class: `rg-${part.mark}`,
	children: part.text
}));
var SKY_ART = {
	sun: /* @__PURE__ */ a(M, { children: [/* @__PURE__ */ a("circle", {
		cx: "24",
		cy: "24",
		r: "10",
		fill: "#ffc928",
		stroke: "#f08a24",
		"stroke-width": "2"
	}), /* @__PURE__ */ a("path", {
		d: "M24 5v6M24 37v6M5 24h6M37 24h6M10.5 10.5l4.3 4.3M33.2 33.2l4.3 4.3M10.5 37.5l4.3-4.3M33.2 14.8l4.3-4.3",
		stroke: "#f08a24",
		"stroke-width": "3"
	})] }),
	moon: /* @__PURE__ */ a(M, { children: [/* @__PURE__ */ a("path", {
		d: "M31 8a17 17 0 1 0 9 24A14 14 0 0 1 31 8z",
		fill: "#ffd95a",
		stroke: "#e0a526",
		"stroke-width": "2"
	}), /* @__PURE__ */ a("path", {
		d: "M9 10l1.5 3 3 1.5-3 1.5L9 19l-1.5-3-3-1.5 3-1.5z",
		fill: "#ffd95a"
	})] }),
	cloud: /* @__PURE__ */ a("path", {
		d: "M13 36a8 8 0 0 1 0-16 11 11 0 0 1 21-3 9 9 0 0 1 1 19z",
		fill: "#cfe3f7",
		stroke: "#6f9fd8",
		"stroke-width": "2.2"
	}),
	rain: /* @__PURE__ */ a(M, { children: [
		/* @__PURE__ */ a("path", {
			d: "M5 25a19 19 0 0 1 38 0q-4.75-5-9.5 0-4.75-5-9.5 0-4.75-5-9.5 0-4.75-5-9.5 0z",
			fill: "#ff7b6b",
			stroke: "#d9483b",
			"stroke-width": "2"
		}),
		/* @__PURE__ */ a("path", {
			d: "M24 6v-3M24 25v14a4 4 0 0 1-8 0",
			stroke: "#7a5a48",
			"stroke-width": "2.6"
		}),
		/* @__PURE__ */ a("path", {
			d: "M36 33l-2 6M42 31l-2 6M8 33l-2 6",
			stroke: "#4d9be6",
			"stroke-width": "2.6"
		})
	] }),
	snow: /* @__PURE__ */ a(M, { children: [/* @__PURE__ */ a("path", {
		d: "M13 27a7 7 0 0 1 0-14 10 10 0 0 1 19-3 8 8 0 0 1 1 17z",
		fill: "#dfe9f5",
		stroke: "#8fa6c4",
		"stroke-width": "2.2"
	}), /* @__PURE__ */ a("path", {
		d: "M12 34v8M8.5 36l7 4M15.5 36l-7 4M25 33v8M21.5 35l7 4M28.5 35l-7 4M37 34v8M33.5 36l7 4M40.5 36l-7 4",
		stroke: "#5aa7ea",
		"stroke-width": "2"
	})] }),
	bolt: /* @__PURE__ */ a(M, { children: [/* @__PURE__ */ a("path", {
		d: "M13 27a7 7 0 0 1 0-14 10 10 0 0 1 19-3 8 8 0 0 1 1 17z",
		fill: "#aab5c3",
		stroke: "#6f7b8c",
		"stroke-width": "2.2"
	}), /* @__PURE__ */ a("path", {
		d: "M26 22l-8 12h6l-3 11 10-14h-6l4-9z",
		fill: "#ffc928",
		stroke: "#f08a24",
		"stroke-width": "1.6"
	})] })
};
function SkyArt({ icon }) {
	const night = document.documentElement.dataset.theme === "dark";
	return /* @__PURE__ */ a("svg", {
		class: "rg-sky-art",
		viewBox: "0 0 48 48",
		"aria-hidden": "true",
		fill: "none",
		"stroke-linecap": "round",
		"stroke-linejoin": "round",
		children: [/* @__PURE__ */ a("filter", {
			id: "rg-crayon",
			x: "-10%",
			y: "-10%",
			width: "120%",
			height: "120%",
			children: [
				/* @__PURE__ */ a("feTurbulence", {
					type: "fractalNoise",
					baseFrequency: ".12",
					numOctaves: "2",
					seed: "4",
					result: "wobble"
				}),
				/* @__PURE__ */ a("feDisplacementMap", {
					in: "SourceGraphic",
					in2: "wobble",
					scale: "2.6",
					result: "shape"
				}),
				/* @__PURE__ */ a("feTurbulence", {
					type: "fractalNoise",
					baseFrequency: ".8 .5",
					numOctaves: "2",
					seed: "9"
				}),
				/* @__PURE__ */ a("feColorMatrix", {
					values: "0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 -2.6 2.4",
					result: "grain"
				}),
				/* @__PURE__ */ a("feComposite", {
					in: "shape",
					in2: "grain",
					operator: "in"
				})
			]
		}), /* @__PURE__ */ a("g", {
			filter: "url(#rg-crayon)",
			children: SKY_ART[night && icon === "sun" ? "moon" : icon]
		})]
	});
}
function RideSky({ spot }) {
	const [sky, setSky] = d(null), key = spot.at.join();
	A(() => {
		let gone = false;
		setSky(null);
		__vitePreload(() => import("../lib/ride_info_motion.mjs").then((motion) => motion.skySay(spot.at)), [], import.meta.url).then((talk) => {
			if (!gone) setSky(talk);
		}).catch(() => {});
		return () => {
			gone = true;
		};
	}, [key]);
	return sky ? /* @__PURE__ */ a("p", {
		class: "rg-more rg-more-sky",
		children: [/* @__PURE__ */ a(SkyArt, { icon: sky.icon }), /* @__PURE__ */ a("span", { children: [
			"지금 ",
			spot.name,
			"엔 ",
			sky.text,
			sky.tip && /* @__PURE__ */ a(M, { children: [" ", /* @__PURE__ */ a("span", {
				class: "rg-star",
				children: sky.tip
			})] })
		] })]
	}) : null;
}
function RideCard({ view, actions }) {
	const info = view.info, talk = info?.talk;
	return /* @__PURE__ */ a("div", {
		class: "rg-stack",
		children: [
			!view.following && /* @__PURE__ */ a("button", {
				type: "button",
				class: "sheet-follow rg-follow",
				onClick: actions.follow,
				children: "다시 따라가기"
			}),
			/* @__PURE__ */ a("div", {
				class: "rg-talk",
				role: "status",
				"aria-live": "polite",
				children: [
					/* @__PURE__ */ a("b", { children: talk ? said(talk.title) : view.title }),
					view.say && /* @__PURE__ */ a("p", {
						class: "rg-said",
						children: /* @__PURE__ */ a("span", {
							class: "rg-pen",
							children: view.say
						})
					}),
					/* @__PURE__ */ a("small", { children: view.detour ? /* @__PURE__ */ a("a", {
						href: "#",
						class: "rg-detour",
						onClick: (event) => {
							event.preventDefault();
							actions.detour();
						},
						children: "다른 길 찾기 ›"
					}) : talk ? said(talk.sub) : view.sub }),
					talk?.todo && /* @__PURE__ */ a("p", {
						class: "rg-more",
						children: said(talk.todo)
					}),
					info?.sky && /* @__PURE__ */ a(RideSky, { spot: info.sky }),
					view.dev && /* @__PURE__ */ a(DevAnswer, {
						dev: view.dev,
						answer: actions.answer
					}),
					/* @__PURE__ */ a("button", {
						type: "button",
						class: "rg-x",
						"aria-label": "타고 가기 끝내기",
						title: "타고 가기 끝내기",
						onClick: actions.close,
						children: CLOSE
					})
				]
			}),
			/* @__PURE__ */ a("i", {
				class: view.flip ? "rg-sprout flip" : "rg-sprout",
				"aria-hidden": "true",
				style: `background-image:url("./brand/characters/${view.image}")`
			})
		]
	});
}
var EDGE_CRAYON = /* @__PURE__ */ a("filter", {
	id: "rg-edge-crayon",
	x: "-20%",
	y: "-20%",
	width: "140%",
	height: "140%",
	children: [
		/* @__PURE__ */ a("feTurbulence", {
			type: "fractalNoise",
			baseFrequency: ".12",
			numOctaves: "2",
			seed: "4",
			result: "wobble"
		}),
		/* @__PURE__ */ a("feDisplacementMap", {
			in: "SourceGraphic",
			in2: "wobble",
			scale: "2.6",
			result: "shape"
		}),
		/* @__PURE__ */ a("feTurbulence", {
			type: "fractalNoise",
			baseFrequency: ".8 .5",
			numOctaves: "2",
			seed: "9"
		}),
		/* @__PURE__ */ a("feColorMatrix", {
			values: "0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 -2.6 2.4",
			result: "grain"
		}),
		/* @__PURE__ */ a("feComposite", {
			in: "shape",
			in2: "grain",
			operator: "in"
		})
	]
});
var ROW_CRAYON = /* @__PURE__ */ a("filter", {
	id: "rg-row-crayon",
	x: "-100%",
	y: "0",
	width: "300%",
	height: "100%",
	children: [
		/* @__PURE__ */ a("feTurbulence", {
			type: "fractalNoise",
			baseFrequency: ".12",
			numOctaves: "2",
			seed: "4",
			result: "wobble"
		}),
		/* @__PURE__ */ a("feDisplacementMap", {
			in: "SourceGraphic",
			in2: "wobble",
			scale: "1.8",
			xChannelSelector: "R",
			yChannelSelector: "R",
			result: "shape"
		}),
		/* @__PURE__ */ a("feTurbulence", {
			type: "fractalNoise",
			baseFrequency: ".8 .5",
			numOctaves: "2",
			seed: "9"
		}),
		/* @__PURE__ */ a("feColorMatrix", {
			values: "0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 -2.6 2.4",
			result: "grain"
		}),
		/* @__PURE__ */ a("feComposite", {
			in: "shape",
			in2: "grain",
			operator: "in"
		})
	]
});
var textCrayon = (id, wobble, grain) => /* @__PURE__ */ a("filter", {
	id,
	x: "-5%",
	y: "-15%",
	width: "110%",
	height: "130%",
	children: [
		/* @__PURE__ */ a("feTurbulence", {
			type: "fractalNoise",
			baseFrequency: ".12",
			numOctaves: "2",
			seed: "4",
			result: "wobble"
		}),
		/* @__PURE__ */ a("feDisplacementMap", {
			in: "SourceGraphic",
			in2: "wobble",
			scale: wobble,
			xChannelSelector: "R",
			yChannelSelector: "G",
			result: "shape"
		}),
		/* @__PURE__ */ a("feTurbulence", {
			type: "fractalNoise",
			baseFrequency: ".8 .5",
			numOctaves: "2",
			seed: "9"
		}),
		/* @__PURE__ */ a("feColorMatrix", {
			values: `0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 ${grain}`,
			result: "grain"
		}),
		/* @__PURE__ */ a("feComposite", {
			in: "shape",
			in2: "grain",
			operator: "in"
		})
	]
});
var TEXT_CRAYON = /* @__PURE__ */ a(M, { children: [textCrayon("rg-text-crayon", .9, "-2.2 2.3"), textCrayon("rg-text-crayon-big", 1.6, "-2.6 2.4")] });
function RideEdge({ color, top, bottom }) {
	return /* @__PURE__ */ a(M, { children: [/* @__PURE__ */ a("i", {
		class: `rg-edge top${top ? "" : " off"}`,
		"aria-hidden": "true",
		children: /* @__PURE__ */ a("svg", {
			viewBox: "0 0 44 56",
			fill: "none",
			stroke: color,
			"stroke-linecap": "round",
			children: /* @__PURE__ */ a("g", {
				filter: "url(#rg-edge-crayon)",
				children: [
					/* @__PURE__ */ a("path", {
						d: "M22 62V52l-2-4",
						"stroke-width": "4.4"
					}),
					/* @__PURE__ */ a("path", {
						d: "M17 43l8-11",
						"stroke-width": "4.2",
						opacity: ".9"
					}),
					/* @__PURE__ */ a("path", {
						d: "M18 28l7-10",
						"stroke-width": "3.4",
						opacity: ".68"
					}),
					/* @__PURE__ */ a("path", {
						d: "M19 13l5-8",
						"stroke-width": "2.6",
						opacity: ".45"
					})
				]
			})
		})
	}), /* @__PURE__ */ a("i", {
		class: `rg-edge bottom${bottom ? "" : " off"}`,
		"aria-hidden": "true",
		children: /* @__PURE__ */ a("svg", {
			viewBox: "0 0 120 76",
			fill: "none",
			"stroke-linecap": "round",
			"stroke-linejoin": "round",
			children: [
				EDGE_CRAYON,
				ROW_CRAYON,
				TEXT_CRAYON,
				/* @__PURE__ */ a("g", {
					filter: "url(#rg-edge-crayon)",
					children: [/* @__PURE__ */ a("path", {
						d: "M22 -6V40l-3 6 5 4-4 5 2 5",
						stroke: color,
						"stroke-width": "4.4"
					}), /* @__PURE__ */ a("g", {
						transform: "translate(22 61) rotate(-28)",
						children: [
							/* @__PURE__ */ a("path", {
								class: "wood",
								d: "M1 0l13-6v12z"
							}),
							/* @__PURE__ */ a("path", {
								d: "M0 0l5.5-2.5v5z",
								fill: color
							}),
							/* @__PURE__ */ a("rect", {
								x: "14",
								y: "-6",
								width: "60",
								height: "12",
								fill: color
							}),
							/* @__PURE__ */ a("path", {
								class: "shade",
								d: "M14 2.5h60"
							}),
							/* @__PURE__ */ a("rect", {
								class: "band",
								x: "74",
								y: "-6",
								width: "8",
								height: "12"
							}),
							/* @__PURE__ */ a("rect", {
								class: "rubber",
								x: "82",
								y: "-6",
								width: "9",
								height: "12",
								rx: "3"
							})
						]
					})]
				})
			]
		})
	})] });
}
var LIST_ROW_PX = 40;
var EDGE_TOP_PX = 56;
var EDGE_BOTTOM_PX = 76;
function RideList({ list, unit }) {
	const box = T(null), touching = T(false), waiting = T(false), opened = T(false);
	const centre = b((smooth) => {
		const calm = !smooth || matchMedia("(prefers-reduced-motion:reduce)").matches;
		box.current?.scrollTo({
			top: list.at * LIST_ROW_PX,
			behavior: calm ? "auto" : "smooth"
		});
	}, [list.at]);
	A(() => {
		if (touching.current) {
			waiting.current = true;
			return;
		}
		centre(opened.current);
		opened.current = true;
	}, [list.at]);
	const [ends, setEnds] = d({
		top: false,
		bottom: false
	});
	const measure = b(() => {
		const host = box.current, rows = host?.querySelectorAll("li");
		const first = rows?.[0], last = rows?.[rows.length - 1];
		if (!host || !first || !last) return;
		const frame = host.getBoundingClientRect(), head = first.getBoundingClientRect(), tail = last.getBoundingClientRect();
		const top = head.top + head.height / 2 < frame.top + EDGE_TOP_PX, bottom = tail.top + tail.height / 2 > frame.bottom - EDGE_BOTTOM_PX;
		setEnds((seen) => seen.top === top && seen.bottom === bottom ? seen : {
			top,
			bottom
		});
	}, []);
	A(measure, [list.at, list.rows.length]);
	const release = b(() => {
		touching.current = false;
		if (waiting.current) {
			waiting.current = false;
			centre(true);
		}
	}, [centre]);
	const lined = list.rows.slice(0, list.at + 1).reverse().concat(list.rows).find((row) => row.kind !== "gap");
	return /* @__PURE__ */ a("div", {
		class: "rg-list-box",
		children: [/* @__PURE__ */ a("div", {
			class: "rg-list",
			ref: box,
			onScroll: measure,
			onTouchStart: () => {
				touching.current = true;
			},
			onTouchEnd: release,
			onTouchCancel: release,
			children: /* @__PURE__ */ a("ol", { children: list.rows.map((row, order) => {
				const gone = order < list.at ? " past" : "";
				if (row.kind === "gap") return /* @__PURE__ */ a("li", {
					class: `gap${gone}`,
					children: /* @__PURE__ */ a("i", { children: row.text })
				});
				if (row.kind === "leg") return /* @__PURE__ */ a("li", {
					class: `leg${gone}`,
					style: `--rg-line:${row.color}`,
					children: /* @__PURE__ */ a("b", { children: row.text })
				});
				const now = order === list.at, state = now ? "now" : order < list.at ? "past" : "rest";
				return /* @__PURE__ */ a("li", {
					class: `stop ${state}${row.edge ? ` ${row.edge}` : ""}`,
					style: `--rg-line:${row.color}`,
					"aria-current": now ? "step" : void 0,
					children: [now && /* @__PURE__ */ a("small", { children: ["이번 ", unit] }), /* @__PURE__ */ a("span", { children: [/* @__PURE__ */ a("b", { children: row.name }), row.off && /* @__PURE__ */ a("em", { children: "내림" })] })]
				});
			}) })
		}), lined && /* @__PURE__ */ a(RideEdge, {
			color: lined.color,
			top: ends.top,
			bottom: ends.bottom
		})]
	});
}
function RideInfo({ info }) {
	const box = T(null);
	A(() => {
		let gone = false, stop = null;
		__vitePreload(() => import("../lib/ride_info_motion.mjs").then((motion) => {
			if (!gone && box.current) stop = motion.startRideMotion(box.current, info.here);
		}), [], import.meta.url).catch(() => {});
		return () => {
			gone = true;
			stop?.();
		};
	}, []);
	return /* @__PURE__ */ a("section", {
		class: "rg-info",
		"aria-label": "타고 가는 곳",
		children: [/* @__PURE__ */ a("div", {
			class: "rg-info-view",
			"aria-hidden": "true",
			children: /* @__PURE__ */ a("div", {
				class: "rg-info-scene",
				ref: box
			})
		}), /* @__PURE__ */ a(RideList, {
			list: info.list,
			unit: info.unit
		})]
	});
}
function ArrivalCard({ view, actions, map, hideMe }) {
	const [failed, setFailed] = d(false), fail = b(() => setFailed(true), []);
	const at = view.arrival?.at;
	if (failed || !view.arrival || !at) return /* @__PURE__ */ a(RideCard, {
		view,
		actions
	});
	return /* @__PURE__ */ a(MapArrival, {
		map,
		at,
		hideMe,
		arrival: view.arrival,
		onClose: actions.close,
		onError: fail
	});
}
function drawRideCard(host, view, actions, map, hideMe) {
	const goal = view?.goal?.at, flag = map && goal ? /* @__PURE__ */ a(GoalFlag, {
		map,
		at: goal
	}, "goal") : null;
	const draw = (body, flagOnTop = false) => K(flag ? /* @__PURE__ */ a(M, { children: [
		flagOnTop ? null : flag,
		body,
		flagOnTop ? flag : null
	] }) : body, host);
	const at = view?.arrival?.at;
	if (view?.arrival && map && at) {
		draw(/* @__PURE__ */ a(ArrivalCard, {
			view,
			actions,
			map,
			hideMe
		}, "arrival"), true);
		return;
	}
	const card = view ? /* @__PURE__ */ a(RideCard, {
		view,
		actions
	}, "card") : null;
	draw(view?.info ? /* @__PURE__ */ a(M, { children: [/* @__PURE__ */ a(RideInfo, { info: view.info }, "info"), card] }) : card);
}
export { RideCard, drawRideCard };
