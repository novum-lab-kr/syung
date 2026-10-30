import "../lib/journey-ui.mjs";
import { Component as x, Fragment as M } from "../npm/preact/dist/preact.mjs";
import { jsx as a } from "../npm/preact/jsx-runtime/dist/jsxRuntime.mjs";
import { Chip } from "./chip.mjs";
import { BUS, WALK } from "./icons.mjs";
// web/components/step_list.tsx
var BusChips = class extends x {
	state = {
		all: false,
		tapped: null
	};
	render({ chips }) {
		const shown = this.state.all ? chips : chips.slice(0, 4), hidden = chips.length - shown.length;
		const note = chips.find((chip) => chip.route === this.state.tapped)?.detail;
		return /* @__PURE__ */ a(M, { children: [/* @__PURE__ */ a("span", {
			class: "js-chips",
			children: [shown.map((chip) => chip.detail === null ? /* @__PURE__ */ a(Chip, {
				kind: "line",
				color: chip.color,
				ink: chip.ink,
				icon: BUS,
				children: chip.route
			}) : /* @__PURE__ */ a("button", {
				type: "button",
				class: "js-chip side",
				style: `--c:${chip.color};--t:${chip.ink}`,
				"aria-expanded": this.state.tapped === chip.route,
				onClick: (event) => {
					event.stopPropagation();
					this.setState({ tapped: this.state.tapped === chip.route ? null : chip.route });
				},
				children: [
					BUS,
					chip.route,
					/* @__PURE__ */ a("small", { children: chip.side })
				]
			})), hidden > 0 && /* @__PURE__ */ a("button", {
				type: "button",
				class: "jp-more",
				onClick: (event) => {
					event.stopPropagation();
					this.setState({ all: true });
				},
				children: `외 ${hidden}대`
			})]
		}), note != null && /* @__PURE__ */ a("small", {
			class: "js-side",
			children: note
		})] });
	}
};
function AlightChips({ chips }) {
	return /* @__PURE__ */ a("small", {
		class: "js-chips",
		children: chips.map((chip) => /* @__PURE__ */ a("span", {
			class: "js-alt",
			children: [/* @__PURE__ */ a(Chip, {
				kind: "line",
				color: chip.color,
				ink: chip.ink,
				icon: BUS,
				children: chip.route
			}), chip.where]
		}))
	});
}
function Step({ step, timed }) {
	if (step.kind === "place") return /* @__PURE__ */ a("li", {
		class: `js node ${step.at}`,
		style: `--c:${step.at === "start" ? "var(--syung)" : "var(--ink)"}`,
		children: [
			timed && /* @__PURE__ */ a("span", {
				class: "js-t",
				children: step.time
			}),
			/* @__PURE__ */ a("span", { class: "js-dot" }),
			/* @__PURE__ */ a("div", {
				class: "js-b",
				children: /* @__PURE__ */ a("b", { children: step.name })
			})
		]
	});
	if (step.kind === "walk") return /* @__PURE__ */ a("li", {
		class: "js walk",
		children: [
			timed && /* @__PURE__ */ a("span", { class: "js-t" }),
			/* @__PURE__ */ a("span", { class: "js-rail" }),
			/* @__PURE__ */ a("div", {
				class: "js-b",
				children: /* @__PURE__ */ a("small", { children: [
					WALK,
					step.text,
					/* @__PURE__ */ a("span", {
						class: "js-d",
						children: step.detail
					})
				] })
			})
		]
	});
	if (step.kind === "board") return /* @__PURE__ */ a("li", {
		class: "js node board",
		style: `--c:${step.color}`,
		children: [
			timed && /* @__PURE__ */ a("span", {
				class: "js-t",
				children: step.time
			}),
			/* @__PURE__ */ a("span", { class: "js-dot" }),
			/* @__PURE__ */ a("div", {
				class: "js-b",
				children: /* @__PURE__ */ a("b", { children: step.name })
			})
		]
	});
	if (step.kind === "alight") return /* @__PURE__ */ a("li", {
		class: "js node alight",
		style: `--c:${step.color}`,
		children: [
			timed && /* @__PURE__ */ a("span", {
				class: "js-t",
				children: step.time
			}),
			/* @__PURE__ */ a("span", { class: "js-dot" }),
			/* @__PURE__ */ a("div", {
				class: "js-b",
				children: [/* @__PURE__ */ a("b", { children: step.name }), step.chips.length > 0 && /* @__PURE__ */ a(AlightChips, { chips: step.chips })]
			})
		]
	});
	return /* @__PURE__ */ a("li", {
		class: "js ride",
		style: `--c:${step.color};--t:${step.ink}`,
		children: [
			timed && /* @__PURE__ */ a("span", { class: "js-t" }),
			/* @__PURE__ */ a("span", { class: "js-rail" }),
			/* @__PURE__ */ a("div", {
				class: "js-b",
				children: [/* @__PURE__ */ a("p", { children: [step.bus ? /* @__PURE__ */ a(BusChips, { chips: step.chips }) : /* @__PURE__ */ a(Chip, {
					kind: "line",
					children: step.chip
				}), step.toward !== null && /* @__PURE__ */ a("span", {
					class: "js-toward",
					children: step.toward
				})] }), (step.info !== "" || step.live !== null) && /* @__PURE__ */ a("small", { children: [step.info, step.live !== null && /* @__PURE__ */ a("span", {
					class: "js-live",
					children: step.live
				})] })]
			})
		]
	});
}
function StepList({ steps, className }) {
	const timed = steps.some((step) => "time" in step && step.time !== null);
	return /* @__PURE__ */ a("ol", {
		class: timed ? className : `${className} notime`,
		children: steps.map((step) => /* @__PURE__ */ a(Step, {
			step,
			timed
		}))
	});
}
export { StepList };
