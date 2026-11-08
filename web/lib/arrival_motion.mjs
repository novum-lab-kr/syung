import { __vitePreload } from "../_virtual/_vite/preload-helper.mjs";
import arrival_char_ride_default from "../brand/arrival-char-ride.json_url.mjs";
import arrival_flag_default from "../brand/arrival-flag.json_url.mjs";
// web/lib/arrival_motion.mts
var player = () => globalThis.lottie;
var PAINT = {
	"#ffd400": "--syung",
	"#e0a000": "--syung-deep",
	"#2a2000": "--syung-ink",
	"#111111": "--ink",
	"#fefefe": "--paper"
};
var hexOf = (rgb) => `#${rgb.slice(0, 3).map((part) => Math.round(part * 255).toString(16).padStart(2, "0")).join("")}`;
function cssRgb(host, name) {
	const probe = document.createElement("i");
	probe.style.color = `var(${name})`;
	probe.style.display = "none";
	host.append(probe);
	const value = getComputedStyle(probe).color;
	probe.remove();
	const parts = /rgba?\(([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)/.exec(value);
	return parts ? parts.slice(1, 4).map((part) => +(Number(part) / 255).toFixed(4)) : null;
}
function paint(node, colors) {
	if (Array.isArray(node)) {
		node.forEach((child) => paint(child, colors));
		return;
	}
	if (!node || typeof node !== "object") return;
	const item = node, color = item.c;
	if (typeof item.nm === "string" && item.nm.startsWith("lm-") && typeof item.ty === "number") return;
	if ((item.ty === "fl" || item.ty === "st") && color && Array.isArray(color.k) && typeof color.k[0] === "number") {
		const next = colors.get(hexOf(color.k));
		if (next) color.k = [...next, 1];
	}
	Object.values(item).forEach((child) => paint(child, colors));
}
var cache = /* @__PURE__ */ new Map();
function loadScene(name) {
	let pending = cache.get(name);
	if (!pending) {
		pending = fetch(new URL((/* #__PURE__ */ Object.assign({
			"../brand/arrival-char-ride.json": arrival_char_ride_default,
			"../brand/arrival-flag.json": arrival_flag_default
		}))[`../brand/arrival-${name}.json`], import.meta.url)).then((response) => response.ok ? response.json() : null).catch(() => null);
		pending.then((data) => {
			if (!data) cache.delete(name);
		});
		cache.set(name, pending);
	}
	return pending;
}
function playArrival(box, name, onError) {
	let anim = null, gone = false, failed = false;
	const fail = () => {
		if (gone || failed || !box.isConnected) return;
		failed = true;
		anim?.destroy();
		anim = null;
		box.classList.remove("on");
		box.classList.add("fail");
		onError?.();
	};
	Promise.all([loadScene(name), player() ? 0 : __vitePreload(() => import("../vendor/lottie/lottie_light.min.js"), [], import.meta.url)]).then(([data]) => {
		const lottie = player();
		if (gone || !box.isConnected) return;
		if (!data || !lottie) {
			fail();
			return;
		}
		const colors = /* @__PURE__ */ new Map();
		for (const [code, variable] of Object.entries(PAINT)) {
			const rgb = cssRgb(box, variable);
			if (rgb) colors.set(code, rgb);
		}
		const copy = structuredClone(data);
		paint(copy.layers, colors);
		const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
		anim = lottie.loadAnimation({
			container: box,
			renderer: "svg",
			loop: name === "flag" && !still,
			autoplay: !still,
			animationData: copy
		});
		anim.addEventListener("data_failed", fail);
		anim.addEventListener("error", fail);
		if (still) anim.goToAndStop(anim.totalFrames - 1, true);
		box.classList.add("on");
	}).catch(fail);
	return () => {
		gone = true;
		anim?.destroy();
		anim = null;
	};
}
export { playArrival };
