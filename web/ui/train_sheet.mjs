import { Fragment as M, render as K } from "../npm/preact/dist/preact.mjs";
import { jsx as a } from "../npm/preact/jsx-runtime/dist/jsxRuntime.mjs";
// web/ui/train_sheet.tsx
function Raw({ raw }) {
	return /* @__PURE__ */ a("dl", {
		class: "kv",
		children: [
			/* @__PURE__ */ a("dt", { children: "역" }),
			/* @__PURE__ */ a("dd", { children: raw.station }),
			/* @__PURE__ */ a("dt", { children: "상태" }),
			/* @__PURE__ */ a("dd", { children: raw.status }),
			/* @__PURE__ */ a("dt", { children: "방향" }),
			/* @__PURE__ */ a("dd", { children: raw.direction }),
			/* @__PURE__ */ a("dt", { children: "행선지" }),
			/* @__PURE__ */ a("dd", { children: raw.destination }),
			/* @__PURE__ */ a("dt", { children: "기록 시각" }),
			/* @__PURE__ */ a("dd", { children: [`${raw.recorded} `, /* @__PURE__ */ a("span", {
				class: "muted",
				children: `(${raw.ageSec}초 전)`
			})] }),
			/* @__PURE__ */ a("dt", { children: "받은 시각" }),
			/* @__PURE__ */ a("dd", { children: raw.fetched })
		]
	});
}
function TrainSheet({ color, line, trainNo, express, last, dest, now, ride, raw }) {
	return /* @__PURE__ */ a("div", {
		class: "train-inspect",
		style: `--c:${color}`,
		children: [
			/* @__PURE__ */ a("div", {
				class: "tp-line",
				children: [
					/* @__PURE__ */ a("span", { class: "dot" }),
					line,
					/* @__PURE__ */ a("span", {
						class: "no",
						children: trainNo
					}),
					express && /* @__PURE__ */ a("span", {
						class: "b ex",
						children: "급행"
					}),
					last && /* @__PURE__ */ a("span", {
						class: "b last",
						children: "막차"
					})
				]
			}),
			/* @__PURE__ */ a("div", {
				class: "tp-dest",
				children: dest
			}),
			/* @__PURE__ */ a("div", {
				class: "tp-now",
				children: now
			}),
			ride && /* @__PURE__ */ a(M, { children: [
				/* @__PURE__ */ a("div", {
					class: "sec",
					children: ["자리 고르고 타기 ", /* @__PURE__ */ a("span", {
						class: "muted",
						children: "· 위가 진행 방향"
					})]
				}),
				/* @__PURE__ */ a("div", {
					class: "ride-pick",
					dangerouslySetInnerHTML: { __html: ride.seatsHTML }
				}),
				/* @__PURE__ */ a("button", {
					type: "button",
					class: "ride-go",
					children: ride.goLabel
				})
			] }),
			/* @__PURE__ */ a("div", {
				class: "sec",
				children: "서울시 실시간 원본"
			}),
			/* @__PURE__ */ a(Raw, { raw })
		]
	});
}
var drawTrainSheet = (body, props) => K(/* @__PURE__ */ a(TrainSheet, { ...props }), body);
export { TrainSheet, drawTrainSheet };
