// web/lib/time-wheel.mts
var ROW = 40;
var pad = (value) => String(value).padStart(2, "0");
var clockParts = (time) => {
	const [hours = 0, minutes = 0] = time.split(":").map(Number);
	return {
		ampm: hours < 12 ? 0 : 1,
		hour: hours % 12 || 12,
		minute: minutes
	};
};
function createTimeWheel(box, onChange) {
	const wheels = Object.fromEntries([...box.querySelectorAll(".tw-col")].map((el) => [el.dataset.part, {
		el,
		values: [],
		label: String
	}]));
	const indexOf = (wheel) => Math.max(0, Math.min(wheel.values.length - 1, Math.round(wheel.el.scrollTop / ROW)));
	function mark(wheel) {
		const at = indexOf(wheel);
		[...wheel.el.children].forEach((button, index) => {
			const near = Math.abs(index - at) === 1 ? "near" : "";
			button.className = index === at ? "on" : near;
		});
		wheel.el.setAttribute("aria-valuetext", wheel.label(wheel.values[at]));
	}
	function fill(part, values, label, current) {
		const wheel = wheels[part];
		wheel.values = values;
		wheel.label = label;
		wheel.el.replaceChildren(...values.map((value, index) => {
			const button = document.createElement("button");
			button.type = "button";
			button.tabIndex = -1;
			button.textContent = label(value);
			button.onclick = () => wheel.el.scrollTo({
				top: index * ROW,
				behavior: "smooth"
			});
			return button;
		}));
		wheel.el.scrollTop = Math.max(0, values.indexOf(current)) * ROW;
		mark(wheel);
	}
	function time() {
		const value = (part) => wheels[part].values[indexOf(wheels[part])];
		return `${pad(value("ampm") * 12 + value("hour") % 12)}:${pad(value("minute"))}`;
	}
	for (const wheel of Object.values(wheels)) {
		let frame = 0;
		wheel.el.addEventListener("scroll", () => {
			cancelAnimationFrame(frame);
			frame = requestAnimationFrame(() => {
				mark(wheel);
				onChange(time());
			});
		}, { passive: true });
		wheel.el.addEventListener("keydown", (event) => {
			if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
			event.preventDefault();
			wheel.el.scrollTo({
				top: (indexOf(wheel) + (event.key === "ArrowDown" ? 1 : -1)) * ROW,
				behavior: "smooth"
			});
		});
	}
	return {
		show(shown) {
			const parts = clockParts(shown), minutes = Array.from({ length: 12 }, (_, index) => index * 5);
			if (!minutes.includes(parts.minute)) {
				minutes.push(parts.minute);
				minutes.sort((left, right) => left - right);
			}
			fill("ampm", [0, 1], (value) => value ? "오후" : "오전", parts.ampm);
			fill("hour", Array.from({ length: 12 }, (_, index) => index + 1), String, parts.hour);
			fill("minute", minutes, pad, parts.minute);
		},
		roll(rolled) {
			const parts = clockParts(rolled);
			for (const part of [
				"ampm",
				"hour",
				"minute"
			]) {
				const wheel = wheels[part], at = wheel.values.indexOf(parts[part]);
				if (at >= 0) wheel.el.scrollTo({
					top: at * ROW,
					behavior: "smooth"
				});
			}
		},
		time,
		focus() {
			wheels.hour.el.focus({ preventScroll: true });
		}
	};
}
export { createTimeWheel };
