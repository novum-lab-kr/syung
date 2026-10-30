import { Fragment as M } from "../npm/preact/dist/preact.mjs";
import { jsx as a } from "../npm/preact/jsx-runtime/dist/jsxRuntime.mjs";
// web/components/train_sheet.tsx
var TRAIN_SHEET_CSS = ".train-inspect{min-width:190px}.train-inspect .tp-line{display:flex;align-items:center;gap:6px;font-size:12.5px;font-weight:700;color:var(--c)}.train-inspect .tp-line .dot{width:9px;height:9px;border-radius:50%;background:var(--c)}.train-inspect .tp-line .no{color:#7a8a90;font-weight:600;font-variant-numeric:tabular-nums}.train-inspect .b{font-size:10.5px;font-weight:800;border-radius:999px;padding:1px 7px;color:#fff;background:var(--c)}.train-inspect .b.last{background:#141414}.train-inspect .tp-dest{font-size:20px;font-weight:800;margin:4px 0 2px;letter-spacing:-.01em}.train-inspect .tp-now{font-size:12px;color:#6b7b80}.train-inspect details{margin-top:8px;font-size:12px}.train-inspect summary{cursor:pointer;color:#8a979b;font-weight:600}.train-inspect table{border-collapse:collapse;font-size:12px;margin-top:4px}.train-inspect th{text-align:left;color:#6b7b80;font-weight:600;padding:2px 10px 2px 0;white-space:nowrap;vertical-align:top}.train-inspect td{padding:2px 0}.train-inspect .sec{padding-top:8px;font-weight:800;color:#172429;border-bottom:1px solid #dbe1e2}.train-inspect .muted{color:#8a979b}";
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
export { TRAIN_SHEET_CSS, TrainSheet };
