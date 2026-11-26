import { rideSwapAsk } from "../lib/ride-along.mjs";
import { Fragment as M, render as K } from "../npm/preact/dist/preact.mjs";
import { __vitePreload } from "../_virtual/_vite/preload-helper.mjs";
import { jsx as a } from "../npm/preact/jsx-runtime/dist/jsxRuntime.mjs";
import { useCallback as b, useEffect as A, useRef as T, useState as d } from "../npm/preact/hooks/dist/hooks.mjs";
import { MapArrival } from "./ride_arrival.mjs";
import { LayerSheet } from "./layer_sheet.mjs";
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
function FixAsk({ fix, act }) {
	return /* @__PURE__ */ a(M, { children: [fix.buttons.length > 0 && /* @__PURE__ */ a("div", {
		class: "rg-ask",
		role: "group",
		"aria-label": "열차에 탔는지 알려 주기",
		children: fix.buttons.map((button) => /* @__PURE__ */ a("button", {
			type: "button",
			class: `sy-btn ${button.main ? "sy-btn-primary" : "sy-btn-secondary"}`,
			onClick: () => act?.(button.act),
			children: button.text
		}, button.act))
	}), fix.links.length > 0 && /* @__PURE__ */ a("p", {
		class: "rg-fix",
		children: [fix.hint && /* @__PURE__ */ a(M, { children: [/* @__PURE__ */ a("span", { children: fix.hint }), /* @__PURE__ */ a("i", {
			"aria-hidden": "true",
			children: "·"
		})] }), fix.links.map((link, order) => /* @__PURE__ */ a(M, { children: [order > 0 && /* @__PURE__ */ a("i", {
			"aria-hidden": "true",
			children: "·"
		}), /* @__PURE__ */ a("a", {
			href: "#",
			class: "rg-detour",
			onClick: (event) => {
				event.preventDefault();
				act?.(link.act);
			},
			children: link.text
		})] }, link.act))]
	})] });
}
function said(parts) {
	return parts.map((part) => {
		if (typeof part === "string") return part;
		if (part.mark === "line") return /* @__PURE__ */ a("span", {
			class: "rg-line",
			children: part.text
		});
		return part.mark === "star" ? /* @__PURE__ */ a(Starred, { text: part.text }) : /* @__PURE__ */ a("span", {
			class: "rg-mark",
			children: part.text
		});
	});
}
function Starred({ text }) {
	return /* @__PURE__ */ a("span", {
		class: "rg-star",
		children: [text, /* @__PURE__ */ a("svg", {
			class: "rg-star-art",
			viewBox: "0 0 48 48",
			"aria-hidden": "true",
			"stroke-linecap": "round",
			"stroke-linejoin": "round",
			children: /* @__PURE__ */ a("g", {
				filter: "url(#rg-crayon)",
				children: [/* @__PURE__ */ a("path", {
					d: "M24 5.5l5.4 12 13 2.1-9.6 9 2.7 13.1L24 35.4l-11.9 6.1 2.8-13-9.7-9.2 13.3-1.4z",
					fill: "#ffc928",
					stroke: "#f08a24",
					"stroke-width": "2.6"
				}), /* @__PURE__ */ a("path", {
					d: "M16 26l13-8M17.5 31.5l15-9.5M22 34l9-5.5",
					fill: "none",
					stroke: "#f5a623",
					"stroke-width": "2",
					opacity: ".75"
				})]
			})
		})]
	});
}
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
		children: /* @__PURE__ */ a("g", {
			filter: "url(#rg-crayon)",
			children: SKY_ART[night && icon === "sun" ? "moon" : icon]
		})
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
			said(sky.said),
			sky.tip && /* @__PURE__ */ a(M, { children: [" ", /* @__PURE__ */ a(Starred, { text: sky.tip })] })
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
					view.fix && /* @__PURE__ */ a(FixAsk, {
						fix: view.fix,
						act: actions.fix
					}),
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
var SKY_CRAYON = /* @__PURE__ */ a("filter", {
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
});
var TEXT_CRAYON = /* @__PURE__ */ a(M, { children: [textCrayon("rg-text-crayon", .9, "-2.2 2.3"), textCrayon("rg-text-crayon-big", 1.6, "-2.6 2.4")] });
function RideHatch({ color, past }) {
	return /* @__PURE__ */ a("i", {
		class: `rg-edge top${past ? " past" : ""}`,
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
	});
}
function RideEdge({ color }) {
	return /* @__PURE__ */ a(M, { children: /* @__PURE__ */ a("i", {
		class: "rg-edge bottom",
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
				SKY_CRAYON,
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
	}) });
}
var LIST_ROW_PX = 40;
var FOCUS_ROW_PX = 72;
var EDGE_BOTTOM_PX = 76;
var SUBWAY_ART = (color) => /* @__PURE__ */ a("svg", {
	viewBox: "0 0 48 20",
	"aria-hidden": "true",
	"stroke-linecap": "round",
	"stroke-linejoin": "round",
	children: /* @__PURE__ */ a("g", {
		filter: "url(#rg-edge-crayon)",
		children: [
			/* @__PURE__ */ a("path", {
				d: "M2 2h35c5.5 0 9 4.5 9 10v5H2z",
				fill: color,
				stroke: "var(--ink)",
				"stroke-width": "1.5"
			}),
			/* @__PURE__ */ a("path", {
				d: "M37 4.5c3 .3 5.6 2.6 6.6 6.5H37z",
				fill: "var(--paper)"
			}),
			/* @__PURE__ */ a("rect", {
				x: "5",
				y: "5",
				width: "6",
				height: "5",
				rx: "1",
				fill: "var(--paper)"
			}),
			/* @__PURE__ */ a("rect", {
				x: "22",
				y: "5",
				width: "6",
				height: "5",
				rx: "1",
				fill: "var(--paper)"
			}),
			/* @__PURE__ */ a("rect", {
				x: "13",
				y: "4",
				width: "7",
				height: "12",
				rx: "1",
				fill: "var(--paper)",
				stroke: "var(--ink)",
				"stroke-width": "1"
			}),
			/* @__PURE__ */ a("path", {
				d: "M16.5 4v12",
				stroke: "var(--ink)",
				"stroke-width": "1"
			}),
			/* @__PURE__ */ a("rect", {
				x: "30",
				y: "4",
				width: "6",
				height: "12",
				rx: "1",
				fill: "var(--paper)",
				stroke: "var(--ink)",
				"stroke-width": "1"
			}),
			/* @__PURE__ */ a("path", {
				d: "M33 4v12",
				stroke: "var(--ink)",
				"stroke-width": "1"
			}),
			/* @__PURE__ */ a("path", {
				d: "M2 17.5h44",
				stroke: "var(--ink)",
				"stroke-width": "2"
			})
		]
	})
});
var BUS_ART = (color) => /* @__PURE__ */ a("svg", {
	viewBox: "0 0 40 24",
	"aria-hidden": "true",
	"stroke-linecap": "round",
	"stroke-linejoin": "round",
	children: /* @__PURE__ */ a("g", {
		filter: "url(#rg-edge-crayon)",
		children: [
			/* @__PURE__ */ a("rect", {
				x: "2",
				y: "3",
				width: "36",
				height: "15",
				rx: "4",
				fill: color,
				stroke: "var(--ink)",
				"stroke-width": "1.5"
			}),
			/* @__PURE__ */ a("rect", {
				x: "6",
				y: "6",
				width: "7",
				height: "5",
				rx: "1",
				fill: "var(--paper)"
			}),
			/* @__PURE__ */ a("rect", {
				x: "15",
				y: "6",
				width: "7",
				height: "5",
				rx: "1",
				fill: "var(--paper)"
			}),
			/* @__PURE__ */ a("rect", {
				x: "24",
				y: "6",
				width: "5",
				height: "5",
				rx: "1",
				fill: "var(--paper)"
			}),
			/* @__PURE__ */ a("rect", {
				x: "31",
				y: "6",
				width: "5",
				height: "10",
				rx: "1",
				fill: "var(--paper)",
				stroke: "var(--ink)",
				"stroke-width": "1"
			}),
			/* @__PURE__ */ a("circle", {
				cx: "10",
				cy: "19",
				r: "3.2",
				fill: "var(--ink)"
			}),
			/* @__PURE__ */ a("circle", {
				cx: "30",
				cy: "19",
				r: "3.2",
				fill: "var(--ink)"
			})
		]
	})
});
var STACK_PX = 13;
function TrainMark({ mark, color, pick, order = 0, count = 1, step = LIST_ROW_PX }) {
	const art = mark.bus ? BUS_ART(color) : SUBWAY_ART(color), size = mark.mine ? "mine" : "other";
	if (mark.mine || !mark.id || !pick) return /* @__PURE__ */ a("i", {
		class: `rg-train ${size}${mark.bus ? " bus" : ""}`,
		style: mark.slide ? `--rg-slide:${mark.slide.toFixed(3)};--rg-step:${step}px` : void 0,
		"aria-hidden": "true",
		children: art
	});
	const id = mark.id, shift = (order - (count - 1) / 2) * STACK_PX, vars = [shift ? `--rg-shift:${shift}px` : "", mark.slide ? `--rg-slide:${mark.slide.toFixed(3)};--rg-step:${step}px` : ""].filter(Boolean).join(";");
	return /* @__PURE__ */ a("button", {
		type: "button",
		class: `rg-train ${size}${count > 1 ? " stacked" : ""}`,
		style: vars || void 0,
		"aria-label": `${mark.name ?? "이 열차"} — 탄 열차로 바꾸기`,
		onClick: () => pick({
			...mark,
			id
		}),
		children: art
	});
}
function RideList({ list, pick }) {
	const box = T(null), touching = T(false), waiting = T(false), opened = T(false);
	const focus = list.ahead ? list.at + 1 : list.at;
	const centre = b((smooth) => {
		const calm = !smooth || matchMedia("(prefers-reduced-motion:reduce)").matches;
		box.current?.scrollTo({
			top: focus * LIST_ROW_PX,
			behavior: calm ? "auto" : "smooth"
		});
	}, [focus]);
	A(() => {
		if (touching.current) {
			waiting.current = true;
			return;
		}
		centre(opened.current);
		opened.current = true;
	}, [focus]);
	const release = b(() => {
		touching.current = false;
		if (waiting.current) {
			waiting.current = false;
			centre(true);
		}
	}, [centre]);
	const [edgeAt, setEdgeAt] = d(-1);
	const measure = b(() => {
		const host = box.current;
		if (!host) return;
		const line = host.getBoundingClientRect().bottom - EDGE_BOTTOM_PX, items = [...host.querySelectorAll("ol > li")];
		const hit = items.findIndex((item) => item.getBoundingClientRect().bottom > line);
		setEdgeAt(hit < 0 ? items.length - 1 : hit);
	}, []);
	A(measure, [
		list.at,
		list.rows.length,
		measure
	]);
	const edgeColor = (list.rows.slice(Math.max(0, edgeAt)).find((row) => row.kind !== "gap") ?? list.rows.findLast((row) => row.kind !== "gap"))?.color ?? null;
	const head = list.rows[0], headColor = head && head.kind !== "gap" ? head.color : null;
	const pastClass = (order) => order < focus ? " past" : "";
	const last = list.rows.length - 1;
	const rowPx = (order) => order === focus ? FOCUS_ROW_PX : LIST_ROW_PX;
	const slideStep = (order, slide = 0) => (rowPx(order) + rowPx(order + Math.sign(slide))) / 2;
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
			children: [headColor && /* @__PURE__ */ a(RideHatch, {
				color: headColor,
				past: focus > 0
			}), /* @__PURE__ */ a("ol", {
				class: focus > 0 ? "head-past" : void 0,
				style: headColor ? `--rg-head:${headColor}` : void 0,
				children: list.rows.map((row, order) => {
					const tail = order === last;
					if (row.kind === "gap") return /* @__PURE__ */ a("li", {
						class: `gap${pastClass(order)}`,
						children: /* @__PURE__ */ a("i", { children: row.text })
					});
					if (row.kind === "leg") return /* @__PURE__ */ a("li", {
						class: `leg${pastClass(order)}${tail ? " tail" : ""}`,
						style: `--rg-line:${row.color}`,
						children: /* @__PURE__ */ a("b", { children: row.text })
					});
					const now = order === focus, marks = row.marks ?? [], others = marks.filter((mark) => !mark.mine);
					let note = order === 0 ? "여기서 탔어요" : "지금 여기예요";
					if (list.ahead) note = "다음은 여기예요";
					return /* @__PURE__ */ a("li", {
						class: `stop${now ? " now" : ""}${pastClass(order)}${row.edge ? ` ${row.edge}` : ""}${marks.length ? " marked" : ""}${tail ? " tail" : ""}`,
						style: `--rg-line:${row.color}`,
						"aria-current": now ? "step" : void 0,
						children: [
							marks.map((mark) => /* @__PURE__ */ a(TrainMark, {
								mark,
								color: row.color,
								pick,
								order: others.indexOf(mark),
								count: others.length,
								step: slideStep(order, mark.slide)
							}, mark.id ?? "mine")),
							now && /* @__PURE__ */ a("small", { children: note }),
							/* @__PURE__ */ a("span", { children: [/* @__PURE__ */ a("b", { children: row.name }), row.off && /* @__PURE__ */ a("em", { children: "여기서 내려요" })] })
						]
					});
				})
			})]
		}), edgeColor && /* @__PURE__ */ a(RideEdge, { color: edgeColor })]
	});
}
var platformSvg = "";
function platformArt() {
	if (platformSvg) return platformSvg;
	const at = (i, j) => [1e3 + 60 * i + 60 * j, 500 + 30 * i - 30 * j];
	const pts = (list) => list.map((point) => point.map((num) => num.toFixed(1)).join(",")).join(" ");
	const line = (cls, from, to, width) => `<line class="${cls}" x1="${from[0].toFixed(1)}" y1="${from[1].toFixed(1)}" x2="${to[0].toFixed(1)}" y2="${to[1].toFixed(1)}"${width ? ` stroke-width="${width}"` : ""}/>`;
	const poly = (cls, list) => `<polygon class="${cls}" points="${pts(list)}"/>`;
	const drop = (point, by) => [point[0], point[1] + by];
	const back = -1.15, far = 14, side = 14, wide = 30, step = .5;
	const tiles = (edge, dir, end, span) => {
		let out = "";
		for (let row = edge + dir * step; dir > 0 ? row < end : row > end; row += dir * step) out += line("rg-pl-tile", at(row, -span), at(row, span));
		for (let col = -span; col <= span; col += step) out += line("rg-pl-tile", at(edge + dir * .38, col), at(end, col));
		out += line("rg-pl-safety", at(edge + dir * .12, -14), at(edge + dir * .12, side), 3);
		for (let dot = -56; dot < 56; dot++) {
			const [cx, cy] = at(edge + dir * .24, dot / 4);
			out += `<circle class="rg-pl-dot" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="1.1"/>`;
		}
		return out;
	};
	const track = (mid) => {
		let out = poly("rg-pl-bal", [
			at(mid - .32, -14),
			at(mid - .32, side),
			at(mid + .32, side),
			at(mid + .32, -14)
		]);
		for (let tie = -70; tie < 70; tie++) out += line("rg-pl-tie", at(mid - .22, tie / 5), at(mid + .22, tie / 5), 3);
		for (const off of [-.13, .13]) out += line("rg-pl-rail", at(mid + off, -14), at(mid + off, side), 1.6);
		return out;
	};
	const opposite = -3.25, beyond = -21.15;
	let rear = poly("rg-pl-pit", [
		at(opposite, -14),
		at(opposite, side),
		at(back, side),
		at(back, -14)
	]);
	rear += track(-1.75) + track(-2.65);
	rear += poly("rg-pl-top", [
		at(beyond, -30),
		at(beyond, wide),
		at(opposite, wide),
		at(opposite, -30)
	]);
	rear += tiles(opposite, -1, beyond, wide);
	rear += poly("rg-pl-wall", [
		at(opposite, -14),
		at(opposite, side),
		drop(at(opposite, side), 9),
		drop(at(opposite, -14), 9)
	]);
	rear += poly("rg-pl-lip", [
		at(back, -14),
		at(back, side),
		at(-1.3299999999999998, side),
		at(-1.3299999999999998, -14)
	]);
	let front = poly("rg-pl-pit", [
		at(back, -14),
		at(back, side),
		drop(at(back, side), -5),
		drop(at(back, -14), -5)
	]);
	front += poly("rg-pl-top", [
		at(back, -14),
		at(back, side),
		at(far, side),
		at(far, -14)
	]);
	front += tiles(back, 1, far, side);
	front += "<ellipse class=\"rg-pl-shadow\" cx=\"1000\" cy=\"500\" rx=\"26\" ry=\"8\"/>";
	platformSvg = `<svg viewBox="0 0 1400 700"><defs><linearGradient id="rgPlFade" gradientUnits="userSpaceOnUse" x1="0" y1="180" x2="0" y2="350"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#fff"/></linearGradient><mask id="rgPlMask" maskUnits="userSpaceOnUse" x="0" y="0" width="1400" height="700"><rect width="1400" height="700" fill="url(#rgPlFade)"/></mask></defs><g mask="url(#rgPlMask)">${rear}</g>${front}</svg>`;
	return platformSvg;
}
function RideInfo({ info, pick }) {
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
		children: [
			/* @__PURE__ */ a("div", {
				class: "rg-info-view",
				"aria-hidden": "true",
				children: /* @__PURE__ */ a("div", {
					class: "rg-info-scene",
					ref: box
				})
			}),
			/* @__PURE__ */ a("i", {
				class: "rg-platform",
				"aria-hidden": "true",
				dangerouslySetInnerHTML: { __html: platformArt() }
			}),
			/* @__PURE__ */ a(RideList, {
				list: info.list,
				pick
			})
		]
	});
}
function SwapAsk({ mark, yes, no }) {
	const [open, setOpen] = d(false), sure = T(null), ask = rideSwapAsk(mark.name);
	A(() => {
		const frame = requestAnimationFrame(() => setOpen(true));
		sure.current?.focus({ preventScroll: true });
		const key = (event) => {
			if (event.key === "Escape") {
				event.stopImmediatePropagation();
				no();
			}
		};
		window.addEventListener("keydown", key, true);
		return () => {
			cancelAnimationFrame(frame);
			window.removeEventListener("keydown", key, true);
		};
	}, []);
	return /* @__PURE__ */ a("div", {
		class: `login-sheet rg-swap${open ? " open" : ""}`,
		onClick: (event) => {
			if (event.target.classList.contains("login-scrim")) no();
		},
		children: /* @__PURE__ */ a(LayerSheet, {
			labelledBy: "rgSwapTitle",
			children: [
				/* @__PURE__ */ a("h2", {
					id: "rgSwapTitle",
					children: ask.title
				}),
				ask.name && /* @__PURE__ */ a("p", {
					class: "rg-swap-name",
					children: ask.name
				}),
				/* @__PURE__ */ a("div", {
					class: "rg-swap-do",
					children: [/* @__PURE__ */ a("button", {
						type: "button",
						class: "sy-btn sy-btn-secondary",
						onClick: no,
						children: ask.no
					}), /* @__PURE__ */ a("button", {
						type: "button",
						class: "sy-btn sy-btn-primary",
						ref: sure,
						onClick: yes,
						children: ask.yes
					})]
				})
			]
		})
	});
}
function RideInfoCard({ info, card, pick }) {
	const [asking, setAsking] = d(null);
	const yes = () => {
		const id = asking?.id;
		setAsking(null);
		if (id) pick?.(id);
	};
	return /* @__PURE__ */ a(M, { children: [
		/* @__PURE__ */ a(RideInfo, {
			info,
			pick: pick ? setAsking : void 0
		}),
		card,
		asking && /* @__PURE__ */ a(SwapAsk, {
			mark: asking,
			yes,
			no: () => setAsking(null)
		}, asking.id)
	] });
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
		onError: fail,
		onPlayed: actions.played
	});
}
function drawRideCard(host, view, actions, map, hideMe) {
	const at = view?.arrival?.at;
	if (view?.arrival && map && at) {
		K(/* @__PURE__ */ a(ArrivalCard, {
			view,
			actions,
			map,
			hideMe
		}, "arrival"), host);
		return;
	}
	const card = view ? /* @__PURE__ */ a(RideCard, {
		view,
		actions
	}, "card") : null;
	K(view?.info ? /* @__PURE__ */ a(RideInfoCard, {
		info: view.info,
		card,
		pick: actions.pick
	}, "info") : card, host);
}
export { RideCard, drawRideCard };
